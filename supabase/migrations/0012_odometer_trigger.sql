-- 0012 — The odometer trigger
--
-- docs/02-DATA-MODEL.md, on `vehicles.odometer_km`:
--
--   "a denormalised max of all odometer readings across expenses, fuel logs and
--    service records. Maintained by trigger -- never lower it silently; if a
--    lower reading is entered, flag it in the UI rather than accepting it."
--
-- So this only ever raises the figure. A reading below the current max is stored
-- on its own row exactly as it was typed and simply does not move the vehicle;
-- the screens compare the two and say so. Nothing is rejected, because a reading
-- someone actually took is data, and an app that refuses it just teaches them to
-- lie to it.
--
-- Attached to all three tables the document names. `fuel_logs` and
-- `service_records` hold nothing until roadmap Phase 6, but the definition of the
-- column is the max across all three, and a trigger that covers two of them is a
-- column that is quietly wrong the day the third starts being written to. The
-- three differ only in what their date column is called, which is why there are
-- three near-identical functions rather than one with a dynamic column name.
--
-- No `security definer`: the caller owns both the reading and the vehicle, so the
-- vehicles RLS update policy already lets this through. A reading pointed at
-- someone else's car updates nothing, which is the right answer.

create or replace function public.raise_vehicle_odometer_from_expense()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.vehicles v
  set odometer_km = new.odometer_km,
      odometer_at = new.occurred_on
  where v.id = new.vehicle_id
    and new.odometer_km is not null
    and new.odometer_km > v.odometer_km;
  return new;
end;
$$;

comment on function public.raise_vehicle_odometer_from_expense() is
  'Raises vehicles.odometer_km to an expense reading. Never lowers it: a lower reading stays on its own row and is flagged in the UI.';

create or replace function public.raise_vehicle_odometer_from_fuel_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.vehicles v
  set odometer_km = new.odometer_km,
      odometer_at = new.filled_on
  where v.id = new.vehicle_id
    and new.odometer_km is not null
    and new.odometer_km > v.odometer_km;
  return new;
end;
$$;

create or replace function public.raise_vehicle_odometer_from_service_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.vehicles v
  set odometer_km = new.odometer_km,
      odometer_at = new.performed_on
  where v.id = new.vehicle_id
    and new.odometer_km is not null
    and new.odometer_km > v.odometer_km;
  return new;
end;
$$;

create trigger expenses_raise_vehicle_odometer
  after insert or update of odometer_km, vehicle_id, occurred_on on public.expenses
  for each row execute function public.raise_vehicle_odometer_from_expense();

create trigger fuel_logs_raise_vehicle_odometer
  after insert or update of odometer_km, vehicle_id, filled_on on public.fuel_logs
  for each row execute function public.raise_vehicle_odometer_from_fuel_log();

create trigger service_records_raise_vehicle_odometer
  after insert or update of odometer_km, vehicle_id, performed_on on public.service_records
  for each row execute function public.raise_vehicle_odometer_from_service_record();
