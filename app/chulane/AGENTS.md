<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Application language and modules

- Write all application code in TypeScript (`.ts` / `.tsx`), including Cordis
  composition, Node hosts, Electron main/preload code, tests, and owned scripts.
- Use ES module `import` / `export`. Do not author application code in CommonJS
  or use handwritten `.js`, `.cjs`, or `.mjs` files as a compilation shortcut.
- Compile Node and Electron entry points with TypeScript before execution. Keep
  emitted JavaScript in the ignored `dist/` directory; do not edit build output.
- Keep strict type checks enabled for every application entry point. JSDoc
  documents behavior; TypeScript annotations define its types.
- Standard tool configuration files may retain their required `.mjs` format
  (for example ESLint and PostCSS). This exception does not cover runtime code.
- Next.js App Router is the UI framework. Cordis owns application composition
  and plugin lifecycle; Electron hosts the same application UI.
