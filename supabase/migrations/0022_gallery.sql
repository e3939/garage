-- 0022 — The gallery
--
-- A personal photo host for the build, per vehicle. Everything else in this app
-- compresses a photo before it leaves the phone; this is the one place that
-- does not. The original is stored byte for byte, including HEIC, and the
-- original is what downloads. A small WebP thumbnail is generated alongside it
-- purely so browsing a grid does not pull megabytes per tile.
--
-- Grouping is albums rather than tags: the examples are events -- "wheels
-- fitted", "Hai Van pass" -- and an event is a container, not an attribute. One
-- nullable foreign key rather than a join table, a tag vocabulary, and the
-- rename-and-merge tooling a free-text vocabulary always ends up needing. If a
-- photo ever needs to be in two places, a join table is additive; going the
-- other way means picking a primary tag out of a set, which has no right answer.
--
-- docs/02-DATA-MODEL.md carries both tables, the bucket and the view.


-- ---------------------------------------------------------------------------
-- gallery_albums
--
-- Named groups of photos. `occurred_on` is the event's date and is what the
-- album sorts by; it is nullable because "engine bay" is a perfectly good album
-- that did not happen on a day.
-- ---------------------------------------------------------------------------

create table public.gallery_albums (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  occurred_on date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index gallery_albums_vehicle_idx
  on public.gallery_albums (user_id, vehicle_id, occurred_on desc nulls last, created_at desc);

create unique index gallery_albums_name_idx
  on public.gallery_albums (user_id, vehicle_id, lower(btrim(name)));

create trigger gallery_albums_set_updated_at
  before update on public.gallery_albums
  for each row execute function public.set_updated_at();

comment on table public.gallery_albums is
  'Named groups of gallery photos, one per event. A photo belongs to at most one.';


-- ---------------------------------------------------------------------------
-- gallery_photos
--
-- The row describes an object that is stored untouched. `bytes`, `width`,
-- `height` and `content_type` are the original''s, not the thumbnail''s, because
-- they are what the quota is spent on and what a download hands back.
--
-- `thumb_path` is nullable on purpose. A thumbnail is made by drawing the image
-- into a canvas, and only Safari can do that with a HEIC -- which is fine on the
-- phone this is built for, and degrades to a placeholder tile everywhere else
-- rather than refusing the upload. Nothing is lost when it is null; the original
-- is still there.
-- ---------------------------------------------------------------------------

create table public.gallery_photos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  album_id          uuid references public.gallery_albums(id) on delete set null,
  storage_path      text not null unique,
  thumb_path        text unique,
  original_filename text not null,
  content_type      text not null,
  bytes             bigint not null check (bytes > 0),
  width             int,
  height            int,
  captured_at       timestamptz,
  occurred_on       date not null,
  caption           text,
  odometer_km       int check (odometer_km is null or odometer_km >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index gallery_photos_vehicle_idx
  on public.gallery_photos (user_id, vehicle_id, occurred_on desc, created_at desc, id desc);

create index gallery_photos_album_idx
  on public.gallery_photos (user_id, album_id);

create trigger gallery_photos_set_updated_at
  before update on public.gallery_photos
  for each row execute function public.set_updated_at();

comment on table public.gallery_photos is
  'Uncompressed originals, one row per file. bytes/width/height describe the original, never the thumbnail.';


-- ---------------------------------------------------------------------------
-- RLS. Four policies each, the shape docs/02-DATA-MODEL.md states, and explicit
-- grants because this stack does not expose a new table to the Data API roles
-- on its own.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  tables text[] := array['gallery_albums', 'gallery_photos'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format($p$
      create policy own_select on public.%I for select
      using (user_id = (select auth.uid()))
    $p$, t);

    execute format($p$
      create policy own_insert on public.%I for insert
      with check (user_id = (select auth.uid()))
    $p$, t);

    execute format($p$
      create policy own_update on public.%I for update
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()))
    $p$, t);

    execute format($p$
      create policy own_delete on public.%I for delete
      using (user_id = (select auth.uid()))
    $p$, t);
  end loop;
end;
$$;

grant select, insert, update, delete on public.gallery_albums to authenticated, service_role;
grant select, insert, update, delete on public.gallery_photos to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The bucket. Private, same path convention as the other three, and a 50MB
-- ceiling per object -- a 48MP ProRAW is about 25MB, so that is headroom rather
-- than a limit anyone meets.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery',
  'gallery',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'image/avif', 'image/tiff', 'image/gif', 'image/x-adobe-dng'
  ]
)
on conflict (id) do nothing;

do $$
begin
  execute $p$
    create policy gallery_own_select on storage.objects for select to authenticated
    using (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;

  execute $p$
    create policy gallery_own_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;

  execute $p$
    create policy gallery_own_update on storage.objects for update to authenticated
    using (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text)
    with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;

  execute $p$
    create policy gallery_own_delete on storage.objects for delete to authenticated
    using (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
end;
$$;


-- ---------------------------------------------------------------------------
-- v_storage_usage
--
-- What the free tier is being spent on, per bucket. `security_invoker` means the
-- storage policies above decide which rows are visible, so this sums the
-- caller''s objects and nobody else''s.
--
-- The quota itself is not here: it is a plan detail, not a schema fact, and it
-- lives in lib/storage/quota.ts.
-- ---------------------------------------------------------------------------

create view public.v_storage_usage
with (security_invoker = true) as
  select
    o.bucket_id,
    count(*)::bigint                                          as objects,
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint   as bytes
  from storage.objects o
  group by o.bucket_id;

comment on view public.v_storage_usage is
  'Bytes and object count per bucket for the calling user. Sum across rows for total usage.';

grant select on public.v_storage_usage to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- v_timeline, with the gallery branch added. The rest of the definition is
-- unchanged from 0019.
-- ---------------------------------------------------------------------------

create or replace view public.v_timeline
with (security_invoker = true) as

  -- Expenses. Drafts are awaiting confirmation and are not history yet.
  select
    e.user_id,
    e.vehicle_id,
    e.occurred_on,
    'expense'::public.timeline_kind         as kind,
    e.id                                    as ref_id,
    coalesce(e.merchant, c.name, 'Expense') as title,
    nullif(concat_ws(
      ' · ',
      case when e.merchant is not null then c.name end,
      case when e.amortize_months > 1
           then 'Over ' || e.amortize_months || ' months' end
    ), '')                                  as subtitle,
    e.amount                                as amount,
    e.currency::text                        as currency,
    e.created_at,
    null::text                              as stamp
  from public.expenses e
  left join public.categories c on c.id = e.category_id
  where e.is_draft = false

union all

  -- Mods. Archived plans are out of the log the same way archived anything is.
  select
    m.user_id,
    m.vehicle_id,
    coalesce(m.installed_on, m.created_at::date) as occurred_on,
    'mod'::public.timeline_kind                  as kind,
    m.id                                         as ref_id,
    m.title,
    case m.status
      when 'installed'   then 'Installed'
      when 'ordered'     then 'Ordered'
      when 'saving'      then 'Saving for it'
      when 'researching' then 'Researching'
      when 'abandoned'   then 'Abandoned'
      else 'On the list'
    end                                          as subtitle,
    null::bigint                                 as amount,
    m.currency::text                             as currency,
    m.created_at,
    case when m.status = 'installed' then 'Installed' end as stamp
  from public.mod_plans m
  where m.archived_at is null

union all

  -- Service records.
  select
    s.user_id,
    s.vehicle_id,
    s.performed_on                as occurred_on,
    'service'::public.timeline_kind as kind,
    s.id                          as ref_id,
    s.name                        as title,
    nullif(concat_ws(
      ' · ',
      s.workshop,
      case when s.odometer_km is not null then s.odometer_km || ' km' end
    ), '')                        as subtitle,
    e.amount                      as amount,
    e.currency::text              as currency,
    s.created_at,
    null::text                    as stamp
  from public.service_records s
  left join public.expenses e on e.id = s.expense_id

union all

  -- Fuel fill-ups.
  select
    f.user_id,
    f.vehicle_id,
    f.filled_on                 as occurred_on,
    'fuel'::public.timeline_kind as kind,
    f.id                        as ref_id,
    coalesce(f.station, 'Fill-up') as title,
    nullif(concat_ws(
      ' · ',
      trim(trailing '.' from trim(trailing '0' from f.litres::text)) || ' L',
      case when f.is_full_tank then 'Full tank' else 'Part fill' end
    ), '')                      as subtitle,
    f.total_cost                as amount,
    coalesce(f.currency::text, p.base_currency::text) as currency,
    f.created_at,
    null::text                  as stamp
  from public.fuel_logs f
  join public.profiles p on p.id = f.user_id

union all

  -- Milestones. A milestone with no vehicle is garage-wide and shows on none of
  -- the vehicle feeds; the feed this phase builds is per vehicle.
  select
    ms.user_id,
    ms.vehicle_id,
    ms.achieved_on                    as occurred_on,
    'milestone'::public.timeline_kind as kind,
    ms.id                             as ref_id,
    ms.title,
    ms.body                           as subtitle,
    null::bigint                      as amount,
    null::text                        as currency,
    ms.created_at,
    ms.title                          as stamp
  from public.milestones ms

union all

  -- Timeline notes: cost-free entries.
  select
    n.user_id,
    n.vehicle_id,
    n.occurred_on,
    'note'::public.timeline_kind as kind,
    n.id                         as ref_id,
    n.title,
    nullif(concat_ws(
      ' · ',
      case when n.odometer_km is not null then n.odometer_km || ' km' end
    ), '')                       as subtitle,
    null::bigint                 as amount,
    null::text                   as currency,
    n.created_at,
    null::text                   as stamp
  from public.timeline_notes n

union all

  -- Gallery photos. One row per photo, not per album: the album is a grouping
  -- for browsing, and a feed that showed "Wheels fitted" once would hide the
  -- eleven photos behind it. `ref_id` is the photo so the feed can open it
  -- directly.
  select
    g.user_id,
    g.vehicle_id,
    g.occurred_on,
    'gallery'::public.timeline_kind as kind,
    g.id                            as ref_id,
    coalesce(nullif(g.caption, ''), a.name, 'Photo') as title,
    nullif(concat_ws(
      ' · ',
      a.name,
      case when g.odometer_km is not null then g.odometer_km || ' km' end
    ), '')                          as subtitle,
    null::bigint                    as amount,
    null::text                      as currency,
    g.created_at,
    null::text                      as stamp
  from public.gallery_photos g
  left join public.gallery_albums a on a.id = g.album_id;


comment on view public.v_timeline is
  'Every event on a vehicle, normalised. Ordered by occurred_on desc, created_at desc; paginate by keyset on (occurred_on, created_at, ref_id).';

grant select on public.v_timeline to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The same guard 0007 runs, re-run now that two tables have been added. If
-- either lost a policy above, the reset fails here rather than shipping an open
-- table.
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
