---
description: Hand a background build to the CTO worker and keep working
argument-hint: [what to build]
allowed-tools: Bash
---

# Hand it to the worker

**$ARGUMENTS**

This does not build anything here. It writes one line to the CTO daemon's
inbox; the worker picks it up within about ten seconds and does the whole
thing on **its own copy** of the repo — plan, Codex plan review, build in an
isolated worktree, the project's checks, land on `staging`. Nothing in this
session's checkout is touched, no branch is switched, and Steven carries on
typing while it runs.

## Do this

1. If `$ARGUMENTS` is empty, ask Steven what to build and stop.

2. Read the task type off the front of the text. `fix: <task>` → `fix`,
   `docs: <task>` → `docs`; `refactor:` and `chore:` work the same way.
   Anything else — including no prefix at all — is `build`. Strip the prefix
   from the task text; the rest of it is the request.

3. Work out which repo this is, as `owner/name`:

   ```bash
   git remote get-url origin 2>/dev/null
   ```

   Normalize it: drop a trailing `.git`, and take the last two path segments,
   so `git@github.com:sklores/demo.git` and
   `https://github.com/sklores/demo.git` both become `sklores/demo`. If there
   is no remote, say so and stop — the worker files jobs by repo.

4. Append **exactly one line** — four tab-separated fields, no header, no
   quotes:

   ```bash
   mkdir -p ~/.anddone-cto && printf '%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "<owner/name>" "<build|fix|refactor|docs|chore>" "<the task on one line>" >> ~/.anddone-cto/jobs-inbox.tsv
   ```

   Collapse the task onto one line first — every tab and newline inside it
   becomes a single space, or the line splits into fields that mean nothing.

5. Then say **exactly** this, with the task and the repo filled in:

   Handed to the worker: “<task>” for <owner/name>. It shows up on cto.anddone.ai/projects (the repo's Now and Work cards) within ~10 seconds — the worker plans it, Codex reviews the plan, it builds in an isolated copy, runs the checks, and lands on staging. Say “ship it” when you want it live.

## If it does not work

- **Mac only.** The daemon runs on Steven's Mac. In a cloud session there is
  no `~/.anddone-cto` and nothing drains the file — say so and offer to queue
  the job on https://cto.anddone.ai instead.
- The inbox is a plain file. If the daemon is not running the line simply
  waits in it; say that rather than retrying.
- A repo the CTO does not manage is refused, not built: the daemon writes the
  reason to `~/.anddone-cto/jobs-inbox.errors.log`. If a handed-off job never
  appears on the site, read that file.
