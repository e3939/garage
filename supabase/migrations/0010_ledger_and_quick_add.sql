-- 0010 — Reads for the expense screens
--
-- Roadmap Phase 2. Nothing here changes a table: no new columns, no new enums,
-- no new tables. It adds the read paths the ledger and the quick-add sheet need,
-- so that every total, subtotal and ranking is computed by Postgres and the
-- client only ever renders what it is handed. See CLAUDE.md section 3,
-- "Aggregate in SQL (views, RPC), never by pulling rows to the client".
--
-- Three indexes are added for search and for the has-photo filter. Indexes are
-- not part of the data contract in docs/02-DATA-MODEL.md, but they are new, so
-- they are called out in AUTOPILOT-NOTES.md.

-- ---------------------------------------------------------------------------
-- Search support. `note` and `merchant` are free text and the ledger searches
-- both with a contains match, which no b-tree can serve. Trigram GIN indexes can.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

create index expenses_note_trgm_idx
  on public.expenses using gin (note extensions.gin_trgm_ops);

create index expenses_merchant_trgm_idx
  on public.expenses using gin (merchant extensions.gin_trgm_ops);


-- ---------------------------------------------------------------------------
-- v_monthly_impact — the monthly figure, per user, per month, per currency.
--
-- Reads from v_expense_impact, which is the only implementation of amortisation
-- in the database. A month's total is the sum of the slices that land in it, so
-- a set of tyres spread over 24 months contributes a twenty-fourth here while
-- the ledger still shows one purchase for the full amount.
-- ---------------------------------------------------------------------------

create view public.v_monthly_impact
with (security_invoker = true) as
select
  i.user_id,
  i.impact_month,
  i.currency,
  sum(i.amount)::bigint            as total,
  count(distinct i.expense_id)::int as expense_count
from public.v_expense_impact i
group by i.user_id, i.impact_month, i.currency;

comment on view public.v_monthly_impact is
  'Budget-impact total per user, month and currency. The monthly number on /today reads this.';


-- ---------------------------------------------------------------------------
-- v_category_usage / v_categories_ranked
--
-- The quick-add sheet puts the most-used categories first, and "most used" is
-- decided here rather than by sorting an array in the browser. Recent use wins
-- over lifetime use, because habits move: a category used four times last month
-- beats one used forty times three years ago.
-- ---------------------------------------------------------------------------

create view public.v_category_usage
with (security_invoker = true) as
select
  e.user_id,
  e.category_id,
  count(*)::int                                                              as uses_all,
  count(*) filter (where e.occurred_on >= current_date - interval '90 days')::int as uses_recent,
  max(e.occurred_on)                                                         as last_used_on
from public.expenses e
where e.category_id is not null
  and e.is_draft = false
group by e.user_id, e.category_id;

comment on view public.v_category_usage is
  'How often each category has been used, lifetime and in the last 90 days.';

create view public.v_categories_ranked
with (security_invoker = true) as
select
  c.id,
  c.user_id,
  c.name,
  c.icon,
  c.colour_hex,
  c.default_bucket,
  c.default_counts_toward_budget,
  c.is_system,
  c.sort_order,
  c.archived_at,
  c.created_at,
  c.updated_at,
  coalesce(u.uses_recent, 0) as uses_recent,
  coalesce(u.uses_all, 0)    as uses_all,
  u.last_used_on
from public.categories c
left join public.v_category_usage u
  on u.category_id = c.id and u.user_id = c.user_id;

comment on view public.v_categories_ranked is
  'Categories with their usage counts. Order by uses_recent desc, uses_all desc, sort_order to get the chip order.';


-- ---------------------------------------------------------------------------
-- v_amortise_suggestion
--
-- docs/01-PRODUCT.md: the form offers to spread an expense when it "exceeds a
-- threshold (default: 3x the median expense of the last 90 days)". The multiplier
-- is per-profile; the median is a percentile over the same 90 days, on the
-- magnitude of the amount so a large refund does not drag it down.
--
-- One row per profile. `threshold` is null when there is nothing to take a median
-- of, and the form then simply never suggests.
-- ---------------------------------------------------------------------------

create view public.v_amortise_suggestion
with (security_invoker = true) as
select
  p.id                                            as user_id,
  coalesce(p.amortise_suggest_multiplier, 3.0)    as multiplier,
  m.median_amount::bigint                         as median_amount,
  case
    when m.median_amount is null or m.median_amount <= 0 then null
    else ceil(m.median_amount * coalesce(p.amortise_suggest_multiplier, 3.0))::bigint
  end                                             as threshold
from public.profiles p
left join lateral (
  select percentile_cont(0.5) within group (order by abs(e.amount)) as median_amount
  from public.expenses e
  where e.user_id = p.id
    and e.is_draft = false
    and e.occurred_on >= current_date - interval '90 days'
) m on true;

comment on view public.v_amortise_suggestion is
  'Median expense of the last 90 days times the profile multiplier. Above this the form offers to spread the cost.';


-- ---------------------------------------------------------------------------
-- ledger_page — one page of the ledger, with its day subtotals.
--
-- Keyset, never offset: the cursor is the last row of the previous page and the
-- sort is (occurred_on, created_at, id) descending, which is unique and matches
-- the expenses_user_occurred_idx index prefix.
--
-- The day subtotal is the subtotal of the whole day under the current filters,
-- not of the part of the day that happens to be on this page. It is computed by
-- aggregating the filtered set restricted to the days the page touches, so a day
-- straddling a page boundary shows the same figure on both sides.
--
-- `filtered` is NOT MATERIALIZED so the planner inlines it into both references
-- and the filters reach the index rather than building the whole set once.
-- ---------------------------------------------------------------------------

create function public.ledger_page(
  p_limit               int                     default 40,
  p_cursor_occurred_on  date                    default null,
  p_cursor_created_at   timestamptz             default null,
  p_cursor_id           uuid                    default null,
  p_from                date                    default null,
  p_to                  date                    default null,
  p_category_ids        uuid[]                  default null,
  p_buckets             public.expense_bucket[] default null,
  p_vehicle_ids         uuid[]                  default null,
  p_has_photo           boolean                 default null,
  p_amount_min          bigint                  default null,
  p_amount_max          bigint                  default null,
  p_search              text                    default null,
  p_include_drafts      boolean                 default false
)
returns table (
  id                   uuid,
  occurred_on          date,
  amount               bigint,
  currency             text,
  category_id          uuid,
  category_name        text,
  category_icon        text,
  category_colour_hex  text,
  vehicle_id           uuid,
  vehicle_nickname     text,
  bucket               public.expense_bucket,
  counts_toward_budget boolean,
  amortize_months      smallint,
  merchant             text,
  note                 text,
  odometer_km          int,
  is_draft             boolean,
  attachment_count     int,
  created_at           timestamptz,
  day_total            bigint,
  day_count            int
)
language sql
stable
security invoker
set search_path = ''
as $$
with filtered as not materialized (
  select e.*
  from public.expenses e
  where e.user_id = (select auth.uid())
    and (p_include_drafts or e.is_draft = false)
    and (p_from          is null or e.occurred_on >= p_from)
    and (p_to            is null or e.occurred_on <= p_to)
    and (p_category_ids  is null or e.category_id = any (p_category_ids))
    and (p_buckets       is null or e.bucket      = any (p_buckets))
    and (p_vehicle_ids   is null or e.vehicle_id  = any (p_vehicle_ids))
    and (p_amount_min    is null or e.amount >= p_amount_min)
    and (p_amount_max    is null or e.amount <= p_amount_max)
    and (
      p_search is null or p_search = ''
      or e.note     ilike '%' || p_search || '%'
      or e.merchant ilike '%' || p_search || '%'
    )
    and (
      p_has_photo is null
      or p_has_photo = exists (
        select 1 from public.attachments a where a.expense_id = e.id
      )
    )
),
page as (
  select f.*
  from filtered f
  where p_cursor_id is null
     or (f.occurred_on, f.created_at, f.id)
        < (p_cursor_occurred_on, p_cursor_created_at, p_cursor_id)
  order by f.occurred_on desc, f.created_at desc, f.id desc
  limit greatest(p_limit, 1)
),
day_totals as (
  select
    f.occurred_on,
    sum(f.amount)::bigint as day_total,
    count(*)::int         as day_count
  from filtered f
  where f.occurred_on in (select distinct p.occurred_on from page p)
  group by f.occurred_on
)
select
  p.id,
  p.occurred_on,
  p.amount,
  p.currency::text,
  p.category_id,
  c.name,
  c.icon,
  c.colour_hex,
  p.vehicle_id,
  v.nickname,
  p.bucket,
  p.counts_toward_budget,
  p.amortize_months,
  p.merchant,
  p.note,
  p.odometer_km,
  p.is_draft,
  coalesce(a.n, 0),
  p.created_at,
  d.day_total,
  d.day_count
from page p
left join public.categories c on c.id = p.category_id
left join public.vehicles   v on v.id = p.vehicle_id
left join lateral (
  select count(*)::int as n
  from public.attachments at
  where at.expense_id = p.id
) a on true
join day_totals d on d.occurred_on = p.occurred_on
order by p.occurred_on desc, p.created_at desc, p.id desc;
$$;

comment on function public.ledger_page is
  'One keyset page of the ledger with per-day subtotals under the same filters. Cursor is the last row of the previous page.';


-- ---------------------------------------------------------------------------
-- Grants. Same shape as 0007: authenticated and service_role, never anon.
-- ---------------------------------------------------------------------------

grant select on public.v_monthly_impact       to authenticated, service_role;
grant select on public.v_category_usage       to authenticated, service_role;
grant select on public.v_categories_ranked    to authenticated, service_role;
grant select on public.v_amortise_suggestion  to authenticated, service_role;

revoke all on function public.ledger_page(
  int, date, timestamptz, uuid, date, date, uuid[], public.expense_bucket[],
  uuid[], boolean, bigint, bigint, text, boolean
) from public;

grant execute on function public.ledger_page(
  int, date, timestamptz, uuid, date, date, uuid[], public.expense_bucket[],
  uuid[], boolean, bigint, bigint, text, boolean
) to authenticated, service_role;
