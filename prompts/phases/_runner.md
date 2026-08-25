You are running UNATTENDED. Nobody is at the keyboard. Nobody will answer a question.

CONTEXT: Phases 0, 1 and 2 of docs/04-ROADMAP.md are already built, merged to main and
deployed. The app is live and in real use. Read CLAUDE.md, all of docs/, and the existing
AUTOPILOT-NOTES.md before starting — the notes contain assumptions from earlier runs that
you must stay consistent with.

RULES FOR THIS RUN:

1. WORK TO COMPLETION. Build the phase below end to end. Do not ask for approval on
   implementation decisions — there is nobody to approve them.

2. WHEN A SPEC IS AMBIGUOUS: take the simpler reading, build it, and append the assumption
   to AUTOPILOT-NOTES.md under a heading for this phase. Never stall.

3. SELF-VERIFY CONTINUOUSLY. After each meaningful chunk: typecheck, lint, tests, and
   `npx supabase db reset` if you touched the schema. Fix what you broke before continuing.
   Never leave the tree broken.

4. THREE STRIKES. If the same error survives three genuine fix attempts, stop trying. Write
   what you tried and what you think is actually wrong to AUTOPILOT-NOTES.md, revert that
   specific change so the tree still builds, and continue with the rest of the phase. Do not
   thrash on one problem for an hour.

5. MIGRATIONS ARE LOCAL ONLY. Write them, run `npx supabase db reset` to prove they replay
   clean from zero, commit them. `supabase db push` is blocked and I will run it myself
   after taking a backup. Note clearly in AUTOPILOT-NOTES.md if a phase adds a migration, so
   I know a push is needed before deploying.

6. THESE COMMANDS ARE BLOCKED AND WILL FAIL — deliberately, not an error to work around:
   `git push`, `supabase db push`, `supabase link`, anything Vercel, anything gh. Commit
   locally only. Do not attempt workarounds or alternative commands.

7. IF THE PHASE CANNOT BE FINISHED — a genuine blocker, something needing a credential,
   something a later phase was supposed to build — stop, write the reason to
   AUTOPILOT-NOTES.md, leave the tree building, and end your turn.

8. STAY IN SCOPE. Build this phase only. Note later-phase work you spot; leave it alone.

9. DOCS ARE THE CONTRACT. Never edit anything under docs/ unless the phase prompt explicitly
   pre-approves that edit. Where the code must diverge, note it — do not rewrite the spec to
   match what you built.

10. AT THE END, append a section to AUTOPILOT-NOTES.md containing:
    - What you built, five bullets, plain language
    - Every assumption you made
    - Whether this phase added a migration that needs pushing
    - Anything in the phase you did not build, and why
    - Anything you are not confident about
    - What a reviewer should check first

--- THE PHASE ---
