# The workflow

Follow this every session. It is how this repo ships.

## Branches

- Work happens on `staging`. Check it out before you change anything:
  `git fetch origin && git checkout staging || git checkout -b staging origin/main`
- Never commit to `main`.
- `main` moves ONLY when Steven says "ship it". Shipping is a fast-forward:
  `git push origin origin/staging:main`
- "Roll it back" = `git revert <sha>` on `staging`, push staging, then ship.
- Background jobs (the CTO worker) land on `staging` too. Expect commits you
  did not write. Fetch before you assume you know the tip.

## The files

- `STATE.md` is the shared memory. Keep it current AS YOU WORK — move items
  between "In progress", "Staged (not shipped)", "Shipped", "Blocked". A
  session that ends without updating it has thrown its context away.
- `PLAN.md`, when it exists, is the map: gates as `## ` headings, steps as
  `- [ ]` checkboxes. When Steven approves a plan in conversation, write it
  there. Tick a step the moment it is done, not at the end.
- Under the gate you are working on, keep a `Stage:` line saying which of the
  eight stages the work is in: DESIGN, PLAN, BUILD, REVIEW, TEST or SECURE.
  Move it as the work moves — that line is what lights the gold ring on
  cto.anddone.ai, so a stale line is a lie on his screen. (MONITOR and REPAIR
  are measured, never written here.)
- `NOTES.md` is Steven's. Read it. Never rewrite it.
- `.claude/rules/cto.md` holds Steven's rules. Obey them. Append only when he
  asks you to add one.
- `DESIGN.md` + `design/board/` are Steven's references — look before you
  design anything visual.

## Lessons

When something bites you or you learn a convention, record it: `/lesson <one
line>`. Builds read these first.

## Background builds

`/build <task>` hands a build to the CTO worker in the background;
`/second-opinion <q>` asks Codex; `/lesson <line>` records a lesson.

## Before you report status

Run this and say what it shows:

```
git log --oneline origin/main..origin/staging
```

That is what is staged and not shipped. "Done" means shipped, not merged.

## Two hard stops

Stop and ask Steven in person. Do not work around these.

1. Spending money or creating infrastructure — a new Vercel project, a new
   Supabase project, a paid plan, a domain, anything with a bill.
2. Destructive database changes — `drop table`, `drop column`, `truncate`,
   `delete from` in a migration, or editing a migration that already ran.
   Applied migrations are immutable; write a new numbered one.
