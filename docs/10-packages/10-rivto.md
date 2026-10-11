# `@chulane/rivto` core package

`@chulane/rivto` owns canonical collaborative document state and framework-neutral editor behavior. Browser rendering and React interactions do not belong in this package.

## Responsibilities

- CRDT storage through `@chulane/crdt-doc` (`CRDTDoc` and its Yjs implementation), re-exported from this package.
- Document blocks, hierarchy, links, elements, snapshots, and validation.
- Focused managers for blocks, links, elements, selection, clipboard, commands, and undo history.
- Transactional mutations and portable snapshot loading and dumping.
- Local and remote update subscriptions without coupling consumers to React.

## Main API

Create host-owned storage, then use an explicit API for an acquired model:

```ts
import { createRivtoEditor } from "@chulane/rivto";
import { DocumentStorage } from "@chulane/document-model";
import { YjsDocumentRegistry } from "@chulane/crdt-doc";

const storage = new DocumentStorage({ registry: new YjsDocumentRegistry("workspace-id") });
const document = await storage.create("document-id");
const editor = createRivtoEditor({ document });
editor.blockRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
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
- `editor.blockRegistry`
- `editor.links`
- `editor.elements`
- `editor.commands`
- `editor.selection`
- `editor.clipboard`
- `editor.history`

## Persistence and collaboration

Hosts choose a registry and provider factory and pass an async document loader to `EditorStorage`. Views acquire only their required documents. Snapshots are the portable persistence boundary; local selection and presentation mode are runtime state rather than document content.

## Package commands

```sh
pnpm --filter @chulane/rivto check-types
pnpm --filter @chulane/rivto test
pnpm --filter @chulane/rivto build
```
