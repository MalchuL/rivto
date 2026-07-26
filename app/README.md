# Rivto App (Stage 1)

Self-contained nested workspace for the Rivto product shell:

- `web/` — Next.js App Router UI
- `desktop/` — Electron window around the web UI
- `server/` — Encore.ts page API + SQL
- `shared/` — DDD domain/application layers, TipTap editor adapter, UI chrome

This folder is independent of the Rivto library workspace at the repo root. Install and run from here only.

## Prerequisites

- Node.js 20+
- pnpm 11+
- [Encore CLI](https://encore.dev/docs/ts/install) for the real SQL-backed API

If the Encore CLI is not installed, `pnpm server` / `pnpm dev` starts an
in-memory HTTP fallback with the same `/page` routes so the UI remains usable
locally. Install Encore for persistence and production.

## Setup

```sh
cd app
pnpm install
```

## Develop

Terminal A / combined:

```sh
pnpm dev
```

This starts Encore (`server`) and Next.js (`web` on http://127.0.0.1:3000).

Desktop (with web already running):

```sh
pnpm desktop
```

## Environment

Copy `web/.env.example` to `web/.env.local` if needed:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
```

Encore local APIs typically listen on port `4000`.

## API client

Stage 1 uses a hand-written typed client in
`shared/src/infrastructure/api/client.ts`.

After installing the Encore CLI:

```sh
pnpm gen:client
```

## Imports

- Domain / API (server-safe): `@chulane/rivto-app-shared`
- React UI / hooks (client): `@chulane/rivto-app-shared/client`

## Editor swap

`shared/client` exposes `DocumentEditor` (TipTap today). Replace the
implementation behind that export with `@chulane/rivto-react` later without
changing sidebar routing or page CRUD.
