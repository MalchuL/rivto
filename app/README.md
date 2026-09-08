# Rivto App (Stage 1)

Product shell for Rivto. It lives in the repository workspace so it can import
the editor packages the same way `demo/` does:

- `web/` — Next.js App Router UI (app shell: left sidebar, tabs, journal, projects, pages, contextual right sidebar)
- `chulane/` — product kit: domain types, in-memory mock services, TanStack Query hooks, Rivto editor adapter
- `desktop/` — Electron window around the web UI
- `server/` — Encore.ts page API + SQL (not used by V1; storage is mocked in-memory)

## Prerequisites

- Node.js 20+
- pnpm 11+

V1 stores everything in in-memory mocks seeded at boot (see
`chulane/src/lib/mock/db.ts`), so no server or database is required. Data
resets on dev-server restart / full page reload.

**What to replace when adding a real API:** see [MOCKS.md](MOCKS.md).

## Run

```sh
pnpm install    # from the repository root
pnpm app        # Next.js on http://127.0.0.1:3000
```

From `app/`, `pnpm web` still starts the Next app. `pnpm server` starts the
Encore (or fallback) page API for later stages, but the web app does not call
it yet.

Desktop (with web already running):

```sh
pnpm desktop
```

## Environment

Copy `web/.env.example` to `web/.env.local` if needed:

```env
PUBLIC_API_BASE_URL=http://127.0.0.1:4000
SERVER_API_BASE_URL=http://127.0.0.1:4000
```

Both are read at **request time** (no `NEXT_PUBLIC_*` inlining), so the same
build can be repointed at a different backend by restarting the container with
new env. They are unused while storage is mocked.

## Architecture

- `chulane/src/domain/<context>/` — `types.ts`, `service.ts` (mock CRUD),
  `hooks.ts` (TanStack Query) per bounded context (`project`, `page`, `journal`)
- `web/src/app/(core)/(workspace)/` — thin route pages composing domain views
- `web/src/components/ui/` — shadcn/ui primitives
- `web/src/components/shared/` — app shell (sidebar, tab bar, palette, context sidebar)
- `web/src/domain/<context>/` — view components and client-state stores (Zustand)

Journal days are ordinary pages with `kind: "journal"` living in the system
`Journal` project; Inbox/Templates/Archive/Trash are system containers in the
same model.

## Imports

- Domain / services (server-safe): `@chulane/app`
- React hooks / editor (client): `@chulane/app/client`

## Editor

`@chulane/app/client` exposes `DocumentEditor`, a Rivto host that follows the
same create / `EditorView` / destroy pattern as `demo/`. Page bodies are
serialized Rivto snapshots (`editor.dump()` JSON) stored on `Page.content`.
