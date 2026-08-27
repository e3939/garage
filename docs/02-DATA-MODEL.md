# 02 — Data model

Source of truth for the schema. Any change to a table here requires a new migration file in
`supabase/migrations/` and an edit to this document **in the same commit**.

Conventions:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade` on every user table
- `created_at timestamptz not null default now()`, `updated_at` maintained by trigger
- Money: `bigint` minor units + `currency char(3) not null default 'VND'`
- Distance: `integer` kilometres. Volume: `numeric(8,3)` litres.
- Soft delete via `archived_at timestamptz` where history matters; hard delete elsewhere.

---

## Enums

```sql
create type expense_bucket   as enum ('life', 'car_running', 'car_project');
create type vehicle_status   as enum ('owned', 'sold');
create type mod_status       as enum ('dreaming', 'researching', 'saving', 'ordered', 'installed', 'abandoned');
create type mod_priority     as enum ('needed', 'next_up', 'someday', 'dreaming');
create type part_status      as enum ('on_car', 'shelf', 'sold', 'binned');
create type attachment_kind  as enum ('receipt', 'inspiration', 'progress', 'document');
create type recurrence       as enum ('monthly', 'quarterly', 'yearly');
create type timeline_kind    as enum ('expense', 'mod', 'service', 'fuel', 'milestone', 'note', 'gallery');
```

---

## Tables

### profiles
Mirrors `auth.users`, holds preferences.
```
id uuid pk references auth.users
display_name text
base_currency char(3) not null default 'VND'
locale text not null default 'vi-VN'
timezone text not null default 'Asia/Ho_Chi_Minh'
distance_unit text not null default 'km'          -- km | mi
volume_unit text not null default 'l'             -- l | gal
default_view text not null default 'monthly'      -- monthly | all_in | car_only
amortise_suggest_multiplier numeric default 3.0
```

### vehicles
```
id, user_id
nickname text not null
make text, model text, year int, trim text
plate text
colour_hex text                                   -- swatch shown in UI chrome
fuel_type text                                    -- petrol | diesel | hybrid | ev
transmission text                                 -- manual | auto | dct | cvt
purchase_date date, purchase_price bigint, currency char(3)
purchase_odometer_km int not null                 -- the clock when this owner took it on
odometer_km int not null default 0                -- highest known reading
odometer_at date
hero_photo_path text                              -- storage path in `vehicles`
status vehicle_status not null default 'owned'
sold_date date, sold_price bigint
sort_order int not null default 0
archived_at timestamptz
```
Rule: `odometer_km` is a denormalised max of all odometer readings across expenses, fuel logs
and service records. Maintained by trigger — never lower it silently; if a lower reading is
entered, flag it in the UI rather than accepting it.

Rule: `purchase_odometer_km` is the reading the car was on when this owner took it on, and it
is what `km_driven` is measured from — a car bought at 34,500km has driven nothing until the
clock passes 34,500. It defaults to the vehicle's own `odometer_km` at creation, set by a
trigger rather than a column default because a default cannot reference another column. It is
never moved by an odometer reading; only an explicit edit changes it, and it can never exceed
`odometer_km`.

### categories
```
id, user_id
name text not null
icon text not null                                -- Phosphor icon name, e.g. 'GasPump'
colour_hex text not null
default_bucket expense_bucket not null
default_counts_toward_budget boolean not null
is_system boolean not null default false          -- seeded; renameable, not deletable
sort_order int
archived_at timestamptz
unique (user_id, name) where archived_at is null
```

### expenses
The centre of the app.
```
id, user_id
occurred_on date not null
amount bigint not null                            -- may be negative (refunds, part sales)
currency char(3) not null default 'VND'
category_id uuid references categories
vehicle_id uuid references vehicles               -- null for `life`
bucket expense_bucket not null
counts_toward_budget boolean not null
amortize_months smallint not null default 1 check (amortize_months between 1 and 120)
merchant text
note text
odometer_km int                                   -- optional, feeds vehicle odometer
mod_plan_id uuid references mod_plans             -- set when created from a mod
fund_id uuid references funds                     -- set when paid from a sinking fund
recurring_id uuid references recurring_expenses
is_draft boolean not null default false           -- generated recurrences awaiting confirmation
created_at, updated_at
```
Indexes: `(user_id, occurred_on desc)`, `(user_id, vehicle_id, occurred_on desc)`,
`(user_id, category_id)`, partial `(user_id) where is_draft`.

Validation (enforced in zod **and** a check constraint where possible):
- `bucket in ('car_running','car_project')` requires `vehicle_id is not null`
- `bucket = 'life'` requires `vehicle_id is null`

### attachments
Polymorphic, deliberately.
```
id, user_id
storage_path text not null
bucket_name text not null                         -- receipts | inspiration | vehicles
kind attachment_kind not null
width int, height int, bytes int
caption text
expense_id uuid references expenses on delete cascade
mod_plan_id uuid references mod_plans on delete cascade
service_record_id uuid references service_records on delete cascade
fuel_log_id uuid references fuel_logs on delete cascade
part_id uuid references parts on delete cascade
timeline_note_id uuid references timeline_notes on delete cascade
sort_order int not null default 0
check (num_nonnulls(expense_id, mod_plan_id, service_record_id, fuel_log_id, part_id, timeline_note_id) = 1)
```

### mod_plans
```
id, user_id, vehicle_id not null
title text not null
description text
status mod_status not null default 'dreaming'
priority mod_priority not null default 'someday'
est_cost_min bigint, est_cost_max bigint, currency char(3)
target_date date
links jsonb not null default '[]'                 -- [{label, url}]
notes text
installed_on date
board_order int not null default 0                -- position within its status column
archived_at timestamptz
```
Actual cost is derived: sum of expenses where `mod_plan_id = this`. A mod can accumulate
several expenses (part, then labour, then a bracket you forgot).

### mod_dependencies
```
mod_plan_id uuid references mod_plans on delete cascade
depends_on_id uuid references mod_plans on delete cascade
primary key (mod_plan_id, depends_on_id)
check (mod_plan_id <> depends_on_id)
```
Cycle prevention: enforce with a recursive check in the server action, not a trigger.

### service_schedules
```
id, user_id, vehicle_id not null
name text not null
interval_km int, interval_months int              -- at least one not null
last_done_km int, last_done_on date
notes text
archived_at timestamptz
```

### service_records
```
id, user_id, vehicle_id not null
schedule_id uuid references service_schedules     -- null for one-off work
name text not null
performed_on date not null
odometer_km int
workshop text
notes text
expense_id uuid references expenses
```
Trigger: inserting a record updates the parent schedule's `last_done_*`.

### fuel_logs
```
id, user_id, vehicle_id not null
filled_on date not null
odometer_km int not null
litres numeric(8,3) not null
total_cost bigint not null
currency char(3)
is_full_tank boolean not null default true
missed_previous boolean not null default false    -- breaks the consumption chain honestly
station text
expense_id uuid references expenses
unique (vehicle_id, filled_on, odometer_km)
```
Consumption is computed in a view, not stored. Between two full tanks:
`litres_consumed = sum(litres of fills after the earlier full tank, up to and including the later one)`,
`distance = later.odometer_km - earlier.odometer_km`. Skip any interval where
`missed_previous` is true.

### parts
```
id, user_id, vehicle_id not null
name text not null, brand text, part_number text
status part_status not null default 'on_car'
installed_on date, removed_on date
warranty_until date
expense_id uuid references expenses               -- purchase
sale_expense_id uuid references expenses          -- negative expense if sold
mod_plan_id uuid references mod_plans
notes text
```

### budgets
```
id, user_id
month date not null                               -- always the 1st
category_id uuid references categories            -- null = overall budget for the month
amount bigint not null
currency char(3)
unique (user_id, month, category_id)
```

### funds
```
id, user_id
name text not null
vehicle_id uuid references vehicles
mod_plan_id uuid references mod_plans
target_amount bigint not null
monthly_contribution bigint
currency char(3)
closed_at timestamptz
```

### fund_contributions
```
id, user_id, fund_id not null references funds on delete cascade
occurred_on date not null
amount bigint not null                            -- negative = drawdown
note text
```
Fund balance = `sum(amount)`. Never store a running balance.

### recurring_expenses
Template rows. Generation is a scheduled job (Supabase cron) that inserts `is_draft = true`
expenses. Confirmation flips the flag.
```
id, user_id
label text not null
amount bigint, currency char(3)
category_id, vehicle_id, bucket, counts_toward_budget
cadence recurrence not null
day_of_month smallint, month_of_year smallint
next_due date not null
active boolean not null default true
```

### timeline_notes
Cost-free log entries: a drive, a meet, a wash, a thought.
```
id, user_id, vehicle_id not null
occurred_on date not null
title text not null
body text
odometer_km int
```

### milestones
```
id, user_id, vehicle_id
kind text not null                                -- 'first_mod' | 'km_10000' | 'custom' | ...
achieved_on date not null
title text not null
body text
auto boolean not null default true
unique (user_id, vehicle_id, kind) where auto
```

### gallery_albums
Named groups of gallery photos, one per event. A photo belongs to at most one.
```
id, user_id, vehicle_id not null
name text not null check (length(btrim(name)) > 0)
occurred_on date                                  -- the event's date; null for a standing group
notes text
unique (user_id, vehicle_id, lower(btrim(name)))
```
Albums rather than tags, deliberately. The grouping people actually want here is an
event — "wheels fitted", "Hai Van pass" — and an event is a container, not an attribute.
One nullable foreign key instead of a join table, a tag vocabulary and the rename-and-merge
tooling a free-text vocabulary always needs. If a photo ever has to be in two places, adding
a join table is additive; the reverse means picking a primary tag out of a set.

### gallery_photos
The one place in this app that stores an original. Everything in `attachments` has been
resized and re-encoded before upload; these are the file exactly as it left the camera,
HEIC included, and the original is what a download returns.
```
id, user_id, vehicle_id not null
album_id uuid references gallery_albums on delete set null
storage_path text not null unique                 -- {user_id}/{vehicle_id}/{uuid}.{ext}
thumb_path text unique                            -- {…}-thumb.webp, nullable, see below
original_filename text not null
content_type text not null
bytes bigint not null check (bytes > 0)
width int, height int
captured_at timestamptz                           -- the file's own date, when it has one
occurred_on date not null                         -- what the timeline sorts by
caption text
odometer_km int
```
`bytes`, `width`, `height` and `content_type` describe the **original**, never the thumbnail:
they are what the storage quota is spent on and what a download hands back.

`thumb_path` is nullable on purpose. A thumbnail is made by drawing the image into a canvas,
and only Safari does that with a HEIC. On a phone it works; in a desktop Chrome it does not,
and the upload proceeds with no thumbnail rather than being refused. Nothing is lost — the
original is still there and still downloads.

Deleting an album never deletes its photos: `on delete set null` leaves them unfiled.

Gallery photos do **not** feed `vehicles.odometer_km`. That column is the max across
expenses, fuel logs and service records, and a photo is not a reading.

---

## Views and functions

### `v_expense_impact`
Expands each budget-affecting expense into monthly slices. This is what every monthly figure
reads from. Nothing else may implement amortisation.

```sql
create view v_expense_impact as
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
from expenses e
cross join lateral generate_series(0, e.amortize_months - 1) as g(n)
where e.counts_toward_budget = true
  and e.is_draft = false;
```
Note the remainder rule: with a 3-month split of 100, slices are 34/33/33, never 33/33/33.

### `v_fuel_consumption`
One row per completed full-tank-to-full-tank interval, with `km`, `litres`,
`l_per_100km`, `km_per_l`, `cost`, `cost_per_km`.

### `v_vehicle_totals`
Per vehicle: `total_spend` (all car buckets, undiscounted), `running_spend`, `project_spend`,
`km_driven` (odometer − odometer at purchase), `cost_per_km`, `months_owned`,
`planning_accuracy` (sum of actuals ÷ sum of estimates over installed mods).

### `v_service_due`
Per schedule row: `due_km`, `due_date`, `km_remaining`, `days_remaining`, and a
`state` of `ok` / `due_soon` / `overdue`.

### `v_storage_usage`
`bucket_id`, `objects`, `bytes` per bucket for the calling user, summed over
`storage.objects` with `security_invoker = true` so the storage policies decide what is
visible. Read rather than derived from the app's own rows on purpose: an orphaned object
still costs quota and should still be counted. The plan's 1GB ceiling is not here — that is
a billing fact, not a schema one, and lives in `lib/gallery/types.ts`.

### `v_timeline`
`union all` over expenses, mod status changes, service records, fuel logs, milestones,
timeline notes and gallery photos, normalised to
`(user_id, vehicle_id, occurred_on, kind timeline_kind, ref_id, title, subtitle, amount)`.
Ordered by `occurred_on desc, created_at desc`. Paginate by keyset, never by offset.

---

## RLS

Every table: enable RLS, then four policies.

```sql
alter table <t> enable row level security;
create policy "own_select" on <t> for select using (user_id = auth.uid());
create policy "own_insert" on <t> for insert with check (user_id = auth.uid());
create policy "own_update" on <t> for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_delete" on <t> for delete using (user_id = auth.uid());
```

Views run with the invoker's rights (`security_invoker = true`) so the base-table policies apply.

**Storage:** four buckets, all private. Object paths are `{user_id}/{vehicle_id}/{uuid}.{ext}`.
Three of them — `receipts`, `inspiration`, `vehicles` — only ever hold `.webp`, because
everything in them is compressed before upload. The fourth, `gallery`, holds originals and so
carries whatever extension the camera gave the file. It has a 50MB per-object ceiling and an
allowed-MIME list set on the bucket itself.
Policy on each bucket checks `(storage.foldername(name))[1] = auth.uid()::text`.
Images are served through signed URLs with a 1-hour TTL, generated server-side and cached.

---

## Seed data

`seed.sql` inserts system categories on first sign-in via a trigger on `profiles`:

| Name | Icon | Bucket | Counts |
|---|---|---|---|
| Fuel | GasPump | car_running | yes |
| Maintenance | Wrench | car_running | yes |
| Repair | FirstAidKit | car_running | yes |
| Insurance & Tax | ShieldCheck | car_running | yes |
| Parking & Tolls | Ticket | car_running | yes |
| Detailing | Drop | car_running | yes |
| Mods & Parts | Gauge | car_project | **no** |
| Track & Events | Flag | car_project | **no** |
| Tools & Garage | Toolbox | car_project | no |
| Groceries | ShoppingCart | life | yes |
| Eating out | ForkKnife | life | yes |
| Housing | House | life | yes |
| Transport | Bus | life | yes |
| Health | Heartbeat | life | yes |
| Other | DotsThree | life | yes |
