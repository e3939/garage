-- 0019 — Automatic milestones, and the stamp flag the feed reads
--
-- Roadmap Phase 8. Two things, and they belong together because one is only
-- visible through the other:
--
--   `award_milestones` implements the seven automatic milestones listed in
--   docs/01-PRODUCT.md section H. It is idempotent — every one of them is an
--   insert guarded by the `milestones_auto_key` unique index — so it is safe to
--   call after any write, which is exactly what the triggers below do.
--
--   `v_timeline` and `timeline_page` gain one column, `stamp`. docs/03-DESIGN.md
--   signature element 3 says milestones *and installed mods* render as a dealer
--   stamp, and the feed had no way to tell an installed mod from any other mod
--   except by reading its subtitle string. A column is cheaper than a string
--   comparison that a copy edit could break.
--
-- No table changes, no new columns on any table, no new enums. Additive: an
-- older build of the app ignores the extra column, a newer one reads it.


-- ---------------------------------------------------------------------------
-- award_milestones
--
-- Everything here is scoped to one vehicle. The `milestones` table allows a
-- garage-wide row (`vehicle_id` null) and the manual flow can still write one,
-- but nothing automatic does: the build log is per vehicle, so a milestone with
-- no vehicle would be awarded into a feed that does not exist. "First expense"
-- therefore means the first expense recorded against this car.
--
-- Security invoker, deliberately. Every read is then RLS-filtered to the caller
-- and the insert is checked by the `own_insert` policy, so a trigger firing on
-- somebody else's row cannot write a milestone onto their timeline. It also
-- means the function needs no grant of its own to work from a trigger.
--
-- No exception handler. A milestone that cannot be computed should fail the
-- write that provoked it and say why, rather than disappearing quietly and
-- leaving a feature that is untestable from the outside.
-- ---------------------------------------------------------------------------

create function public.award_milestones(p_user_id uuid, p_vehicle_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase_date date;
  v_km_driven     int;
  v_step          int;
  v_odometer_on   date;
begin
  if p_user_id is null or p_vehicle_id is null then
    return;
  end if;

  -- 1. First expense against this car.
  insert into public.milestones (user_id, vehicle_id, kind, achieved_on, title, body, auto)
  select p_user_id, p_vehicle_id, 'first_expense', min(e.occurred_on),
         'First expense', 'The log starts here.', true
  from public.expenses e
  where e.user_id = p_user_id
    and e.vehicle_id = p_vehicle_id
    and e.is_draft = false
  having count(*) > 0
  on conflict do nothing;

  -- 2. First mod installed.
  insert into public.milestones (user_id, vehicle_id, kind, achieved_on, title, body, auto)
  select p_user_id, p_vehicle_id, 'first_mod', min(m.installed_on),
         'First mod installed', 'The car is no longer as it arrived.', true
  from public.mod_plans m
  where m.user_id = p_user_id
    and m.vehicle_id = p_vehicle_id
    and m.status = 'installed'
    and m.installed_on is not null
    and m.archived_at is null
  having count(*) > 0
  on conflict do nothing;

  -- 3. Every 10,000 km driven under this owner, and 4. a year of ownership.
  --
  -- `odometer_km` is the highest reading the app has seen and `odometer_at` the
  -- day it saw it, so that date is the closest thing to the day the clock turned
  -- over. Nothing records the crossing itself and inventing one would be worse.
  select v.purchase_date,
         greatest(v.odometer_km - v.purchase_odometer_km, 0),
         coalesce(v.odometer_at, current_date)
  into v_purchase_date, v_km_driven, v_odometer_on
  from public.vehicles v
  where v.id = p_vehicle_id
    and v.user_id = p_user_id;

  if v_km_driven is not null then
    -- Capped at a hundred stamps. A typo of a million kilometres should not
    -- write a hundred thousand rows before anybody notices.
    for v_step in 1 .. least(v_km_driven / 10000, 100) loop
      insert into public.milestones (user_id, vehicle_id, kind, achieved_on, title, body, auto)
      values (
        p_user_id,
        p_vehicle_id,
        'km_' || (v_step * 10000),
        v_odometer_on,
        replace(to_char(v_step * 10000, 'FM999,999,999'), ',', '.') || ' km driven',
        'Since you took it on.',
        true
      )
      on conflict do nothing;
    end loop;
  end if;

  if v_purchase_date is not null and v_purchase_date + interval '1 year' <= current_date then
    insert into public.milestones (user_id, vehicle_id, kind, achieved_on, title, body, auto)
    values (
      p_user_id, p_vehicle_id, 'owned_1_year',
      (v_purchase_date + interval '1 year')::date,
      'One year of ownership', null, true
    )
    on conflict do nothing;
  end if;

  -- 5. Ten fill-ups. Dated by the tenth of them, not by today.
  insert into public.milestones (user_id, vehicle_id, kind, achieved_on, title, body, auto)
  select p_user_id, p_vehicle_id, 'fills_10', tenth.filled_on,
         'Ten fill-ups', 'Enough history for the consumption figure to mean something.', true
  from (
    select f.filled_on
    from public.fuel_logs f
    where f.user_id = p_user_id
      and f.vehicle_id = p_vehicle_id
    order by f.filled_on, f.created_at
    offset 9
    limit 1
  ) tenth
  on conflict do nothing;

  -- 6. The first full service cycle: every scheduled item done at least once.
  --
  -- "Full cycle" is read as coverage rather than as a second lap — a schedule
  -- whose every live item has been ticked once. Dated by the last of those
  -- firsts, which is the day the cycle actually closed.
  insert into public.milestones (user_id, vehicle_id, kind, achieved_on, title, body, auto)
  select p_user_id, p_vehicle_id, 'service_cycle', max(firsts.first_done),
         'First full service cycle', 'Every item on the schedule has been done once.', true
  from (
    select (
      select min(r.performed_on)
      from public.service_records r
      where r.schedule_id = s.id
    ) as first_done
    from public.service_schedules s
    where s.user_id = p_user_id
      and s.vehicle_id = p_vehicle_id
      and s.archived_at is null
  ) firsts
  having count(*) > 0 and count(firsts.first_done) = count(*)
  on conflict do nothing;

  -- 7. A hundred entries in the log. Milestones do not count towards it, or the
  --    hundredth entry could be the stamp announcing itself.
  insert into public.milestones (user_id, vehicle_id, kind, achieved_on, title, body, auto)
  select p_user_id, p_vehicle_id, 'log_100', hundredth.occurred_on,
         '100 entries in the log', 'This is a book now.', true
  from (
    select t.occurred_on
    from public.v_timeline t
    where t.user_id = p_user_id
      and t.vehicle_id = p_vehicle_id
      and t.kind <> 'milestone'
    order by t.occurred_on, t.created_at
    offset 99
    limit 1
  ) hundredth
  on conflict do nothing;
end;
$$;

comment on function public.award_milestones is
  'Awards the automatic milestones of docs/01-PRODUCT.md section H for one vehicle. Idempotent; safe to call after any write.';

revoke all on function public.award_milestones(uuid, uuid) from public;
grant execute on function public.award_milestones(uuid, uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The triggers.
--
-- Every one of them calls the same function, which computes all seven. That is
-- the point: nothing in the schema changes when a year of ownership passes or
-- when a service schedule is deleted, so a milestone that depends on the
-- calendar has to be picked up by the next write of any kind. The alternative is
-- a scheduled job, and a job that runs nightly to notice one stamp a year is a
-- moving part that does not earn its keep.
--
-- Row-level and AFTER, so the row that provoked the award is already visible to
-- the queries above.
-- ---------------------------------------------------------------------------

create function public.award_milestones_tg()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.award_milestones(new.user_id, new.vehicle_id);
  return null;
end;
$$;

create trigger expenses_award_milestones
  after insert or update of vehicle_id, occurred_on, is_draft on public.expenses
  for each row execute function public.award_milestones_tg();

create trigger fuel_logs_award_milestones
  after insert or update of filled_on on public.fuel_logs
  for each row execute function public.award_milestones_tg();

create trigger service_records_award_milestones
  after insert or update of performed_on, schedule_id on public.service_records
  for each row execute function public.award_milestones_tg();

create trigger mod_plans_award_milestones
  after insert or update of status, installed_on on public.mod_plans
  for each row execute function public.award_milestones_tg();

create trigger timeline_notes_award_milestones
  after insert on public.timeline_notes
  for each row execute function public.award_milestones_tg();

-- The vehicle's own trigger passes its id as the vehicle, not its `vehicle_id`
-- column — it has none. This is the one that catches the odometer rolling past
-- a ten-thousand and the purchase date ageing past a year.
create function public.vehicles_award_milestones_tg()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.award_milestones(new.user_id, new.id);
  return null;
end;
$$;

create trigger vehicles_award_milestones
  after insert or update of odometer_km, odometer_at, purchase_date, purchase_odometer_km
  on public.vehicles
  for each row execute function public.vehicles_award_milestones_tg();


-- ---------------------------------------------------------------------------
-- v_timeline, with `stamp`.
--
-- Replaced rather than altered: a view's column list can only grow at the end,
-- which is where this one goes. Everything above it is character-for-character
-- what 0014 created.
-- ---------------------------------------------------------------------------

create or replace view public.v_timeline
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
    e.created_at,
    null::text                              as stamp
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
    m.created_at,
    case when m.status = 'installed' then 'Installed' end as stamp
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
    s.created_at,
    null::text                    as stamp
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
    f.created_at,
    null::text                  as stamp
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
    ms.created_at,
    ms.title                          as stamp
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
    n.created_at,
    null::text                   as stamp
  from public.timeline_notes n;

comment on view public.v_timeline is
  'Every event on a vehicle, normalised. Ordered by occurred_on desc, created_at desc; paginate by keyset on (occurred_on, created_at, ref_id). `stamp` is the dealer-stamp caption, non-null for milestones and installed mods.';


-- ---------------------------------------------------------------------------
-- timeline_page, with `stamp`.
--
-- A function's return type cannot be widened in place, so this is a drop and a
-- create. The body is 0014's with one column carried through; the fuel group is
-- the only row the function invents and it never carries a stamp.
-- ---------------------------------------------------------------------------

drop function public.timeline_page(uuid, int, date, timestamptz, uuid);

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
  items        jsonb,
  photos       jsonb,
  stamp        text
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
    m.amount, m.currency, '[]'::jsonb as items, m.stamp
  from mine m
  where m.kind <> 'fuel'
  union all
  select
    g.ref_id, g.kind, g.occurred_on, g.created_at,
    g.fills || case when g.fills = 1 then ' fill-up' else ' fill-ups' end,
    null::text,
    g.amount, g.currency, g.items, null::text
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
  coalesce(a.photos, '[]'::jsonb),
  p.stamp
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
  'One keyset page of a vehicle build log. Fuel is collapsed to a month per row; every row carries its attachments and its stamp caption.';

revoke all on function public.timeline_page(uuid, int, date, timestamptz, uuid) from public;
grant execute on function public.timeline_page(uuid, int, date, timestamptz, uuid)
  to authenticated, service_role;
