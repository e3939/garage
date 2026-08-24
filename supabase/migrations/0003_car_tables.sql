-- 0003 — Car tables
--
-- The vehicle's own records: the mod board, maintenance, fuel, parts, notes and
-- milestones. See docs/02-DATA-MODEL.md.

-- ---------------------------------------------------------------------------
-- mod_plans
--
-- Actual cost is derived: sum of expenses where mod_plan_id = this. A mod can
-- accumulate several expenses (part, then labour, then a bracket you forgot).
-- ---------------------------------------------------------------------------

create table public.mod_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  vehicle_id    uuid not null references public.vehicles (id),
  title         text not null,
  description   text,
  status        public.mod_status not null default 'dreaming',
  priority      public.mod_priority not null default 'someday',
  est_cost_min  bigint,
  est_cost_max  bigint,
  currency      char(3),
  target_date   date,
  links         jsonb not null default '[]',               -- [{label, url}]
  notes         text,
  installed_on  date,
  board_order   int not null default 0,                    -- position within its status column
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index mod_plans_user_vehicle_idx on public.mod_plans (user_id, vehicle_id);
create index mod_plans_board_idx on public.mod_plans (vehicle_id, status, board_order);

create trigger mod_plans_set_updated_at
  before update on public.mod_plans
  for each row execute function public.set_updated_at();

-- Deferred from 0002: expenses can now point at the mod they paid for.
alter table public.expenses
  add constraint expenses_mod_plan_id_fkey
  foreign key (mod_plan_id) references public.mod_plans (id);

create index expenses_mod_plan_idx on public.expenses (mod_plan_id);


-- ---------------------------------------------------------------------------
-- mod_dependencies
--
-- Cycle prevention is a recursive check in the server action, not a trigger.
-- No user_id column: ownership is read through mod_plans, and so is RLS.
-- ---------------------------------------------------------------------------

create table public.mod_dependencies (
  mod_plan_id   uuid not null references public.mod_plans (id) on delete cascade,
  depends_on_id uuid not null references public.mod_plans (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (mod_plan_id, depends_on_id),
  constraint mod_dependencies_no_self_check check (mod_plan_id <> depends_on_id)
);

create index mod_dependencies_depends_on_idx on public.mod_dependencies (depends_on_id);


-- ---------------------------------------------------------------------------
-- service_schedules
-- ---------------------------------------------------------------------------

create table public.service_schedules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  vehicle_id      uuid not null references public.vehicles (id),
  name            text not null,
  interval_km     int,
  interval_months int,
  last_done_km    int,
  last_done_on    date,
  notes           text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- at least one interval, or the item can never come due
  constraint service_schedules_interval_check
    check (interval_km is not null or interval_months is not null)
);

create index service_schedules_user_vehicle_idx on public.service_schedules (user_id, vehicle_id);

create trigger service_schedules_set_updated_at
  before update on public.service_schedules
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- service_records
--
-- The trigger that rolls a record's odometer and date up into the parent
-- schedule's last_done_* belongs to the phase that builds the maintenance
-- screens (roadmap Phase 6).
-- ---------------------------------------------------------------------------

create table public.service_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  vehicle_id   uuid not null references public.vehicles (id),
  schedule_id  uuid references public.service_schedules (id),  -- null for one-off work
  name         text not null,
  performed_on date not null,
  odometer_km  int,
  workshop     text,
  notes        text,
  expense_id   uuid references public.expenses (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index service_records_user_vehicle_performed_idx
  on public.service_records (user_id, vehicle_id, performed_on desc);

create index service_records_schedule_idx on public.service_records (schedule_id);

create trigger service_records_set_updated_at
  before update on public.service_records
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- fuel_logs
--
-- Consumption is computed in v_fuel_consumption, never stored.
-- ---------------------------------------------------------------------------

create table public.fuel_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  vehicle_id       uuid not null references public.vehicles (id),
  filled_on        date not null,
  odometer_km      int not null,
  litres           numeric(8,3) not null,
  total_cost       bigint not null,
  currency         char(3),
  is_full_tank     boolean not null default true,
  missed_previous  boolean not null default false,   -- breaks the consumption chain honestly
  station          text,
  expense_id       uuid references public.expenses (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint fuel_logs_fill_key unique (vehicle_id, filled_on, odometer_km)
);

create index fuel_logs_user_vehicle_filled_idx
  on public.fuel_logs (user_id, vehicle_id, filled_on desc);

create trigger fuel_logs_set_updated_at
  before update on public.fuel_logs
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- parts
-- ---------------------------------------------------------------------------

create table public.parts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  vehicle_id      uuid not null references public.vehicles (id),
  name            text not null,
  brand           text,
  part_number     text,
  status          public.part_status not null default 'on_car',
  installed_on    date,
  removed_on      date,
  warranty_until  date,
  expense_id      uuid references public.expenses (id),      -- purchase
  sale_expense_id uuid references public.expenses (id),      -- negative expense if sold
  mod_plan_id     uuid references public.mod_plans (id),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index parts_user_vehicle_status_idx on public.parts (user_id, vehicle_id, status);

create trigger parts_set_updated_at
  before update on public.parts
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- timeline_notes — cost-free log entries: a drive, a meet, a wash, a thought.
-- ---------------------------------------------------------------------------

create table public.timeline_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  vehicle_id  uuid not null references public.vehicles (id),
  occurred_on date not null,
  title       text not null,
  body        text,
  odometer_km int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index timeline_notes_user_vehicle_occurred_idx
  on public.timeline_notes (user_id, vehicle_id, occurred_on desc);

create trigger timeline_notes_set_updated_at
  before update on public.timeline_notes
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------

create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  vehicle_id  uuid references public.vehicles (id),
  kind        text not null,                       -- 'first_mod' | 'km_10000' | 'custom' | ...
  achieved_on date not null,
  title       text not null,
  body        text,
  auto        boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- unique (user_id, vehicle_id, kind) where auto.
-- `nulls not distinct` so a garage-wide milestone (vehicle_id null) is still
-- awarded once rather than once per insert.
create unique index milestones_auto_key
  on public.milestones (user_id, vehicle_id, kind)
  nulls not distinct
  where auto;

create index milestones_user_vehicle_achieved_idx
  on public.milestones (user_id, vehicle_id, achieved_on desc);

create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();
