-- 0011 — vehicles.purchase_odometer_km
--
-- docs/02-DATA-MODEL.md defines v_vehicle_totals.km_driven as "odometer minus
-- odometer at purchase", but `vehicles` carried no purchase odometer: only
-- `odometer_km` (the running max) and `odometer_at`. Without this column a car
-- entered mid-life would report every kilometre it has ever driven as driven by
-- its current owner, and cost per km would be wrong by exactly that ratio.
--
-- The value defaults to the vehicle's own `odometer_km` at creation, so entering
-- a car with 34.500 on the clock records that as the starting line. It is set by
-- a BEFORE INSERT trigger rather than a column default, because a column default
-- cannot reference another column of the same row.
--
-- docs/02-DATA-MODEL.md is edited in the same commit, per CLAUDE.md section 4.

alter table public.vehicles
  add column purchase_odometer_km int;

-- Rows that already exist started their life in this app at whatever the clock
-- said when they were entered, which is what `odometer_km` still holds until a
-- reading raises it.
update public.vehicles
set purchase_odometer_km = odometer_km
where purchase_odometer_km is null;

create or replace function public.vehicles_default_purchase_odometer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.purchase_odometer_km is null then
    new.purchase_odometer_km := new.odometer_km;
  end if;
  return new;
end;
$$;

comment on function public.vehicles_default_purchase_odometer() is
  'A vehicle entered without a purchase odometer starts from whatever its current reading is.';

create trigger vehicles_default_purchase_odometer
  before insert on public.vehicles
  for each row execute function public.vehicles_default_purchase_odometer();

alter table public.vehicles
  alter column purchase_odometer_km set not null;

alter table public.vehicles
  add constraint vehicles_purchase_odometer_check
  check (purchase_odometer_km >= 0 and purchase_odometer_km <= odometer_km);

comment on column public.vehicles.purchase_odometer_km is
  'The clock when this owner took the car on. km_driven is odometer_km minus this.';
