-- 0016 — Maintenance, fuel and parts
--
-- Roadmap Phase 6. No new tables, no new columns, no new enums: `service_schedules`,
-- `service_records`, `fuel_logs` and `parts` have all existed since 0003. What is
-- missing is the arithmetic and the two triggers docs/02-DATA-MODEL.md promises,
-- and every figure these screens put up is computed here rather than reduced in
-- the browser (CLAUDE.md section 3).
--
-- Five things:
--
--   seed_service_schedules()      a new vehicle arrives with the seven default
--                                 intervals from docs/01-PRODUCT.md section D.
--   roll_up_service_schedule()    a service record moves its schedule's
--                                 last_done_* — "Trigger: inserting a record
--                                 updates the parent schedule's last_done_*".
--   v_service_due                 due_km, due_date, km_remaining, days_remaining
--                                 and a state of ok / due_soon / overdue.
--   v_fuel_consumption            one row per completed full-tank-to-full-tank
--                                 interval.
--   v_fuel_summary                the same intervals rolled up per vehicle.
--
-- Parts need nothing here. The remove -> keep / sell / bin flow is three status
-- values and one negative expense, and both already have columns.


-- ---------------------------------------------------------------------------
-- A new vehicle arrives with a service book.
--
-- docs/01-PRODUCT.md, section D: "Seeded defaults on vehicle creation: engine
-- oil + filter (5,000km / 6mo), air filter (15,000km / 12mo), brake fluid
-- (—/24mo), coolant (40,000km/24mo), spark plugs (40,000km/—), transmission
-- fluid (60,000km/—), tyre rotation (10,000km/—). All editable and deletable —
-- they are a starting point, not doctrine."
--
-- Seven rows, exactly as listed, for every vehicle whatever it runs on. An
-- electric car has no spark plugs and its owner can delete the row in one tap;
-- a table that decided for them would be a table that has an opinion about
-- hybrids, range extenders and rotaries, and it would be wrong about at least
-- one of them.
--
-- No `last_done_*`: nothing has been done to a car nobody has serviced yet. What
-- the interval is measured from in the meantime is decided by `v_service_due`,
-- not stored here as a fact that never happened.
--
-- No `security definer`. The caller owns the vehicle, so the insert policy on
-- service_schedules lets this through on its own.
-- ---------------------------------------------------------------------------

create or replace function public.seed_service_schedules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.service_schedules
    (user_id, vehicle_id, name, interval_km, interval_months)
  values
    (new.user_id, new.id, 'Engine oil + filter',   5000,  6),
    (new.user_id, new.id, 'Air filter',           15000, 12),
    (new.user_id, new.id, 'Brake fluid',           null, 24),
    (new.user_id, new.id, 'Coolant',              40000, 24),
    (new.user_id, new.id, 'Spark plugs',          40000, null),
    (new.user_id, new.id, 'Transmission fluid',   60000, null),
    (new.user_id, new.id, 'Tyre rotation',        10000, null);

  return null;
end;
$$;

comment on function public.seed_service_schedules() is
  'Gives a new vehicle the seven default service intervals from docs/01-PRODUCT.md section D. All editable, all deletable.';

create trigger vehicles_seed_service_schedules
  after insert on public.vehicles
  for each row execute function public.seed_service_schedules();


-- ---------------------------------------------------------------------------
-- A service record rolls up into its schedule.
--
-- docs/02-DATA-MODEL.md, on service_records: "Trigger: inserting a record
-- updates the parent schedule's last_done_*."
--
-- Recomputed from the records rather than written forward from the new row, so
-- editing a record's date and deleting one both land correctly. Back-dating a
-- forgotten oil change from March must not move the schedule past the one you
-- did in August, and deleting the August one must move it back.
--
-- The two halves are two independent maxima, not one row's pair of columns:
-- `last_done_on` is the latest date this was done and `last_done_km` is the
-- furthest reading it was done at. They come apart when a record carries no
-- odometer, which is allowed — a workshop invoice often does not have one — and
-- taking the latest row's null would otherwise throw away a reading that is
-- still the best thing known about the km axis.
--
-- An update that moves a record from one schedule to another touches both.
-- ---------------------------------------------------------------------------

create or replace function public.roll_up_service_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  targets uuid[] := array[]::uuid[];
  target  uuid;
begin
  if tg_op <> 'INSERT' then
    if old.schedule_id is not null then targets := targets || old.schedule_id; end if;
  end if;

  if tg_op <> 'DELETE' then
    if new.schedule_id is not null then targets := targets || new.schedule_id; end if;
  end if;

  foreach target in array targets loop
    update public.service_schedules sc
    set last_done_km = roll.done_km,
        last_done_on = roll.done_on
    from (
      select
        max(r.odometer_km)  as done_km,
        max(r.performed_on) as done_on
      from public.service_records r
      where r.schedule_id = target
    ) roll
    where sc.id = target;
  end loop;

  return null;
end;
$$;

comment on function public.roll_up_service_schedule() is
  'Recomputes a schedule''s last_done_km and last_done_on from its service records. Handles back-dating, re-pointing and deletion, not just insertion.';

create trigger service_records_roll_up_schedule
  after insert or update of schedule_id, performed_on, odometer_km or delete
  on public.service_records
  for each row execute function public.roll_up_service_schedule();


-- ---------------------------------------------------------------------------
-- v_service_due
--
-- docs/02-DATA-MODEL.md: "Per schedule row: due_km, due_date, km_remaining,
-- days_remaining, and a state of ok / due_soon / overdue."
-- docs/01-PRODUCT.md: "Due calculation uses whichever comes first. ... 'Due
-- soon' thresholds: within 500km or 30 days."
--
-- Whichever comes first wins, so the state is the worse of the two axes: past on
-- either is overdue, close on either is due soon. An axis the schedule does not
-- have — brake fluid has no kilometre interval — does not vote.
--
-- **What an unserviced schedule is measured from.** A seeded schedule has no
-- last_done_*, and an interval has to be measured from something or the whole
-- feature is inert until the first time you mark something done. The baseline is
-- the day you took the car on and the reading it was on then: `purchase_date`
-- and `purchase_odometer_km`, which is the same pair `km_driven` is measured
-- from. `basis` says which of the two it used, so a screen can say "estimated
-- from purchase" rather than claim the car was serviced that day. Where there is
-- no purchase date either, the row's own creation date stands in.
--
-- `today` is the calendar day in Asia/Ho_Chi_Minh, not the server's UTC day. At
-- half past midnight in Ho Chi Minh City those are different dates and
-- `days_remaining` would be out by one for seven hours every night.
--
-- `remaining_fraction` is what the gauge on the vehicle home sweeps: how much of
-- the interval is left, as the smaller of the two axes. It is a fraction of the
-- interval rather than of anything absolute, so 400km left on a 5,000km oil
-- change reads as more urgent than 400km left on a 40,000km coolant flush —
-- which is how it actually feels. `least` ignores nulls, so a one-axis schedule
-- gets that axis.
-- ---------------------------------------------------------------------------

create view public.v_service_due
with (security_invoker = true) as
select
  s.id                      as schedule_id,
  s.user_id,
  s.vehicle_id,
  s.name,
  s.interval_km,
  s.interval_months,
  s.last_done_km,
  s.last_done_on,
  s.notes,
  v.odometer_km,
  b.basis,
  b.basis_km,
  b.basis_on,
  d.due_km,
  d.due_date,
  d.km_remaining,
  d.days_remaining,
  f.km_fraction,
  f.day_fraction,
  least(f.km_fraction, f.day_fraction)  as remaining_fraction,
  case
    when f.km_fraction is not null
         and (f.day_fraction is null or f.km_fraction <= f.day_fraction) then 'km'
    when f.day_fraction is not null                                      then 'date'
  end                                   as due_by,
  st.state,
  -- Sortable urgency, because a screen orders by "most pressing" and `state` is
  -- a word. Ranked first and the fraction second: "due soon" is an absolute
  -- threshold (500km, 30 days) and the fraction is relative, so a coolant flush
  -- 500km out has a smaller fraction than an oil change 600km out while being
  -- the less pressing of the two. The rank settles that; the fraction breaks
  -- ties inside it.
  case st.state when 'overdue' then 0 when 'due_soon' then 1 else 2 end as urgency
from public.service_schedules s
join public.vehicles v on v.id = s.vehicle_id
cross join lateral (
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date as day
) t
cross join lateral (
  select
    case
      when s.last_done_km is not null or s.last_done_on is not null then 'done'
      else 'purchase'
    end                                                              as basis,
    coalesce(s.last_done_km, v.purchase_odometer_km)                 as basis_km,
    coalesce(s.last_done_on, v.purchase_date, v.created_at::date)    as basis_on
) b
cross join lateral (
  select
    case when s.interval_km is not null
         then b.basis_km + s.interval_km end                          as due_km,
    case when s.interval_months is not null
         then (b.basis_on + (s.interval_months || ' months')::interval)::date end
                                                                      as due_date
) raw
cross join lateral (
  select
    raw.due_km,
    raw.due_date,
    case when raw.due_km   is not null then raw.due_km - v.odometer_km end as km_remaining,
    case when raw.due_date is not null then raw.due_date - t.day       end as days_remaining
) d
cross join lateral (
  select
    case when d.km_remaining is not null and s.interval_km > 0
         then d.km_remaining::numeric / s.interval_km end             as km_fraction,
    case when d.days_remaining is not null and (d.due_date - b.basis_on) > 0
         then d.days_remaining::numeric / (d.due_date - b.basis_on) end
                                                                      as day_fraction
) f
cross join lateral (
  select
    case
      when d.due_km is null and d.due_date is null                     then 'ok'
      when coalesce(d.km_remaining, 2147483647) < 0
        or coalesce(d.days_remaining, 2147483647) < 0                  then 'overdue'
      when coalesce(d.km_remaining, 2147483647) <= 500
        or coalesce(d.days_remaining, 2147483647) <= 30                then 'due_soon'
      else 'ok'
    end as state
) st
where s.archived_at is null;

comment on view public.v_service_due is
  'Every live service schedule with what it is due at, how far off that is on both axes, and a state of ok / due_soon / overdue. Whichever axis comes first wins.';


-- ---------------------------------------------------------------------------
-- v_fuel_consumption
--
-- docs/02-DATA-MODEL.md: "One row per completed full-tank-to-full-tank interval,
-- with km, litres, l_per_100km, km_per_l, cost, cost_per_km." And the rule:
--
--   litres_consumed = sum(litres of fills after the earlier full tank, up to and
--                     including the later one)
--   distance        = later.odometer_km - earlier.odometer_km
--   Skip any interval where missed_previous is true.
--
-- The grouping is the whole trick. Number each fill by how many full tanks came
-- strictly before it, and every group is exactly one interval: the partial fills
-- after full tank k, closed by full tank k+1, which is always the last row in
-- the group because passing it is what increments the counter. Group 0 is
-- whatever came before the first full tank and has no earlier tank to measure
-- from, so it is dropped.
--
-- A group with no full tank in it is the tail — fills since the last full tank,
-- an interval still in progress — and is dropped for the same reason: nothing
-- has closed it yet.
--
-- `missed_previous` on any fill in the interval kills the whole interval, not
-- just that fill. The flag means the chain is broken: litres were burned that
-- were never logged, so the litres in this window do not account for the
-- distance in it, and a figure computed from them would be confidently wrong.
--
-- Ordering is chronological — (filled_on, odometer_km, id) — because that is the
-- order the fills happened in and the odometer is a reading, not a clock. An
-- interval whose distance comes out at zero or below is a typo somewhere and is
-- dropped rather than shown as an infinity.
--
-- One currency per interval, or no cost at all. Nothing here converts, because
-- no rate is stored on the row (CLAUDE.md section 5); litres and kilometres are
-- physics and are unaffected, so consumption still computes and only the money
-- goes null.
-- ---------------------------------------------------------------------------

create view public.v_fuel_consumption
with (security_invoker = true) as
with ordered as (
  select
    f.id,
    f.user_id,
    f.vehicle_id,
    f.filled_on,
    f.odometer_km,
    f.litres,
    f.total_cost,
    f.is_full_tank,
    f.missed_previous,
    coalesce(f.currency, p.base_currency)::char(3) as currency,
    count(*) filter (where f.is_full_tank) over (
      partition by f.vehicle_id
      order by f.filled_on, f.odometer_km, f.id
      rows between unbounded preceding and 1 preceding
    ) as prior_fulls
  from public.fuel_logs f
  join public.profiles p on p.id = f.user_id
),
fulls as (
  select
    o.vehicle_id,
    o.prior_fulls + 1 as ordinal,
    o.filled_on,
    o.odometer_km
  from ordered o
  where o.is_full_tank
),
intervals as (
  select
    o.user_id,
    o.vehicle_id,
    o.prior_fulls                                      as ordinal,
    -- Exactly one row in a group is a full tank, and it is the last one; uuid
    -- has no max(), so the closer's id is taken out of a filtered array.
    (array_agg(o.id) filter (where o.is_full_tank))[1] as end_fuel_log_id,
    max(o.filled_on) filter (where o.is_full_tank)     as ended_on,
    max(o.odometer_km) filter (where o.is_full_tank)   as end_km,
    sum(o.litres)                                      as litres,
    sum(o.total_cost)                                  as cost,
    count(*)::int                                      as fills,
    bool_or(o.missed_previous)                         as missed,
    bool_or(o.is_full_tank)                            as closed,
    count(distinct o.currency)::int                    as currencies,
    max(o.currency)                                    as currency
  from ordered o
  where o.prior_fulls >= 1
  group by o.user_id, o.vehicle_id, o.prior_fulls
),
computed as (
  select
    i.user_id,
    i.vehicle_id,
    i.end_fuel_log_id,
    start.filled_on                          as started_on,
    start.odometer_km                        as start_km,
    i.ended_on,
    i.end_km,
    (i.end_km - start.odometer_km)::int      as km,
    i.litres,
    i.fills,
    i.currency,
    case when i.currencies = 1 then i.cost::bigint end as cost
  from intervals i
  join fulls start
    on  start.vehicle_id = i.vehicle_id
    and start.ordinal    = i.ordinal
  where i.closed
    and not i.missed
    and i.litres > 0
    and i.end_km - start.odometer_km > 0
)
select
  c.user_id,
  c.vehicle_id,
  c.end_fuel_log_id,
  c.started_on,
  c.ended_on,
  c.start_km,
  c.end_km,
  c.km,
  c.litres,
  c.fills,
  c.currency,
  c.cost,
  round(c.litres * 100 / c.km, 2)                        as l_per_100km,
  round(c.km / c.litres, 2)                              as km_per_l,
  case when c.cost is not null then round(c.cost::numeric / c.km)::bigint    end as cost_per_km,
  case when c.cost is not null then round(c.cost::numeric / c.litres)::bigint end as cost_per_litre,
  -- The rolling average docs/01-PRODUCT.md asks for: this interval and the two
  -- before it. Fewer than three so far averages what there is, which is what
  -- somebody reading the third row of a new log expects to see.
  round(
    avg(c.litres * 100 / c.km) over (
      partition by c.vehicle_id
      order by c.ended_on, c.end_km
      rows between 2 preceding and current row
    ),
    2
  )                                                       as rolling3_l_per_100km
from computed c;

comment on view public.v_fuel_consumption is
  'One row per completed full-tank-to-full-tank interval: distance, litres burned, L/100km, km/L, cost and cost per km, with a three-interval rolling average.';


-- ---------------------------------------------------------------------------
-- v_fuel_summary — the fuel page's headline figures, one row per vehicle.
--
-- The lifetime consumption is litres-weighted rather than an average of the
-- per-interval figures: total litres over total distance. A mean of ratios
-- gives a 40km splash-and-dash the same say as a 600km motorway run, which is
-- how a fuel log ends up disagreeing with the arithmetic somebody did on the
-- back of the receipt.
--
-- `fills` and `total_cost` count every fill-up, including the partials and the
-- ones outside a usable interval — that is what was spent on fuel. The
-- consumption figures count only what is inside a closed, unbroken interval.
-- The two are different questions and the screen labels them differently.
-- ---------------------------------------------------------------------------

create view public.v_fuel_summary
with (security_invoker = true) as
select
  v.id                                       as vehicle_id,
  v.user_id,
  cur.code                                   as currency,
  coalesce(all_fills.fills, 0)::int          as fills,
  all_fills.first_on,
  all_fills.last_on,
  coalesce(all_fills.total_litres, 0)        as total_litres,
  coalesce(all_fills.total_cost, 0)::bigint  as total_cost,
  coalesce(runs.intervals, 0)::int           as intervals,
  coalesce(runs.km, 0)::int                  as measured_km,
  coalesce(runs.litres, 0)                   as measured_litres,
  case when runs.km > 0 then round(runs.litres * 100 / runs.km, 2) end  as l_per_100km,
  case when runs.litres > 0 then round(runs.km / runs.litres, 2) end    as km_per_l,
  case when runs.km > 0 and runs.cost is not null
       then round(runs.cost::numeric / runs.km)::bigint end             as cost_per_km,
  latest.l_per_100km                         as latest_l_per_100km,
  latest.km_per_l                            as latest_km_per_l,
  latest.rolling3_l_per_100km,
  latest.ended_on                            as latest_on
from public.vehicles v
left join public.profiles p on p.id = v.user_id
cross join lateral (select coalesce(p.base_currency, 'VND')::char(3) as code) cur
left join lateral (
  select
    count(*)::int      as fills,
    min(f.filled_on)   as first_on,
    max(f.filled_on)   as last_on,
    sum(f.litres)      as total_litres,
    sum(f.total_cost) filter (where coalesce(f.currency, cur.code) = cur.code)::bigint
                       as total_cost
  from public.fuel_logs f
  where f.vehicle_id = v.id
) all_fills on true
left join lateral (
  select
    count(*)::int   as intervals,
    sum(c.km)::int  as km,
    sum(c.litres)   as litres,
    sum(c.cost) filter (where c.currency = cur.code)::bigint as cost
  from public.v_fuel_consumption c
  where c.vehicle_id = v.id
) runs on true
left join lateral (
  select c.l_per_100km, c.km_per_l, c.rolling3_l_per_100km, c.ended_on
  from public.v_fuel_consumption c
  where c.vehicle_id = v.id
  order by c.ended_on desc, c.end_km desc
  limit 1
) latest on true;

comment on view public.v_fuel_summary is
  'Per vehicle: every fill-up counted for spend, and only closed unbroken intervals counted for consumption. Lifetime consumption is litres-weighted, not a mean of ratios.';


-- ---------------------------------------------------------------------------
-- Grants. Same shape as every migration before it: authenticated and
-- service_role, never anon.
-- ---------------------------------------------------------------------------

grant select on public.v_service_due       to authenticated, service_role;
grant select on public.v_fuel_consumption  to authenticated, service_role;
grant select on public.v_fuel_summary      to authenticated, service_role;
