# Rivto editor demo

This Vite application consumes Rivto through the public `@chulane/rivto`
workspace package. It demonstrates the `DocumentModel → CRDTDoc → YjsDoc`
boundary without importing native Yjs. It also exercises editable blocks,
formatting, slash commands, a custom plugin block and command, replaceable
page/edgeless renderers, structured clipboard handling, canvas movement, and
browser persistence.

The header displays `RIVTO_VERSION` from the package's public API, so the demo
identifies the Rivto build it is exercising.

## Run locally

From the repository root:

```sh
pnpm install
pnpm demo
```

Open <http://localhost:5173>.

`pnpm demo` builds the Rivto package first and then starts the demo development
server. Changes made in the editor are saved in the browser's local storage.
Use **Reset document** to restore the example content.

## Production build

From the repository root:

```sh
pnpm demo:build
pnpm --dir demo exec vite preview
```

The production files are generated in `demo/dist/`.

## Checks

```sh
pnpm demo:check
pnpm demo:build
```

The cross-browser interaction suite can be run after installing Playwright's
browser dependencies:

```sh
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```
