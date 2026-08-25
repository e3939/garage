-- 0015 — The mod planner
--
-- Roadmap Phase 5. No table changes, no new columns, no new enums: `mod_plans`,
-- `mod_dependencies` and `expenses.mod_plan_id` have all existed since 0002 and
-- 0003. What is missing is the arithmetic, and every figure the board puts on a
-- screen is computed here rather than reduced in the browser
-- (CLAUDE.md section 3).
--
-- Three things:
--
--   v_mod_costs        one row per live mod: what it was estimated at, what it
--                      has actually cost, and the signed difference.
--   v_mod_board_totals the build sheet — the same figures rolled up per status
--                      and once more for the whole board.
--   mod_board()        one call that returns a vehicle's whole board with each
--                      mod's dependencies and inspiration photos attached.
--   mod_reorder()      one statement that persists a drag.
--
-- Cycle prevention on dependencies is deliberately not here.
-- docs/02-DATA-MODEL.md: "enforce with a recursive check in the server action,
-- not a trigger." It lives in `lib/mods/graph.ts` and is unit-tested, because an
-- error that has to name the cycle is copy, and copy does not belong in a
-- constraint.


-- ---------------------------------------------------------------------------
-- v_mod_costs — plan against actual, one row per mod.
--
-- The estimate is the midpoint of the range when both ends are given and
-- whichever end exists when only one does. That is the same rule
-- `v_vehicle_totals.planning_accuracy` already uses, and the two have to agree
-- or the accuracy figure on the vehicle page would disagree with the variance on
-- the card that fed it.
--
-- A mod with no estimate at all has a null estimate and a null variance rather
-- than a zero: nobody planned nothing, they just did not say.
--
-- The actual is the sum of every expense pointing at the mod, which is the
-- derivation docs/02-DATA-MODEL.md gives — a mod accumulates several (the part,
-- then the labour, then a bracket you forgot). Drafts are awaiting confirmation
-- and are not spend yet.
--
-- One currency per row. An expense recorded in some other currency is excluded
-- rather than converted, because no rate is stored on the row (CLAUDE.md
-- section 5) and multi-currency conversion is on the deferred list.
-- ---------------------------------------------------------------------------

create view public.v_mod_costs
with (security_invoker = true) as
select
  m.id                                            as mod_plan_id,
  m.user_id,
  m.vehicle_id,
  m.status,
  m.priority,
  coalesce(m.currency, p.base_currency)::char(3)  as currency,
  m.est_cost_min,
  m.est_cost_max,
  coalesce((m.est_cost_min + m.est_cost_max) / 2, m.est_cost_max, m.est_cost_min)::bigint
                                                  as estimate,
  coalesce(spend.actual, 0)::bigint               as actual,
  coalesce(spend.expense_count, 0)::int           as expense_count,
  case
    when coalesce((m.est_cost_min + m.est_cost_max) / 2, m.est_cost_max, m.est_cost_min) is null
      then null
    else (
      coalesce(spend.actual, 0)
      - coalesce((m.est_cost_min + m.est_cost_max) / 2, m.est_cost_max, m.est_cost_min)
    )::bigint
  end                                             as variance
from public.mod_plans m
left join public.profiles p on p.id = m.user_id
left join lateral (
  select
    sum(e.amount)::bigint as actual,
    count(*)::int         as expense_count
  from public.expenses e
  where e.mod_plan_id = m.id
    and e.is_draft = false
    and e.currency = coalesce(m.currency, p.base_currency)
) spend on true
where m.archived_at is null;

comment on view public.v_mod_costs is
  'Plan against actual for every live mod: the estimate midpoint, the sum of the expenses linked to it, and the signed difference.';


-- ---------------------------------------------------------------------------
-- v_mod_board_totals — the build sheet.
--
-- docs/01-PRODUCT.md: "the mod board rolls up into a total — what the current
-- plan costs, split by status, so 'everything I want' has a single honest number
-- attached to it."
--
-- Two grouping sets, so one query answers both the strip at the top of the board
-- and the count and subtotal in each column header. A row with a null status is
-- the whole board; `status` is `not null` on the table, so null can only ever
-- mean the rollup.
--
-- `without_estimate` is what keeps the total honest. A plan where four of eleven
-- mods have no numbers on them is not a plan that costs the sum of the other
-- seven, and the strip says so rather than quietly implying otherwise.
-- ---------------------------------------------------------------------------

create view public.v_mod_board_totals
with (security_invoker = true) as
select
  c.user_id,
  c.vehicle_id,
  c.currency,
  c.status,
  count(*)::int                                     as mods,
  coalesce(sum(c.estimate), 0)::bigint              as estimate_total,
  coalesce(sum(c.est_cost_min), 0)::bigint          as estimate_min_total,
  coalesce(sum(c.est_cost_max), 0)::bigint          as estimate_max_total,
  coalesce(sum(c.actual), 0)::bigint                as actual_total,
  count(*) filter (where c.estimate is null)::int   as without_estimate
from public.v_mod_costs c
group by grouping sets (
  (c.user_id, c.vehicle_id, c.currency, c.status),
  (c.user_id, c.vehicle_id, c.currency)
);

comment on view public.v_mod_board_totals is
  'The build sheet: mods, estimate and actual per status, plus one row per vehicle with a null status for the whole board.';


-- ---------------------------------------------------------------------------
-- mod_board — a vehicle's whole board in one round trip.
--
-- The board is not paged. A plan is a list of wants, not a log: ten is a lot and
-- fifty would be a different problem than pagination solves. So every card
-- arrives with its dependencies and its inspiration photos already on it, and
-- the page costs one call plus one to sign the photographs.
--
-- `depends_on` carries each dependency's current status, because "blocked" is
-- derived from it and deriving it here would mean the caller could not also
-- name the blockers.
-- ---------------------------------------------------------------------------

create function public.mod_board(p_vehicle_id uuid)
returns table (
  id            uuid,
  vehicle_id    uuid,
  title         text,
  description   text,
  status        public.mod_status,
  priority      public.mod_priority,
  est_cost_min  bigint,
  est_cost_max  bigint,
  estimate      bigint,
  actual        bigint,
  variance      bigint,
  expense_count int,
  currency      text,
  target_date   date,
  links         jsonb,
  notes         text,
  installed_on  date,
  board_order   int,
  created_at    timestamptz,
  depends_on    jsonb,
  photos        jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
select
  m.id,
  m.vehicle_id,
  m.title,
  m.description,
  m.status,
  m.priority,
  c.est_cost_min,
  c.est_cost_max,
  c.estimate,
  c.actual,
  c.variance,
  c.expense_count,
  c.currency::text,
  m.target_date,
  m.links,
  m.notes,
  m.installed_on,
  m.board_order,
  m.created_at,
  coalesce(d.depends_on, '[]'::jsonb),
  coalesce(a.photos, '[]'::jsonb)
from public.mod_plans m
join public.v_mod_costs c on c.mod_plan_id = m.id
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id',     dep.id,
      'title',  dep.title,
      'status', dep.status
    )
    order by dep.board_order, dep.title
  ) as depends_on
  from public.mod_dependencies e
  join public.mod_plans dep on dep.id = e.depends_on_id
  where e.mod_plan_id = m.id
    and dep.archived_at is null
) d on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id',           at.id,
      'storage_path', at.storage_path,
      'bucket_name',  at.bucket_name,
      'kind',         at.kind,
      'caption',      at.caption,
      'width',        at.width,
      'height',       at.height,
      'bytes',        at.bytes,
      'sort_order',   at.sort_order
    )
    order by at.sort_order, at.created_at
  ) as photos
  from public.attachments at
  where at.mod_plan_id = m.id
) a on true
where m.user_id = (select auth.uid())
  and m.vehicle_id = p_vehicle_id
  and m.archived_at is null
order by m.board_order, m.created_at;
$$;

comment on function public.mod_board is
  'Every live mod on one vehicle, with its dependencies, its inspiration photos and its plan-against-actual figures.';


-- ---------------------------------------------------------------------------
-- mod_reorder — persist a drag.
--
-- A drag moves one card and renumbers whichever columns it left and landed in,
-- so the write is a list of (id, status, board_order) and it has to land as one
-- statement: two cards briefly sharing a position is a board that renders in a
-- different order than the one the finger drew.
--
-- Moving a card into Installed stamps `installed_on`, and moving it back out
-- clears it. The date comes in as a parameter rather than from `current_date`
-- because the server's clock is UTC and the app's day is Asia/Ho_Chi_Minh — at
-- half past midnight in Ho Chi Minh City those are different days.
--
-- The `user_id` predicate is belt and braces on top of RLS; the vehicle
-- predicate is what stops a forged payload from renumbering another car's board.
-- ---------------------------------------------------------------------------

create function public.mod_reorder(
  p_vehicle_id uuid,
  p_moves      jsonb,
  p_today      date
)
returns int
language sql
volatile
security invoker
set search_path = ''
as $$
with moves as (
  select *
  from jsonb_to_recordset(p_moves)
    as x(id uuid, status public.mod_status, board_order int)
),
updated as (
  update public.mod_plans m
  set status       = mv.status,
      board_order  = mv.board_order,
      installed_on = case
        when mv.status = 'installed' and m.installed_on is null then p_today
        when mv.status <> 'installed'                           then null
        else m.installed_on
      end
  from moves mv
  where m.id = mv.id
    and m.vehicle_id = p_vehicle_id
    and m.user_id = (select auth.uid())
  returning m.id
)
select count(*)::int from updated;
$$;

comment on function public.mod_reorder is
  'Apply a board drag: set status and board_order for a set of mods on one vehicle in a single statement.';


-- ---------------------------------------------------------------------------
-- Grants. Same shape as every migration before it: authenticated and
-- service_role, never anon.
-- ---------------------------------------------------------------------------

grant select on public.v_mod_costs        to authenticated, service_role;
grant select on public.v_mod_board_totals to authenticated, service_role;

revoke all on function public.mod_board(uuid) from public;
grant execute on function public.mod_board(uuid) to authenticated, service_role;

revoke all on function public.mod_reorder(uuid, jsonb, date) from public;
grant execute on function public.mod_reorder(uuid, jsonb, date) to authenticated, service_role;
