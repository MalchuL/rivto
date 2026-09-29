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

## AI agent (mock)

The demo toolbar has an **AI** button. It opens a panel whose mock model streams
random words into blocks: add a paragraph, rewrite the block under the caret,
or duplicate it. Each block row also has an **AI** button on the right (shown
on hover) that rewrites that block.

While typing in a block, light ghost text suggests a completion of the current
word plus a few words and punctuation. **Tab** inserts the full suggestion, even
if the last words are still streaming. **Escape** dismisses it. Tab still
indents when no suggestion is showing.

Open `/?sync=1`, run the agent in one pane, and the other pane follows because
the writes are normal block updates. Details and the client interface are in
`src/extensions/ai/README.md`.

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
