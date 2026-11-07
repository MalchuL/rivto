# Chulane completed stages

Append each completed stage with its date, result, and validation. Development
proceeds step by step, with user approval before starting the next stage.

## 1. Preserve the previous application — 2026-10-02

- Renamed `app/chulane` to `app/chulane_old`.
- Verified all 28 files and symlinks were preserved unchanged.
- The archived package remains outside active workspace resolution.

## 2. Initialize the replacement package — 2026-10-02

- Created the new `app/chulane` package with identity `@chulane/app`.
- Copied the existing glossary into [CONTEXT.md](./CONTEXT.md).
- Verified workspace resolution, glossary preservation, and the initial
  TypeScript package's type check, lint, and build.

## 3. Initialize Next.js and Electron — 2026-10-02

- Generated the Next.js starter through `create-next-app`, using TypeScript,
  App Router, Tailwind CSS, ESLint, and the `src/` directory.
- Added an Electron launcher in the same application folder. Both hosts show
  the same initial Chulane screen.
- Electron starts its own Next.js server on an available loopback port and
  stops that server when quitting.
- Separated development output directories so web and desktop can run together.
- Added root commands: `pnpm app` for web and `pnpm app:desktop` for Electron.
- Configured this workstation's Electron sandbox helper using the existing
  system Chrome helper; details are in [README.md](./README.md).

Validation passed: type checks, lint, production build, and three Playwright
smoke tests covering browser startup, Electron development and production
startup, desktop reload, and local-server shutdown.

Checkpoint after stage 3: a runnable application starter. Desktop installers and
application features belong to subsequent approved stages.

## 4. Initialize the UI foundation — 2026-10-03

- Confirmed `src/components` for application components and
  `src/components/ui` for shadcn primitives.
- The official shadcn CLI verified the existing Tailwind v4 setup and import
  alias, initialized the Radix Nova preset, and installed the Button primitive.
- Added `components.json` with aliases matching `@/*` → `src/*` and the shared
  `src/app/globals.css` entry.
- Replaced placeholder element styles with semantic theme tokens and Tailwind
  layout classes. Retained system fonts for builds without font downloads.
- Adapted generated TypeScript to the repository's JSDoc and class constants.
- Added a styled starter with page creation disabled until application services
  exist, and extended the three smoke tests to check resolved styles.
- Kept dependency changes in the active root workspace lockfile; documented
  the root command for adding future shadcn components.

Validation: the new browser check failed before implementation, then passed.
Type checks, lint, and production build passed. All three smoke tests passed,
covering browser styles, Electron development/production styles, desktop reload,
and local-server shutdown. Electron checks used the existing display (`DISPLAY=:1`)
because the agent shell did not inherit it. Production screenshot inspected.

Checkpoint after stage 4: a runnable application with its shared UI foundation.
The next stage establishes Cordis composition and lifecycle with focused tests.

## 5. Initialize the application runtime — 2026-10-04

- Added `@deepseek-ai/cordis` directly and a small composition boundary in
  `src/runtime/application.ts`. One application fiber owns bundled plugins;
  hosts await startup and disposal, and startup failures roll back resources.
- Added `test:unit` using Node's built-in test runner with recursive discovery
  of colocated TypeScript tests. No additional test framework is required, and
  an empty suite fails. `test:smoke` runs the build and Playwright; `test` runs both.
- Runtime tests exercise asynchronous setup, dependency injection, service and
  listener cleanup, awaited effects, repeated disposal, and failed-startup rollback.
- Unified browser and Electron startup through `src/runtime/server.ts`, retaining
  Next.js App Router. The host starts Cordis before opening its loopback listener.
- Changed Electron quit to request and await runtime cleanup. Development HMR
  connections are closed during teardown, and quitting during startup cannot
  reopen a window or turn canceled navigation into an application failure.
- Updated ADR 0001 to record Next.js as the UI host and Cordis as the composition
  owner, and to remove its obsolete first-release synchronization deferral.
- Corrected the Electron launcher and runtime composition to strict TypeScript
  ES modules, including the unit-test runner. `build:runtime` emits ignored
  `dist/` output; development commands compile before launch, and the production
  build compiles both the hosts and Next.js. No compilation dependency was added.
- Added explicit TypeScript and ES module requirements to `AGENTS.md`, disabled
  JavaScript source inclusion, and removed the CommonJS lint exception.

Validation passed: composition tests failed before implementation, then passed;
web lifecycle and desktop startup-cancellation checks also demonstrated their
expected failures before the corresponding fixes. Final validation passed two
unit tests, five Playwright smoke tests, type checks, lint, and production build.
Electron checks used `DISPLAY=:1` on this workstation.
For the TypeScript correction, the compiled-host regression failed before the
compiler pipeline existed, then passed. Both unit tests, all five smoke tests,
strict type checks, lint, and the production build passed again.

Checkpoint after stage 5: both hosts own a tested Cordis lifecycle. Application domain
services and third-party plugin installation are subsequent stages. Next:
local users, workspace ownership, and SQLite-backed application services.

## 6. Local identity, workspace ownership, and password login — 2026-10-09

- Confirmed automatic private personal workspaces, owner/editor/viewer rules,
  multiple shared-workspace owners, and protection of the last owner.
- Added storage-independent identity/workspace contracts and pure access rules.
  Drizzle with a local libSQL/SQLite adapter persists profiles, workspaces, and
  membership; permission checks and mutations share a transaction.
- Used Better Auth's CLI to initialize password authentication and generate its
  SQLite schema, then Drizzle Kit to generate migrations. Drizzle Kit has no
  configuration initializer. Used shadcn CLI for input, label, and native select.
- Added local email/password registration, login, logout, persisted sessions,
  and a device-local signing secret. Email is an unverified local identifier;
  no mail delivery or remote account is required. Passwordless mode was excluded
  by the user's final choice.
- Cordis owns persistence and authentication. The shared Node host exposes
  authenticated operations to Next.js without database access in UI components.
  Request actors come from verified sessions; mutation origins and input are
  validated, and the host controls rate-limit client addresses.
- Added forms for creating/renaming workspaces and assigning/removing members.
  Personal membership is immutable; shared settings are owner-only. Both browser
  and Electron use the same interface and application operations.
- Verified atomic rollback of partial profile/workspace creation and recovery
  when authentication commits before application provisioning fails. Repeated
  provisioning creates no duplicate personal workspace.
- Corrected the document-storage plan: `DocumentStore` selects either database
  or ordinary filesystem persistence for a document. It is not implemented in
  this stage; Markdown interpretation remains a next-stage decision.

Validation: domain, persistence, authentication, and API tests demonstrated
expected failures before their implementations; the browser workflow initially
failed because registration controls did not exist. Final validation passed all
12 unit/integration tests, all 7 Playwright scenarios, strict type checks, lint,
Drizzle migration checks, production build, and `git diff --check`. Desktop
checks used `DISPLAY=:1` and exercised registration/login in both development
and production. Inspected the authenticated workspace screenshot.

Current checkpoint: local users can sign in and manage durable workspaces with
enforced roles. Next: Rivto hosting, document persistence, and page operations.
Password reset by email, remote synchronization, and desktop installers remain
outside this stage.

Profile ownership clarification — 2026-10-09: the existing Chulane user owns its
name independently of Better Auth. Authentication supplies an initial name only
when creating the application profile. A regression first failed because an
empty auth name blocked returning an existing user; validation now runs only
for new profiles. Integration checks verify that auth renaming does not change
the application API's user or directory, including after restart and login.
All 12 unit/integration tests, type checks, lint, and diff checks passed. Browser
and Electron suites were not rerun for this service-only correction.


Class-based implementation refactor — 2026-10-09: split SQLite persistence into
`SqliteLocalServices`, `SqliteIdentityService`, and `SqliteWorkspaceService`.
The connection owner now exposes an async `open()` factory and explicit cleanup;
transactional authorization and profile ownership behavior are unchanged.
`LocalApi`, `LocalServicesPlugin`, `LocalServer`, and `DesktopApplication` own
HTTP dispatch, composition, and host lifecycle state. Callback entry points
retain their instance binding, including Cordis cleanup and shutdown hooks.
Updated all callers and existing tests. Pure domain checks, React components,
Better Auth configuration, and generated Drizzle schemas remain idiomatic.
Validation passed 12 unit/integration tests, all 7 browser/Electron scenarios,
strict application/runtime type checks, affected-source lint, production build,
and diff checks. No schema changes or data migrations were needed.


Interface review and workspace lifecycle — 2026-10-26: reviewed current contracts
in `dev_notes/chulane-interface-review.md`. Replaced workspace `rename` with a
whitelisted, typed `update` returning the persisted entity; added owner-only
recoverable deletion, owner-filtered deleted listings, and restoration with
preserved membership. Personal workspaces cannot be deleted separately. Added
explicit updates to the acting user's Chulane profile. HTTP derives the actor
from the session; UI provides profile editing, deletion confirmation and restore.
Per user instruction the initial SQLite schema is regenerated without an upgrade
path for old development data. Account deletion and new metadata fields are out
of scope.

Validation: all 21 unit/integration tests and all 10 browser/Electron scenarios
passed, including canceled/rejected deletion, explicit retry, reload, restore,
and subsequent password login. Type checks, lint, production build, Drizzle check,
and diff checks passed. Electron tests used `DISPLAY=:1`.


Unified workspaces and user-scoped services — 2026-10-27: removed the separate
personal workspace model. The initial workspace now follows the same membership,
sharing, deletion, and restoration rules as every other workspace. Workspace and
identity services bind the verified user at construction for each request; Cordis
no longer publishes globally scoped instances. A dedicated provisioning coordinator
creates a profile and its initial workspace atomically, using the workspace adapter
for workspace insertion. Public access was deferred at the user's request; all
workspace access requires membership. The initial development schema was regenerated
without an upgrade path for earlier data.

Validation: 34 unit/integration tests and 11 browser/Electron scenarios passed,
including initial-workspace sharing, request identity isolation, concurrent writes,
rollback and restart. Type checks, lint, production build, Drizzle check, and diff
checks passed. Browser/Electron and network tests used loopback access outside the
sandbox; Electron tests used `DISPLAY=:1`.


Workspace onboarding — 2026-10-28: profile provisioning no longer creates a
workspace. Users create workspaces explicitly from the workspace screen.
