-- 0017 — Budgets, funds, reports and recurrences
--
-- Roadmap Phase 7. Every figure this phase puts on a screen is computed here.
-- Nothing is reduced in the browser (CLAUDE.md section 3).
--
-- The one rule that governs the whole file: **a budget figure reads
-- `v_expense_impact` and nothing else.** That view is the only implementation of
-- amortisation in the system, and a budget that ignored it would show a set of
-- tyres spread over 24 months as a single catastrophic August. Cash-out figures
-- — reports' all-in column, the top-ten list — read `expenses` directly at full
-- amount on the day it was paid, which is the same split `v_month_totals` makes.
--
-- No new tables. `budgets`, `funds`, `fund_contributions` and
-- `recurring_expenses` were created in 0004 with their policies in 0007; this
-- migration adds the views, the functions and the schedule that make them do
-- something.


-- ===========================================================================
-- Budgets
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- v_budget_month — the overall monthly figure against what was actually spent.
--
-- One row per user, month and currency. A full join because both halves exist
-- independently: a budget can be set for a month nothing has been spent in, and
-- a month can be spent in with no budget set at all. The screen needs a row
-- either way — with no budget it shows the spend and offers to set one.
--
-- `spent` is the monthly view: budget-affecting expenses only, amortised. That
-- is what a budget is measured against, so that is what the arc reads.
-- ---------------------------------------------------------------------------

create view public.v_budget_month
with (security_invoker = true) as
with impact as (
  select
    i.user_id,
    i.currency,
    i.impact_month                    as month,
    sum(i.amount)::bigint             as spent,
    count(distinct i.expense_id)::int as expense_count
  from public.v_expense_impact i
  group by i.user_id, i.currency, i.impact_month
),
overall as (
  select
    b.id                                          as budget_id,
    b.user_id,
    b.month,
    coalesce(b.currency, p.base_currency)::char(3) as currency,
    b.amount
  from public.budgets b
  join public.profiles p on p.id = b.user_id
  where b.category_id is null
)
select
  coalesce(o.user_id, i.user_id)      as user_id,
  coalesce(o.month, i.month)          as month,
  coalesce(o.currency, i.currency)    as currency,
  o.budget_id,
  o.amount                            as budget_amount,
  coalesce(i.spent, 0)::bigint        as spent,
  coalesce(i.expense_count, 0)        as expense_count,
  case when o.amount is null then null else (o.amount - coalesce(i.spent, 0))::bigint end
                                      as remaining,
  -- Null rather than infinity when the budget is zero: a zero budget has no
  -- meaningful "per cent of" and the arc draws nothing instead of everything.
  case
    when o.amount is null or o.amount = 0 then null
    else round(coalesce(i.spent, 0)::numeric / o.amount, 4)
  end                                 as used_fraction
from overall o
full join impact i
  on  i.user_id  = o.user_id
  and i.month    = o.month
  and i.currency = o.currency;

comment on view public.v_budget_month is
  'The overall monthly budget against amortised, budget-affecting spend. One row per user, month and currency; either side may be absent.';


-- ---------------------------------------------------------------------------
-- v_budget_category_month — the optional per-category caps.
--
-- Driven by `budgets`, not by spend: a category with no cap is not over or under
-- anything, so it has no row here. It still appears in the reports breakdown,
-- which is where "what did I spend it on" lives.
-- ---------------------------------------------------------------------------

create view public.v_budget_category_month
with (security_invoker = true) as
with impact as (
  select
    i.user_id,
    i.currency,
    i.category_id,
    i.impact_month        as month,
    sum(i.amount)::bigint as spent,
    count(distinct i.expense_id)::int as expense_count
  from public.v_expense_impact i
  where i.category_id is not null
  group by i.user_id, i.currency, i.category_id, i.impact_month
)
select
  b.id                                           as budget_id,
  b.user_id,
  b.month,
  b.category_id,
  c.name                                         as category_name,
  c.icon                                         as category_icon,
  c.colour_hex                                   as category_colour_hex,
  c.default_bucket                               as category_bucket,
  coalesce(b.currency, p.base_currency)::char(3) as currency,
  b.amount                                       as budget_amount,
  coalesce(i.spent, 0)::bigint                   as spent,
  coalesce(i.expense_count, 0)                   as expense_count,
  (b.amount - coalesce(i.spent, 0))::bigint      as remaining,
  case
    when b.amount = 0 then null
    else round(coalesce(i.spent, 0)::numeric / b.amount, 4)
  end                                            as used_fraction
from public.budgets b
join public.profiles p   on p.id = b.user_id
join public.categories c on c.id = b.category_id
left join impact i
  on  i.user_id     = b.user_id
  and i.month       = b.month
  and i.category_id = b.category_id
  and i.currency    = coalesce(b.currency, p.base_currency)::char(3)
where b.category_id is not null;

comment on view public.v_budget_category_month is
  'Per-category caps against amortised spend in that category. A category with no cap has no row.';


-- ---------------------------------------------------------------------------
-- copy_budgets_from — last month again, in one statement.
--
-- Insert-only. An existing row for the target month wins, because the button is
-- offered as a starting point and silently overwriting a figure somebody typed
-- would be the worst kind of helpful. Returns how many rows it wrote so the
-- toast can say something true.
--
-- Security invoker: the insert goes through the caller's own RLS policies, and
-- `auth.uid()` is what stamps the row, so this cannot copy anybody else's budget
-- anywhere.
-- ---------------------------------------------------------------------------

create function public.copy_budgets_from(p_from date, p_to date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  written integer;
begin
  insert into public.budgets (user_id, month, category_id, amount, currency)
  select b.user_id, p_to, b.category_id, b.amount, b.currency
  from public.budgets b
  where b.user_id = (select auth.uid())
    and b.month = p_from
  on conflict on constraint budgets_user_month_category_key do nothing;

  get diagnostics written = row_count;
  return written;
end;
$$;

comment on function public.copy_budgets_from(date, date) is
  'Copy one month of budgets onto another, never overwriting a figure already there. Returns the number of rows written.';


-- ---------------------------------------------------------------------------
-- save_budgets — the whole month, in one transaction.
--
-- The sheet edits an overall figure and a set of caps together, and they have to
-- land together: clearing the overall budget and adding a cap in two round trips
-- leaves a window where the month is a lie. Delete-then-insert inside one
-- function is one statement from the client's point of view and one transaction
-- from the database's, so a failure anywhere leaves the month exactly as it was.
--
-- A cap with a null amount is simply absent from the insert, which is how a cap
-- is removed. Two caps on the same category hit the unique constraint and roll
-- the whole thing back rather than silently keeping one.
-- ---------------------------------------------------------------------------

create function public.save_budgets(
  p_month    date,
  p_currency char(3),
  p_overall  bigint default null,
  p_caps     jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid      uuid := (select auth.uid());
  written  integer := 0;
  inserted integer;
begin
  if uid is null then
    raise exception 'save_budgets requires a signed-in user';
  end if;

  delete from public.budgets b
  where b.user_id = uid
    and b.month = p_month;

  if p_overall is not null then
    insert into public.budgets (user_id, month, category_id, amount, currency)
    values (uid, p_month, null, p_overall, p_currency);
    written := written + 1;
  end if;

  insert into public.budgets (user_id, month, category_id, amount, currency)
  select uid, p_month, (cap ->> 'category_id')::uuid, (cap ->> 'amount')::bigint, p_currency
  from jsonb_array_elements(p_caps) as cap
  where cap ->> 'amount' is not null;

  get diagnostics inserted = row_count;
  return written + inserted;
end;
$$;

comment on function public.save_budgets(date, char, bigint, jsonb) is
  'Replace one month of budgets — the overall figure and every category cap — in a single transaction. Returns the number of rows written.';


-- ===========================================================================
-- Funds
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- v_fund_status — balance, progress and the date it lands.
--
-- The balance is the sum of contributions and is never stored
-- (docs/02-DATA-MODEL.md). A drawdown is a negative contribution, so the same
-- sum covers both directions without a second column to keep in step.
--
-- The projection is deliberately naive arithmetic: what is left, divided by the
-- monthly contribution, rounded up, added to this month. It assumes the
-- contribution actually gets made every month, which is exactly the assumption
-- the sentence "at 2.000.000 dong a month, funded by March 2027" makes out loud.
-- With no contribution rate set there is no date, and the screen says so rather
-- than inventing one.
-- ---------------------------------------------------------------------------

create view public.v_fund_status
with (security_invoker = true) as
select
  f.id                                           as fund_id,
  f.user_id,
  f.name,
  f.vehicle_id,
  v.nickname                                     as vehicle_nickname,
  f.mod_plan_id,
  m.title                                        as mod_title,
  m.status                                       as mod_status,
  coalesce(f.currency, p.base_currency)::char(3) as currency,
  f.target_amount,
  f.monthly_contribution,
  f.closed_at,
  f.created_at,
  coalesce(c.balance, 0)::bigint                 as balance,
  coalesce(c.contribution_count, 0)              as contribution_count,
  c.last_contributed_on,
  greatest(f.target_amount - coalesce(c.balance, 0), 0)::bigint as remaining,
  case
    when f.target_amount = 0 then null
    else round(coalesce(c.balance, 0)::numeric / f.target_amount, 4)
  end                                            as progress,
  months_remaining.n                             as months_remaining,
  case
    when months_remaining.n is null then null
    else (
      date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')::date)
      + (months_remaining.n || ' months')::interval
    )::date
  end                                            as projected_on
from public.funds f
join public.profiles p on p.id = f.user_id
left join public.vehicles v  on v.id = f.vehicle_id
left join public.mod_plans m on m.id = f.mod_plan_id
left join lateral (
  select
    sum(fc.amount)::bigint as balance,
    count(*)::int          as contribution_count,
    max(fc.occurred_on)    as last_contributed_on
  from public.fund_contributions fc
  where fc.fund_id = f.id
) c on true
cross join lateral (
  select case
    when greatest(f.target_amount - coalesce(c.balance, 0), 0) = 0 then 0
    when f.monthly_contribution is null or f.monthly_contribution <= 0 then null
    else ceil(
      greatest(f.target_amount - coalesce(c.balance, 0), 0)::numeric
      / f.monthly_contribution
    )::int
  end as n
) months_remaining;

comment on view public.v_fund_status is
  'A sinking fund with its balance, progress and projected completion date. Balance is the sum of contributions; a drawdown is a negative one.';


-- ===========================================================================
-- Recurring templates
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- next_recurrence_due — move a due date on by one period.
--
-- The day of the month survives a short month: a template due on the 31st lands
-- on the 30th in April and comes back to the 31st in May, because the clamp is
-- applied to the stored `day_of_month` rather than to whatever last month
-- managed. Postgres's own `+ interval '1 month'` would have quietly walked the
-- date backwards a day at a time down the year.
--
-- `lib/recurring/cadence.ts` is a mirror of this function and is tested against
-- it. If the two disagree, this one is right.
-- ---------------------------------------------------------------------------

create function public.next_recurrence_due(
  p_cadence       public.recurrence,
  p_from          date,
  p_day_of_month  smallint default null,
  p_month_of_year smallint default null
)
returns date
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  base     date;
  y        int;
  m        int;
  d        int;
  last_day int;
begin
  base := case p_cadence
    when 'monthly'   then p_from + interval '1 month'
    when 'quarterly' then p_from + interval '3 months'
    when 'yearly'    then p_from + interval '1 year'
  end;

  y := extract(year  from base);
  m := extract(month from base);

  -- A yearly template can name its month; a monthly one cannot, because every
  -- month is its month.
  if p_cadence = 'yearly' and p_month_of_year is not null then
    m := p_month_of_year;
  end if;

  last_day := extract(day from (make_date(y, m, 1) + interval '1 month' - interval '1 day'));
  d := coalesce(p_day_of_month::int, extract(day from base)::int);

  return make_date(y, m, least(d, last_day));
end;
$$;

comment on function public.next_recurrence_due(public.recurrence, date, smallint, smallint) is
  'The next due date one period after the given one, clamping the day of month to the length of the month it lands in.';


-- ---------------------------------------------------------------------------
-- generate_due_recurrences — the cron job's whole job.
--
-- For every active template whose next due date has arrived, insert a draft
-- expense and move the due date on. Nothing enters the ledger: `is_draft` is
-- true, which keeps the row out of `v_expense_impact`, `v_month_totals`,
-- `v_timeline`, `ledger_page` and every total in the app until a person taps
-- Confirm. docs/01-PRODUCT.md: "Never silently created."
--
-- Security definer, because the cron job runs as `postgres` with no `auth.uid()`
-- and has to write rows for every user. That makes it the one function in this
-- schema that can bypass RLS, so execute is revoked from everybody and granted
-- only to `service_role` — the key the cron endpoint holds, and nothing that
-- ever reaches a browser.
--
-- A template that is several periods behind is caught up in one run rather than
-- one period a day, capped at `MAX_CATCH_UP` so a template with a due date set
-- to 1970 cannot generate twenty thousand drafts. A template with no amount
-- generates nothing: an expense of nothing is a mistake, not a record, and the
-- form will not save one either.
-- ---------------------------------------------------------------------------

create function public.generate_due_recurrences(p_today date default null)
returns table (
  expense_id   uuid,
  recurring_id uuid,
  user_id      uuid,
  occurred_on  date,
  amount       bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_catch_up constant int := 24;
  today        date := coalesce(p_today, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  t            record;
  due          date;
  guard        int;
  new_id       uuid;
begin
  for t in
    select r.*, c.default_bucket, c.default_counts_toward_budget
    from public.recurring_expenses r
    left join public.categories c on c.id = r.category_id
    where r.active
      and r.next_due <= today
      and r.amount is not null
    order by r.next_due
    for update of r skip locked
  loop
    due   := t.next_due;
    guard := 0;

    while due <= today and guard < max_catch_up loop
      insert into public.expenses (
        user_id, occurred_on, amount, currency, category_id, vehicle_id,
        bucket, counts_toward_budget, merchant, recurring_id, is_draft
      )
      values (
        t.user_id,
        due,
        t.amount,
        coalesce(t.currency, 'VND'),
        t.category_id,
        t.vehicle_id,
        -- The template normally stores both, because the form resolves them the
        -- same way the expense form does. The coalesces are what happens if a
        -- row was written by hand: the category's defaults, then the bucket rule
        -- that the check constraint would enforce anyway.
        case
          when t.vehicle_id is null then 'life'::public.expense_bucket
          when coalesce(t.bucket, t.default_bucket, 'car_running') = 'life' then 'car_running'::public.expense_bucket
          else coalesce(t.bucket, t.default_bucket, 'car_running')
        end,
        coalesce(t.counts_toward_budget, t.default_counts_toward_budget, true),
        -- The ledger row needs a name and `expenses` has no label column. The
        -- template's label is the name of the thing: "Rent", "Insurance".
        t.label,
        t.id,
        true
      )
      returning id into new_id;

      expense_id   := new_id;
      recurring_id := t.id;
      user_id      := t.user_id;
      occurred_on  := due;
      amount       := t.amount;
      return next;

      due   := public.next_recurrence_due(t.cadence, due, t.day_of_month, t.month_of_year);
      guard := guard + 1;
    end loop;

    update public.recurring_expenses set next_due = due where id = t.id;
  end loop;
end;
$$;

comment on function public.generate_due_recurrences(date) is
  'Insert a draft expense for every active template that has come due and move its next due date on. Bypasses RLS; service_role only.';


-- ---------------------------------------------------------------------------
-- v_draft_expenses — the confirmation tray.
--
-- Drafts are invisible to every other view in the app by design, so the tray
-- needs its own. One row per waiting draft, with the template that made it and
-- enough of the category and vehicle to render a row without a second query.
-- ---------------------------------------------------------------------------

create view public.v_draft_expenses
with (security_invoker = true) as
select
  e.id,
  e.user_id,
  e.occurred_on,
  e.amount,
  e.currency,
  e.category_id,
  c.name        as category_name,
  c.icon        as category_icon,
  c.colour_hex  as category_colour_hex,
  e.vehicle_id,
  v.nickname    as vehicle_nickname,
  e.bucket,
  e.counts_toward_budget,
  e.amortize_months,
  e.merchant,
  e.note,
  e.recurring_id,
  r.label       as recurring_label,
  r.cadence     as recurring_cadence,
  e.created_at
from public.expenses e
left join public.categories c         on c.id = e.category_id
left join public.vehicles v           on v.id = e.vehicle_id
left join public.recurring_expenses r on r.id = e.recurring_id
where e.is_draft;

comment on view public.v_draft_expenses is
  'Generated expenses awaiting confirmation. Nothing here counts toward any total until is_draft is cleared.';


-- ===========================================================================
-- Reports
--
-- Every report takes a whole-month range and a currency, and returns both the
-- monthly figure and the all-in figure side by side. Both, always: the point of
-- this app is that a month with one big purchase has two honest numbers, and a
-- report that showed one of them would be picking a side.
--
-- The range is snapped to month starts on the way in, so `impact_month` and the
-- month an expense fell in are the same axis and the two columns of a row are
-- comparable. Amounts in another currency are excluded rather than converted;
-- no rate is stored on the row (CLAUDE.md section 5).
-- ===========================================================================

create function public.report_months(p_from date, p_to date, p_currency char(3))
returns table (
  month           date,
  monthly_total   bigint,
  all_in_total    bigint,
  car_only_total  bigint,
  monthly_count   int,
  all_in_count    int,
  car_only_count  int
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- generate_series, not the rows that happen to exist: a month with nothing in
  -- it is a fact about the year and has to keep its place on the axis.
  select
    g.month::date,
    coalesce(t.monthly_total, 0)::bigint,
    coalesce(t.all_in_total, 0)::bigint,
    coalesce(t.car_only_total, 0)::bigint,
    coalesce(t.monthly_count, 0),
    coalesce(t.all_in_count, 0),
    coalesce(t.car_only_count, 0)
  from generate_series(
    date_trunc('month', p_from),
    date_trunc('month', p_to),
    interval '1 month'
  ) as g(month)
  left join public.v_month_totals t
    on  t.month    = g.month::date
    and t.currency = p_currency
    and t.user_id  = (select auth.uid())
  order by g.month;
$$;

comment on function public.report_months(date, date, char) is
  'Month-over-month totals across a range, both views side by side, with empty months kept.';


create function public.report_categories(p_from date, p_to date, p_currency char(3))
returns table (
  category_id    uuid,
  name           text,
  icon           text,
  colour_hex     text,
  bucket         public.expense_bucket,
  monthly_total  bigint,
  all_in_total   bigint,
  expense_count  int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with impact as (
    select i.category_id, sum(i.amount)::bigint as monthly_total
    from public.v_expense_impact i
    where i.currency     = p_currency
      and i.impact_month >= date_trunc('month', p_from)::date
      and i.impact_month <= date_trunc('month', p_to)::date
    group by i.category_id
  ),
  cash as (
    select
      e.category_id,
      sum(e.amount)::bigint as all_in_total,
      count(*)::int         as expense_count
    from public.expenses e
    where e.is_draft = false
      and e.currency = p_currency
      and e.occurred_on >= date_trunc('month', p_from)::date
      and e.occurred_on <  (date_trunc('month', p_to) + interval '1 month')::date
    group by e.category_id
  )
  select
    coalesce(i.category_id, c.category_id),
    cat.name,
    cat.icon,
    cat.colour_hex,
    cat.default_bucket,
    coalesce(i.monthly_total, 0)::bigint,
    coalesce(c.all_in_total, 0)::bigint,
    coalesce(c.expense_count, 0)
  from impact i
  -- `is not distinct from` so the uncategorised bucket joins to itself rather
  -- than falling out of both sides of the join.
  full join cash c on c.category_id is not distinct from i.category_id
  left join public.categories cat on cat.id = coalesce(i.category_id, c.category_id)
  order by coalesce(c.all_in_total, 0) desc, cat.name;
$$;

comment on function public.report_categories(date, date, char) is
  'Spend per category across a month range, monthly and all-in. Uncategorised expenses keep a row with a null category.';


create function public.report_buckets(p_from date, p_to date, p_currency char(3))
returns table (
  bucket         public.expense_bucket,
  monthly_total  bigint,
  all_in_total   bigint,
  expense_count  int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with impact as (
    select i.bucket, sum(i.amount)::bigint as monthly_total
    from public.v_expense_impact i
    where i.currency     = p_currency
      and i.impact_month >= date_trunc('month', p_from)::date
      and i.impact_month <= date_trunc('month', p_to)::date
    group by i.bucket
  ),
  cash as (
    select
      e.bucket,
      sum(e.amount)::bigint as all_in_total,
      count(*)::int         as expense_count
    from public.expenses e
    where e.is_draft = false
      and e.currency = p_currency
      and e.occurred_on >= date_trunc('month', p_from)::date
      and e.occurred_on <  (date_trunc('month', p_to) + interval '1 month')::date
    group by e.bucket
  )
  select
    coalesce(i.bucket, c.bucket),
    coalesce(i.monthly_total, 0)::bigint,
    coalesce(c.all_in_total, 0)::bigint,
    coalesce(c.expense_count, 0)
  from impact i
  full join cash c on c.bucket = i.bucket;
$$;

comment on function public.report_buckets(date, date, char) is
  'Spend per bucket across a month range. Life versus car, and running versus project, come out of this one row set.';


create function public.report_top_expenses(
  p_from     date,
  p_to       date,
  p_currency char(3),
  p_limit    int default 10
)
returns table (
  id                   uuid,
  occurred_on          date,
  amount               bigint,
  currency             char(3),
  merchant             text,
  note                 text,
  category_id          uuid,
  category_name        text,
  category_icon        text,
  category_colour_hex  text,
  vehicle_id           uuid,
  vehicle_nickname     text,
  bucket               public.expense_bucket,
  counts_toward_budget boolean,
  amortize_months      smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    e.occurred_on,
    e.amount,
    e.currency,
    e.merchant,
    e.note,
    e.category_id,
    c.name,
    c.icon,
    c.colour_hex,
    e.vehicle_id,
    v.nickname,
    e.bucket,
    e.counts_toward_budget,
    e.amortize_months
  from public.expenses e
  left join public.categories c on c.id = e.category_id
  left join public.vehicles v   on v.id = e.vehicle_id
  where e.is_draft = false
    and e.currency = p_currency
    and e.occurred_on >= date_trunc('month', p_from)::date
    and e.occurred_on <  (date_trunc('month', p_to) + interval '1 month')::date
  -- Largest first, at full amount on the day it was paid. A refund is not a
  -- large expense, so the ordering leaves negatives at the bottom where the
  -- limit never reaches them.
  order by e.amount desc, e.occurred_on desc
  limit greatest(p_limit, 0);
$$;

comment on function public.report_top_expenses(date, date, char, int) is
  'The largest expenses of a period, at full amount on the day they were paid.';


-- ===========================================================================
-- The schedule
--
-- pg_cron runs in UTC. 17:05 UTC is 00:05 the next day in Asia/Ho_Chi_Minh, so
-- a template due on the 1st gets its draft five minutes into the 1st, local
-- time, which is the day docs/01-PRODUCT.md says it is due on.
--
-- The job calls the function directly rather than the HTTP endpoint: there is no
-- reason to leave the database to write a row into it, and it means the schedule
-- needs no secret stored in Postgres. `app/api/cron/recurring` exists for the
-- same job triggered from outside — a platform scheduler, or a person catching
-- up by hand — and is the path that holds `SUPABASE_SECRET_KEY`.
-- ===========================================================================

create extension if not exists pg_cron;

select cron.unschedule('garage-generate-recurrences')
where exists (select 1 from cron.job where jobname = 'garage-generate-recurrences');

select cron.schedule(
  'garage-generate-recurrences',
  '5 17 * * *',
  $job$select public.generate_due_recurrences()$job$
);


-- ===========================================================================
-- Grants. Same shape as 0007, 0010, 0013 and 0016: authenticated and
-- service_role, never anon. `generate_due_recurrences` is the exception — it is
-- the only function here that bypasses RLS, so no user role can call it.
-- ===========================================================================

grant select on public.v_budget_month           to authenticated, service_role;
grant select on public.v_budget_category_month  to authenticated, service_role;
grant select on public.v_fund_status            to authenticated, service_role;
grant select on public.v_draft_expenses         to authenticated, service_role;

revoke all on function public.copy_budgets_from(date, date) from public;
grant execute on function public.copy_budgets_from(date, date) to authenticated, service_role;

revoke all on function public.save_budgets(date, char, bigint, jsonb) from public;
grant execute on function public.save_budgets(date, char, bigint, jsonb) to authenticated, service_role;

revoke all on function public.next_recurrence_due(public.recurrence, date, smallint, smallint) from public;
grant execute on function public.next_recurrence_due(public.recurrence, date, smallint, smallint)
  to authenticated, service_role;

revoke all on function public.report_months(date, date, char) from public;
grant execute on function public.report_months(date, date, char) to authenticated, service_role;

revoke all on function public.report_categories(date, date, char) from public;
grant execute on function public.report_categories(date, date, char) to authenticated, service_role;

revoke all on function public.report_buckets(date, date, char) from public;
grant execute on function public.report_buckets(date, date, char) to authenticated, service_role;

revoke all on function public.report_top_expenses(date, date, char, int) from public;
grant execute on function public.report_top_expenses(date, date, char, int) to authenticated, service_role;

revoke all on function public.generate_due_recurrences(date) from public;
grant execute on function public.generate_due_recurrences(date) to service_role;
