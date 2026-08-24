-- 0002 — Core tables
--
-- profiles, vehicles, categories, expenses. Everything else in the schema hangs off
-- these four. See docs/02-DATA-MODEL.md.
--
-- Conventions from that document, applied to every table here and below:
--   id          uuid primary key default gen_random_uuid()
--   user_id     uuid not null references auth.users(id) on delete cascade
--   created_at  timestamptz not null default now()
--   updated_at  timestamptz not null default now(), maintained by trigger

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger helper: stamps updated_at on every UPDATE.';


-- ---------------------------------------------------------------------------
-- profiles — mirrors auth.users, holds preferences.
-- Keyed by the auth user id, so its RLS predicate is `id`, not `user_id`.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                          uuid primary key references auth.users (id) on delete cascade,
  display_name                text,
  base_currency               char(3) not null default 'VND',
  locale                      text not null default 'vi-VN',
  timezone                    text not null default 'Asia/Ho_Chi_Minh',
  distance_unit               text not null default 'km',           -- km | mi
  volume_unit                 text not null default 'l',            -- l | gal
  default_view                text not null default 'monthly',      -- monthly | all_in | car_only
  amortise_suggest_multiplier numeric default 3.0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- vehicles
--
-- odometer_km is a denormalised max of every odometer reading across expenses,
-- fuel logs and service records. The trigger that maintains it belongs to the
-- phase that introduces odometer entry (roadmap Phase 3); the column carries the
-- default until then.
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  nickname        text not null,
  make            text,
  model           text,
  year            int,
  "trim"          text,
  plate           text,
  colour_hex      text,                                    -- swatch shown in UI chrome
  fuel_type       text,                                    -- petrol | diesel | hybrid | ev
  transmission    text,                                    -- manual | auto | dct | cvt
  purchase_date   date,
  purchase_price  bigint,
  currency        char(3),
  odometer_km     int not null default 0,                  -- highest known reading
  odometer_at     date,
  hero_photo_path text,                                    -- storage path in `vehicles`
  status          public.vehicle_status not null default 'owned',
  sold_date       date,
  sold_price      bigint,
  sort_order      int not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index vehicles_user_sort_idx on public.vehicles (user_id, sort_order);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

create table public.categories (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references auth.users (id) on delete cascade,
  name                          text not null,
  icon                          text not null,             -- Phosphor icon name, e.g. 'GasPump'
  colour_hex                    text not null,
  default_bucket                public.expense_bucket not null,
  default_counts_toward_budget  boolean not null,
  is_system                     boolean not null default false,  -- seeded; renameable, not deletable
  sort_order                    int,
  archived_at                   timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- unique (user_id, name) where archived_at is null
create unique index categories_user_name_live_key
  on public.categories (user_id, name)
  where archived_at is null;

create index categories_user_sort_idx on public.categories (user_id, sort_order);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- expenses — the centre of the app.
--
-- mod_plan_id, fund_id and recurring_id are declared here because the document
-- lists them as columns of this table, but their foreign keys are added in 0003
-- and 0004 once the referenced tables exist.
-- ---------------------------------------------------------------------------

create table public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  occurred_on          date not null,
  amount               bigint not null,                    -- may be negative (refunds, part sales)
  currency             char(3) not null default 'VND',
  category_id          uuid references public.categories (id),
  vehicle_id           uuid references public.vehicles (id),
  bucket               public.expense_bucket not null,
  counts_toward_budget boolean not null,
  amortize_months      smallint not null default 1,
  merchant             text,
  note                 text,
  odometer_km          int,
  mod_plan_id          uuid,
  fund_id              uuid,
  recurring_id         uuid,
  is_draft             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint expenses_amortize_months_check
    check (amortize_months between 1 and 120),

  -- A car bucket needs a car; life is everything that is not a car.
  constraint expenses_bucket_vehicle_check
    check (
      (bucket = 'life' and vehicle_id is null)
      or (bucket in ('car_running', 'car_project') and vehicle_id is not null)
    )
);

create index expenses_user_occurred_idx
  on public.expenses (user_id, occurred_on desc);

create index expenses_user_vehicle_occurred_idx
  on public.expenses (user_id, vehicle_id, occurred_on desc);

create index expenses_user_category_idx
  on public.expenses (user_id, category_id);

create index expenses_user_draft_idx
  on public.expenses (user_id)
  where is_draft;

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();
