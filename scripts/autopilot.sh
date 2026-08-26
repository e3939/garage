#!/usr/bin/env bash
#
# Unattended phase runner.
#
# Runs each phase in prompts/phases/ in order, verifies it, commits, and moves on.
# Stops the whole chain the moment a phase fails verification — a broken phase is
# never built on top of.
#
# Usage:  ./scripts/autopilot.sh
# Watch:  tail -f logs/autopilot.log
# Stop:   Ctrl+C, or `touch STOP` in the project root

set -uo pipefail
cd "$(dirname "$0")/.."

# ---- configuration ---------------------------------------------------------

# Phases already merged to main are commented out. Uncomment to re-run one.
PHASES=(
  # "00-foundation"
  # "01-schema-money"
  # "02-expenses"
  # "03-fixes"
  # "04-vehicles"
  # "05-timeline"
  # "06-mod-planner"
  # "07-car-records"
  "08-money-tools"
  "09-polish"
  "10-import-export"
)

PHASE_TIMEOUT_MIN=90     # kill a phase that runs longer than this
LOG_DIR="logs"

# ---- setup -----------------------------------------------------------------

mkdir -p "$LOG_DIR"
MAIN_LOG="$LOG_DIR/autopilot.log"
rm -f STOP

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$MAIN_LOG"; }

banner() {
  echo "" | tee -a "$MAIN_LOG"
  echo "════════════════════════════════════════════════════════" | tee -a "$MAIN_LOG"
  log "$*"
  echo "════════════════════════════════════════════════════════" | tee -a "$MAIN_LOG"
}

# Run a command with a timeout. macOS has no `timeout` by default.
with_timeout() {
  local minutes=$1; shift
  "$@" &
  local pid=$!
  ( sleep $((minutes * 60)); kill -TERM "$pid" 2>/dev/null ) &
  local watchdog=$!
  wait "$pid"; local rc=$?
  kill "$watchdog" 2>/dev/null
  return $rc
}

# ---- preflight -------------------------------------------------------------

banner "PREFLIGHT"

command -v claude >/dev/null || { log "FATAL: claude not found"; exit 1; }
command -v npx    >/dev/null || { log "FATAL: npx not found"; exit 1; }

if ! docker info >/dev/null 2>&1; then
  log "FATAL: Docker isn't running. Open Docker Desktop and retry."
  exit 1
fi

if ! npx supabase status >/dev/null 2>&1; then
  log "FATAL: local Supabase isn't running. Run 'npx supabase start' first."
  exit 1
fi

if [ ! -f .claude/settings.autopilot.json ]; then
  log "FATAL: .claude/settings.autopilot.json missing."
  exit 1
fi

# Swap in the unattended permission profile; restore it on any exit.
cp .claude/settings.json .claude/settings.interactive.json
cp .claude/settings.autopilot.json .claude/settings.json
restore() {
  if [ -f .claude/settings.interactive.json ]; then
    mv .claude/settings.interactive.json .claude/settings.json
    log "Restored interactive permission settings."
  fi
}
trap restore EXIT INT TERM

log "Preflight passed. Running ${#PHASES[@]} phases."

# ---- verification gate -----------------------------------------------------

verify() {
  local phase=$1
  local vlog="$LOG_DIR/${phase}-verify.log"
  local failed=0

  log "Verifying $phase..."

  # Each check only runs if that npm script actually exists yet.
  for script in typecheck lint test build; do
    if npm run 2>/dev/null | grep -qE "^  $script$"; then
      log "  running: npm run $script"
      if ! npm run "$script" >>"$vlog" 2>&1; then
        log "  FAILED: npm run $script"
        failed=1
      fi
    else
      log "  skipped: npm run $script (not defined yet)"
    fi
  done

  # If migrations exist, prove they replay cleanly from zero.
  if [ -d supabase/migrations ] && [ -n "$(ls -A supabase/migrations 2>/dev/null)" ]; then
    log "  running: supabase db reset"
    if ! npx supabase db reset >>"$vlog" 2>&1; then
      log "  FAILED: supabase db reset"
      failed=1
    fi
  fi

  return $failed
}

# ---- main loop -------------------------------------------------------------

COMPLETED=()

for phase in "${PHASES[@]}"; do

  if [ -f STOP ]; then
    log "STOP file found. Halting before $phase."
    break
  fi

  PROMPT_FILE="prompts/phases/${phase}.md"
  if [ ! -f "$PROMPT_FILE" ]; then
    log "FATAL: $PROMPT_FILE missing. Halting."
    break
  fi

  banner "PHASE: $phase"

  BRANCH="feat/${phase}"
  git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
  log "On branch $BRANCH"
  log "HEAD: $(git rev-parse --short HEAD)"

  PHASE_LOG="$LOG_DIR/${phase}.log"

  log "Handing to Claude Code (timeout ${PHASE_TIMEOUT_MIN}m)..."
  with_timeout "$PHASE_TIMEOUT_MIN" \
    claude -p "$(cat prompts/phases/_runner.md; echo; cat "$PROMPT_FILE")" \
      --dangerously-skip-permissions \
      --output-format text \
      >>"$PHASE_LOG" 2>&1
  CLAUDE_RC=$?

  if [ $CLAUDE_RC -ne 0 ]; then
    log "Claude Code exited non-zero ($CLAUDE_RC). Possible timeout or usage limit."
    log "See $PHASE_LOG. Halting the chain."
    break
  fi

  if verify "$phase"; then
    git add -A
    git commit -m "feat(${phase}): autopilot run" >>"$PHASE_LOG" 2>&1 || log "  nothing to commit"
    log "PHASE PASSED: $phase (committed locally, not pushed)"
    COMPLETED+=("$phase")
  else
    log "PHASE FAILED VERIFICATION: $phase"
    git add -A
    git commit -m "wip(${phase}): autopilot run, failed verification" >>"$PHASE_LOG" 2>&1 || true
    log "Work committed to $BRANCH for inspection. Halting the chain."
    break
  fi

done

# ---- summary ---------------------------------------------------------------

banner "AUTOPILOT FINISHED"
log "Phases completed: ${#COMPLETED[@]} of ${#PHASES[@]}"
for p in "${COMPLETED[@]}"; do log "  passed: $p"; done
log ""
log "Nothing was pushed to GitHub and nothing touched your cloud database."
log "Read logs/autopilot.log, then review each branch before merging."
