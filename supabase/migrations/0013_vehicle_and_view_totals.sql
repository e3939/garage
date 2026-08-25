-- 0013 — v_vehicle_totals, and the three views of a month
--
-- Roadmap Phase 3. Every figure this phase puts on a screen is computed here.
-- Nothing is reduced in the browser (CLAUDE.md section 3).
--
-- The three views of the same data, from docs/01-PRODUCT.md:
--
--   Monthly  only counts_toward_budget = true, amortised across the months it
--            was spread over. The discipline number.
--   All-in   everything, at full amount, on the date it was paid. The truth.
--   Car only every bucket beginning car_, ignoring the budget switch, at full
--            amount. The cost-of-ownership number.
--
-- Amortisation belongs to the budget view alone: "Cash-out views and lifetime
-- totals always use the full amount on the purchase date." So `monthly_total`
-- reads v_expense_impact and the other two read `expenses` directly. That is the
-- whole reason the same month can show three different, correct figures.


-- ---------------------------------------------------------------------------
-- v_month_totals — one row per user, month and currency, carrying all three.
--
-- A month can exist in one half and not the other: a 24-month spread puts slices
-- into months that hold no cash out at all, and an expense kept out of the budget
-- is cash out with no slice. Hence the full join, and hence the coalesce on every
-- figure — a missing side is a zero, not a null.
-- ---------------------------------------------------------------------------

create view public.v_month_totals
with (security_invoker = true) as
with impact as (
  select
    i.user_id,
    i.currency,
    i.impact_month                     as month,
    sum(i.amount)::bigint              as monthly_total,
    count(distinct i.expense_id)::int  as monthly_count
  from public.v_expense_impact i
  group by i.user_id, i.currency, i.impact_month
),
cash as (
  select
    e.user_id,
    e.currency,
    date_trunc('month', e.occurred_on)::date as month,
    sum(e.amount)::bigint                    as all_in_total,
    count(*)::int                            as all_in_count,
    coalesce(sum(e.amount) filter (where e.bucket in ('car_running', 'car_project')), 0)::bigint
                                             as car_only_total,
    count(*) filter (where e.bucket in ('car_running', 'car_project'))::int
                                             as car_only_count
  from public.expenses e
  where e.is_draft = false
  group by e.user_id, e.currency, date_trunc('month', e.occurred_on)::date
)
select
  coalesce(i.user_id, c.user_id)        as user_id,
  coalesce(i.month, c.month)            as month,
  coalesce(i.currency, c.currency)      as currency,
  coalesce(i.monthly_total, 0)::bigint  as monthly_total,
  coalesce(i.monthly_count, 0)          as monthly_count,
  coalesce(c.all_in_total, 0)::bigint   as all_in_total,
  coalesce(c.all_in_count, 0)           as all_in_count,
  coalesce(c.car_only_total, 0)::bigint as car_only_total,
  coalesce(c.car_only_count, 0)         as car_only_count
from impact i
full join cash c
  on  c.user_id  = i.user_id
  and c.month    = i.month
  and c.currency = i.currency;

comment on view public.v_month_totals is
  'Monthly (budget, amortised), all-in and car-only totals for one month. The view switcher picks a column; it never recomputes anything.';


-- ---------------------------------------------------------------------------
-- v_vehicle_month_totals — the same three figures, per vehicle.
--
-- For a vehicle the all-in and car-only figures are always equal, because the
-- check constraint on `expenses` will not let a vehicle carry a life expense.
-- They are both kept anyway: the screens label a figure with the view it is
-- showing, and a figure that quietly stopped responding to the switcher would be
-- a worse lie than a figure that happens to match its neighbour.
-- ---------------------------------------------------------------------------

create view public.v_vehicle_month_totals
with (security_invoker = true) as
with impact as (
  select
    i.user_id,
    i.vehicle_id,
    i.currency,
    i.impact_month                     as month,
    sum(i.amount)::bigint              as monthly_total,
    count(distinct i.expense_id)::int  as monthly_count
  from public.v_expense_impact i
  where i.vehicle_id is not null
  group by i.user_id, i.vehicle_id, i.currency, i.impact_month
),
cash as (
  select
    e.user_id,
    e.vehicle_id,
    e.currency,
    date_trunc('month', e.occurred_on)::date as month,
    sum(e.amount)::bigint                    as all_in_total,
    count(*)::int                            as all_in_count,
    coalesce(sum(e.amount) filter (where e.bucket in ('car_running', 'car_project')), 0)::bigint
                                             as car_only_total,
    count(*) filter (where e.bucket in ('car_running', 'car_project'))::int
                                             as car_only_count
  from public.expenses e
  where e.is_draft = false
    and e.vehicle_id is not null
  group by e.user_id, e.vehicle_id, e.currency, date_trunc('month', e.occurred_on)::date
)
select
  coalesce(i.user_id, c.user_id)        as user_id,
  coalesce(i.vehicle_id, c.vehicle_id)  as vehicle_id,
  coalesce(i.month, c.month)            as month,
  coalesce(i.currency, c.currency)      as currency,
  coalesce(i.monthly_total, 0)::bigint  as monthly_total,
  coalesce(i.monthly_count, 0)          as monthly_count,
  coalesce(c.all_in_total, 0)::bigint   as all_in_total,
  coalesce(c.all_in_count, 0)           as all_in_count,
  coalesce(c.car_only_total, 0)::bigint as car_only_total,
  coalesce(c.car_only_count, 0)         as car_only_count
from impact i
full join cash c
  on  c.user_id    = i.user_id
  and c.vehicle_id = i.vehicle_id
  and c.month      = i.month
  and c.currency   = i.currency;

comment on view public.v_vehicle_month_totals is
  'The three monthly figures for one vehicle. All-in and car-only are equal by construction; a vehicle cannot carry a life expense.';


-- ---------------------------------------------------------------------------
-- v_vehicle_totals — the lifetime figures, one row per vehicle.
--
-- docs/02-DATA-MODEL.md names total_spend, running_spend, project_spend,
-- km_driven, cost_per_km, months_owned and planning_accuracy. Two figures are
-- added because the vehicle home needs them and they are sums of columns already
-- here rather than new facts: `purchase_price` and `total_invested`.
--
-- Everything is undiscounted and un-amortised: this is a lifetime total, and
-- lifetime totals use the full amount on the date it was paid.
--
-- One currency, one row. Amounts in a currency other than the profile's base are
-- excluded rather than converted, because no rate is stored on the row
-- (CLAUDE.md section 5). Multi-currency conversion is on the deferred list in
-- docs/04-ROADMAP.md.
-- ---------------------------------------------------------------------------

create view public.v_vehicle_totals
with (security_invoker = true) as
select
  v.id                                as vehicle_id,
  v.user_id,
  cur.code                            as currency,

  coalesce(spend.total_spend, 0)::bigint    as total_spend,
  coalesce(spend.running_spend, 0)::bigint  as running_spend,
  coalesce(spend.project_spend, 0)::bigint  as project_spend,

  -- A purchase price recorded in another currency is not folded in, for the same
  -- reason a foreign expense is not.
  case
    when v.purchase_price is null then 0
    when coalesce(v.currency, cur.code) <> cur.code then 0
    else v.purchase_price
  end::bigint                         as purchase_price,

  (
    case
      when v.purchase_price is null then 0
      when coalesce(v.currency, cur.code) <> cur.code then 0
      else v.purchase_price
    end
    + coalesce(spend.total_spend, 0)
  )::bigint                           as total_invested,

  (v.odometer_km - v.purchase_odometer_km) as km_driven,

  case
    when v.odometer_km - v.purchase_odometer_km > 0 then
      round(
        (
          case
            when v.purchase_price is null then 0
            when coalesce(v.currency, cur.code) <> cur.code then 0
            else v.purchase_price
          end
          + coalesce(spend.total_spend, 0)
        )::numeric
        / (v.odometer_km - v.purchase_odometer_km)
      )::bigint
  end                                 as cost_per_km,

  case
    when v.purchase_date is null then null
    else (
      extract(year  from age(coalesce(v.sold_date, current_date), v.purchase_date)) * 12
      + extract(month from age(coalesce(v.sold_date, current_date), v.purchase_date))
    )::int
  end                                 as months_owned,

  case
    when plan.estimate_total is null or plan.estimate_total = 0 then null
    else round(plan.actual_total::numeric / plan.estimate_total, 4)
  end                                 as planning_accuracy

from public.vehicles v
left join public.profiles p on p.id = v.user_id
cross join lateral (select coalesce(p.base_currency, 'VND')::char(3) as code) cur

left join lateral (
  select
    sum(e.amount)::bigint as total_spend,
    coalesce(sum(e.amount) filter (where e.bucket = 'car_running'), 0)::bigint as running_spend,
    coalesce(sum(e.amount) filter (where e.bucket = 'car_project'), 0)::bigint as project_spend
  from public.expenses e
  where e.vehicle_id = v.id
    and e.is_draft = false
    and e.currency = cur.code
) spend on true

-- Planning accuracy: actuals over estimates across installed mods. The estimate
-- is the midpoint of the range when both ends are given, and whichever end exists
-- when only one does. A mod with no estimate at all is left out of both sums
-- rather than counted as an infinite overrun.
left join lateral (
  select
    sum(x.actual)::bigint   as actual_total,
    sum(x.estimate)::bigint as estimate_total
  from (
    select
      coalesce((
        select sum(e.amount)
        from public.expenses e
        where e.mod_plan_id = m.id
          and e.is_draft = false
          and e.currency = cur.code
      ), 0) as actual,
      coalesce((m.est_cost_min + m.est_cost_max) / 2, m.est_cost_max, m.est_cost_min) as estimate
    from public.mod_plans m
    where m.vehicle_id = v.id
      and m.status = 'installed'
      and m.archived_at is null
      and coalesce(m.currency, cur.code) = cur.code
  ) x
  where x.estimate is not null
    and x.estimate > 0
) plan on true;

comment on view public.v_vehicle_totals is
  'Lifetime, undiscounted figures per vehicle: what it cost, how far it has gone, and what that works out to per kilometre.';


-- ---------------------------------------------------------------------------
-- Grants. Same shape as 0007 and 0010: authenticated and service_role, never anon.
-- ---------------------------------------------------------------------------

grant select on public.v_month_totals          to authenticated, service_role;
grant select on public.v_vehicle_month_totals  to authenticated, service_role;
grant select on public.v_vehicle_totals        to authenticated, service_role;
