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
stops it when quitting. Both commands can run simultaneously. The desktop
renderer is sandboxed; Node integration is disabled.

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
pnpm --filter @chulane/app test
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
