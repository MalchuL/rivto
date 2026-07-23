# Rivto

Rivto is a collaborative block-document runtime backed by Yjs. The core and
React view are separate packages:

- `@chulane/rivto` owns documents, CRDT storage, blocks, commands, selection,
  history, clipboard data, modes, and slash-command state.
- `@chulane/rivto-react` owns React rendering, page and edgeless surfaces,
  Markdown, browser events, key bindings, and interaction plugins.

## Install

```sh
pnpm add @chulane/rivto @chulane/rivto-react react react-dom yjs
```

## React editor

```tsx
import { createRivtoEditor } from "@chulane/rivto";
import {
  blockCreationPlugin,
  clipboardPlugin,
  createReactEditor,
  edgelessSurfacePlugin,
  EditorView,
  historyPlugin,
  indentPlugin,
  pageSurfacePlugin,
  slashCommandPlugin,
  textSelectionPlugin,
} from "@chulane/rivto-react";
import "@chulane/rivto-react/styles.css";

const editor = createRivtoEditor();
const view = createReactEditor({
  editor,
  plugins: [
    pageSurfacePlugin(),
    edgelessSurfacePlugin(),
    historyPlugin(),
    clipboardPlugin(),
    textSelectionPlugin(),
    slashCommandPlugin(),
    blockCreationPlugin(),
    indentPlugin(),
  ],
});

export function Document() {
  return <EditorView editor={view} />;
}

// The owner disposes the view before the core runtime.
view.destroy();
editor.destroy();
```

Plugins are ordinary factory calls supplied to `createReactEditor`; plugin
components are never placed in `EditorView` children. Optional children are
reserved for application chrome such as a mode toolbar.

See [Markdown rendering and live block size](packages/react/docs/markdown-rendering.md)
for the focused/raw presentation model and its CSS overrides.

## Custom React blocks

One registration installs the core model definition, renderer, and optional
in-place slash conversion:

```tsx
view.registerBlock({
  definition: {
    type: "acme.counter",
    title: "Counter",
    defaultProps: { count: 0 },
  },
  render: CounterBlock,
  slashCommand: {
    title: "Counter",
    group: "Turn into",
    keywords: ["count"],
  },
});
```

Renderers receive `{ blockId }` and use `useBlock`, `useEditor`, and the other
focused hooks from `@chulane/rivto-react`. Unknown persisted types remain in
the document and render through the configured fallback.

## Custom plugins and events

```ts
const plugin = (keys = ["Primary+K"]) => ({
  id: "acme.command",
  setup({ keyboard }) {
    keyboard.bind(keys, ({ event, editor }) => {
      event.preventDefault();
      editor.execute("acme.command");
    });
  },
});
```

`EditorEvents` delegates typed native events to the active surface root.
`KeyboardEvents` adds exact, portable shortcut matching. Registrations follow
plugin declaration order, stop after `defaultPrevented`, and are removed when
the React editor is destroyed.

## Core-only usage

The core has no React dependency and can be used with another view layer:

```ts
import { createRivtoEditor, YjsDoc } from "@chulane/rivto";

const editor = createRivtoEditor({ document: new YjsDoc("room-id") });
const id = editor.insertBlock({ type: "paragraph", content: "Hello" });
editor.updateBlock(id, { content: "Hello world" });
```

## Development

```sh
pnpm install --frozen-lockfile
pnpm check-types
pnpm --filter @chulane/rivto-react check-types
pnpm lint
pnpm test
pnpm --filter @chulane/rivto-react test
pnpm demo:build
pnpm test:e2e
```
