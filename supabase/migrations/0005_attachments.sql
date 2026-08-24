-- 0005 — Attachments
--
-- Polymorphic, deliberately: one row points at exactly one owner. It lives in its
-- own migration because it references every other table in the schema.
-- See docs/02-DATA-MODEL.md.

create table public.attachments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  storage_path     text not null,
  bucket_name      text not null,                    -- receipts | inspiration | vehicles
  kind             public.attachment_kind not null,
  width            int,
  height           int,
  bytes            int,
  caption          text,
  expense_id       uuid references public.expenses (id) on delete cascade,
  mod_plan_id      uuid references public.mod_plans (id) on delete cascade,
  service_record_id uuid references public.service_records (id) on delete cascade,
  fuel_log_id      uuid references public.fuel_logs (id) on delete cascade,
  part_id          uuid references public.parts (id) on delete cascade,
  timeline_note_id uuid references public.timeline_notes (id) on delete cascade,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint attachments_single_owner_check
    check (num_nonnulls(expense_id, mod_plan_id, service_record_id, fuel_log_id, part_id, timeline_note_id) = 1)
);

create index attachments_expense_idx on public.attachments (expense_id, sort_order);
create index attachments_mod_plan_idx on public.attachments (mod_plan_id, sort_order);
create index attachments_service_record_idx on public.attachments (service_record_id, sort_order);
create index attachments_fuel_log_idx on public.attachments (fuel_log_id, sort_order);
create index attachments_part_idx on public.attachments (part_id, sort_order);
create index attachments_timeline_note_idx on public.attachments (timeline_note_id, sort_order);
create index attachments_user_idx on public.attachments (user_id);

create trigger attachments_set_updated_at
  before update on public.attachments
  for each row execute function public.set_updated_at();
