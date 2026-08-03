# Mocks to replace

V1 stores all workspace data in an in-memory mock DB. Nothing is persisted across a full page reload or process restart. This file lists every mock surface and what should replace it when wiring a real backend (Encore/`app/server` or another API).

## Source of truth today

| Piece | Path | Role |
|-------|------|------|
| Mock DB + seed | [`chulane/src/lib/mock/db.ts`](chulane/src/lib/mock/db.ts) | In-memory `Map`s for projects, pages, tags; seed data |
| System project IDs | `SYSTEM_PROJECT_IDS` in the same file | Inbox, Journal, Templates, Archive, Trash |

Domain services call `getMockDb()` directly. TanStack Query hooks in `chulane` call those services. The Next app never talks to HTTP for CRUD.

## Services to replace

Keep the **public method shapes** (and domain types) stable so hooks/UI stay unchanged. Swap the implementation from mock Maps to HTTP (or repository) clients.

| Service | Path | Methods | Replace with |
|---------|------|---------|--------------|
| `projectService` | [`chulane/src/domain/project/service.ts`](chulane/src/domain/project/service.ts) | `list`, `get`, `create`, `update`, `delete` | Project API (nested `parentProjectId`, description, status) |
| `pageService` | [`chulane/src/domain/page/service.ts`](chulane/src/domain/page/service.ts) | `list`, `get`, `create`, `update`, `delete`, `search` | Page API (`tagIds`, `kind`, hierarchy, content) |
| `tagService` | [`chulane/src/domain/tag/service.ts`](chulane/src/domain/tag/service.ts) | `listForProject`, `get`, `create`, `update`, `delete` | Tag vocabulary API; inherit ancestor tags server-side or in client from project tree |
| `journalService` | [`chulane/src/domain/journal/service.ts`](chulane/src/domain/journal/service.ts) | `listDays`, `getDay`, `getOrCreateDay` | Thin facade over pages with `kind: "journal"` + `properties.day` — prefer reusing page API |

## What is *not* a data mock

These are client UI state (Zustand + `localStorage`). Do **not** move them to the backend unless you intentionally sync workspace UI across devices:

- Pinned pages / pinned projects / recent pages — [`web/src/domain/workspace/store/ui-store.ts`](web/src/domain/workspace/store/ui-store.ts)
- Open tabs — [`web/src/domain/workspace/store/tabs-store.ts`](web/src/domain/workspace/store/tabs-store.ts)
- Sidebar widths, journal/project list↔linked view modes — same `ui-store`

## Env / HTTP scaffolding (already present, unused for CRUD)

Runtime API URLs are injected for a future client; mocks ignore them:

| Variable | Purpose |
|----------|---------|
| `PUBLIC_API_BASE_URL` | Browser → API origin ([`web/src/lib/runtime-config.ts`](web/src/lib/runtime-config.ts)) |
| `SERVER_API_BASE_URL` | Next BFF → API ([`web/src/lib/env.ts`](web/src/lib/env.ts)) |

Suggested replacement pattern (aligned with frontend-architecture skill):

1. Add axios (or fetch) client using `getPublicApiBaseUrl()`.
2. Implement `projectService` / `pageService` / `tagService` against `API_ROUTES.*`.
3. Keep hooks calling the same service objects (swap module internals or inject via a thin interface).
4. Point `pnpm server` / Encore at the same routes; drop or gate the mock DB behind a flag if needed for offline demos.

## Seed data that should become real fixtures or migrations

Defined in `seed()` inside [`db.ts`](chulane/src/lib/mock/db.ts):

- System containers: Inbox, Journal, Templates, Archive, Trash
- User projects: Research, Personal, Rivto (+ nested **Docs**)
- Sample pages, journal days, and tag vocabulary (`#editor`, `#architecture`, `#guide`, …)

When replacing mocks, either migrate this seed into SQL/fixtures or remove it and start empty with only system containers created on workspace bootstrap.

## Checklist

```
- [ ] Replace getMockDb() usage in project/page/tag/journal services with API client
- [ ] Persist pages (content, tagIds, parentPageId, kind)
- [ ] Persist projects (parentProjectId, description)
- [ ] Persist tags (project-owned; enforce edit-only-on-owner)
- [ ] Journal days via page kind + day property (or dedicated endpoint)
- [ ] Wire PUBLIC_API_BASE_URL / SERVER_API_BASE_URL clients
- [ ] CORS / auth as needed (auth still out of scope for current app shell)
- [ ] Remove or feature-flag mock seed for production builds
```
