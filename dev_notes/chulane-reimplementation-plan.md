# Chulane reimplementation plan

Status: implementation is underway; completed stages are recorded in [PROGRESS.md](../app/chulane/PROGRESS.md). Storage-independent service boundaries were accepted on 2026-10-09; Markdown's role remains open until document persistence. The numbered interview and original accepted decisions are recorded in [chulane-reimplementation.md](./chulane-reimplementation.md).

## Scope and destination

Rename `app/chulane` to `app/chulane_old`, preserving its source and glossary, and create a new `app/chulane`. Exclude the old package from active workspace resolution so it cannot collide with the replacement's package identity. Retain the Rivto editor packages. Reuse or adapt the existing application hosts as needed to run the replacement; do not rewrite the underlying editor.

Build a local-first desktop application with third-party plugin installation from local folders without vetting checks, external-file ingestion, and working remote synchronization in the first release. A browser client against the same local runtime is optional if straightforward. Provide a runnable self-hosted synchronization backend; full hosted web UI and payments remain later work.

## Domain model

- One local database supports multiple users. Personal and shared workspaces unify project ownership; membership roles are owner, editor, and viewer.
- Projects and pages support nesting. Each page retains its identity and content while switching between writing and canvas views through Rivto.
- Each user has a private journal in their personal workspace, outside project hierarchy. Journal pages appear in a vertical daily sequence. A journal day is a date-only value determined from the user's local calendar at creation and does not shift with timezone changes.
- All pages can reference pages and projects. References do not grant access.
- Users can write undefined `#tag` labels. Tag definitions belong to the viewing/invoking user and provide descriptions and parameters, including meaning for agents. Hover shows that user's definition or offers to define the tag.
- Conversations are private, persisted, and owned by users. Each has a workspace/project context; retrieval may span all accessible knowledge according to settings.

The canonical glossary belongs with the new Chulane application, separate from Rivto's editor glossary.

## Code ownership

Use domain-oriented folders under `src/domain/` for identity/access, workspaces, projects, pages, journals, tags, conversations, and retrieval as their behavior requires. Each domain owns its rules, use cases, and replaceable service contracts. Use the smallest modules needed; these are ownership boundaries, not a requirement to manufacture a package or abstraction for every noun.

Keep Drizzle/SQLite persistence, Zvec indexing, Mastra orchestration, Rivto hosting, and future synchronization adapters outside domain rules. UI consumes application service contracts rather than accessing databases directly. Build the UI with shadcn/ui and Tailwind CSS.

Cordis owns application composition, plugin dependencies, lifecycle, and cleanup. Use `@deepseek-ai/cordis` directly, adapting DeepSeek Harness composition/lifecycle patterns rather than importing its agent runtime. Chulane defines its own services and typed events. Preserve applicable license notices for copied source. Support bundled capabilities and third-party plugins installed from local folders with a small composition kernel. Include UI contributions and the complete enable, disable, uninstall, and cleanup lifecycle, without an installation vetting gate. Other distribution sources are deferred.

Expose application service operations as tools. Tool handlers invoke the same use cases as UI operations, including validation, ownership checks, and transactions.

## AI behavior and permissions

Mastra owns AI orchestration. Ask mode reads knowledge; plan mode reads and proposes changes; agent mode executes permitted tools; custom modes choose tool pools. Enforce these limits at execution.

Automatic approval is off by default. Before unapproved execution, show the requested operation and its arguments, then permit one-time approval or remembered permission scoped to agent, tool, and workspace. Remembered permission covers later arguments within that scope. Auto-approval never expands tool availability or user access.

One chat can operate across the project's capabilities. Persist conversation history and pending approvals. Restore them after restart, but do not automatically repeat interrupted mutations. Report actual operation results rather than treating generated text as proof of execution.

Local users configure providers and credentials. Future backend adapters define permitted provider offerings, allowing later paid access. Editing and knowledge management remain usable without an available model provider.

## Persistence, retrieval, and synchronization

Storage-independent application services expose domain operations to UI and AI tools, enforcing validation and access rules without exposing SQL, file operations, or a generic database transaction API. Drizzle with SQLite is the initial record adapter for local users and workspaces; persistence may combine a database and filesystem. Separate page operations (`PageService`), durable document content (`DocumentStore`), and attachment bytes and metadata (`AttachmentStore`) as those features are implemented. Define durability and failure guarantees per operation; hybrid adapters coordinate recovery without assuming one transaction spans SQLite and files. See [ADR 0001](../docs/adr/0001-chulane-local-first-service-boundaries.md).

Before document persistence, decide whether Markdown is canonical content or a readable mirror/export, and where metadata and content live. Canonical Markdown requires decisions about stable IDs, external-edit reconciliation, conflicts, and representation of canvas and structured blocks; do not assume a lossless Markdown round trip. Store durable CRDT state/updates for documents rather than using portable JSON import as the synchronization mechanism. Restore persisted CRDT state before editing. Preserve Rivto's stable entity identities and transaction rules; reuse its existing local-tab synchronization.

Zvec supplies replaceable vector storage/retrieval. Index Chulane page text, textual canvas content, and extracted text from ingested external files. Apply user access checks and configured project/page inclusion and exclusion before returning knowledge to agents. Derive indexes from canonical content and reconcile them after content changes or deletion. Managed file storage is behind a replaceable service: copy source files into it, retain citation identity, and support explicit reimport and conversion to pages when content can be extracted. Filesystem watching is deferred.

Accept every pasted file type as an attachment, retaining filename, type, size, and download access even when rendering or extraction is unsupported. Replaceable extractor plugins provide searchable text for supported types. Files without an extractor remain durably stored and accessible, without preview or content-based RAG until a suitable plugin is installed. Universal format acceptance does not require universal extraction or rendering.

Distinguish local durability from remote synchronization. Implement persisted update exchange, acknowledgments/retry, record revisions, metadata conflicts, and deletion tombstones with a runnable backend in phase one, behind replaceable contracts. Document content merges through CRDT; conflicting application metadata is preserved for explicit resolution. Deletion remains recoverable.

A WebSocket adapter exchanges CRDT updates with backend persistence. Disabling multi-user live sync pauses exchange without granting or revoking access, discarding edits, or creating a fork. Edits merge when synchronization resumes. Local tabs remain synchronized. The first release must implement this transport and verify offline reconnection, not only define its contract.

Provide a self-hosted synchronization server with authentication and explicit linking between local profiles and server identities. Local-only operation needs no remote account. Synchronize knowledge, imported files, conversations, and ownership metadata; keep provider credentials, remembered approvals, and plugin installations device-local. Rebuild vector indexes from synchronized sources rather than transferring index internals.

## TDD and validation

Write and run a failing test before implementing every behavior. Cover the required behavior rather than using line coverage alone as evidence of correctness.

- Domain/use-case tests: ownership and roles, nesting invariants, references, journal dates, user-specific tag definitions, tool modes, approval scopes, and metadata/deletion policies.
- Adapter contract tests: run shared behavior checks against concrete local service implementations, preserving replacement semantics.
- Persistence integration tests: use temporary SQLite and Zvec stores; verify transactions, restart recovery, durable CRDT restoration, indexing updates, and tombstones.
- AI tests: use deterministic model/tool doubles to verify orchestration, permissions, cancellation/failure, and interrupted-operation recovery. Real-model response quality is evaluated separately from deterministic behavior tests.
- Browser/desktop integration tests: verify the critical workflows, page/canvas switching, journal scrolling, tag hover/definition, permission prompts, and multiple local tabs editing one document.
- Plugin installation tests: install, load, disable, remove, and restore third-party plugins using the agreed distribution format, including their lifecycle cleanup.
- Ingestion tests: accept arbitrary file types, preserve attachment metadata and bytes, extract through available plugins, preserve source/citation identity, update retrieval, and retain unsupported or malformed files without losing stored knowledge.
- Remote integration tests: synchronize separate local replicas through the backend, reconnect after offline edits, recover interrupted delivery, enforce workspace access, resolve metadata conflicts, and propagate tombstones.

Run focused tests first, then applicable type checks, lint, affected suites, and builds. Test actual persistence rather than substituting mocks for adapter correctness.

## Implementation sequence

1. Preserve the old source, create the replacement package, and wire workspace/host resolution. Establish the test runner and Cordis lifecycle with a failing composition test.
2. Implement local identity, workspace ownership, and SQLite-backed application services through failing domain and adapter tests.
3. Host Rivto with durable CRDT persistence; implement nested projects/pages, journals, references, and tag definitions with their UI and integration checks.
4. Implement configurable providers, private conversations, Mastra orchestration, tools, modes, and approval persistence.
5. Implement Zvec indexing, configurable retrieval, and external-file ingestion with source citations.
6. Implement third-party installation and its runtime lifecycle using the agreed package format.
7. Implement the remote backend and synchronization adapters, then complete offline recovery and critical desktop/browser/remote workflow checks.

The first release is accepted when these workflows persist across restart, enforce ownership and agent permissions, and pass their tests, including third-party installation, external-file retrieval, and synchronization after offline edits.
