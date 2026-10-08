# Steven's rules

Steven adds rules here from cto.anddone.ai — the CTO daemon appends them to the bottom. Obey every line.

- Commits pushed to a Vercel-linked repo must use the author email `225766321+sklores@users.noreply.github.com`. Any other author and Vercel blocks the deploy.
- A new Vercel project imported from an empty repo gets `framework=null` and every route 404s. Add `vercel.json` with the framework named, up front.
- Never delete production rows by pattern. Capture the exact ids when you create the rows, and delete by id only.
- Solo dev building internal tools: the least machinery that works. A file beats a table, a command beats a service, a conversation beats a gate.
- The BCM apps — Dashboard, Mobile, Plans & Permits, Portal — share ONE Supabase project, and BCM Dashboard owns the migrations. Do not add migrations from the other three.
