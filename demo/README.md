# Rivto demo

This is the Vite/React development host for the Rivto workspace.

## Run locally

From the repository root:

```sh
pnpm install
pnpm demo
```

Open <http://localhost:5173>.

`pnpm demo` starts only Vite. Development aliases resolve
`@chulane/rivto` and `@chulane/rivto-react` directly to workspace sources, so
core and React edits are hot-reloaded without building or watching package
output.

## Production build

From the repository root:

```sh
pnpm demo:build
pnpm --dir demo exec vite preview
```

The production files are generated in `demo/dist/`.

The demo build also consumes workspace sources. Run the individual core and
React package builds only when verifying their publishable `dist` output.

## Checks

```sh
pnpm demo:check
pnpm demo:build
```
