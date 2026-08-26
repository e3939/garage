-- 0018 — report_categories: replace a FULL JOIN Postgres will not execute
--
-- `report_categories` as written in 0017 fails at run time, every time, with:
--
--   0A000: FULL JOIN is only supported with merge-joinable or hash-joinable
--          join conditions
--
-- The condition was `full join cash c on c.category_id is not distinct from
-- i.category_id`. The intent is right and worth keeping: an expense with no
-- category is a real row that has to appear in the breakdown, and a plain `=`
-- drops it from both sides of the join because null never equals null. But
-- `is not distinct from` is neither merge- nor hash-joinable, and a FULL JOIN
-- in Postgres has no nested-loop fallback — so the planner rejects the query
-- outright rather than running it slowly. The function was never callable.
--
-- Nothing else in 0017 has this shape: `report_buckets` and `v_budget_month`
-- both join on plain equality over columns that are never null.
--
-- The fix keeps the null-safe behaviour and drops the FULL JOIN. The set of
-- categories to report on is built with a UNION — which does treat two nulls as
-- the same value, so the uncategorised row appears exactly once — and each half
-- is then attached with a LEFT JOIN, where `is not distinct from` is allowed
-- because a left join can fall back to a nested loop.
--
-- Signature, return type, ordering and grants are unchanged, so this is a
-- `create or replace` and the application needs no edit.

create or replace function public.report_categories(p_from date, p_to date, p_currency char(3))
returns table (
  category_id    uuid,
  name           text,
  icon           text,
  colour_hex     text,
  bucket         public.expense_bucket,
  monthly_total  bigint,
  all_in_total   bigint,
  expense_count  int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with impact as (
    select i.category_id, sum(i.amount)::bigint as monthly_total
    from public.v_expense_impact i
    where i.currency     = p_currency
      and i.impact_month >= date_trunc('month', p_from)::date
      and i.impact_month <= date_trunc('month', p_to)::date
    group by i.category_id
  ),
  cash as (
    select
      e.category_id,
      sum(e.amount)::bigint as all_in_total,
      count(*)::int         as expense_count
    from public.expenses e
    where e.is_draft = false
      and e.currency = p_currency
      and e.occurred_on >= date_trunc('month', p_from)::date
      and e.occurred_on <  (date_trunc('month', p_to) + interval '1 month')::date
    group by e.category_id
  ),
  -- Every category either half has anything to say about. UNION, not UNION ALL:
  -- it deduplicates, and it treats null as equal to null, which is the whole
  -- reason the uncategorised row survives.
  keys as (
    select category_id from impact
    union
    select category_id from cash
  )
  select
    k.category_id,
    cat.name,
    cat.icon,
    cat.colour_hex,
    cat.default_bucket,
    coalesce(i.monthly_total, 0)::bigint,
    coalesce(c.all_in_total, 0)::bigint,
    coalesce(c.expense_count, 0)
  from keys k
  left join impact i on i.category_id is not distinct from k.category_id
  left join cash   c on c.category_id is not distinct from k.category_id
  left join public.categories cat on cat.id = k.category_id
  order by coalesce(c.all_in_total, 0) desc, cat.name;
$$;

comment on function public.report_categories(date, date, char) is
  'Spend per category across a month range, monthly and all-in. Uncategorised expenses keep a row with a null category.';

-- Unchanged from 0017 and restated because `create or replace` on a function
-- keeps its grants — but a reader of this file should not have to know that.
grant execute on function public.report_categories(date, date, char) to authenticated, service_role;
