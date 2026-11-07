# Chulane TODO

Start each stage after user approval. Record completed stages and validation in
[PROGRESS.md](./PROGRESS.md).

## Completed: initialize the UI foundation

- [x] Choose and confirm the folder for application components before running
  the shadcn/ui CLI. Keep them inside `app/chulane`; configure `components.json`
  aliases and TypeScript paths to match the chosen location.
- [x] Initialize or verify Tailwind CSS through the CLI before installing
  shadcn/ui. Tailwind v4, its PostCSS plugin, and the stylesheet import are
  already present from `create-next-app`; complete any missing setup via CLI.
- [x] Initialize shadcn/ui through its CLI using the existing Tailwind setup
  and the confirmed component folder. Tailwind must be configured first.
- [x] Verify styles in both web and Electron, then run type checks, lint,
  production build, and the application smoke tests.

## Completed: initialize the application runtime

- [x] Establish a focused test command for application runtime and domain tests.
- [x] Write and run a failing composition/lifecycle test before implementation.
- [x] Initialize `@deepseek-ai/cordis` composition with application-owned lifecycle
  boundaries and verify setup and disposal through that test.
- [x] Run type checks, lint, build, and affected application tests; record results
  in `PROGRESS.md`.

## Completed: local identity and workspace persistence

- [x] Define local user and workspace ownership behavior through failing domain
  tests, including owner/editor/viewer access rules. The initial personal/shared
  distinction was replaced by the unified workspace model on 2026-10-27.
- [x] Implement storage-independent user/workspace service contracts and initial
  Drizzle/SQLite adapters with real temporary-database tests for transactions and
  restart recovery. Expose domain operations, not a generic database API; follow
  [ADR 0001](../../docs/adr/0001-chulane-local-first-service-boundaries.md).
- [x] Compose the services through Cordis and expose application use cases to
  the shared Next.js UI without direct database access from components.
- [x] Add Better Auth email/password login and session-derived authorization,
  using CLI-generated schemas and UI primitives.
- [x] Run affected tests and application checks; record the completed stage.

## Next stage: Rivto hosting and document persistence

Implement Rivto hosting with durable CRDT persistence, followed by projects/pages,
journals, references, and user-owned tag definitions.
Before implementing document persistence, settle Markdown's role (canonical
content or mirror/export), metadata/content placement, and any external-edit
reconciliation. `PageService` uses `DocumentStore` with a selected database or
ordinary-filesystem implementation; a document is stored in one or the other.
Define durability guarantees with the selected metadata/content layout.
