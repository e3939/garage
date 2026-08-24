You are running UNATTENDED. Nobody is at the keyboard. Nobody will answer a question.

RULES FOR THIS RUN:

1. WORK TO COMPLETION. Read CLAUDE.md and all of docs/ first. Then build the phase below
   end to end. Do not ask for approval on implementation decisions — there is nobody to
   approve them.

2. WHEN A SPEC IS AMBIGUOUS: take the simpler reading, build it, and append the assumption
   to AUTOPILOT-NOTES.md in the project root under a heading for this phase. Never stall.

3. SELF-VERIFY CONTINUOUSLY. After each meaningful chunk run typecheck, lint, tests, and
   `npx supabase db reset` if you touched the schema. Fix what you broke before continuing.
   Never leave the tree broken.

4. THREE STRIKES. If the same error survives three genuine fix attempts, stop trying.
   Write what you tried and what you think is actually wrong to AUTOPILOT-NOTES.md, revert
   that specific change so the tree still builds, and continue with the rest of the phase.
   Do not thrash on one problem for an hour.

5. THESE COMMANDS ARE BLOCKED AND WILL FAIL — that is deliberate, not an error to work
   around: `git push`, `supabase db push`, `supabase link`, anything Vercel, anything gh.
   The cloud is off limits tonight. Commit locally only. Do not attempt workarounds, do not
   try alternative commands to achieve the same thing.

6. IF THE PHASE CANNOT BE FINISHED — a genuine blocker, something needing a credential,
   something a later phase was supposed to build — stop, write the reason to
   AUTOPILOT-NOTES.md, leave the tree in a state that builds, and end your turn.

7. STAY IN SCOPE. Build this phase only. If you notice work belonging to a later phase,
   note it in AUTOPILOT-NOTES.md and leave it alone.

8. AT THE END, append a section to AUTOPILOT-NOTES.md containing:
   - What you built, five bullets, plain language
   - Every assumption you made
   - Anything in the phase you did not build, and why
   - Anything you are not confident about
   - What a reviewer should check first

Never edit anything in docs/. Those are the contract. If the code needs to diverge from
them, note it — do not rewrite the spec to match what you built.

--- THE PHASE ---
