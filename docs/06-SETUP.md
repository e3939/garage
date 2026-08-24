# 06 — Setup, start to finish

Written for someone who is not a developer. Every command is explained. After each step
there's a **"You should see"** line — if you don't see it, stop there rather than continuing.

Total time: about 90 minutes, most of it waiting for downloads.

---

# Part 1 — Accounts (browser only, ~20 minutes)

You need four. All the free tiers are fine except the first.

### 1.1 Anthropic — required, paid

Claude Code needs a **Pro, Max, Team or Enterprise** plan. The free Claude.ai plan does not
include it. For long autonomous runs, Max is the realistic choice — a single phase can be an
hour of continuous work, and Pro's usage limits will interrupt you mid-run.

Sign up at claude.ai, subscribe, done.

### 1.2 GitHub — free

github.com → sign up. This is where your code lives. It's also your undo button: every phase
is a separate branch, so if one goes badly you throw the branch away and nothing is lost.

### 1.3 Supabase — free

supabase.com → sign up with GitHub (fewer passwords). Then:

- **New project** → name it `garage`
- **Region: Singapore** — closest to Hanoi, and this choice directly affects how fast the app
  feels. Get it right now; changing it later means a migration.
- **Database password** → click Generate, then **save it in a password manager immediately**.
  Supabase shows it once. You'll need it in Part 3.

Wait for provisioning (~2 minutes).

### 1.4 Vercel — free

vercel.com → sign up with GitHub. You won't need this until Phase 0 is deployed. Skip it for
now if you like.

---

# Part 2 — Install software (~30 minutes)

Four things: a terminal, Node.js, Docker, and Claude Code.

## If you're on a Mac

**Open Terminal:** press `Cmd+Space`, type `Terminal`, press Enter. A window with text
appears. This is where everything happens. You type a command, press Enter, wait.

**2.1 — Command line tools**
```
xcode-select --install
```
A dialog appears; click Install. This gives you `git`. If it says "already installed", good.

**2.2 — Node.js**
Go to **nodejs.org**, download the **LTS** version, run the installer, accept defaults.

Check it worked:
```
node --version
```
> **You should see** `v22.x.x` or higher. If the terminal says "command not found", close
> Terminal completely and reopen it — new installs need a fresh window.

**2.3 — Docker Desktop**
Go to **docker.com** → Download Docker Desktop → pick the Apple Silicon or Intel build to
match your Mac (Apple menu → About This Mac tells you which). Install it, open it, and let it
finish starting. You can skip creating a Docker account.

> **You should see** the whale icon in your menu bar sitting still, not animating.

**2.4 — Claude Code**
Go to **docs.claude.com/en/docs/claude-code/setup** and copy the macOS install command from
that page. I'm deliberately not printing it here — install commands change, and the official
page is always right.

## If you're on Windows

Claude Code runs natively on Windows now; you don't need WSL.

**Open PowerShell:** Start menu → type `PowerShell` → open it. The prompt starts with `PS`.
(If it starts with just `C:\`, you're in the old Command Prompt — close it and open
PowerShell instead.)

**2.1 — Git for Windows**
git-scm.com → download → install with all defaults. Recommended because it gives Claude Code
a proper shell to work in.

**2.2 — Node.js**
nodejs.org → **LTS** installer → make sure **"Add to PATH"** stays checked → install.

Check:
```
node --version
```
> **You should see** `v22.x.x` or higher. If not, close PowerShell and reopen it.

**2.3 — Docker Desktop**
docker.com → Download for Windows → install → restart when it asks. It may prompt you to
enable WSL 2; say yes, that's just Docker's engine.

> **You should see** the whale icon in your system tray, still.

**2.4 — Claude Code**
Go to **docs.claude.com/en/docs/claude-code/setup** and copy the Windows PowerShell command
from that page.

## Both platforms — verify

```
claude --version
claude doctor
```
> **You should see** a version number, then a health check that's green across the board.
> `claude doctor` catches almost every install problem before it wastes your afternoon.

---

# Part 3 — Log in once to everything (~10 minutes)

This is the "give all credentials once" part. Each login stores a token on your machine.
After this, Claude Code runs these tools without ever handling a password.

**3.1 — Make the project folder**

Mac:
```
mkdir -p ~/Projects/garage && cd ~/Projects/garage
```
Windows:
```
mkdir $HOME\Projects\garage; cd $HOME\Projects\garage
```
`mkdir` makes a folder, `cd` moves into it. Everything from here happens inside it.

**3.2 — Put the docs in place**

Copy the files I gave you into this folder so it looks like:
```
garage/
  CLAUDE.md
  .env.example
  docs/          (01 through 06)
  prompts/
```
Rename `.claude-settings.json` to `settings.json` and put it in a new `.claude` folder:
```
mkdir .claude
```
then move the file in and rename it. On Mac, folders starting with a dot are hidden in
Finder — press `Cmd+Shift+.` to show them.

**3.3 — Claude Code**
```
claude
```
First run opens a browser to log in. Then, inside Claude Code, run:
```
/terminal-setup
```
This makes `Shift+Enter` insert a newline so you can write multi-line prompts. Type `/exit`
to leave for now.

**3.4 — Git and GitHub**
```
git init
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```
Then install the GitHub CLI (`brew install gh` on Mac, or from cli.github.com on Windows) and:
```
gh auth login
```
Choose: GitHub.com → HTTPS → yes, authenticate Git → login with a web browser. Copy the code
it shows, paste it in the browser.

> **You should see** "Logged in as <your-username>".

**3.5 — Supabase**
```
npm install --save-dev supabase
npx supabase login
```
Opens a browser. Approve.

Then link to your cloud project. Find the reference ID in your Supabase dashboard under
Settings → General — it's a 20-character string like `abcdefghijklmnopqrst`:
```
npx supabase init
npx supabase link --project-ref YOUR_REF_HERE
```
It asks for the database password from step 1.3. Paste it.

> **You should see** "Finished supabase link."

**3.6 — Vercel** (optional now)
```
npm install -g vercel
vercel login
```

**3.7 — Start the local database**
```
npx supabase start
```
First run downloads several Docker images — 5 to 10 minutes, and it looks frozen while it
works. Let it run.

> **You should see** a block of output ending with `API URL`, `anon key` and
> `service_role key`. **Leave this window open and don't close it.** Those keys are the same
> on every computer in the world — they're demo values for local development, not secrets.

---

# Part 4 — Turn on autonomy

Two settings. One in your personal config, one already in the repo.

**4.1 — Enable auto mode, once**

Auto mode is the sweet spot: a background safety classifier reviews each action instead of
asking you. Near-zero prompts, but not a free-for-all. Opt in:
```
claude --enable-auto-mode
```
Then make it your default. Open your personal settings file — `~/.claude/settings.json` on
Mac, `%USERPROFILE%\.claude\settings.json` on Windows — and put this in it:

```json
{
  "permissions": {
    "defaultMode": "auto",
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(sudo:*)",
      "Bash(git push --force:*)"
    ]
  }
}
```

Auto mode has to live in your *personal* settings, not the project's — a repository isn't
allowed to grant itself that level of trust. That's deliberate, and it's a good rule.

The deny list here is your permanent safety net: **deny always beats allow**, and a deny in
your personal settings can't be switched off by any project file.

**4.2 — The project's gates are already written**

`.claude/settings.json` in the repo puts three things in the `ask` list:
`supabase db push`, `git push`, and anything touching Vercel.

The important detail: **`ask` rules still stop the agent even in the most permissive modes.**
So Claude Code works freely for an hour, then genuinely halts and waits for you before it
touches your cloud database or pushes code. That's your "until something critical comes up".

**4.3 — What still can't hurt you**

- Claude Code works against the **local** database. If it corrupts it, `npx supabase db reset`
  rebuilds it from scratch in 30 seconds.
- Your cloud database only changes when you approve `db push`.
- Every phase is its own branch. A bad phase gets deleted; `main` is untouched.
- Your Supabase and GitHub passwords aren't in the project folder at all.

The worst realistic outcome of an unattended run is **wasted time**, not lost data.

---

# Part 5 — The daily loop

Two windows.

**Window 1** (leave running):
```
cd ~/Projects/garage
npx supabase start
npm run dev
```

**Window 2:**
```
cd ~/Projects/garage
claude
```

Then paste one prompt from `prompts/PROMPTS.md` — the Setup prompt first, then P1, then P2,
one per session.

**Between phases, always type `/clear`.** It wipes the conversation so the next phase starts
fresh. Without it, Claude Code drags Phase 2's context into Phase 5 and gets sloppy about
scope. You can check how full it is with `/context`.

**One phase per session.** When a phase finishes, review it (Part 6), merge it, `/clear`,
then start the next.

---

# Part 6 — What to check at each stop

You don't need to read the code. You need to check four things, and you can ask Claude Code
to prove each one.

**1. Does it work?** Open the app on your phone — it's on the same wifi, so
`http://<your-computer's-ip>:3000`. Claude Code can tell you the address. Walk through the
phase's acceptance line in `docs/04-ROADMAP.md`.

**2. Is the data still private?**
```
Prove RLS still holds: create a second test user, insert a row as the first user,
query as the second, show me it returns nothing.
```
Ask this after **every** phase that touches the database. It is the single check that matters
most, and it's the one that fails silently.

**3. Is it still fast?**
```
Run a production build and report the three largest route bundles against the
Phase 0 performance budget in CLAUDE.md.
```

**4. Did it stay in scope?**
```
List everything you built that isn't in this phase's roadmap entry, and everything
in the entry you didn't build.
```

If all four are clean, approve the push and move on.

---

# When to stop and think

Interrupt an autonomous run — `Esc` stops it — if you see:

- The same test failing three times with different "fixes". It's guessing; take over.
- A migration that drops or renames a column on a table with real data in it.
- Claude Code proposing to change `docs/` to match the code during a build phase. Docs get
  updated deliberately, at the end, not mid-flight to make an error look intentional.
- Any mention of `--linked`, `--db-url`, or the production dashboard during normal work.
- It asking for a password. Nothing in the normal loop needs one after Part 3.

---

# Troubleshooting

**"command not found"** — close the terminal completely and open a new one. Installers only
affect windows opened after them.

**`supabase start` hangs** — Docker Desktop isn't running. Open it, wait for the whale to go
still, retry.

**Port already in use** — something's still running from last time: `npx supabase stop` then
start again.

**Claude Code is asking permission constantly** — you're in `default` mode, not `auto`. Press
`Shift+Tab` to cycle modes; the current one shows in the interface.

**A phase went badly and you want out:**
```
git checkout main
git branch -D feat/whatever-it-was
```
That deletes the branch and everything in it. `main` is untouched. This is why every phase
gets its own branch.

**Anything else** — `claude doctor` first, then paste the exact error into Claude Code. It
debugs its own environment well.
