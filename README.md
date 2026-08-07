# Rivto

Rivto is a collaborative block-document runtime backed by Yjs. The core and
React view are separate packages:

- `@chulane/rivto` owns documents, CRDT storage, blocks, links, generic canvas
  elements, commands, validated selection and structured clipboard managers, history, modes, and
  slash-command state.
- `@chulane/rivto-react` owns React rendering, page and edgeless surfaces,
  Markdown, browser events, key bindings, and interaction extensions.

## Document architecture

An open document stores block content separately from canvas elements:

```text
rivto.editor.roots       Y.Array<blockId>
rivto.editor.blocks      Y.Map<blockId, {
  type, content, props, pluginData, collapsed,
  listProps: Y.Map<{ type, checked }>,
  children: Y.Array<blockId>
}>
rivto.editor.links       Y.Map<linkId, link>
rivto.editor.elements    Y.Map<elementId, {
  type, frame: { x, y, width, height }, zIndex, props
}>
```

The root array stores top-level order. Every block's `children` array stores
its direct child order. Moving a block transfers its ID between these arrays;
the canonical block record stays in `rivto.editor.blocks`.

`listProps` describes how a block is presented when several sibling blocks
are rendered as one sequence. It keeps marker, sibling-derived numbering, and
checkbox state together without changing the block's own type or content.

`DocumentModel` keeps a lazy `blockId -> sibling-index path` cache. A read first
walks and validates the cached path. A missing or stale path triggers one
depth-first search and caches only that requested ID. Mutations, undo/redo, and
remote updates never rebuild or eagerly invalidate the cache. Nested snapshot
v5 is the strict portable import/export format. It always contains `blocks`,
`links`, and `elements`; older snapshots are intentionally rejected.

Elements are generic core records exposed through `document.elements` and
`editor.elements`. Core validates their common geometry but leaves `type` and
`props` to presentation extensions. React stores shapes, text, brush drawings,
styled sticky notes, attached connectors, groups, and block cards in this collection. A block card has type
`block` and inclusive `props.startBlockId` / `props.endBlockId` boundaries;
roots in that current document-order range remain ordinary document content
and contain no coordinates.

In edgeless mode React partitions root blocks into cards at explicit separator
blocks. `standardPreset()` installs the built-in separator; custom block plugins
can opt into the same behavior with `separatesBlockElements: true`. Empty
paragraphs always remain card content, while nested separators render without
splitting the current root projection. Derived repairs still use an untracked
transaction origin, so they do not add undo steps.

See [First-class edgeless elements](packages/react-rivto-editor/docs/edgeless-elements.md)
for ownership, separator, reconciliation, and clipboard details.

Zero roots is a valid collaborative and snapshot state. Core deletion never
invents a replacement block. The React `standardPreset()` adds three accessible
“+ Add block” targets after the page roots. Activating target N creates N
paragraphs in one undo step and focuses the last one. Use `standardPreset(N)`
or `trailingBlockExtension(N)` to choose the number of targets.

## Selection architecture

Selection belongs to the editor session, not to either surface. Core exposes
only `TextSelection` and `BlockSelection`; page and edgeless mode consume the
same state. A block selection may contain roots or nested blocks and survives
mode switches unchanged.

On the canvas, Ctrl/Cmd-click and rectangle gestures select element IDs. Text
and structural selection inside block elements continues to use the block
selection managers. See
[Selection in Rivto](packages/react-rivto-editor/docs/selection.md) for the DOM bridge,
gesture ownership, and collapse behavior.

## Install

```sh
pnpm add @chulane/rivto @chulane/rivto-react react react-dom yjs
```

## React editor

```tsx
import { createRivtoEditor } from "@chulane/rivto";
import {
  blockExtension,
  createReactEditor,
  EditorView,
  standardPreset,
} from "@chulane/rivto-react";
import "@chulane/rivto-react/styles.css";

const editor = createRivtoEditor();
const view = createReactEditor({
  editor,
  extensions: [standardPreset()],
});

export function Document() {
  return <EditorView editor={view} />;
}

// The owner disposes the view before the core runtime.
view.destroy();
editor.destroy();
```

Extensions are ordinary factory calls supplied to `createReactEditor`; extension
components are never placed in `EditorView` children. Optional children are
reserved for application chrome such as a mode toolbar.

See [React editor managers](packages/react-rivto-editor/docs/managers.md) for registration
ownership, ordering, rollback, and cleanup.

See [Markdown rendering and live block size](packages/react-rivto-editor/docs/markdown-rendering.md)
for the focused/raw presentation model and its CSS overrides.

## Custom React blocks

One registration installs the core model definition, renderer, and optional
in-place slash conversion:

```tsx
const counterExtension = blockExtension({
  definition: {
    type: "acme.counter",
    title: "Counter",
    defaultProps: { count: 0 },
    toRawText: (block) => `Count: ${block.props.count}`,
  },
  render: CounterBlock,
  slashCommand: {
    title: "Counter",
    group: "Turn into",
    keywords: ["count"],
  },
});
```

Pass block extensions to `createReactEditor({ extensions })`; registrations are
installed atomically and released with the React runtime.

Renderers receive `{ blockId }` and use `useBlockEditing` for reactive block
state, latest property access, bound mutations, and the DOM attributes required
by text or structural selection. Unknown persisted types remain in the document
and render through the configured fallback.

See the [`useBlockEditing` renderer guide](packages/react-rivto-editor/docs/use-block-editing.md)
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

## Custom extensions and events

```ts
const extension = {
  id: "acme.command",
  setup(reactEditor) {
    const command = reactEditor.editor.register("acme.command.open", () => {
      // Open application UI.
    });
    reactEditor.keyboard.register({
      id: "acme.command.open",
      keys: ["Primary+K"],
      when: ({ selection }) => selection.length > 0,
    }, ({ editor }) => {
      editor.execute("acme.command.open");
      return true;
    });
    return () => command.dispose();
  },
};
```

`ReactEditor.events` registers delegated native DOM behavior, while
`ReactEditor.keyboard` registers semantic shortcuts using that DOM transport.
Returning `true` claims an event; extensions never call `preventDefault()` merely
to announce ownership. Handlers receive `EditorEvent` or
`KeyboardEditorEvent`; their `raw` property contains the browser event.

Initial keymap overrides use stable binding IDs:

```ts
createReactEditor({
  editor,
  extensions: [standardPreset(), extension],
  keymap: {
    "block.indent": ["Primary+ArrowRight"],
    "history.redo": [],
  },
});

reactEditor.keyboard.setKeymapOverride("block.indent", ["Alt+ArrowRight"]);
reactEditor.keyboard.replaceKeymap({ "history.redo": ["Primary+y"] });
```

See [React events and keymaps](packages/react-rivto-editor/docs/events.md) for targets,
scopes, conditions, composition policy, hooks, and built-in binding IDs.

## Core-only usage

The core has no React dependency and can be used with another view layer:

```ts
import { createRivtoEditor, YjsDoc } from "@chulane/rivto";

const editor = createRivtoEditor({ document: new YjsDoc("room-id") });
const id = editor.insertBlock({ type: "paragraph", content: "Hello" });
editor.updateBlock(id, { content: "Hello world" });

editor.batchUpdates(() => {
  editor.updateBlock(id, { content: "Hello again" });
  editor.insertBlock({ type: "paragraph", content: "One undo step" }, id);
});
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
