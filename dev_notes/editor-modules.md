# Rivto module reference

This note explains the current modules by responsibility. It is a code map for
developers deciding where new behavior belongs. The broader product design and
feature status remain in `editor-architecture.md`.

## Dependency direction

```text
Host application
  → React binding and renderer strategies
  → RivtoEditorCore
  → BlockRegistry and focused managers
  → DocumentModelImpl
  → CRDTDoc interfaces
  → Yjs adapter
  → native Yjs
```

Dependencies only point downward. Native Yjs imports belong exclusively inside
`src/store/crdt-doc/yjs-doc/**`.

## Public package boundary

### `src/index.ts`

The package entry point. It exports the version, adapter-neutral CRDT API,
document model, editor runtime, and React binding. Applications should import
from `@chulane/rivto`, never private source paths.

### `src/editor/index.ts`

The editor barrel. It exposes the block, editor, manager, and React modules
without maintaining old aliases or deprecated APIs.

## Block runtime: `src/editor/blocks`

### `block-definition.ts`

Defines the extension contracts:

- `BlockDefinition` describes one persisted native block type, content mode,
  defaults, Zod property schema, optional React renderer, and slash metadata.
- `BlockRenderProps` gives a trusted renderer the detached block value, public
  editor API, and Rivto's default editable content.
- `SlashItem` describes either typed block insertion or a custom action.

A definition describes behavior. It does not own collaborative state and never
receives CRDT containers.

### `block-registry.ts`

`BlockRegistry` owns the runtime map from native type strings to definitions.
It:

- Rejects missing and duplicate types.
- Resolves definitions for renderers.
- Merges definition defaults into new block input.
- Runs property validation during editor-level creation and updates.
- Builds slash items from registered definitions.
- Allows unknown stored types to remain readable when their plugin is absent.

The registry does not read documents, attach providers, or render UI.

### `default-writing.ts`

Contains the built-in writing definitions: paragraph, headings, list items,
checklist, quote, code, divider, image, and file. They are registered through
the same `BlockRegistry` path as host definitions; storage has no built-in type.

## Editor application layer: `src/editor/editor`

### `types.ts`

Defines the public application vocabulary:

- `EditorMode` for page or edgeless presentation.
- `EditorPosition` and `EditorSelection` for local UTF-16 text positions.
- `CreateRivtoEditorOptions` for a document, typed initial content, plugins,
  and initial mode.
- `RivtoEditorApi` for commands exposed to hosts and trusted plugins.
- `EditorEvent` for document, selection, mode, and focus subscriptions.

These contracts reference portable document values, not Yjs values.

### `rivto-editor.ts`

`RivtoEditorCore` is the application orchestrator. It constructs and connects
the document model, block registry, and managers. It owns:

- Public block, text, layout, link, clipboard, history, and mode commands.
- Validation of selections against the current block tree.
- Block-definition and plugin registration.
- Editor-level event publication and revision tracking.
- Lifecycle cleanup.

All collaborative mutations delegate to `DocumentModelImpl`. EditorCore does
not implement CRDT storage and renderers do not bypass it.

`createRivtoEditor()` is the public factory for a fully initialized runtime.

## Managers: `src/editor/managers`

Managers exist only for behavior with an independent state or lifecycle. There
is no shared base manager or service locator.

### `selection-manager.ts`

`SelectionManager` owns local directed selection only.

- `anchor` is where a gesture began.
- `head` is its active end, so backward ranges retain direction.
- Equal positions are collapsed.
- Different block IDs form a cross-block range.
- Offsets are UTF-16 indices compatible with DOM range APIs.
- `get()` returns a detached copy.
- `set()` copies the value and notifies subscribers.
- `clear()` notifies only when state actually changes.
- `subscribe()` returns a disposer.

It deliberately has no document, DOM, React, or CRDT dependency. EditorCore
validates block IDs and offsets before storing a selection. Selection remains
local because user intent and focus are not collaborative content.

### `clipboard-bundle.ts`

Contains pure clipboard-domain functions. It:

- Flattens block trees in visible order.
- Derives selected top-level subtrees without duplicating descendants.
- Normalizes same-block text ranges.
- Produces structured JSON, escaped HTML, and plain text.
- Generates new block and link IDs during paste.
- Remaps link endpoints and offsets edgeless geometry.

Keeping these transformations pure makes them testable without browser APIs.

### `clipboard-manager.ts`

`ClipboardManager` coordinates browser clipboard I/O with the document and
selection managers. Copy priority is:

1. `application/x-rivto+json`
2. `text/html`
3. `text/plain`

Structured paste preserves block types and data while remapping identities.
HTML currently becomes visible plain text. Plain text uses the explicit default
block type supplied by the React host when no selected block exists.

### `plugin-manager.ts`

`PluginManager` owns trusted plugin installation, commands, plugin slash items,
and cleanup. Plugin block definitions are registered into `BlockRegistry`, so
definition ownership and plugin lifetime remain connected while responsibilities
stay separate. Duplicate plugin IDs and command names are rejected.

Direct host definitions use `editor.defineBlock()`. Plugin bundles use
`editor.use()`.

### `provider-manager.ts`

`ProviderManager` attaches and detaches collaboration providers through
`CRDTDoc`. It prevents providers and editor code from depending on a native
Yjs document. Provider status and presence are not implemented yet.

### `undo-manager.ts`

`UndoManager` wraps `CRDTUndoManager` for the current document scopes and local
transaction origin. The Yjs adapter supplies the native history implementation,
but EditorCore only sees the adapter-neutral interface.

## React binding: `src/editor/react`

### `types.ts`

Defines `RivtoEditorProps`, `EditorRendererProps`, and slash-query state. The
host must pass `defaultBlockType`; generic UI actions never assume paragraph.
Applications may replace page and edgeless renderer strategies independently.

### `rivto-editor.tsx`

`RivtoEditor` subscribes to editor events with `useSyncExternalStore`, owns
transient view state such as slash query, selected canvas block, and zoom, and
chooses the renderer for the current mode. It also provides the toolbar and
forwards native copy/paste events to `ClipboardManager`.

The React component does not create or destroy the editor. The host owns the
editor lifetime; see `react-strict-mode-editor-lifecycle.md`.

### `renderers.tsx`

Contains both renderer strategies and their shared block components:

- `BlockDOMRenderer` renders the ordered nested page tree. A small pointer
  bridge extends native selection across independent block editing hosts.
- `EdgelessCanvasRenderer` renders the same root blocks on an absolute DOM
  plane and draws links with SVG.
- Shared block components resolve `BlockDefinition` through `editor.blocks`.
- Unknown types render a visible fallback without losing their data.
- `contenteditable` input writes Markdown source through editor commands.
- Page block dragging starts only from the side handle, so it does not intercept
  ordinary text-selection gestures.
- Slash replacement creates a new typed block and removes the trigger block;
  persisted block types are never patched.

Renderers use the public editor surface and never access `DocumentModelImpl`,
CRDT containers, or native Yjs directly.

### `markdown.ts`

Provides escaped, lightweight Markdown preview helpers. Markdown remains plain
collaborative text, so this renderer can later be replaced by a complete parser
without changing stored documents.

### `selection.ts`

Maps both browser selection endpoints independently to block-relative UTF-16
positions. This shared mapping allows native selections to cross separate block
contenteditables while preserving anchor/head direction for clipboard actions.
Because some engines paint only the active editing host, this module also uses
the CSS Highlight API to paint the remaining cross-block text ranges without
mutating editable DOM.

### `styles.ts`

Contains the self-contained default editor CSS mounted by `RivtoEditor`.

## Document model: `src/store/document-model/core`

### `types/document.ts`

Defines portable storage-domain values:

- `Block` is a detached stored block with native type, props, Markdown content,
  children, plugin data, and optional layout.
- `BlockInput` requires `type`; there is no implicit default.
- `BlockPatch` contains mutable fields and intentionally excludes ID and type.
- `Link`, `BlockLayout`, and schema-v3 `Snapshot` complete the public model.

### `types/storage.ts`

Defines the exact internal CRDT container schema. Blocks are stored once in a
map, while ordered root and child arrays contain IDs. Moving a block therefore
changes ordering references without rewriting its collaborative payload.

### `document-model.ts`

`DocumentModelImpl` is the only collaborative content source of truth. It owns:

- Ordered root and child references.
- Block identity and required immutable native type.
- Validated properties and plugin namespaces.
- Collaborative Markdown text.
- Edgeless layout and first-class links.
- Schema-v3 snapshots and deterministic normalization.
- Transaction origin and undo scopes.

It patches the smallest intended CRDT range or key so concurrent changes to
unrelated fields can merge. The model does not know registered block
definitions, selection, React, providers, or native Yjs.

### `utils`

Contains small storage helpers for cloning portable values, recognizing
adapter-neutral shared containers, and assigning maps, arrays, and text without
leaking adapter implementations.

## CRDT abstraction: `src/store/crdt-doc`

### `types`

Defines generic `CRDTDoc`, `CRDTMap`, `CRDTArray`, `CRDTText`, provider,
transaction, instantiation, and undo contracts. These are the only collaborative
types available to the document model and editor.

### `yjs-doc`

Implements those contracts with Yjs. It owns native wrapping, shared structures,
provider attachment, snapshots/updates, and native undo integration. Replacing
Yjs requires another adapter implementing the same CRDT contracts; higher layers
must not change.

## Demo: `demo`

The demo is a public-package consumer and playground. It demonstrates:

- `editor.defineBlock()` with a custom callout.
- `editor.use()` with a command plugin.
- Explicit typed block creation.
- `defaultBlockType="paragraph"` at the React boundary.
- Replaceable page and edgeless renderers.
- Snapshot persistence and package-version display.

It must never import private Rivto source files.

## Placement rules for new code

- Collaborative content or structure belongs in `DocumentModelImpl`.
- Local state with an independent lifecycle belongs in a focused manager.
- Native type behavior belongs in `BlockDefinition` and `BlockRegistry`.
- Framework rendering and DOM event mapping belong in `editor/react`.
- CRDT-specific behavior belongs in the adapter, never the editor.
- A feature that needs none of those boundaries should remain a plain function.

## Non-negotiable invariants

1. Native Yjs stays inside its adapter.
2. Every created block has an explicit native type.
3. Block ID and type cannot be changed through `BlockPatch`.
4. Unknown stored blocks remain lossless.
5. Selection, mode, focus, menus, and viewport state remain local.
6. Page and edgeless render the same document content.
7. Clipboard paste remaps block and link identities.
8. All collaborative mutations pass through `DocumentModelImpl`.
9. The host owns editor and CRDT document lifetimes.
