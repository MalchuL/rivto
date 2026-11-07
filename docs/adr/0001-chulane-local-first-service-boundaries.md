# Chulane starts locally behind replaceable service contracts

Chulane owns local data behind replaceable service contracts. Domain use cases
depend on those contracts rather than storage or transport implementations.
The first release includes working remote synchronization, offline recovery,
and a runnable self-hosted backend; contracts alone do not satisfy that scope.
Local-only use remains available without a remote account.

Storage boundary clarification accepted on 2026-10-09: UI and AI tools invoke
domain-oriented application services, such as `WorkspaceService` and
`PageService`, which enforce validation and access rules. Their contracts expose
application operations, not SQL queries, file paths, or a generic `Database`
transaction API. Persistence may use a database, filesystem, or both.

`PageService` owns page operations and access checks, and delegates durable
content loading and saving to `DocumentStore`. A document store uses one of two
alternative implementations: database storage or ordinary filesystem files.
The same document is not simultaneously persisted to both implementations.
The service contract hides the selected implementation from its callers; the
previous proposal for a mandatory shared `FileStorage` is superseded.

Introduce document contracts and adapters during the page/document stage, not
as speculative scaffolding for identity and workspaces. Define durability and
failure guarantees with the chosen metadata/content layout.

The identity/workspace stage uses Drizzle/SQLite repositories behind
storage-independent repository and service contracts. Services own authorization
and business rules; an atomic storage context binds identity and workspace
repositories to the same transaction. Better Auth owns authentication behind an
application service interface and receives its SQLite adapter at composition. Before document persistence, decide whether Markdown files
are canonical content or readable mirrors/exports, and how a hybrid layout
stores metadata and content. External-edit reconciliation, stable IDs, conflicts,
and representation of canvas and structured blocks must be resolved if Markdown
is canonical. This decision does not remove the requirement for durable CRDT
state and updates or authorize a lossy Markdown round trip.

Next.js App Router supplies the shared browser and Electron UI. A Node host owns
one application fiber using `@deepseek-ai/cordis` for plugin composition,
dependencies, services, events, and cleanup. It awaits startup before admitting
requests and disposes plugins before exiting. Domain rules remain independent
of Next.js, Electron, Cordis, and concrete storage or transport adapters.

The local-services Cordis plugin owns SQLite, provisioning, and Better Auth.
The shared host dispatches `/api/auth/*` and `/api/local` before Next.js.
Authenticated requests construct domain services bound to the verified user. The plugin does
not publish unscoped identity or workspace service instances in Cordis. Better Auth's CLI initializes its configuration and
schema; Drizzle Kit generates migrations; shadcn's CLI initializes UI primitives.
Use initialization/generation CLIs where available and resolve ambiguous product
behavior with the user before implementing it.

Application sources, including Node hosts, Electron entry points, and owned
scripts, use strict TypeScript and ES modules. Host entry points compile with
TypeScript into ignored `dist/` output before execution.
