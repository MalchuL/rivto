# Rivto demo

This is an intentionally empty Vite/React host for rebuilding the editor view
top down. It currently verifies only that the public Rivto package can be
consumed by the demo workspace.

## Run locally

From the repository root:

```sh
pnpm install
pnpm demo
```

Open <http://localhost:5173>.

`pnpm demo` watches the Rivto package and starts the demo development server.

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
