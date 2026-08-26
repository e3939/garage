-- 0020 — Data ownership
--
-- Roadmap Phase 9. Two things the browser cannot do for itself:
--
--   1. Import a file of expenses **atomically**. PostgREST wraps one request in
--      one transaction, so a single insert of many rows is already all-or-
--      nothing — but an import that has to create the categories the file names
--      before it can reference them is two statements, and two requests is two
--      transactions with a window in between where the categories exist and the
--      expenses do not. One function is one statement is one transaction.
--   2. Close a vehicle's chapter with one query. The sold page reads figures
--      that already exist in `v_vehicle_totals` plus four counts, and the rule
--      is that aggregation happens in SQL (CLAUDE.md section 3).
--
-- No new tables, no new columns, no new enums, no data touched. `vehicles`
-- already carries `status`, `sold_date` and `sold_price` from 0002 — this
-- migration adds nothing to it; the sold flow only ever writes columns that
-- docs/02-DATA-MODEL.md already specifies.


-- ---------------------------------------------------------------------------
-- import_expenses — the whole commit, in one transaction.
--
-- Security invoker, so every row inserted is checked by the `own_insert`
-- policies from 0007 and `auth.uid()` is the only user this can ever write for.
-- The client sends resolved ids, never names: mapping "Fuel" to a category and
-- "The Civic" to a vehicle happens in the browser against data it was already
-- given, and this function's job is to make the write atomic, not to guess.
--
-- Two things it does check, because a client that skipped the form could
-- otherwise reach them:
--
--   * every vehicle and category referenced has to be **visible to the caller**.
--     Under RLS that is the same sentence as "owned by the caller", and it is
--     what stops a hand-made request hanging its own expense off somebody else's
--     car. A foreign key alone would happily allow it.
--   * `on conflict (id) do nothing` on the expenses insert, which is what makes
--     re-importing a file this app exported a no-op rather than a second copy of
--     the ledger. The export carries each row's id; the same id cannot land
--     twice. The returned count is the number of rows that were actually new.
--
-- That last one has a second half, and it is the reason the insert happens in
-- two passes. A primary key is global but RLS is not: an id in the file can
-- already belong to **somebody else's** row, and `on conflict do nothing` would
-- then drop it in silence — the worst possible outcome, because the person is
-- told they came back with everything and is quietly missing rows. So the second
-- pass looks for offered ids that are still not visible after the first, which
-- can only mean a stranger holds them, and inserts those rows again under an id
-- of this garage's own.
--
-- That id is derived rather than random: `md5(user || source id)`, which is the
-- same 128 bits every time the same file is imported by the same person. A
-- random one would work exactly once — the second import would find the source
-- id still invisible, mint another, and quietly double the ledger. Derived, the
-- second import lands on the id the first one used, conflicts, and does nothing,
-- which is the whole promise of the id column.
--
-- The statement timeout is raised for the duration of the call. Every insert
-- here fires the row-level milestone trigger from 0019, and a file of a
-- thousand expenses is a thousand of those on top of a thousand odometer
-- triggers — comfortably inside a minute, and comfortably outside the eight
-- seconds `authenticated` is normally given.
-- ---------------------------------------------------------------------------

create function public.import_expenses(
  p_categories jsonb default '[]'::jsonb,
  p_expenses   jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_user       uuid := auth.uid();
  v_categories int  := 0;
  v_expenses   int  := 0;
  v_reassigned int  := 0;
  v_offered    int  := jsonb_array_length(p_expenses);
  v_stranger   text;
begin
  if v_user is null then
    raise exception 'import_expenses: no signed-in user' using errcode = '28000';
  end if;

  if jsonb_typeof(p_categories) <> 'array' or jsonb_typeof(p_expenses) <> 'array' then
    raise exception 'import_expenses: both arguments must be JSON arrays' using errcode = '22023';
  end if;

  -- The categories the file named that this garage has not got yet. Inserted
  -- first so the expenses below can reference them, and `on conflict do nothing`
  -- against the partial unique index on (user_id, name) so a name race with
  -- another tab loses quietly rather than failing the whole import.
  insert into public.categories
    (id, user_id, name, icon, colour_hex, default_bucket, default_counts_toward_budget)
  select c.id, v_user, c.name, c.icon, c.colour_hex, c.default_bucket, c.default_counts_toward_budget
  from jsonb_to_recordset(p_categories) as c(
    id                           uuid,
    name                         text,
    icon                         text,
    colour_hex                   text,
    default_bucket               public.expense_bucket,
    default_counts_toward_budget boolean
  )
  on conflict do nothing;

  get diagnostics v_categories = row_count;

  -- A vehicle or category the caller cannot see is a vehicle or category the
  -- caller does not own. Named in the error so the screen can say which one.
  select e.vehicle_id::text into v_stranger
  from jsonb_to_recordset(p_expenses) as e(vehicle_id uuid)
  where e.vehicle_id is not null
    and not exists (select 1 from public.vehicles v where v.id = e.vehicle_id)
  limit 1;

  if v_stranger is not null then
    raise exception 'import_expenses: unknown vehicle %', v_stranger using errcode = '23503';
  end if;

  select e.category_id::text into v_stranger
  from jsonb_to_recordset(p_expenses) as e(category_id uuid)
  where e.category_id is not null
    and not exists (select 1 from public.categories c where c.id = e.category_id)
  limit 1;

  if v_stranger is not null then
    raise exception 'import_expenses: unknown category %', v_stranger using errcode = '23503';
  end if;

  -- Pass one: every row, keeping the id the file gave it. A row already in this
  -- ledger conflicts on the primary key and is left exactly as it is, which is
  -- what makes importing the same file twice a no-op.
  insert into public.expenses (
    id, user_id, occurred_on, amount, currency, category_id, vehicle_id,
    bucket, counts_toward_budget, amortize_months, merchant, note, odometer_km
  )
  select
    coalesce(e.id, gen_random_uuid()),
    v_user,
    e.occurred_on,
    e.amount,
    coalesce(e.currency, 'VND'),
    e.category_id,
    e.vehicle_id,
    e.bucket,
    coalesce(e.counts_toward_budget, true),
    coalesce(e.amortize_months, 1),
    e.merchant,
    e.note,
    e.odometer_km
  from jsonb_to_recordset(p_expenses) as e(
    id                   uuid,
    occurred_on          date,
    amount               bigint,
    currency             char(3),
    category_id          uuid,
    vehicle_id           uuid,
    bucket               public.expense_bucket,
    counts_toward_budget boolean,
    amortize_months      smallint,
    merchant             text,
    note                 text,
    odometer_km          int
  )
  on conflict (id) do nothing;

  get diagnostics v_expenses = row_count;

  -- Pass two: an offered id that is still invisible was never ours to take, so
  -- the row goes in under one derived from it rather than disappearing. In a
  -- garage with one owner this inserts nothing, ever.
  insert into public.expenses (
    id, user_id, occurred_on, amount, currency, category_id, vehicle_id,
    bucket, counts_toward_budget, amortize_months, merchant, note, odometer_km
  )
  select
    md5(v_user::text || ':' || e.id::text)::uuid,
    v_user,
    e.occurred_on,
    e.amount,
    coalesce(e.currency, 'VND'),
    e.category_id,
    e.vehicle_id,
    e.bucket,
    coalesce(e.counts_toward_budget, true),
    coalesce(e.amortize_months, 1),
    e.merchant,
    e.note,
    e.odometer_km
  from jsonb_to_recordset(p_expenses) as e(
    id                   uuid,
    occurred_on          date,
    amount               bigint,
    currency             char(3),
    category_id          uuid,
    vehicle_id           uuid,
    bucket               public.expense_bucket,
    counts_toward_budget boolean,
    amortize_months      smallint,
    merchant             text,
    note                 text,
    odometer_km          int
  )
  where e.id is not null
    and not exists (select 1 from public.expenses x where x.id = e.id)
  on conflict (id) do nothing;

  get diagnostics v_reassigned = row_count;

  return jsonb_build_object(
    'categories_created',   v_categories,
    'expenses_imported',    v_expenses + v_reassigned,
    'expenses_reassigned',  v_reassigned,
    'expenses_skipped',     v_offered - v_expenses - v_reassigned
  );
end;
$$;

comment on function public.import_expenses(jsonb, jsonb) is
  'Commits a mapped CSV import in one transaction: creates the categories the file named, then inserts its expenses, skipping ids already in the ledger. All or nothing.';


-- ---------------------------------------------------------------------------
-- v_vehicle_closing — the figures the closing summary is made of.
--
-- Everything a sold car is worth saying at the end: what it cost, how far it
-- went, what that worked out to per kilometre, how long it was here, and how
-- much of it was built rather than bought. `v_vehicle_totals` already computes
-- the money and the distance, so this view adds only what it has not got — the
-- sale, the arithmetic net of the sale, and four counts of the log.
--
-- It is defined for every vehicle, not only sold ones. A car you still own has a
-- null sale and a net cost equal to its total, which is exactly right, and it
-- means the page can be previewed before the sale is recorded.
--
-- `sold_price` is folded in only when it is in the same currency as everything
-- else, on the same rule as `purchase_price` in 0013: no rate is stored on the
-- row, so nothing is converted (CLAUDE.md section 5).
-- ---------------------------------------------------------------------------

create view public.v_vehicle_closing
with (security_invoker = true) as
select
  t.vehicle_id,
  t.user_id,
  t.currency,

  v.nickname,
  v.status,
  v.purchase_date,
  v.sold_date,
  v.archived_at,

  case
    when v.sold_price is null then null
    when coalesce(v.currency, t.currency) <> t.currency then null
    else v.sold_price
  end::bigint                         as sold_price,

  t.purchase_price,
  t.total_spend,
  t.running_spend,
  t.project_spend,
  t.total_invested,
  t.km_driven,
  t.cost_per_km,
  t.months_owned,

  -- What the car actually cost to own: everything put in, less whatever came
  -- back out on the sale. A car sold for more than it cost gives a negative
  -- number, and that is a true thing to be told.
  (
    t.total_invested
    - coalesce(
        case
          when v.sold_price is null then 0
          when coalesce(v.currency, t.currency) <> t.currency then 0
          else v.sold_price
        end, 0)
  )::bigint                           as net_cost,

  case
    when t.km_driven > 0 then
      round(
        (
          t.total_invested
          - coalesce(
              case
                when v.sold_price is null then 0
                when coalesce(v.currency, t.currency) <> t.currency then 0
                else v.sold_price
              end, 0)
        )::numeric / t.km_driven
      )::bigint
  end                                 as net_cost_per_km,

  coalesce(log.mods_installed, 0)  as mods_installed,
  coalesce(log.fill_ups, 0)        as fill_ups,
  coalesce(log.services_done, 0)   as services_done,
  coalesce(log.expense_count, 0)   as expense_count

from public.v_vehicle_totals t
join public.vehicles v on v.id = t.vehicle_id

left join lateral (
  select
    (select count(*) from public.mod_plans m
      where m.vehicle_id = v.id and m.status = 'installed' and m.archived_at is null)::int
                                              as mods_installed,
    (select count(*) from public.fuel_logs f
      where f.vehicle_id = v.id)::int         as fill_ups,
    (select count(*) from public.service_records s
      where s.vehicle_id = v.id)::int         as services_done,
    (select count(*) from public.expenses e
      where e.vehicle_id = v.id and e.is_draft = false)::int
                                              as expense_count
) log on true;

comment on view public.v_vehicle_closing is
  'The closing summary for a vehicle: total owned cost, kilometres driven, cost per km, months owned, mods installed, and the same figures net of the sale price.';


-- ---------------------------------------------------------------------------
-- Grants. Same shape as every migration before this one: authenticated and
-- service_role, never anon.
-- ---------------------------------------------------------------------------

grant select on public.v_vehicle_closing to authenticated, service_role;

grant execute on function public.import_expenses(jsonb, jsonb) to authenticated, service_role;
