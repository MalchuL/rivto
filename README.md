# Rivto

Rivto is a collaborative block-document runtime backed by Yjs. The core and
React view are separate packages:

- `@chulane/rivto` owns documents, CRDT storage, blocks, commands, validated
  selection and structured clipboard managers, history, modes, and
  slash-command state.
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

See [React editor managers](packages/react/docs/managers.md) for registration
ownership, ordering, rollback, and cleanup.

See [Markdown rendering and live block size](packages/react/docs/markdown-rendering.md)
for the focused/raw presentation model and its CSS overrides.

## Custom React blocks

One registration installs the core model definition, renderer, and optional
in-place slash conversion:

```tsx
view.blocks.register({
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

Renderers receive `{ blockId }` and use `useBlockEditing` for reactive block
state, latest property access, bound mutations, and the DOM attributes required
by text or structural selection. Unknown persisted types remain in the document
and render through the configured fallback.

See the [`useBlockEditing` renderer guide](packages/react/docs/use-block-editing.md)
for where to spread attributes in text, control, and mixed-content blocks.

```tsx
function CounterBlock({ blockId }: { blockId: string }) {
  const editing = useBlockEditing<{ count: number }>(
    blockId,
    { textEdit: false },
  );
  return (
    <div {...editing.attributes}>
      <button>Count: {editing.getProp("count") ?? 0}</button>
    </div>
  );
}
```

## Custom plugins and events

```ts
const plugin = {
  id: "acme.command",
  setup(reactEditor) {
    reactEditor.events.register({
      id: "acme.command.open",
      keys: ["Primary+K"],
      when: ({ selection }) => selection.length > 0,
    }, ({ editor }) => {
      editor.execute("acme.command");
      return true;
    });
  },
};
```

`ReactEditor.events` is one registry for native and keyboard definitions.
Returning `true` claims an event; plugins never call `preventDefault()` merely
to announce ownership. Handlers receive `EditorEvent` or
`KeyboardEditorEvent`; their `raw` property contains the browser event.

Creation-time keymap overrides use stable binding IDs:

```ts
createReactEditor({
  editor,
  plugins,
  keymap: {
    "block.indent": ["Primary+ArrowRight"],
    "history.redo": [],
  },
});
```

See [React events and keymaps](packages/react/docs/events.md) for targets,
scopes, conditions, composition policy, hooks, and built-in binding IDs.

## Core-only usage

The core has no React dependency and can be used with another view layer:

```ts
import { createRivtoEditor, YjsDoc } from "@chulane/rivto";

const editor = createRivtoEditor({ document: new YjsDoc("room-id") });
const id = editor.insertBlock({ type: "paragraph", content: "Hello" });
editor.updateBlock(id, { content: "Hello world" });
```

## Development

The demo resolves both workspace packages directly from TypeScript source.
`pnpm demo` therefore starts only Vite; package builds remain publish checks.

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
