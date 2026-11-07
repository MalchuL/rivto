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
The bundled `LocalServicesPlugin` owns Drizzle/SQLite persistence, Better Auth,
and the identity/workspace services. `SqliteDatabase.open()` initializes the
connection, repository storage, and installation secret. `LocalApi` binds domain
services to the verified user and depends on storage and authentication contracts. `LocalServer` and
`DesktopApplication` own the web and desktop host lifecycles. The host serves `/api/auth/*`
and `/api/local`; UI components call these operations without importing database code.

Register with a name, email, and password. Email is a local login identifier;
no verification email or internet connection is required. Passwords are hashed
by Better Auth, and its persisted sessions support sign-out and restart recovery.
Users create workspaces explicitly. All workspaces can have members and can
be deleted or restored. Owners manage settings and membership; editors can write,
viewers can read, and the last owner cannot be removed or demoted. Workspace
access requires membership. Deleted workspaces are hidden from ordinary access
and can be restored by retained owners.
Page editing is the next stage.

Browser data defaults to `app/chulane/.data/app.sqlite`. Desktop data lives in
`data/app.sqlite` inside Electron's user-data directory. `CHULANE_DATA_DIR`
overrides either host's data directory, including when both should use the same
database. Tests use isolated temporary directories. The database also stores
the installation's signing secret, which remains device-local. New application
data directories use owner-only permissions; the database is not encrypted.

Better Auth credentials and sessions are separate from Chulane's domain profile,
which uses the same user ID. A login provisions the profile without creating a workspace. The Chulane profile owns the displayed name; Better Auth's
name is used only to initialize a missing profile. The profile form updates
Chulane's own name without changing authentication credentials or other users. Subsequent auth name changes
do not overwrite or invalidate the existing application user.
If provisioning fails after authentication commits, a later
login or authenticated application request retries it without duplicating data.
Password reset by email, remote accounts, and synchronization are not implemented.

Configuration and schema initialization used `auth@1.7.7 init` and `generate`,
`drizzle-kit generate`, and `shadcn add input label native-select`. The generated
auth setup was adapted to the existing Cordis-owned host and libSQL driver;
it does not open a second database inside Next.js. Drizzle Kit has no `init`
command, so its small configuration file is maintained directly. From the root:

```sh
pnpm dlx auth@1.7.7 generate --cwd app/chulane --config auth.config.ts --adapter drizzle --dialect sqlite --output src/storage/sqlite/auth-schema.ts --yes
pnpm --filter @chulane/app exec drizzle-kit generate --name describe_change
pnpm --filter @chulane/app exec drizzle-kit check
```

Restore the module documentation after regenerating the auth schema. Runtime
startup initializes the database from the generated initial SQL schema before
admitting application requests. During this pre-release stage the initial schema
may be regenerated; older development databases must be discarded rather than
upgraded. No data-preservation migration is supplied.
Run workspace commands from the repository root to use the active root lockfile.

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
