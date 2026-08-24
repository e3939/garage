Implement Phase 1 (Schema and money core) from docs/04-ROADMAP.md.

Work in this order:

1. Write the migrations from docs/02-DATA-MODEL.md, one file per logical group:
   enums, core tables, car tables, money tables, views, RLS policies, storage buckets
   and their policies. Follow the document exactly — every table, column, constraint,
   index and enum listed there.
2. Seed system categories from the table at the end of docs/02-DATA-MODEL.md, inserted by
   a trigger on profiles so a new user gets them on first sign-in.
3. `npx supabase db reset` and confirm the whole history replays clean from zero.
4. Generate TypeScript types into lib/supabase/types.ts.
5. lib/money.ts — minor units throughout, currency exponents from a lookup table not a
   hardcoded constant, VND formatting (dot thousands separators, ₫ suffix, no decimals),
   and parseAmount() handling "150k", "1.2m", "150.000", "150000", negatives, and garbage.
6. lib/budget.ts — resolveBucket(), resolveCountsTowardBudget(), and amortiseSlices()
   producing exactly what v_expense_impact produces, remainder on the first slice.
7. Vitest for steps 5 and 6. Must include: 100 split over 3 months giving 34/33/33,
   1 over 12 months, negative amounts, a zero-decimal currency against a two-decimal one,
   and every parseAmount input listed above.

Then prove RLS holds. Create two test users against the local stack, insert rows as the
first, query as the second, and write the result into AUTOPILOT-NOTES.md. If the second
user can see any row belonging to the first, that is a phase failure — say so plainly.

Do not run `supabase db push`. Local only.
