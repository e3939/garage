-- 0006 — Views
--
-- v_expense_impact, copied from docs/02-DATA-MODEL.md. This is the only place
-- amortisation is implemented in the database; lib/budget.ts mirrors it for the
-- optimistic client path and is tested against these exact rules.
--
-- The other four views in that document (v_fuel_consumption, v_vehicle_totals,
-- v_service_due, v_timeline) belong to the phases that build the screens reading
-- them -- roadmap Phases 6, 3, 6 and 4 respectively -- and are deliberately not
-- created here. See AUTOPILOT-NOTES.md.
--
-- security_invoker = true so the base-table RLS policies apply to the caller.

create view public.v_expense_impact
with (security_invoker = true) as
select
  e.id as expense_id,
  e.user_id,
  e.vehicle_id,
  e.category_id,
  e.bucket,
  e.currency,
  (date_trunc('month', e.occurred_on)::date + (g.n || ' months')::interval)::date as impact_month,
  -- integer-safe split: remainder goes to the first slice
  case when g.n = 0
    then e.amount / e.amortize_months + (e.amount % e.amortize_months)
    else e.amount / e.amortize_months
  end as amount
from public.expenses e
cross join lateral generate_series(0, e.amortize_months - 1) as g(n)
where e.counts_toward_budget = true
  and e.is_draft = false;

comment on view public.v_expense_impact is
  'Each budget-affecting expense expanded into monthly slices. Remainder lands on the first slice: 100 over 3 months is 34/33/33.';
