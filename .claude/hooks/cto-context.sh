#!/bin/sh
# CTO context — SessionStart hook (Gate 1).
#
# Prints the repo's memory into a fresh session: what state the work is in,
# Steven's notes, Steven's rules, and what is sitting on staging unshipped.
# Read from origin/staging (the branch work lands on) so a compacted or
# brand-new session sees what the last one and the worker left behind.
#
# NEVER FAILS A SESSION. Every path exits 0; the worst case is one line
# saying the context is unavailable. Runs on macOS sh and Linux sh.
set -u

MAX=9000

fail() {
  printf 'CTO context unavailable: %s\n' "$1"
  exit 0
}

if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "${CLAUDE_PROJECT_DIR}" ]; then
  cd "${CLAUDE_PROJECT_DIR}" 2>/dev/null || fail "cannot enter ${CLAUDE_PROJECT_DIR}"
fi

out=$(mktemp 2>/dev/null) || fail "no writable temp file"
trap 'rm -f "$out"' EXIT INT TERM

have_git=no
if git rev-parse --git-dir >/dev/null 2>&1; then
  have_git=yes
fi

# A 10s ceiling on the network, without `timeout` (absent on stock macOS):
# fetch in the background, poll, kill it if it overstays. Errors are ignored
# on purpose — offline is a normal way to start a session.
if [ "$have_git" = yes ]; then
  git fetch -q origin staging main >/dev/null 2>&1 &
  fpid=$!
  n=0
  while [ "$n" -lt 50 ]; do
    kill -0 "$fpid" 2>/dev/null || break
    sleep 0.2
    n=$((n + 1))
  done
  if kill -0 "$fpid" 2>/dev/null; then
    kill -9 "$fpid" >/dev/null 2>&1
  fi
  wait "$fpid" >/dev/null 2>&1 || true
fi

has_ref() {
  git rev-parse --verify -q "$1" >/dev/null 2>&1
}

ref=""
if [ "$have_git" = yes ]; then
  if has_ref origin/staging; then
    ref=origin/staging
  elif has_ref origin/main; then
    ref=origin/main
  fi
fi

# show <path> — from $ref when there is one, otherwise the working tree
# (a repo with no origin yet, or no git at all, still gets its files).
show() {
  if [ -n "$ref" ]; then
    git show "$ref:$1" 2>/dev/null
  elif [ -f "$1" ]; then
    cat "$1" 2>/dev/null
  fi
}

# section <heading> <path> — silent when the file is not there.
section() {
  body=$(show "$2")
  [ -n "$body" ] || return 0
  printf '## %s\n%s\n\n' "$1" "$body" >>"$out"
}

printf '# CTO context (from %s, %s)\n\n' "${ref:-working tree}" "$(date '+%Y-%m-%d %H:%M')" >>"$out"
section "STATE.md — where the work is" "STATE.md"
section "NOTES.md — Steven's notes (read, never rewrite)" "NOTES.md"
section "Steven's rules — .claude/rules/cto.md" ".claude/rules/cto.md"

# THE MAP, ONE LINE OF IT (Gate 2). PLAN.md can be long; a session only needs
# to know which step is next and which gate it belongs to. The first
# unchecked "- [ ]" and the "## " heading above it — nothing else.
plan=$(show "PLAN.md")
if [ -n "$plan" ]; then
  here=$(printf '%s\n' "$plan" | awk '
    /^##[ \t]/ { heading = $0; next }
    !found && /^[ \t]*[-*][ \t]+\[[ ]\]/ {
      if (heading != "") print heading
      print $0
      found = 1
    }
  ')
  if [ -n "$here" ]; then
    printf '## Plan — you are here\n%s\n\n' "$here" >>"$out"
  fi
fi

# THE DESIGN BOARD (Gate 5). One line, not the file: DESIGN.md can be long and
# the session only needs to know it exists before it designs anything. The
# count comes from the marker the daemon writes, so nothing here parses
# markdown.
design=$(show "DESIGN.md")
if [ -n "$design" ]; then
  n=$(printf '%s\n' "$design" | sed -n 's/^<!-- board-items: \([0-9][0-9]*\) -->$/\1/p' | head -1)
  [ -n "$n" ] || n="some"
  printf '## Design board: %s items (see DESIGN.md)\nImages under design/board/ are the references — Read them before designing UI.\n\n' "$n" >>"$out"
fi

if [ "$have_git" = yes ] && has_ref origin/staging && has_ref origin/main; then
  staged=$(git log --oneline origin/main..origin/staging 2>/dev/null | head -15)
  if [ -n "$staged" ]; then
    printf '## Staged, not shipped (git)\n%s\n\n' "$staged" >>"$out"
  fi
fi

# THE SHARED BUILD LOG (Gate 5). The daemon mirrors every lesson, from every
# repo, to ~/.anddone-cto/LESSONS.md once a minute; this prints the newest of
# them into the session. MAC ONLY, silently: a cloud session has no daemon and
# no such file, and says nothing rather than explaining its absence.
#
# LAST, AND CLIPPED. Everything above is about THIS repo; the 9,000-char cap
# below must eat cross-repo context before it eats the repo's own.
if [ -n "${HOME:-}" ] && [ -f "$HOME/.anddone-cto/LESSONS.md" ]; then
  lessons=$(head -25 "$HOME/.anddone-cto/LESSONS.md" 2>/dev/null | cut -c1-200)
  if [ -n "$lessons" ]; then
    printf '## Lessons (all repos)\n%s\n\n' "$lessons" >>"$out"
  fi
fi

size=$(wc -c <"$out" 2>/dev/null | tr -d ' ')
if [ -n "$size" ] && [ "$size" -gt "$MAX" ]; then
  head -c "$MAX" "$out"
  printf '\n[truncated]\n'
else
  cat "$out"
fi
exit 0
