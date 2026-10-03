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

Current checkpoint: a runnable application with its shared UI foundation.
The next stage establishes Cordis composition and lifecycle with focused tests.
