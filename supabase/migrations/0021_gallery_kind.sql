-- 0021 — The `gallery` timeline kind
--
-- On its own, and doing nothing else, because Postgres will not let a value
-- added to an enum be *used* in the same transaction that added it. The Supabase
-- CLI runs each migration file in its own transaction, so this file adds the
-- value and 0022 is free to write it into `v_timeline`.
--
-- docs/02-DATA-MODEL.md carries the enum's new member.

alter type public.timeline_kind add value if not exists 'gallery';
