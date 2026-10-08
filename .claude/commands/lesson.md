---
description: Record one line every future build of every repo should know.
argument-hint: [the lesson, e.g. "vercel env pull returns sensitive secrets as empty strings"]
allowed-tools: Bash
---

# Record a lesson

**$ARGUMENTS**

This goes in the CTO's shared build log — the one thing that crosses repos.
Every build prompt, every plan and every plan gate reads the newest 40 of
these first, in **every** repo. That is the point: a mistake made here should
not be made again in the mobile app.

## What makes a good one

- Concrete. A gotcha, a convention that bit you, a thing that worked.
- One line. If it needs a paragraph it is a note (`NOTES.md`), not a lesson.
- No platitudes. "Write tests" teaches nobody anything.

## Do this

1. If `$ARGUMENTS` is empty, ask Steven what the lesson is and stop.
2. Work out which repo this is, as `owner/name`:

   ```bash
   git remote get-url origin 2>/dev/null
   ```

   Turn that into `owner/name`. If there is no remote, or the lesson is not
   about this repo in particular, use the literal word `global`.

3. Append **exactly one line** — three tab-separated fields, no header, no
   quotes:

   ```bash
   mkdir -p ~/.anddone-cto && printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "<owner/name or global>" "<the lesson on one line>" >> ~/.anddone-cto/lessons-inbox.tsv
   ```

   Collapse the lesson onto one line first — a newline inside it would split
   it into two lessons, and the second one would be nonsense.

4. Confirm in one sentence: what was recorded, and that the daemon picks it up
   within a few seconds and it will be in the next build's prompt.

## If it does not work

The inbox is a plain file the CTO daemon drains on its poll cycle. If the
daemon is not running on this Mac the line simply waits in the file — say so
rather than retrying. In a cloud session there is no `~/.anddone-cto` and no
daemon: tell Steven to add it at https://cto.anddone.ai/lessons instead.
