-- 0009 — A new user arrives with a working set of categories
--
-- Two triggers:
--   auth.users -> profiles          a signed-up user gets a preferences row
--   profiles   -> categories        that row seeds the fifteen system categories
--
-- The category list is the table at the end of docs/02-DATA-MODEL.md. Colours are
-- not in that table; they come from the bucket vocabulary in docs/03-DESIGN.md
-- (life -> ink-soft, car_running -> fire-green, car_project -> fire-brick) so the
-- ledger reads as buckets on day one. All fifteen are renameable and recolourable;
-- is_system only means they cannot be deleted.

create or replace function public.seed_system_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories
    (user_id, name, icon, colour_hex, default_bucket, default_counts_toward_budget, is_system, sort_order)
  values
    (new.id, 'Fuel',            'GasPump',      '#578769', 'car_running', true,  true, 10),
    (new.id, 'Maintenance',     'Wrench',       '#578769', 'car_running', true,  true, 20),
    (new.id, 'Repair',          'FirstAidKit',  '#578769', 'car_running', true,  true, 30),
    (new.id, 'Insurance & Tax', 'ShieldCheck',  '#578769', 'car_running', true,  true, 40),
    (new.id, 'Parking & Tolls', 'Ticket',       '#578769', 'car_running', true,  true, 50),
    (new.id, 'Detailing',       'Drop',         '#578769', 'car_running', true,  true, 60),
    (new.id, 'Mods & Parts',    'Gauge',        '#A95031', 'car_project', false, true, 70),
    (new.id, 'Track & Events',  'Flag',         '#A95031', 'car_project', false, true, 80),
    (new.id, 'Tools & Garage',  'Toolbox',      '#A95031', 'car_project', false, true, 90),
    (new.id, 'Groceries',       'ShoppingCart', '#6B6357', 'life',        true,  true, 100),
    (new.id, 'Eating out',      'ForkKnife',    '#6B6357', 'life',        true,  true, 110),
    (new.id, 'Housing',         'House',        '#6B6357', 'life',        true,  true, 120),
    (new.id, 'Transport',       'Bus',          '#6B6357', 'life',        true,  true, 130),
    (new.id, 'Health',          'Heartbeat',    '#6B6357', 'life',        true,  true, 140),
    (new.id, 'Other',           'DotsThree',    '#6B6357', 'life',        true,  true, 150)
  on conflict do nothing;

  return new;
end;
$$;

comment on function public.seed_system_categories() is
  'Gives a brand new profile the fifteen system categories from docs/02-DATA-MODEL.md.';

create trigger profiles_seed_system_categories
  after insert on public.profiles
  for each row execute function public.seed_system_categories();


-- ---------------------------------------------------------------------------
-- A profile per auth user. Without this nothing above ever fires, because
-- nothing else in the app inserts into profiles.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Mirrors a new auth.users row into public.profiles, which in turn seeds categories.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
