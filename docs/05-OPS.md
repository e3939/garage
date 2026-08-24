# 05 — Operations and credentials

How work actually gets executed: who runs what, where secrets live, and how SQL reaches the
cloud database.

## The principle

**Claude Code develops against a local Supabase stack, not your cloud project.**

`supabase start` runs the full stack — Postgres, Auth, Storage, Studio — in Docker on your
machine. Its anon and service-role keys are fixed demo values, identical on every developer's
machine worldwide, and are not secrets. Claude Code can read them, print them, log them, and
nothing is at risk.

Your cloud project's real keys never enter the repo, and the CLI's access token lives in your
OS keychain or `~/.supabase/`, not in a file the agent is reading.

The only bridge between the two is `supabase db push`, and that is a command **you** run.

---

## Division of labour

| Task | Who | Why |
|---|---|---|
| `supabase login` | You, once | Opens a browser, stores a token outside the repo |
| `supabase link --project-ref …` | You, once | Prompts for the database password |
| `supabase start` / `stop` | Either | Local Docker stack, no secrets involved |
| `supabase migration new …` | Claude | Just creates an empty timestamped file |
| Writing migration SQL | Claude | Its main job |
| `supabase db reset` | Claude | **Local only.** Wipes local, replays all migrations + seed |
| `supabase gen types typescript --local` | Claude | Regenerates `lib/supabase/types.ts` |
| `supabase db push` | **You** | The gate. Applies pending migrations to the cloud |
| `vercel login`, `vercel env add` | You | Real production secrets |
| Creating the cloud project | You | Dashboard, once |

Rule of thumb: if a command prompts for a password, opens a browser, or writes to the cloud,
it's yours. Everything else is Claude's.

---

## Environment files

Three files, one committed.

**`.env.example`** — committed. Structure only, no real values. Claude Code maintains it: any
new variable it introduces must appear here in the same commit.

**`.env.local`** — gitignored. Points at the local stack. Filled from the output of
`supabase start`. These values are not secrets but the file stays gitignored so the habit
never breaks.

**Vercel environment variables** — set through `vercel env add` or the dashboard. Never in the
repo, never pasted into a chat.

### Variables

```
NEXT_PUBLIC_SUPABASE_URL          # http://127.0.0.1:54321 locally
NEXT_PUBLIC_SUPABASE_ANON_KEY     # public by design; RLS is what protects the data
SUPABASE_SERVICE_ROLE_KEY         # bypasses RLS entirely — see below
```

**The anon key is not a secret.** It ships to the browser in every Supabase app. Its safety
comes entirely from row-level security, which is why Phase 1's acceptance test is "prove a
second user sees zero rows". If RLS is wrong, the anon key is a skeleton key.

**The service-role key bypasses RLS completely.** Rules:
- Never prefixed `NEXT_PUBLIC_`
- Never imported into a file that lacks `import 'server-only'` at the top
- Only used by the recurring-expense cron job and CSV import
- The production one exists in Vercel and your password manager. Nowhere else.

Add a check to CI: fail the build if `SUPABASE_SERVICE_ROLE_KEY` appears in any file under
`app/` that isn't marked `server-only`.

---

## How SQL reaches the database

**The only path is a migration file.** No exceptions, including "just this one quick fix".

```bash
supabase migration new add_fund_drawdown     # Claude creates the file
# Claude writes the SQL, shows you the diff
supabase db reset                            # Claude: wipes local, replays everything + seed
npm run test                                 # Claude: verify
# ... you review the PR ...
supabase db push                             # You: applies to cloud
```

`supabase db reset` running clean from zero on every schema change is the safety net — it
proves the migration history is coherent and that a fresh environment can be built from the
repo alone. If a reset fails, the migration is wrong, not the reset.

**The Studio SQL editor is for reading only.** Running DDL there creates schema that exists in
your cloud database and nowhere in git, and the next `db reset` will silently disagree with
production. If you do it by accident, run `supabase db diff` immediately and capture the
change into a proper migration.

**Migrations are append-only once merged.** A merged migration is history. Fix forward.

**Before any `db push` against real data**, take a backup from the dashboard. It takes ten
seconds and the one time you need it, you really need it.

---

## Two-terminal workflow

Terminal 1 — the stack, left running:
```bash
supabase start        # Studio at http://127.0.0.1:54323
npm run dev
```

Terminal 2 — Claude Code.

Claude can read the dev server output and Postgres logs via `supabase logs`, so it debugs its
own migrations without you relaying errors. When you want a clean slate:
`supabase db reset && npm run dev`.

---

## Claude Code permissions

`.claude/settings.json` is committed with the repo. It's a guardrail against accidents, not a
security boundary — treat it as "prevents the agent from doing something dumb at 1am", not as
a sandbox. Real protection comes from the cloud credentials not being in the repo at all.

Two things worth knowing:

- **Deny beats allow**, and the lists merge across scopes. A deny in your `~/.claude/settings.json`
  can't be overridden by a project file — that's a deliberate safety net.
- **Deny rules on `Read` don't block Bash.** `Read(./.env.local)` stops the Read tool but not
  `cat .env.local` in a shell. Deny both forms if it matters to you.

The shipped config puts `supabase db push`, `git push`, and anything targeting `--linked` into
`ask`, so they stop and wait for you rather than being blocked outright.

---

## If a key leaks

1. Supabase dashboard → Settings → API → roll the service-role key.
2. Update Vercel, redeploy.
3. Rotate the database password if it was ever in a command that got committed.
4. `git log -p -S '<fragment of the key>'` to find where it entered history. If it's in a
   pushed commit, rotating is mandatory — rewriting history is not enough, GitHub caches
   force-pushed objects.

Prevention: add `gitleaks` as a pre-commit hook in Phase 0. It costs one afternoon and catches
the mistake that costs a weekend.

---

## CI

GitHub Actions runs typecheck, lint and build. It does **not** need database access —
give it dummy `NEXT_PUBLIC_*` values as repository secrets so the build resolves, and nothing
more. If a future phase needs integration tests against a real schema, spin up
`supabase start` inside the workflow rather than pointing CI at your cloud project.

---

## Cost note

The Supabase free tier covers this app comfortably: 500MB database, 1GB storage, 50,000
monthly active users. The thing that will actually push you off it is **photos**, which is
why client-side compression to webp before upload is a hard rule in `CLAUDE.md` and not a
nice-to-have. A year of receipts and build photos at 400KB each is fine. At 4MB each it is not.
