# Rivto demo

This is the Vite/React development host for the Rivto workspace.

## Run locally

From the repository root:

```sh
pnpm install
pnpm demo
```

Open <http://localhost:5173>.

### Synced editors (same PC)

Open <http://localhost:5173/?sync=1> to show two editors that share one Yjs
document through a local `BroadcastChannel` provider (no signaling server).

Edit either pane — the other should converge. Optional `room=` selects the
channel name so another tab can join the same room, for example
`/?sync=1&room=my-room`.

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
