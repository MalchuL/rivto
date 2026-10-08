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

Current checkpoint: both hosts own a tested Cordis lifecycle. Application domain
services and third-party plugin installation are subsequent stages. Next:
local users, workspace ownership, and SQLite-backed application services.
