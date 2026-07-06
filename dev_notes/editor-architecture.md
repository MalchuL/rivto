# Rivto editor architecture

This note describes the current editor implementation, where each feature
lives, and which parts are still an early vertical slice rather than a finished
BlockNote-level editor.

## Architectural rule

Editor code must never use native Yjs types directly. The dependency direction
is one-way:

```text
Host application
  └─ RivtoEditor (React view)
       ├─ BlockDOMRenderer
       └─ EdgelessCanvasRenderer
            ↓
       EditorRuntime
            ↓
       CommandRegistry + EventRouter + focused managers
            ↓
       DocumentModelImpl
            ↓
       CRDTDoc / CRDTMap / CRDTArray / CRDTText
            ↓
       YjsDoc adapter
            ↓
       native Yjs
```

Only `src/store/crdt-doc/yjs-doc/**` may import native Yjs. This keeps the
editor independent of a specific CRDT implementation and gives tests or future
adapters one stable interface to implement.

## Source map

| Area | Main source | Responsibility |
| --- | --- | --- |
| Document types | `src/store/document-model/core/types/document.ts` | Storage blocks, Markdown content, layouts, links, and snapshots |
| Editor types and kernel | `src/editor/editor/**` | Public commands, events, mode, manager ownership, and feature orchestration |
| Block runtime | `src/editor/blocks/**` | Definitions, native-type registry, nested defaults, validation, and renderers |
| Collaborative model | `src/store/document-model/core/document-model.ts` | Canonical `DocumentModelImpl` boundary; block tree, Markdown content, props, plugin data, links, geometry, snapshots, and normalization |
| Runtime managers | `src/editor/managers/**` | Commands, event routing, mode, selection, history, plugins, UI, providers, and clipboard |
| Core plugins | `src/editor/plugins/**` | Global interaction systems such as slash-menu state, events, filtering, and commands |
| React view | `src/editor/react/**` | Host binding, components, Markdown helpers, styles, and renderer strategies |
| CRDT interfaces | `src/store/crdt-doc/types/**` | Adapter-neutral document and shared-type contracts |
| Yjs adapter | `src/store/crdt-doc/yjs-doc/**` | Native Yjs implementation hidden behind CRDT interfaces |
| Demo consumer | `demo/**` | Public API, custom plugin, custom renderer strategies, and persistence example |

`DocumentModelImpl` is the canonical storage model used by the editor. It
accepts valid schema-v3 snapshots and contains no legacy model or migration API.

The internal persisted shape is declared in
`src/store/document-model/core/types/storage.ts`. Generic
`CRDTMap<Schema>` and `CRDTArray<Item>` contracts make fields such as
`content: CRDTText` and `children: CRDTArray<string>` visible to TypeScript
without exposing native Yjs types.

## Data ownership

Collaborative state belongs in `DocumentModelImpl`:

- Ordered root blocks and nested child blocks
- Block type and validated props
- Plain Markdown collaborative text
- Per-block plugin data
- Canvas geometry and z-index
- Links between blocks
- Document-level plugin data

Local UI state belongs in `EditorRuntime`, managers, or React components:

- Current block or edgeless mode
- Text, block, or edgeless object selection
- Focus
- Slash-menu state
- Selected canvas block
- Canvas zoom and future viewport position

This distinction is important: collaborators share document content and
geometry, but changing one user's active mode or selection must not change
another user's UI.

## Document schema

`DocumentModelImpl` stores four top-level CRDT roots:

```text
rivto.editor.roots    ordered root block IDs
rivto.editor.blocks   block ID → block CRDT map
rivto.editor.links    link ID → link CRDT map
rivto.editor.plugins  document-level plugin data
```

The `rivto.editor.*` prefix is retained as persisted wire format for existing
documents. It does not make the storage model editor-specific.

Each block contains:

```text
id          stable block ID
type        required native string resolved by BlockRegistry at runtime
props       validated block properties
content     plain Markdown CRDTText
children    ordered CRDTArray of child IDs
layout      x, y, width, height, zIndex
pluginData  state owned by plugins for this block
```

Block order is represented by CRDT arrays, not numeric order fields. Content is
returned publicly as one Markdown string such as `"Hello **world**"`.

Normalization removes missing or duplicate tree references and reattaches
unreferenced blocks to the root. Unknown block types keep their document data
and render through a visible fallback.

## Mutation flow

Views and plugins call public editor commands. Commands delegate to
`DocumentModelImpl`, which performs mutations in a `CRDTDoc` transaction:

```text
user gesture or plugin
  → CommandRegistry.execute
  → document-model operation
  → CRDTDoc transaction with local origin
  → CRDT update
  → editor revision/event
  → React renderer update
```

No renderer should mutate CRDT structures directly. The transaction origin is
also used to keep local undo history separate from remote collaborative edits.

### Concurrency-safe mutation rules

CRDT containers keep the same identity for their lifetime. Normal editing must
change the smallest intended key or text range instead of replacing a complete
object with a stale local snapshot:

- `setBlockProp(id, key, value)` changes one validated prop key.
- `setPluginData(id, pluginId, value)` changes one plugin namespace.
- `insertText(id, offset, text)` inserts a CRDT text operation.
- `deleteText(id, offset, length)` deletes a CRDT text range.
- `setBlockText(id, text)` computes a minimal changed range for DOM input.
- `setBlockLayout(id, patch)` changes only supplied geometry keys.

`updateBlock()` remains a useful multi-field command, but interactive controls
should prefer the granular methods. Passing a spread of stale `props` can still
express an unintended overwrite even though the model no longer clears and
recreates the shared props map.

## Editor kernel and managers

`EditorRuntime` owns the document model and focused managers. Public mutation
methods are intentionally absent: renderers, plugins, and application UI use
`runtime.commands.execute(name, payload)`.

### CommandRegistry

Owns built-in and plugin commands, rejects duplicate names, and exposes the last
successful command for tooling. Built-ins cover document structure, text,
properties, layout, links, selection, mode, history, clipboard, and snapshot
loading.

`CommandRegistry<BuiltInCommandMap>` binds each stable name to its payload and
result. These compile-time checks complement rather than replace handler
validation because JavaScript and deserialized data reach the same boundary.
Extensions supply their own command map as the explicit generic to the same
`register()` and `execute()` methods. The returned registration remains a
locally typed execution/disposal handle.

### ModeManager and EventRouter

`ModeManager` owns local `block | edgeless` state. `EventRouter` accepts
framework-neutral keyboard, clipboard, drop, and pointer events, then
short-circuits through active global plugins, block-scoped plugins, and built-in
fallbacks. React only normalizes DOM events and applies `preventDefault` when a
runtime handler reports success.

### UIRegistry

Stores command-backed toolbar and side-menu contributions filtered by mode and
optional block type. React renders contributions but does not own their action
logic.

### SelectionManager

Stores discriminated local text, ordered block, or edgeless object selection.
Text anchor/head positions retain direction and use browser-compatible UTF-16
offsets. The runtime validates selected IDs, offsets, endpoints, and mode
compatibility before the manager stores a detached value.

The React range bridge follows the same separation used by BlockSuite: native
DOM selection is a projection, while portable selection is authoritative.
Cross-block text gestures retain anchor/focus direction, clamp pointer hit
testing through gaps, and paint exact partial first/intermediate/last ranges.
Whole blocks can be selected from handles, extended with Shift+Arrow or
Shift-click, toggled additively, or collected with a blank-area rectangle.
Block IDs are normalized into depth-first document order without changing the
selection's anchor/focus direction.

Selection remains local because focus intent is not collaborative content. The
manager intentionally stores neither DOM nodes, CRDT-relative positions, nor a
document reference.

### HistoryManager

Uses the adapter-neutral `CRDTUndoManager`. The Yjs adapter supplies the native
implementation and tracks transactions carrying the current editor's origin.

Current limitation: undo/redo UI exists, but complex concurrent and multi-editor
history behavior needs broader integration tests.

### PluginManager

Owns trusted plugin lifecycle. Plugin blocks, commands, global and block event handlers, slash
items, and mode-aware UI contributions are installed atomically in their
dedicated registries. Disposing a plugin removes every owned contribution.

Plugins are trusted local JavaScript modules. They receive the public editor
API, never native Yjs objects.

### ClipboardManager

Copies three formats:

- `application/x-rivto+json` for lossless Rivto block trees and links
- `text/html` for other rich editors
- `text/plain` as the universal fallback

Structured paste takes priority. It creates new block and link IDs, remaps child
and link references, offsets canvas positions, and inserts the result in one
document transaction. HTML currently falls back to extracted plain text rather
than a complete HTML-to-block conversion.

Clipboard ranges are normalized in visible document order. Copy trims boundary
content in every MIME representation while keeping block types and extension
data. Paste consumes the first copied block into the current block without
changing its type, inserts later blocks normally, and moves the current suffix
to the final inserted block. React, rather than the manager or document model,
reconciles focused editable DOM and restores the native caret.

### ProviderManager

Attaches and detaches collaboration providers through `CRDTDoc`. Editor and UI
code do not receive the underlying native Yjs document.

Current limitation: provider status events, reconnect UX, presence, remote
cursors, comments, and permissions are not implemented.

## Rendering strategies

`RivtoEditor` chooses a renderer from the current local mode. Applications may
replace either strategy through the `renderers` prop.

### BlockDOMRenderer

Renders the nested ordered block tree as a page. It currently supports:

- `contenteditable` inline text
- Block side controls
- Add, delete, move, indent, and outdent
- Native drag-and-drop ordering
- Slash commands
- Inline formatting toolbar
- Custom `BlockDefinition.render` components
- Unknown-block fallback

Current limitations include incomplete `beforeinput` handling, IME coverage,
rich HTML paste, auto-scroll during long selection drags, and production
screen-reader validation. Ordinary keyboard replacement across partial blocks
is intercepted before native contenteditable handling and applied atomically.

### EdgelessCanvasRenderer

Renders the same blocks on a large positioned DOM plane. An SVG layer draws
links while interactive block content remains DOM-based. It currently supports:

- Shared block content with page mode
- Deterministic initial positions
- Block selection
- Pointer movement and resizing
- Keyboard nudging
- Zoom controls
- Link rendering

Current limitations include pan, marquee and additive selection, connector
creation UI, z-order commands, viewport persistence, duplication, snapping,
and large-document virtualization.

Switching renderers must never change document content or hierarchy.

## Feature catalogue

### Blocks and hierarchy

The editor supports insertion, update, deletion, movement, indentation, and
outdentation. Deleting a tree removes its descendants and links attached to the
deleted root block. Block children are collaborative ordered arrays.

### Default blocks

The runtime registers these default block definitions:

- Paragraph
- Heading 1, 2, and 3
- Bulleted, numbered, and checklist items
- Quote
- Code
- Divider
- Image
- File

Image and file blocks currently accept URLs supplied by the host/user. Upload
transport and asset storage intentionally remain host responsibilities.

### Markdown text and formatting

Inline content is stored as plain Markdown source in `CRDTText`. The toolbar
wraps selections with Markdown tokens for bold, italic, strike, inline code,
and links. Formatting is therefore portable text rather than CRDT attributes.

### Markdown rendering

Paragraphs beginning with `# `, `## `, or `### ` render as headings while
the prefix remains in collaborative content. Explicit block types and props
still select specialized renderers for lists, media, callouts, and plugins.

### Slash commands

Typing `/` at the start of an editable block dispatches a normalized input event
to `SlashMenuPlugin` when the host installs it. The plugin owns query state,
combines plugin contributions, filters unavailable renderer modes, and exposes
the result. React only renders that state.
Selecting an item executes `slash.execute`; the default action creates the typed
replacement and removes the trigger block through built-in commands, so storage
never mutates a block's native type.

Current limitation: full keyboard navigation, grouped presentation, command
arguments, and async items need further work.

### Plugins and custom blocks

A `RivtoPlugin` may contribute:

- `BlockDefinition` values
- Commands
- Global and block-scoped event handlers
- Slash items
- Toolbar and side-menu UI actions
- Registration/disposal hooks

A `BlockDefinition` defines only a type, content mode, optional prop schema, and
optional shared or mode-specific React renderer. Interaction and UI policy live
in plugins. The demo's callout plugin is the reference consumer example.

Planned but not yet available: shortcuts, plugin-defined input rules, themes,
isolated plugin state APIs, and sandboxing.

### Links

Links are first-class collaborative records with `from`, `to`, optional ports,
and metadata. The document validates that both endpoint blocks exist. Edgeless
mode draws links, and structured clipboard paste remaps links between copied
blocks.

Current limitation: there is no connector creation or editing UI.

### Persistence

`getSnapshot()` produces schema v3 JSON containing blocks, links, layouts, and
plugin data. `loadSnapshot()` atomically replaces only supplied sections. The demo stores the
snapshot in browser local storage.

Historical bundle shapes are rejected. Compatibility code is added only for a
named product requirement with committed source fixtures.

### Collaboration

Every collaborative editor mutation goes through `CRDTDoc`, so content, block
structure, geometry, links, and plugin data can synchronize through an attached
provider. `YjsDoc` is the current adapter.

Collaboration is architectural and tested at the CRDT/model level, but the v1
product still needs reconnect, concurrency, provider status, and multi-browser
hardening before it should be considered production-ready.

### Accessibility

The current view includes toolbar roles, button labels, textbox labels, menu
roles, and keyboard nudging. Complete keyboard-only operation, focus management,
screen-reader testing, and automated accessibility checks remain release work.

## Public construction pattern

```tsx
const document = new YjsDoc("document-id");
const editor = createRivtoEditor({
  document,
  initialContent: [{ type: "paragraph", content: "Hello" }],
  plugins: [myPlugin],
});

<RivtoEditor
  editor={editor}
  defaultBlockType="paragraph"
  renderers={{
    page: MyPageRenderer,
    edgeless: MyCanvasRenderer,
  }}
/>;
```

The host owns the lifetimes of both objects and must eventually call
`editor.destroy()` and `document.destroy()`. React development effect replay
needs special care; see `dev_notes/react-strict-mode-editor-lifecycle.md`.

## Important invariants

1. Native Yjs stays inside its adapter.
2. `DocumentModelImpl` is the only collaborative editor source of truth.
3. Renderers and plugins mutate state only through public editor commands.
4. Document data survives unknown block types and missing renderers.
5. Page and edgeless mode render the same blocks; mode and selection stay local.
6. Structured clipboard paste always remaps identities.
7. Snapshot versions and supported compatibility are explicit.
8. Destruction is terminal; a destroyed editor instance must not be reused.
