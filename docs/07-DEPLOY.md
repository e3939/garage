# 07 — Deploying to Vercel

Written for the same reader as `docs/06-SETUP.md`: every step names the dashboard, the page
and the field. After each step there is a **"You should see"** line. If you don't see it,
stop there rather than continuing.

This document describes what the code actually reads, verified against the source on
2026-08-25. If it ever disagrees with `lib/env.ts`, `lib/env.ts` is right and this file is
stale.

---

## 1. Before you deploy

Three things must be true. All three were verified on 2026-08-25.

**1. The cloud database has every migration.**
```bash
npx supabase migration list
```
> **You should see** ten rows, `0001` through `0010`, with the same number in the Local and
> Remote columns. If the Remote column is blank for any row, run `npx supabase db push`
> yourself and take a dashboard backup first.

**2. No secret is reachable from client code.**
```bash
grep -rn "NEXT_PUBLIC_.*SECRET\|NEXT_PUBLIC_.*SERVICE_ROLE" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=supabase .
```
> **You should see** no output. A hit means a secret has been given a `NEXT_PUBLIC_` prefix
> and is being compiled into the browser bundle. That is an incident: roll the key in the
> Supabase dashboard before doing anything else, following `docs/05-OPS.md` § "If a key leaks".

```bash
grep -rn "sb_secret_" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=supabase --exclude=".env.local" .
```
> **You should see** only the explanatory comment on line 14 of `.env.example`. A line
> containing a full key — `sb_secret_` followed by a long string — is a leaked key. Same
> incident procedure.

**3. A production build succeeds with only the deploy variables set.**
```bash
npm run build
```
> **You should see** `Compiled successfully`, then a route table ending in `/today`.

---

## 2. The environment variables

These are the names the code reads. They come from `lib/env.ts` and nowhere else. Type them
into Vercel exactly as written — the check in `lib/env.ts` is case-sensitive and does not
guess at near-misses.

| Variable | Required | What it is for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | The Supabase project's API endpoint. Must be a full URL including `https://`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | The public key the browser and server use to talk to Supabase. Not a secret — RLS is what protects the data. |
| `NEXT_PUBLIC_SITE_URL` | Yes | The app's own origin. Sign-in sends it to Supabase as the fallback redirect, and Supabase rejects a value that is not allow-listed. It defaults to `http://localhost:3000`, which is not, so leaving it unset breaks sign-in on the deployed app. |
| `SUPABASE_SECRET_KEY` | Not yet | Reserved. **No application code reads this today.** Setting it is harmless and correct for later; leaving it unset will not break the deploy. |

Two notes that will save you an afternoon.

**The legacy key name still works.** `lib/env.ts` falls back to
`NEXT_PUBLIC_SUPABASE_ANON_KEY` if `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is absent. If you
already typed the old name, the app runs. Prefer the new name for anything you type fresh.

**The secret key is not wired up yet.** `docs/05-OPS.md` names it
`SUPABASE_SERVICE_ROLE_KEY`; `.env.example` and `.env.local` name it `SUPABASE_SECRET_KEY`.
Neither name appears anywhere in `app/`, `components/` or `lib/`. The first code to need it
is the recurring-expense cron job in Phase 7. Until then the name mismatch cannot break
anything, and it should be settled in one direction when Phase 7 lands.

### Where to find the values

Supabase dashboard → your `garage` project → **Project Settings** → **API Keys**.

- `NEXT_PUBLIC_SUPABASE_URL` is the **Project URL**, e.g. `https://abcdefghijklmnopqrst.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the **publishable** key, starting `sb_publishable_`
- `SUPABASE_SECRET_KEY` is the **secret** key, starting `sb_secret_`. Reveal it, copy it,
  and put it in your password manager at the same time. Never paste it into a chat, a commit
  or a file in this repo.

### Where to put them

Vercel dashboard → your project → **Settings** → **Environment Variables**.

For each one: Key, Value, then tick **Production**. Tick **Preview** as well if you want
branch deployments to work — but see the Preview note in § 5.

`NEXT_PUBLIC_SITE_URL` is the value of your production domain with no trailing path, for
example `https://garage-yourname.vercel.app`. If you later add a custom domain, this changes
and you must redeploy.

---

## 3. The email template

**Sign-in is a six-digit code, not a link.** Supabase's stock templates send a link, so until
you change them the code never arrives and sign-in cannot complete.

Supabase dashboard → **Authentication** → **Emails** (older projects label this
**Email Templates**).

Two templates need the same change, because Supabase picks a different one depending on
whether it has seen the address before:

- **Magic Link** — used for an address that already has an account.
- **Confirm signup** — used the first time an address is seen. This is the one your own first
  sign-in on the deployed app will use, so it is not optional.

For each, set the **Subject heading** to:

```
Your Garage sign-in code
```

and replace the **Message body** with exactly this:

```html
<h2>Your sign-in code</h2>

<p>Enter this code in Garage:</p>

<p style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 28px; font-weight: 700; letter-spacing: 0.24em;">
  {{ .Token }}
</p>

<p>It expires in one hour and can be used once. If you did not ask for it, ignore this email.</p>
```

Click **Save** on each one.

`{{ .Token }}` is the six-digit code. It is a different variable from
`{{ .ConfirmationURL }}`, which is the link the old flow used. You can keep a link in the
template alongside the code if you want a belt-and-braces fallback — `/auth/callback` still
handles it — but the link is the thing that breaks when opened from a mail app, so the
template above deliberately does not include one.

The same two templates are configured for the local stack in `supabase/config.toml`, pointing
at `supabase/templates/sign-in-code.html`, so `npx supabase start` behaves the same way on
your machine.

> **You should see**, after saving and requesting a code from the deployed app, an email whose
> body is six large digits and no link.

---

## 4. Supabase URL configuration

`/auth/callback` still exists and still works, so links already sitting in an inbox keep
functioning. It needs to stay allow-listed.

Supabase dashboard → **Authentication** → **URL Configuration**.

**Site URL** — your production origin, no trailing slash:
```
https://garage-yourname.vercel.app
```

**Redirect URLs** — click Add URL and add both:
```
https://garage-yourname.vercel.app/auth/callback
https://garage-yourname.vercel.app/**
```

Click **Save**.

> **You should see** the two entries listed under Redirect URLs and your domain in Site URL.

---

## 5. Staying signed in

The intent is that signing in on a device lasts for weeks, not hours. Four things decide that,
and three of them are already correct in code:

| Thing | State |
|---|---|
| `persistSession` | On. `@supabase/ssr` forces it true on the server client and it cannot be overridden. |
| `autoRefreshToken` | Off on the server, deliberately. There is no timer on a server; `proxy.ts` refreshes the token on every request instead, which is the correct pattern. |
| Cookie lifetime | 400 days — the maximum a browser will accept. `@supabase/ssr` hard-codes it and ignores any `cookieOptions.maxAge` you pass, so there is nothing to set. |
| Session limits | **Yours to check**, in the dashboard. See below. |

Supabase dashboard → **Authentication** → **Sessions**.

- **Time-box user sessions** — leave **empty**. A value here signs you out on a fixed schedule
  no matter how recently you used the app.
- **Inactivity timeout** — leave **empty**. A value here signs you out after a quiet spell.
- **Access token (JWT) expiry** — leave at `3600`. This is the short-lived token, refreshed
  silently on every request. It has nothing to do with how long you stay signed in.

> **You should see** both timeout fields blank. With them blank, the session lives as long as
> the 400-day cookie and the refresh token behind it.

---

## 6. Redeploy — this step is not optional

Every `NEXT_PUBLIC_` variable is compiled into the build output, not read fresh on each
request. This was verified: a build run with a different `NEXT_PUBLIC_SUPABASE_URL` had that
value baked into the server chunks. So **changing a variable in the Vercel dashboard has no
effect until you redeploy.**

Vercel dashboard → your project → **Deployments** → the most recent one → the menu on its
right → **Redeploy** → confirm.

> **You should see** a new deployment build and finish with a Ready badge. Open the domain
> and sign in.

Email template changes are the exception: they live in Supabase, take effect immediately, and
need no redeploy.

---

## 7. Troubleshooting

### The build fails with "Environment is incomplete: NEXT_PUBLIC_SITE_URL"

The variable is missing, or is not a full URL. `lib/env.ts` validates each one as a URL, so
`garage-yourname.vercel.app` fails and `https://garage-yourname.vercel.app` passes. This was
reproduced deliberately: a bare hostname produces exactly

```
Error: Environment is incomplete: NEXT_PUBLIC_SITE_URL.
Failed to collect page data for /settings
```

Fix the value in Vercel → Settings → Environment Variables, then redeploy. The same message
with a different name means that variable is missing or malformed instead.

### The build fails with "Environment is incomplete" naming a variable you did set

You set it for Preview but not Production, or the reverse. In Vercel → Settings →
Environment Variables, click the variable and confirm the **Production** checkbox is ticked.

### No email arrives at all

Three causes, in order of likelihood. One: you have hit the rate limit — see below. Two: the
address is being rejected upstream; check the Supabase dashboard under Authentication → Logs
for the send attempt. Three: `NEXT_PUBLIC_SITE_URL` is unset or malformed, which does not stop
the email but does mean the deployment probably failed to build at all — check section 5 of
this list.

### Clicking the link lands on an error page or on the Supabase site instead of the app

The redirect URL is not allow-listed. Go back to section 4 and confirm both entries are saved under
Authentication → URL Configuration → Redirect URLs, and that they match the domain in
`NEXT_PUBLIC_SITE_URL` character for character — `http` versus `https`, and any trailing
slash, both count.

### The email arrives but there is no code in it, only a link

The template still has Supabase's default body. Go back to section 3 and change **both** the
Magic Link and the Confirm signup templates. This is the single most likely first-deploy
failure, because a new project ships with link templates and nothing warns you.

### The code is rejected every time, even a fresh one

Check you are entering the code from the **most recent** email. Each code invalidates the one
before it, and a code can only be used once — so a code from an email two minutes older will
be refused even though it looks perfectly valid. The screen says the code did not work rather
than naming which of the two happened, because Supabase does not distinguish them either.

### "Too many codes sent to that address"

Supabase rate-limits sign-in emails hard on the free tier — a small number per hour, and a
short minimum gap between two requests for the same address. The Resend button is disabled for
30 seconds for exactly this reason. If you have hit the limit, wait it out; requesting again
makes it worse. For real use, configure your own SMTP under Authentication → Emails → SMTP
Settings.

### The code screen loses your place when you switch to the mail app

It should not. The code field and the email field are on the same screen and the page never
navigates between the two steps, which is the whole reason the flow was changed. If you do
come back to a blank email field, tell me — it means the tab was discarded by the OS, which is
a different problem with a different fix.

### Signing in appears to work, then immediately bounces back to sign-in

The session cookie is not surviving. Almost always the publishable key belongs to a different
Supabase project than `NEXT_PUBLIC_SUPABASE_URL`. Copy both from the same project's API Keys
page and redeploy.

### The app loads but every screen is empty, or a query errors

Check `npx supabase migration list` again. All ten migrations must show in the Remote column.
If they do, sign out and back in — a brand-new user gets their fifteen system categories from
a trigger on first sign-in, and a session created before the migrations landed will not have
them.

### Signing in on a preview deployment

This used to be impossible and now works. A code is not tied to a URL, so a preview deployment
signs you in the same way production does, as long as the Vercel environment variables are
ticked for **Preview** as well as Production.

### You add a custom domain later

Three things change together, in this order: Vercel → Settings → Domains adds the domain;
`NEXT_PUBLIC_SITE_URL` changes to it; Supabase → Authentication → URL Configuration gets the
new Site URL and two new Redirect URLs. Then redeploy. Leave the old `vercel.app` entries in
the redirect list until you are sure nothing is bookmarked.

---

## 8. What is still not proven

Deployment readiness is not the same as the app being right. As of 2026-08-25:

- Nothing in this app has been driven through a real browser or a real phone. Every check so
  far is a server render, a Server Action call, or a test.
- The performance budget in `CLAUDE.md` — 120KB of route JS — is not met, on every route, and
  has not been since Phase 0. See the open decisions in `AUTOPILOT-NOTES.md`.
- The code flow has been driven end to end in a browser against the local stack — code sent,
  whole code pasted, auto-submitted, session created, redirect honoured, wrong code rejected
  with the right copy. It has never been through a real inbox, a real phone keyboard, or iOS
  autofill from the notification banner.

The first real phone session is the point of this deploy. Walk the Phase 2 acceptance line
from `docs/04-ROADMAP.md`: log an expense in under five seconds, and watch whether the monthly
figure moves before the row appears.
