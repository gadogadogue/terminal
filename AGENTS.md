<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes

- No database by design. All user state is a `Workspace` (`src/lib/workspace`) that is cached in localStorage and exported/imported as the watchlist JSON file. Keep the file format backward compatible; bump `FILE_VERSION` only with a migration in `parseWatchlistFile`.
- Market data goes through `DataProvider` (`src/lib/providers`). UI code never calls a provider directly; it uses `/api/history` and `/api/search`, which cache with `use cache` + `cacheLife`.
- Analytics in `src/lib/analytics` are pure functions with unit tests (`npm test`). Add tests when changing them.
- UI follows `DESIGN.md`: monochrome shadcn chrome, Geist only, color only inside data. Chart series colors come from `src/lib/chart-palette.ts` (validated order, max 8; never reorder or extend).
- IDX shareholder lists are PDFs the user saves in `data/ksei/` (kept in git; only their parsed copies in `.cache/` are ignored); `src/lib/providers/register.ts` reads them and `/api/shareholders` merges them into the provider's ownership. idx.co.id turns servers away, so they are never fetched. In that file pdf.js is imported by Node, outside the bundle, and every file path is marked `turbopackIgnore`: bundling either makes `next dev` reload every page without end.
- Windows dev machine: keep shell commands POSIX-compatible for Git Bash.
