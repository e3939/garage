-- 0023 — ledger_page filters on the budget switch
--
-- The Monthly view means `counts_toward_budget = true` (docs/01-PRODUCT.md,
-- core concept 1). The switcher on /today moved the hero figure but the list
-- under it could not be narrowed the same way, because this function had no
-- parameter for that column -- so Monthly printed a discipline number over a
-- list with the kept-out rows still in it.
--
-- The parameter is added last and defaults to null, so every existing call is
-- unchanged and null still means "do not filter". The function is dropped and
-- recreated rather than replaced because adding an argument changes the
-- signature; leaving both would make the call ambiguous.
--
-- No table, column, enum or constraint changes.

drop function if exists public.ledger_page(
  int, date, timestamptz, uuid, date, date, uuid[], public.expense_bucket[],
  uuid[], boolean, bigint, bigint, text, boolean
);

create function public.ledger_page(
  p_limit               int                     default 40,
  p_cursor_occurred_on  date                    default null,
  p_cursor_created_at   timestamptz             default null,
  p_cursor_id           uuid                    default null,
  p_from                date                    default null,
  p_to                  date                    default null,
  p_category_ids        uuid[]                  default null,
  p_buckets             public.expense_bucket[] default null,
  p_vehicle_ids         uuid[]                  default null,
  p_has_photo           boolean                 default null,
  p_amount_min          bigint                  default null,
  p_amount_max          bigint                  default null,
  p_search              text                    default null,
  p_include_drafts      boolean                 default false,
  p_counts_toward_budget boolean                default null
)
returns table (
  id                   uuid,
  occurred_on          date,
  amount               bigint,
  currency             text,
  category_id          uuid,
  category_name        text,
  category_icon        text,
  category_colour_hex  text,
  vehicle_id           uuid,
  vehicle_nickname     text,
  bucket               public.expense_bucket,
  counts_toward_budget boolean,
  amortize_months      smallint,
  merchant             text,
  note                 text,
  odometer_km          int,
  is_draft             boolean,
  attachment_count     int,
  created_at           timestamptz,
  day_total            bigint,
  day_count            int
)
language sql
stable
security invoker
set search_path = ''
as $$
with filtered as not materialized (
  select e.*
  from public.expenses e
  where e.user_id = (select auth.uid())
    and (p_include_drafts or e.is_draft = false)
    and (p_from          is null or e.occurred_on >= p_from)
    and (p_to            is null or e.occurred_on <= p_to)
    and (p_category_ids  is null or e.category_id = any (p_category_ids))
    and (p_buckets       is null or e.bucket      = any (p_buckets))
    and (p_counts_toward_budget is null or e.counts_toward_budget = p_counts_toward_budget)
    and (p_vehicle_ids   is null or e.vehicle_id  = any (p_vehicle_ids))
    and (p_amount_min    is null or e.amount >= p_amount_min)
    and (p_amount_max    is null or e.amount <= p_amount_max)
    and (
      p_search is null or p_search = ''
      or e.note     ilike '%' || p_search || '%'
      or e.merchant ilike '%' || p_search || '%'
    )
    and (
      p_has_photo is null
      or p_has_photo = exists (
        select 1 from public.attachments a where a.expense_id = e.id
      )
    )
),
page as (
  select f.*
  from filtered f
  where p_cursor_id is null
     or (f.occurred_on, f.created_at, f.id)
        < (p_cursor_occurred_on, p_cursor_created_at, p_cursor_id)
  order by f.occurred_on desc, f.created_at desc, f.id desc
  limit greatest(p_limit, 1)
),
day_totals as (
  select
    f.occurred_on,
    sum(f.amount)::bigint as day_total,
    count(*)::int         as day_count
  from filtered f
  where f.occurred_on in (select distinct p.occurred_on from page p)
  group by f.occurred_on
)
select
  p.id,
  p.occurred_on,
  p.amount,
  p.currency::text,
  p.category_id,
  c.name,
  c.icon,
  c.colour_hex,
  p.vehicle_id,
  v.nickname,
  p.bucket,
  p.counts_toward_budget,
  p.amortize_months,
  p.merchant,
  p.note,
  p.odometer_km,
  p.is_draft,
  coalesce(a.n, 0),
  p.created_at,
  d.day_total,
  d.day_count
from page p
left join public.categories c on c.id = p.category_id
left join public.vehicles   v on v.id = p.vehicle_id
left join lateral (
  select count(*)::int as n
  from public.attachments at
  where at.expense_id = p.id
) a on true
join day_totals d on d.occurred_on = p.occurred_on
order by p.occurred_on desc, p.created_at desc, p.id desc;
$$;

comment on function public.ledger_page is
  'One keyset page of the ledger with its day subtotals. Filters are AND-across, OR-within; null means unfiltered. p_counts_toward_budget narrows to the budget view.';

revoke all on function public.ledger_page(
  int, date, timestamptz, uuid, date, date, uuid[], public.expense_bucket[],
  uuid[], boolean, bigint, bigint, text, boolean, boolean
) from public;

grant execute on function public.ledger_page(
  int, date, timestamptz, uuid, date, date, uuid[], public.expense_bucket[],
  uuid[], boolean, bigint, bigint, text, boolean, boolean
) to authenticated, service_role;
