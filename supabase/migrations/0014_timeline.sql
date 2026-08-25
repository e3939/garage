-- 0014 — The timeline
--
-- Roadmap Phase 4. Two things: the `v_timeline` view from docs/02-DATA-MODEL.md,
-- and the keyset page function the build-log feed reads.
--
-- No table changes, no new columns, no new enums. One expression index on
-- `attachments`, which is what lets a page of timeline rows collect its photos
-- with an equality rather than a six-way OR.


-- ---------------------------------------------------------------------------
-- attachments: the owner, whichever column it happens to be in.
--
-- The single-owner check constraint guarantees exactly one of the six foreign
-- keys is non-null, so their coalesce is the owner's id and is unique across the
-- table. Indexing that expression turns "every attachment belonging to this page
-- of rows" into an index scan.
-- ---------------------------------------------------------------------------

create index attachments_owner_idx on public.attachments (
  (coalesce(expense_id, mod_plan_id, service_record_id, fuel_log_id, part_id, timeline_note_id)),
  sort_order
);


-- ---------------------------------------------------------------------------
-- v_timeline
--
-- `union all` over the six things that happen to a car, normalised to one shape
-- (docs/02-DATA-MODEL.md). Three columns are carried beyond the tuple named
-- there and all three are derived rather than new facts:
--
--   currency    a money column that cannot be formatted without it,
--   created_at  named by that document as part of the ordering, so it has to be
--               selectable,
--   ref_id      is the row's identity: every source table is keyed by a uuid, so
--               the keyset (occurred_on, created_at, ref_id) is unique.
--
-- Mod rows are one per mod, not one per status change: nothing in the schema
-- records a status history, so the honest date for a mod is the day it was
-- installed if it was, and the day it was planned if it was not. Phase 5 owns
-- the board; if it adds a transitions table this view gains a branch.
--
-- Fuel rows are individual here. The feed collapses them per month — that is a
-- presentation rule and it lives in `timeline_page` below, not in the contract.
-- ---------------------------------------------------------------------------

create view public.v_timeline
with (security_invoker = true) as

  -- Expenses. Drafts are awaiting confirmation and are not history yet.
  select
    e.user_id,
    e.vehicle_id,
    e.occurred_on,
    'expense'::public.timeline_kind         as kind,
    e.id                                    as ref_id,
    coalesce(e.merchant, c.name, 'Expense') as title,
    nullif(concat_ws(
      ' · ',
      case when e.merchant is not null then c.name end,
      case when e.amortize_months > 1
           then 'Over ' || e.amortize_months || ' months' end
    ), '')                                  as subtitle,
    e.amount                                as amount,
    e.currency::text                        as currency,
    e.created_at
  from public.expenses e
  left join public.categories c on c.id = e.category_id
  where e.is_draft = false

union all

  -- Mods. Archived plans are out of the log the same way archived anything is.
  select
    m.user_id,
    m.vehicle_id,
    coalesce(m.installed_on, m.created_at::date) as occurred_on,
    'mod'::public.timeline_kind                  as kind,
    m.id                                         as ref_id,
    m.title,
    case m.status
      when 'installed'   then 'Installed'
      when 'ordered'     then 'Ordered'
      when 'saving'      then 'Saving for it'
      when 'researching' then 'Researching'
      when 'abandoned'   then 'Abandoned'
      else 'On the list'
    end                                          as subtitle,
    null::bigint                                 as amount,
    m.currency::text                             as currency,
    m.created_at
  from public.mod_plans m
  where m.archived_at is null

union all

  -- Service records.
  select
    s.user_id,
    s.vehicle_id,
    s.performed_on                as occurred_on,
    'service'::public.timeline_kind as kind,
    s.id                          as ref_id,
    s.name                        as title,
    nullif(concat_ws(
      ' · ',
      s.workshop,
      case when s.odometer_km is not null then s.odometer_km || ' km' end
    ), '')                        as subtitle,
    e.amount                      as amount,
    e.currency::text              as currency,
    s.created_at
  from public.service_records s
  left join public.expenses e on e.id = s.expense_id

union all

  -- Fuel fill-ups.
  select
    f.user_id,
    f.vehicle_id,
    f.filled_on                 as occurred_on,
    'fuel'::public.timeline_kind as kind,
    f.id                        as ref_id,
    coalesce(f.station, 'Fill-up') as title,
    nullif(concat_ws(
      ' · ',
      trim(trailing '.' from trim(trailing '0' from f.litres::text)) || ' L',
      case when f.is_full_tank then 'Full tank' else 'Part fill' end
    ), '')                      as subtitle,
    f.total_cost                as amount,
    coalesce(f.currency::text, p.base_currency::text) as currency,
    f.created_at
  from public.fuel_logs f
  join public.profiles p on p.id = f.user_id

union all

  -- Milestones. A milestone with no vehicle is garage-wide and shows on none of
  -- the vehicle feeds; the feed this phase builds is per vehicle.
  select
    ms.user_id,
    ms.vehicle_id,
    ms.achieved_on                    as occurred_on,
    'milestone'::public.timeline_kind as kind,
    ms.id                             as ref_id,
    ms.title,
    ms.body                           as subtitle,
    null::bigint                      as amount,
    null::text                        as currency,
    ms.created_at
  from public.milestones ms

union all

  -- Timeline notes: cost-free entries.
  select
    n.user_id,
    n.vehicle_id,
    n.occurred_on,
    'note'::public.timeline_kind as kind,
    n.id                         as ref_id,
    n.title,
    nullif(concat_ws(
      ' · ',
      case when n.odometer_km is not null then n.odometer_km || ' km' end
    ), '')                       as subtitle,
    null::bigint                 as amount,
    null::text                   as currency,
    n.created_at
  from public.timeline_notes n;

comment on view public.v_timeline is
  'Every event on a vehicle, normalised. Ordered by occurred_on desc, created_at desc; paginate by keyset on (occurred_on, created_at, ref_id).';


-- ---------------------------------------------------------------------------
-- timeline_page — one keyset page of the build log, with its photos.
--
-- Keyset, never offset, on (occurred_on, created_at, ref_id) descending — the
-- ordering docs/02-DATA-MODEL.md gives the view, made unique by the id.
--
-- Two things happen here that are presentation rather than contract:
--
--   Fuel is collapsed to one row per month per vehicle, because a feed that is
--   four fill-ups deep before it reaches anything you did to the car is a feed
--   nobody scrolls (docs/01-PRODUCT.md, "collapsed — grouped as 4 fill-ups").
--   The group carries its fills in `items` so the row can expand without another
--   round trip, and it is collapsed before the keyset is applied so a month
--   never straddles a page boundary and appears twice.
--
--   Attachments arrive with the row, as `photos`, so a page of the feed is one
--   round trip and the signed URLs for all of them are one more.
-- ---------------------------------------------------------------------------

create function public.timeline_page(
  p_vehicle_id          uuid,
  p_limit               int         default 30,
  p_cursor_occurred_on  date        default null,
  p_cursor_created_at   timestamptz default null,
  p_cursor_id           uuid        default null
)
returns table (
  ref_id       uuid,
  kind         public.timeline_kind,
  occurred_on  date,
  created_at   timestamptz,
  title        text,
  subtitle     text,
  amount       bigint,
  currency     text,
  vehicle_id   uuid,
  /** Fills inside a collapsed fuel month. Empty for every other kind. */
  items        jsonb,
  photos       jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
with mine as not materialized (
  select t.*
  from public.v_timeline t
  where t.user_id = (select auth.uid())
    and t.vehicle_id = p_vehicle_id
),
fuel_months as (
  select
    (md5(p_vehicle_id::text || ':fuel:' || date_trunc('month', f.occurred_on)::text))::uuid
                                              as ref_id,
    'fuel'::public.timeline_kind              as kind,
    max(f.occurred_on)                        as occurred_on,
    max(f.created_at)                         as created_at,
    count(*)::int                             as fills,
    sum(f.amount)::bigint                     as amount,
    min(f.currency)                           as currency,
    jsonb_agg(
      jsonb_build_object(
        'ref_id',      f.ref_id,
        'occurred_on', f.occurred_on,
        'title',       f.title,
        'subtitle',    f.subtitle,
        'amount',      f.amount
      )
      order by f.occurred_on desc, f.created_at desc
    )                                         as items
  from mine f
  where f.kind = 'fuel'
  group by date_trunc('month', f.occurred_on)
),
rows as (
  select
    m.ref_id, m.kind, m.occurred_on, m.created_at, m.title, m.subtitle,
    m.amount, m.currency, '[]'::jsonb as items
  from mine m
  where m.kind <> 'fuel'
  union all
  select
    g.ref_id, g.kind, g.occurred_on, g.created_at,
    g.fills || case when g.fills = 1 then ' fill-up' else ' fill-ups' end,
    null::text,
    g.amount, g.currency, g.items
  from fuel_months g
),
page as (
  select r.*
  from rows r
  where p_cursor_id is null
     or (r.occurred_on, r.created_at, r.ref_id)
        < (p_cursor_occurred_on, p_cursor_created_at, p_cursor_id)
  order by r.occurred_on desc, r.created_at desc, r.ref_id desc
  limit greatest(p_limit, 1)
)
select
  p.ref_id,
  p.kind,
  p.occurred_on,
  p.created_at,
  p.title,
  p.subtitle,
  p.amount,
  p.currency,
  p_vehicle_id,
  p.items,
  coalesce(a.photos, '[]'::jsonb)
from page p
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id',           at.id,
      'storage_path', at.storage_path,
      'bucket_name',  at.bucket_name,
      'caption',      at.caption,
      'width',        at.width,
      'height',       at.height,
      'sort_order',   at.sort_order
    )
    order by at.sort_order, at.created_at
  ) as photos
  from public.attachments at
  where coalesce(
          at.expense_id, at.mod_plan_id, at.service_record_id,
          at.fuel_log_id, at.part_id, at.timeline_note_id
        ) = p.ref_id
) a on true
order by p.occurred_on desc, p.created_at desc, p.ref_id desc;
$$;

comment on function public.timeline_page is
  'One keyset page of a vehicle build log. Fuel is collapsed to a month per row; every row carries its attachments.';


-- ---------------------------------------------------------------------------
-- Grants. Same shape as every migration before it: authenticated and
-- service_role, never anon.
-- ---------------------------------------------------------------------------

grant select on public.v_timeline to authenticated, service_role;

revoke all on function public.timeline_page(uuid, int, date, timestamptz, uuid) from public;
grant execute on function public.timeline_page(uuid, int, date, timestamptz, uuid)
  to authenticated, service_role;
