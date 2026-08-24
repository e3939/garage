-- 0007 — Row level security
--
-- docs/02-DATA-MODEL.md: "Every table: enable RLS, then four policies." A table
-- without a policy is a bug, even in dev, so this migration ends with an
-- assertion that walks the catalogue and fails the reset if one is missing.
--
-- The local stack does not auto-expose new tables to the Data API roles, so the
-- grants are explicit too. Grants say which roles may reach a table at all; the
-- policies say which rows. Both are needed.

-- ---------------------------------------------------------------------------
-- The common case: a user_id column that must equal auth.uid().
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  owned_tables text[] := array[
    'vehicles',
    'categories',
    'expenses',
    'attachments',
    'mod_plans',
    'service_schedules',
    'service_records',
    'fuel_logs',
    'parts',
    'timeline_notes',
    'milestones',
    'budgets',
    'funds',
    'fund_contributions',
    'recurring_expenses'
  ];
begin
  foreach t in array owned_tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "own_select" on public.%I for select using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "own_insert" on public.%I for insert with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "own_update" on public.%I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "own_delete" on public.%I for delete using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- profiles — keyed by the auth user id, so the predicate is `id`.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "own_select" on public.profiles
  for select using (id = (select auth.uid()));
create policy "own_insert" on public.profiles
  for insert with check (id = (select auth.uid()));
create policy "own_update" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own_delete" on public.profiles
  for delete using (id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- mod_dependencies — a join table with no user_id of its own. Ownership is read
-- through mod_plans, and both ends of the edge must belong to the caller so a
-- dependency can never be pointed at somebody else's mod.
-- ---------------------------------------------------------------------------

alter table public.mod_dependencies enable row level security;

create policy "own_select" on public.mod_dependencies
  for select using (
    exists (select 1 from public.mod_plans m
            where m.id = mod_dependencies.mod_plan_id and m.user_id = (select auth.uid()))
  );

create policy "own_insert" on public.mod_dependencies
  for insert with check (
    exists (select 1 from public.mod_plans m
            where m.id = mod_dependencies.mod_plan_id and m.user_id = (select auth.uid()))
    and exists (select 1 from public.mod_plans d
                where d.id = mod_dependencies.depends_on_id and d.user_id = (select auth.uid()))
  );

create policy "own_update" on public.mod_dependencies
  for update using (
    exists (select 1 from public.mod_plans m
            where m.id = mod_dependencies.mod_plan_id and m.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.mod_plans m
            where m.id = mod_dependencies.mod_plan_id and m.user_id = (select auth.uid()))
    and exists (select 1 from public.mod_plans d
                where d.id = mod_dependencies.depends_on_id and d.user_id = (select auth.uid()))
  );

create policy "own_delete" on public.mod_dependencies
  for delete using (
    exists (select 1 from public.mod_plans m
            where m.id = mod_dependencies.mod_plan_id and m.user_id = (select auth.uid()))
  );


-- ---------------------------------------------------------------------------
-- Grants. The Data API roles reach nothing without these.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

-- Views are tables to the grant system; v_expense_impact is read-only either way.
grant select on public.v_expense_impact to authenticated, service_role;

-- anon is signed out. It gets nothing.


-- ---------------------------------------------------------------------------
-- The guard. If a later migration adds a table and forgets its policies, the
-- next `supabase db reset` fails here rather than shipping an open table.
-- ---------------------------------------------------------------------------

do $$
declare
  offender text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into offender
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (
      c.relrowsecurity = false
      or (select count(*) from pg_policy p where p.polrelid = c.oid) < 4
    );

  if offender is not null then
    raise exception 'Tables without RLS or with fewer than four policies: %', offender;
  end if;
end;
$$;
