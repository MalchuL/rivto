# `@chulane/rivto` core package

`@chulane/rivto` owns canonical collaborative document state and framework-neutral editor behavior. Browser rendering and React interactions do not belong in this package.

## Responsibilities

- CRDT storage through the `CRDTDoc` abstraction and its Yjs implementation.
- Document blocks, hierarchy, links, elements, snapshots, and validation.
- Focused managers for blocks, links, elements, selection, mode, clipboard, commands, and undo history.
- Transactional mutations and portable snapshot loading and dumping.
- Local and remote update subscriptions without coupling consumers to React.

## Main API

Create an editor runtime with `createRivtoEditor()`:

```ts
import { createRivtoEditor } from "@chulane/rivto";

const editor = createRivtoEditor();
editor.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
const blockId = editor.blocks.insertBlock({
  type: "paragraph",
  content: "Hello from Rivto",
});

const snapshot = editor.dump();
editor.load(snapshot);
editor.destroy();
```

The runtime exposes focused owners rather than forwarding every operation through the editor object:

- `editor.blocks`
- `editor.blocksRegistry`
- `editor.links`
- `editor.elements`
- `editor.commands`
- `editor.selection`
- `editor.mode`
- `editor.clipboard`
- `editor.history`

## Persistence and collaboration

The default runtime creates a Yjs-backed document. Consumers can supply another `CRDTDoc` through `createRivtoEditor({ document })`. Snapshots are the portable persistence boundary; local selection and presentation mode are runtime state rather than document content.

## Package commands

```sh
pnpm --filter @chulane/rivto check-types
pnpm --filter @chulane/rivto test
pnpm --filter @chulane/rivto build
```
