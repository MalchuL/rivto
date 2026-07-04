# Rivto editor demo

This Vite application consumes Rivto through the public `@chulane/rivto`
workspace package. It demonstrates the `DocumentModel → EditorRuntime → Renderer`
boundary without importing native Yjs. It exercises command-driven editing,
typed selection, routed events, mode-aware plugins and UI, replaceable
block/edgeless renderers, structured clipboard handling, canvas movement, and
browser persistence. The runtime inspector shows the active mode, selection
kind, last routed event, and last executed command.

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

The standard interaction suite runs in Chromium and Firefox:

```sh
pnpm test:e2e
```

The full release suite additionally requires WebKit system libraries:

```sh
sudo pnpm exec playwright install-deps webkit
pnpm test:e2e:all
```
