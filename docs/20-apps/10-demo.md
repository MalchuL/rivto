# Rivto demo app

The `demo` app is Rivto’s Vite and React integration host. It exercises the workspace packages directly from source and provides runnable examples for development and browser regression testing.

## What it demonstrates

- Page and edgeless editor modes over the same core model.
- Markdown writing blocks, nested outlines, lists, separators, and custom blocks.
- Selection, clipboard, slash commands, keyboard behavior, and drag interactions.
- Edgeless shapes, connectors, groups, frames, drawing tools, and property controls.
- Two-editor document transfer with `?editors=2`.
- Local BroadcastChannel collaboration with `?sync=1`.

## Run locally

```sh
pnpm demo
```

The default URL opens the main journal-style playground. Useful variants are:

- `/?editors=2` for two independent editors.
- `/?sync=1` for two editors sharing a Yjs document.
- `/?sync=1&room=my-room` for a named local collaboration room.
- `/?keymap=alternate` for the alternate keymap example.

## Validation

```sh
pnpm demo:check
pnpm demo:build
pnpm test:e2e
```

The demo resolves both Rivto workspace packages directly to their source entry points, so package rebuild watchers are unnecessary during normal development.
