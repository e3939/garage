-- 0001 — Enums
--
-- Implements the "Enums" section of docs/02-DATA-MODEL.md verbatim. These are the
-- vocabulary of the app; every table below leans on them rather than on free text.

create type public.expense_bucket   as enum ('life', 'car_running', 'car_project');
create type public.vehicle_status   as enum ('owned', 'sold');
create type public.mod_status       as enum ('dreaming', 'researching', 'saving', 'ordered', 'installed', 'abandoned');
create type public.mod_priority     as enum ('needed', 'next_up', 'someday', 'dreaming');
create type public.part_status      as enum ('on_car', 'shelf', 'sold', 'binned');
create type public.attachment_kind  as enum ('receipt', 'inspiration', 'progress', 'document');
create type public.recurrence       as enum ('monthly', 'quarterly', 'yearly');
create type public.timeline_kind    as enum ('expense', 'mod', 'service', 'fuel', 'milestone', 'note');
