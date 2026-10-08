#!/bin/sh
# CTO guard — PreToolUse hook (Gate 1).
#
# Two hard stops, enforced instead of restated every session:
#   1. main only moves by shipping staging (git push origin origin/staging:main).
#   2. applied migrations are immutable, and destructive SQL is Steven's job.
#
# Everything else is allowed silently. Denials print the hook's deny JSON and
# exit 0 — a nonzero exit here would look like a broken hook, not a policy.
set -u

if ! command -v python3 >/dev/null 2>&1; then
  echo "cto-guard: python3 missing, guard skipped" >&2
  exit 0
fi

# The hook payload arrives on stdin; the python program arrives on stdin too
# (heredoc), so the payload rides across in the environment instead.
CTO_HOOK_INPUT=$(cat)
export CTO_HOOK_INPUT

python3 - <<'PY'
import json
import os
import re
import subprocess
import sys

SHIP = "git push origin origin/staging:main"


def deny(reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


try:
    data = json.loads(os.environ.get("CTO_HOOK_INPUT") or "{}")
except Exception:
    sys.exit(0)
if not isinstance(data, dict):
    sys.exit(0)

tool = data.get("tool_name") or ""
tool_input = data.get("tool_input") or {}
if not isinstance(tool_input, dict):
    tool_input = {}
cwd = data.get("cwd") or os.getcwd()


# ───────────────────────────── shell parsing ─────────────────────────────
def segments(cmd):
    """Split a command line on ; && || | into runnable pieces, respecting
    quotes. Conservative on purpose: anything we cannot parse stays one
    segment and is checked as a whole."""
    out, cur, i, quote = [], [], 0, None
    while i < len(cmd):
        ch = cmd[i]
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in "'\"":
            quote = ch
            cur.append(ch)
            i += 1
            continue
        if ch == "\\" and i + 1 < len(cmd):
            cur.append(ch)
            cur.append(cmd[i + 1])
            i += 2
            continue
        if cmd.startswith("&&", i) or cmd.startswith("||", i):
            out.append("".join(cur))
            cur = []
            i += 2
            continue
        if ch in ";|&\n":
            out.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    out.append("".join(cur))
    return [s.strip() for s in out if s.strip()]


def tokens_of(segment):
    import shlex
    try:
        return shlex.split(segment)
    except ValueError:
        return segment.split()


GIT_GLOBAL_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}


def git_subcommand(tokens):
    """(subcommand, args) for a git invocation, else (None, [])."""
    start = None
    for i, t in enumerate(tokens):
        base = t.rsplit("/", 1)[-1]
        if base == "git":
            start = i + 1
            break
        if base in ("env", "sudo", "nohup", "time", "command", "exec"):
            continue
        if "=" in t and not t.startswith("-"):
            continue  # VAR=value prefix
        break
    if start is None:
        return None, []
    i = start
    while i < len(tokens):
        t = tokens[i]
        if t in GIT_GLOBAL_WITH_VALUE:
            i += 2
            continue
        if t.startswith("-"):
            i += 1
            continue
        return t, tokens[i + 1:]
    return None, []


PUSH_OPTS_WITH_VALUE = {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}
FORCE_FLAGS = {"-f", "--force"}


def strip_ref(name):
    for prefix in ("refs/heads/", "refs/remotes/"):
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


def current_branch():
    try:
        out = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip()
    except Exception:
        return ""


def check_push(args):
    force = False
    delete = False
    positional = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in PUSH_OPTS_WITH_VALUE:
            i += 2
            continue
        if a.startswith("--push-option=") or a.startswith("--repo="):
            i += 1
            continue
        if a in FORCE_FLAGS or a.startswith("--force-with-lease") or a.startswith("--force-if-includes"):
            force = True
            i += 1
            continue
        if a in ("--delete", "-d"):
            delete = True
            i += 1
            continue
        if a.startswith("-"):
            i += 1
            continue
        positional.append(a)
        i += 1

    refspecs = positional[1:] if len(positional) > 1 else []

    if not refspecs:
        # A bare `git push` / `git push <remote>` pushes the current branch.
        if current_branch() == "main":
            deny("You are on main and this pushes it — main only moves by shipping staging: %s." % SHIP)
        return

    for spec in refspecs:
        plus = spec.startswith("+")
        if plus:
            spec = spec[1:]
        if ":" in spec:
            src, dst = spec.split(":", 1)
        else:
            src, dst = spec, spec
        src_n, dst_n = strip_ref(src), strip_ref(dst)
        if dst_n != "main":
            continue
        if delete or src_n == "":
            deny("Deleting main is a hard stop — main only moves forward by shipping staging: %s." % SHIP)
        if force or plus:
            deny("Force-pushing main is a hard stop — main only fast-forwards from staging: %s." % SHIP)
        if src_n in ("staging", "origin/staging"):
            continue  # THE SHIP COMMAND — the one allowed way main moves.
            # `continue`, not `return`: every other refspec in the same push
            # still gets checked (`git push origin origin/staging:main main`).
        deny("main only moves by shipping staging: %s. Work on staging." % SHIP)


def check_branch(args):
    deleting = any(a in ("-D", "-d", "--delete") or (a.startswith("-") and not a.startswith("--") and "D" in a[1:])
                   for a in args)
    if not deleting:
        return
    names = [a for a in args if not a.startswith("-")]
    if any(strip_ref(n) == "main" for n in names):
        deny("Deleting main is a hard stop — leave main alone and work on staging.")


if tool == "Bash":
    command = tool_input.get("command") or ""
    if isinstance(command, str):
        for seg in segments(command):
            sub, args = git_subcommand(tokens_of(seg))
            if sub == "push":
                check_push(args)
            elif sub == "branch":
                check_branch(args)
    sys.exit(0)


# ───────────────────────────── migrations ─────────────────────────────
DESTRUCTIVE = re.compile(r"drop\s+table|drop\s+column|drop\s+schema|truncate|delete\s+from", re.IGNORECASE)


def under_migrations(path):
    norm = str(path).replace("\\", "/")
    return "supabase/migrations/" in norm or norm.startswith("supabase/migrations/")


def new_content(name, ti):
    parts = []
    if name == "Write":
        parts.append(ti.get("content"))
    if name == "Edit":
        parts.append(ti.get("new_string"))
    if name == "MultiEdit":
        for e in ti.get("edits") or []:
            if isinstance(e, dict):
                parts.append(e.get("new_string"))
    return "\n".join(p for p in parts if isinstance(p, str))


if tool in ("Edit", "Write", "MultiEdit"):
    path = tool_input.get("file_path") or ""
    if isinstance(path, str) and path and under_migrations(path):
        absolute = path if os.path.isabs(path) else os.path.join(cwd, path)
        if os.path.exists(absolute):
            deny("Applied migrations are immutable — create a new numbered migration in supabase/migrations/ instead of editing this one.")
        if DESTRUCTIVE.search(new_content(tool, tool_input)):
            deny("Destructive database change — hard stop, Steven does this by hand.")

sys.exit(0)
PY
