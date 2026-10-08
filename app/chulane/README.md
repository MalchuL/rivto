# Chulane

One Next.js App Router application serves both the browser and Electron.
The web scaffold was generated with `create-next-app` (TypeScript, Tailwind,
ESLint, `src/`, and the empty template). The application glossary is in
[CONTEXT.md](./CONTEXT.md).
Completed development stages are recorded in [PROGRESS.md](./PROGRESS.md).
Upcoming stages are tracked in [TODO.md](./TODO.md).

The shared UI uses Tailwind CSS v4 and shadcn/ui's Radix Nova preset with neutral
colors, CSS theme variables, and system fonts. Application components live in
`src/components`; shadcn primitives live in `src/components/ui`.
`components.json` aliases resolve through the existing `@/*` → `src/*`
TypeScript path. The starter's page-creation button stays disabled until the
application services are implemented.

From the repository root:

```sh
pnpm app          # Web development at http://127.0.0.1:3000
pnpm app:desktop  # Desktop development with its own local Next.js server
```

Electron runs Next.js in a utility process on an available loopback port and
awaits application cleanup when quitting. Both commands can run simultaneously.
The desktop renderer is sandboxed; Node integration is disabled.

Next.js remains the UI framework. Both hosts use `src/runtime/server.ts`, which
creates the Cordis application fiber before admitting HTTP requests.
`src/runtime/application.ts` mounts bundled plugins in dependency order;
`runtime.ctx` is their service/event context and `await runtime.dispose()`
releases the application lifecycle. Failed startup rolls back plugin resources.
All application sources, including `electron/main.ts` and owned scripts, use
strict TypeScript and ES modules. `build:runtime` compiles host entry points to
ignored `dist/` output with the existing TypeScript compiler. Web and desktop
development commands compile these entry points before launch; `build` compiles
them before building Next.js. Production commands use that compiled output.
Domain rules and replaceable adapters will be added in later stages.

Linux requires a configured Chromium sandbox helper. On this workstation,
Electron's installed `chrome-sandbox` points to the existing root-owned
`/opt/google/chrome/chrome-sandbox`. This setup lives in `node_modules` and may
need to be restored after reinstalling Electron.

For production startup and checks:

```sh
pnpm --filter @chulane/app build
pnpm --filter @chulane/app start
pnpm --filter @chulane/app start:desktop
pnpm --filter @chulane/app check-types
pnpm --filter @chulane/app lint
pnpm --filter @chulane/app test:unit
pnpm --filter @chulane/app test:smoke
pnpm --filter @chulane/app test
```

`test:unit` recursively discovers colocated `src/**/*.test.ts` files and runs
them through Node's built-in test runner and type stripping (Node 22.6+).
It fails if no tests are found. `test:smoke` builds the app and runs Playwright;
`test` runs both suites. To focus unit tests:

```sh
pnpm --filter @chulane/app test:unit --test-name-pattern="startup"
```

Electron smoke tests require a graphical session. If the terminal does not
inherit `DISPLAY`, set it to the existing desktop display when running tests.

Add shadcn components from the repository root so dependency changes use the
active workspace and its root lockfile:

```sh
pnpm --filter @chulane/app exec shadcn add <component>
```

Generated components should retain their behavior while following the
repository's JSDoc and named class-constant conventions.

The desktop uses a custom Next.js server, so this setup uses a normal Next.js
build rather than standalone output. Distributable desktop installers are a
separate step.
