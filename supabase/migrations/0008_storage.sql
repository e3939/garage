-- 0008 — Storage buckets and their policies
--
-- Three private buckets. Object paths are {user_id}/{vehicle_id}/{uuid}.webp, so
-- the first path segment is the owner and that is what every policy checks.
-- Nothing is public; images are served through signed URLs generated server-side.
-- See docs/02-DATA-MODEL.md.

insert into storage.buckets (id, name, public)
values
  ('receipts',    'receipts',    false),
  ('inspiration', 'inspiration', false),
  ('vehicles',    'vehicles',    false)
on conflict (id) do nothing;

do $$
declare
  b text;
  buckets text[] := array['receipts', 'inspiration', 'vehicles'];
begin
  foreach b in array buckets loop
    execute format($p$
      create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_own_select', b);

    execute format($p$
      create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_own_insert', b);

    execute format($p$
      create policy %I on storage.objects for update to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_own_update', b, b);

    execute format($p$
      create policy %I on storage.objects for delete to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_own_delete', b);
  end loop;
end;
$$;
