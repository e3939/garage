-- 0004 — Money tables
--
-- Budgets, sinking funds and recurring templates. See docs/02-DATA-MODEL.md.

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  month       date not null,                              -- always the 1st
  category_id uuid references public.categories (id),     -- null = overall budget for the month
  amount      bigint not null,
  currency    char(3),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint budgets_month_is_first_check check (date_part('day', month) = 1),

  -- One overall budget and one cap per category per month. `nulls not distinct`
  -- is what makes the overall row (category_id null) unique rather than repeatable.
  constraint budgets_user_month_category_key
    unique nulls not distinct (user_id, month, category_id)
);

create index budgets_user_month_idx on public.budgets (user_id, month desc);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- funds
-- ---------------------------------------------------------------------------

create table public.funds (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  name                 text not null,
  vehicle_id           uuid references public.vehicles (id),
  mod_plan_id          uuid references public.mod_plans (id),
  target_amount        bigint not null,
  monthly_contribution bigint,
  currency             char(3),
  closed_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index funds_user_idx on public.funds (user_id);

create trigger funds_set_updated_at
  before update on public.funds
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- fund_contributions
--
-- Fund balance = sum(amount). Never store a running balance.
-- ---------------------------------------------------------------------------

create table public.fund_contributions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  fund_id     uuid not null references public.funds (id) on delete cascade,
  occurred_on date not null,
  amount      bigint not null,                            -- negative = drawdown
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index fund_contributions_fund_occurred_idx
  on public.fund_contributions (fund_id, occurred_on desc);

create trigger fund_contributions_set_updated_at
  before update on public.fund_contributions
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- recurring_expenses
--
-- Template rows. Generation is a scheduled job that inserts is_draft = true
-- expenses; confirmation flips the flag.
-- ---------------------------------------------------------------------------

create table public.recurring_expenses (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  label                text not null,
  amount               bigint,
  currency             char(3),
  category_id          uuid references public.categories (id),
  vehicle_id           uuid references public.vehicles (id),
  bucket               public.expense_bucket,
  counts_toward_budget boolean,
  cadence              public.recurrence not null,
  day_of_month         smallint,
  month_of_year        smallint,
  next_due             date not null,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index recurring_expenses_due_idx
  on public.recurring_expenses (next_due)
  where active;

create index recurring_expenses_user_idx on public.recurring_expenses (user_id);

create trigger recurring_expenses_set_updated_at
  before update on public.recurring_expenses
  for each row execute function public.set_updated_at();


-- Deferred from 0002: an expense can be paid from a fund, or generated from a template.
alter table public.expenses
  add constraint expenses_fund_id_fkey
  foreign key (fund_id) references public.funds (id);

alter table public.expenses
  add constraint expenses_recurring_id_fkey
  foreign key (recurring_id) references public.recurring_expenses (id);

create index expenses_fund_idx on public.expenses (fund_id);
create index expenses_recurring_idx on public.expenses (recurring_id);
