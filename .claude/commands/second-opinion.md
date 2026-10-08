---
description: Ask Codex (read-only) for troubleshooting advice or a review. Nothing is changed.
argument-hint: [the question, e.g. "why does the staging build 404 on every route?"]
allowed-tools: Bash, Read, Grep, Glob
---

# Second opinion

Steven wants an outside pair of eyes on this: **$ARGUMENTS**

Codex is a **read-only advisor here**. It reviews and it troubleshoots. It
never edits a file, never runs a command in this repo, and never touches git.
You do not apply anything it says unless Steven says so, in this session,
after reading it.

## 1. Gather the minimal context

Only what the question is actually about — a dump costs tokens and buries the
signal:

- the file(s) the question names, or the two or three that obviously carry it
- `git log -5 --oneline`
- the failing output, if there is any: the test run, the build log, the stack
  trace, the SQL error — the last ~100 lines, not the whole thing

## 2. Ask Codex

Run it via Bash. In **this** repo (anddone-cto) prefer the vendored binary:

```bash
./apps/worker/node_modules/.bin/codex exec --sandbox read-only --skip-git-repo-check --model gpt-5.6-sol "<the question + the context>" < /dev/null
```

Everywhere else, or when that path does not exist:

```bash
npx -y @openai/codex exec --sandbox read-only --skip-git-repo-check --model gpt-5.6-sol "<the question + the context>" < /dev/null
```

Notes that matter:

- `npx -y @openai/codex` — the **full package name**. A bare `npx codex`
  resolves a different package entirely.
- `< /dev/null` is not optional either: with stdin open, `codex exec` waits
  on an interactive prompt forever at 0% CPU (proven live, twice).
- `--sandbox read-only` is not optional. It is the reason this command is safe
  to run without asking.
- Pass the question and the context as **one prompt argument**. Quote it
  properly; heredoc into a variable if it is long.

## 3. Print the answer

Print what Codex said, verbatim, under this heading:

**Codex (read-only second opinion):**

Then, on its own line, end with exactly:

This is advice; nothing was changed.

## Requirements

- **This needs the Mac.** Codex is authenticated through Steven's ChatGPT
  login (`~/.codex/auth.json`). It does not work in cloud sessions, and it
  does not work on a machine he has not logged in on — if the command fails
  with an auth error, say so plainly rather than retrying or working around it.
- If Codex is unreachable, say that no second opinion was obtained. Do not
  substitute your own review and present it as one.
