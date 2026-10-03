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

Current checkpoint: a runnable application starter. Desktop installers and
application features belong to subsequent approved stages.
