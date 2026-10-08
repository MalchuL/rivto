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

Separate page operations from durable document content (`DocumentStore`) and
attachment bytes and metadata (`AttachmentStore`). Introduce these contracts
when their features are implemented. Each operation defines its durability and
failure guarantees; a hybrid adapter coordinates recovery internally rather
than assuming a transaction spans SQLite and files.

The next identity/workspace stage uses Drizzle/SQLite behind storage-independent
service contracts. Before document persistence, decide whether Markdown files
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

Application sources, including Node hosts, Electron entry points, and owned
scripts, use strict TypeScript and ES modules. Host entry points compile with
TypeScript into ignored `dist/` output before execution.
