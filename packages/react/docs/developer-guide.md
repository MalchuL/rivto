# `@chulane/rivto-react` developer guide

Guide for reading and changing this package when you are not primarily a
frontend engineer. It explains ownership, the render/event loop, and the
non-obvious contracts that make the editor behave correctly.

Related deep-dives in this folder:

- [`selection.md`](./selection.md) — portable vs browser selection (read this early)
- [`events.md`](./events.md) — DOM listeners and keyboard bindings
- [`block-wrappers.md`](./block-wrappers.md) — ordered block decorators
- [`markdown-rendering.md`](./markdown-rendering.md) — preview vs raw editor

Also useful outside this package:

- [`dev_notes/editor-architecture.md`](../../../dev_notes/editor-architecture.md)
- [`demo/KEYMAP.md`](../../../demo/KEYMAP.md)
- Working host: `demo/src/App.tsx`

---

## 1. What this package is

`@chulane/rivto-react` is the **browser presentation layer** for Rivto.

| Package | Owns | Does not own |
| --- | --- | --- |
| `@chulane/rivto` | Document, CRDT/Yjs, blocks, selection model, commands, undo, slash registry | React, DOM roots, CSS, pointer UX |
| `@chulane/rivto-react` | Surfaces, block renderers, plugins, DOM events, keymaps, selection sync | Document lifetime, collaborative storage |

Dependency direction is one-way:

```text
host / demo
  → @chulane/rivto-react
    → @chulane/rivto
      → DocumentModel / CRDT
```

**Rule of thumb:** if a change is about *what the document stores*, it belongs in
core. If it is about *how the browser shows or interacts with it*, it belongs
here.

---

## 2. Mental model: two runtimes

Every host creates **two** objects:

1. **`RivtoEditorApi`** (`createRivtoEditor`) — framework-neutral document API.
2. **`ReactEditor`** (`createReactEditor`) — React registries + event runtime.

```text
createRivtoEditor()
        │
        ▼
createReactEditor({ editor, plugins, keymap? })
        │
        ▼
<EditorView editor={reactEditor} />
        │
        ├── editor-wide wrappers from plugins
        ├── mounted plugin components (often headless)
        └── Surface for current mode ("block" | "edgeless")
```

Important ownership facts:

- Host creates and destroys both. Destroy **ReactEditor first**, then core.
- `ReactEditor.destroy()` never destroys the document runtime.
- Plugins are installed **once at creation**, in declaration order. Setup is
  transactional: failure rolls back everything already registered.
- Markdown is registered by default inside `ReactEditor`; other block types are
  added with `reactEditor.blocks.register(...)`.

---

## 3. Best path to understand the project

Read in this order. Each step answers one question.

### Step A — Bootstrapping (how the host wires it)

1. `demo/src/App.tsx` — real plugin list, keymap override example, custom blocks.
2. `src/plugin-factories.tsx` — public plugin catalog and short descriptions.
3. `src/react-editor.tsx` — manager construction, revision forwarding, and teardown.
4. `src/managers/` — focused state ownership and public plugin APIs.

Ask: *What does the runtime register, and who owns each registration?*

### Step B — Rendering (how pixels appear)

5. `src/editor-view.tsx` — context provider, revision subscription, surface pick.
6. `src/surfaces/page/PageSurface.tsx` + `PageBlock.tsx` — page outline.
7. `src/blocks/block-view.tsx` + `block-wrapper.tsx` — DOM contract + decorators.
8. `src/blocks/markdown.tsx` — default content renderer.

Ask: *Who chooses the tree, who paints a block, who adds drag handles?*

### Step C — Data hooks (how React sees the document)

9. `src/hooks/editor/use-editor.ts` / `use-editor-root.ts`
10. `src/hooks/blocks/use-block.ts` / `use-block-editing.ts`
11. `src/hooks/document/use-document.ts`

Ask: *Why does typing update the document without local React state for content?*

### Step D — Selection (do not skip)

12. [`docs/selection.md`](./selection.md) — full model and sync story.
13. Core selection manager plus `src/managers/selection/selection-manager/`.
14. `src/plugins/text-selection-plugin.tsx` — browser ↔ portable bridge.
15. `PageBlockSelectionPlugin` / `PageArrowPlugin` / `EdgelessSelectionPlugin`.

Ask: *Why are there two selections, and when does a drag become blocks vs text?*

### Step E — Interaction (how keys and pointers become commands)

16. `src/managers/events/` — `EditorEventManager → DOMEventManager →
    KeyboardEventManager`
17. One page plugin, e.g. `PageEnterPlugin.tsx` or `PageBackspacePlugin.tsx`

Ask: *Where does Enter/Backspace live, and why is order of plugins important?*

### Step F — Second surface

18. `src/surfaces/edgeless/` — same document, canvas layout + viewport gestures.

Ask: *What is shared between modes, and what is mode-specific?*

### Optional verification

- Unit tests under `src/__tests__/` and `src/editor/__tests__/selection-manager.test.ts`
- Playwright specs under `e2e/` (selection, keymap, markdown)

---

## 4. Main components

### `ReactEditor` (`react-editor.tsx`)

Small coordinator. It holds the core reference, public managers, and a
monotonic revision used to invalidate React. Concrete registries live in:

- `blocks` and `renderers`
- `surfaces` (including block/editor wrappers)
- `plugins` (setup lifecycle and globally mounted UI)
- unified `events` (`KeyboardEventManager`)
- `selection` and `slashCommands` delegates

It does **not** render UI itself.

Every manager is constructed with this complete runtime. Constructors retain
the owner but defer sibling access until operations run, avoiding injected
lifecycle callbacks without introducing a service container. Manager classes
remain exported for typing; host code should use the owned instances.

See [`managers.md`](./managers.md) for the public manager map and ownership
rules.

### `EditorView` (`editor-view.tsx`)

React boundary. Responsibilities:

- subscribe to `ReactEditor` via `useSyncExternalStore`
- publish `{ editor, reactEditor, revision }` through context
- hold the surface **root ref** and call `reactEditor.events.setRoot(...)`
- compose editor wrappers → children + plugin components → active `Surface`

It adds **no DOM wrapper**. Surfaces own the visible root element.

### Surfaces

| Surface | Mode | Layout idea |
| --- | --- | --- |
| `PageSurface` | `block` | Nested outline; respects collapse |
| `EdgelessSurface` | `edgeless` | Root cards on a zoom/pan plane; shows full subtree |

Both traverse the same collaborative document. Mode is read from
`editor.mode.get()`; switching mode swaps the registered surface.

### Block rendering stack

For each block ID, a surface roughly does:

```text
useBlock(blockId)                 → detached snapshot + operations
reactEditor.renderers.get(type)   → content component (e.g. MarkdownContent)
BlockWrapper                      → plugin decorators around a shell
  └─ fallback shell               → BlockView + controls + content + children
       └─ BlockView               → div with data-block-id / type / selected
```

Roles:

- **`BlockView`** — stable DOM identity markers only. No recursion, no editing.
- **`BlockWrapper`** — ordered decorators from plugins (outermost first registered).
- **Surface shell** (e.g. `PageBlockWrapper`) — row layout, collapse controls,
  recursive children. Surfaces never import optional DnD plugins directly.

### Content renderers

A renderer receives `{ blockId }` and should resolve data through hooks.
Default: `MarkdownContent`. Custom types register with
`reactEditor.blocks.register({ definition, render, slashCommand? })`.

`useBlockEditing` is the normal renderer entry point:

```tsx
const editing = useBlockEditing<{ count: number }>(
  blockId,
  { textEdit: false },
);
const count = editing.getProp("count") ?? 0;

return (
  <div {...editing.attributes}>
    <button
      onClick={(event) => {
        if (!event.defaultPrevented) {
          editing.setProp("count", (editing.getProp("count") ?? 0) + 1);
        }
      }}
    >
      Count: {count}
    </button>
  </div>
);
```

The default attributes provide contenteditable synchronization. Contentless or
control-based renderers pass `{ textEdit: false }` to opt their region into
structural drag selection instead. `getProps` and `getProp` resolve current
editor state when called; `setProps` patches several keys and `setProp` patches
one validated key.

See [`useBlockEditing`](./use-block-editing.md) for exact text, control, and
mixed-renderer attribute placement.

### Hooks (public API surface for UI code)

| Hook | Purpose |
| --- | --- |
| `useEditor` / `useReactEditor` | Core API / React runtime |
| `useEditorMode` | Current presentation mode |
| `useEditorRoot` | Register/read the surface root element |
| `useDocument` | Document model (roots via `document.document`) |
| `useBlock` | Snapshot + bound commands for one ID |
| `useBlockEditing` | Renderer state, properties, commands, and text/structural attributes |
| `useBlockSelection` | Whether a block is in the structural selection |
| `useDOMEvent` / `useKeyboardEvent` | Register listeners/bindings from components |

---

## 5. End-to-end runtime flow

### Cold start

```text
createRivtoEditor
  → createReactEditor (install plugins, register Markdown)
  → optional blocks.register for custom types
  → insert initial content via core API
  → render <EditorView>
       → pick Surface for mode
       → Surface calls useEditorRoot().ref on its container
       → ReactEditor.events connects to that root
```

### Local edit (typing in Markdown)

```text
1. User types in contenteditable (.markdown-editor)
2. useBlockEditing() onInput → operations.setContent(plainText)
3. Core updates CRDT / document revision
4. ReactEditor forwards revision → EditorView re-renders
5. useBlock / MarkdownContent see new detached snapshot
6. useLayoutEffect syncs DOM only if text differs (caret preserved)
```

Markdown preview geometry (idle absolute layer vs focused raw editor) is
documented in [`markdown-rendering.md`](./markdown-rendering.md).

### Structural command (Enter, indent, delete selection)

```text
1. Native keydown on root / window
2. KeyboardEventManager matches binding IDs (and `when` predicates)
3. First handler returning true claims the event (preventDefault)
4. Handler calls core commands (insertBlock, indentBlock, deleteSelection, …)
5. Document revises → same React invalidation path as typing
```

Several bindings may share one physical key (especially Backspace). They run in
**plugin declaration order** until one returns `true`. That is why demo plugin
order matters for merge vs outdent vs selection delete.

### Pointer / selection (summary)

Selection is the hardest subsystem. Full detail:
[`selection.md`](./selection.md).

```text
Browser Selection (DOM node + offset)
  ↔ textSelectionPlugin / pageSelectionPlugin / edgelessSelectionPlugin
  ↔ editor.selection.set() | editor.selection.clear()
  ↔ SelectionManager list: text | block | edgeless items
  ↔ data-selected / data-text-selected / CSS Highlight paint
```

Facts that surprise most readers:

- Portable selection is an **array** of items (text + middle blocks can coexist).
- Normal cross-block drag becomes **whole-block** selection; hold **Alt** for
  partial text across hosts.
- Each block has its own `contenteditable`; the text plugin freezes the
  pointer-down anchor and suppresses noisy `selectionchange` during synthetic
  drags.
- `useBlockSelection` ignores text carets — only `block` / `edgeless` paint
  `data-selected`.
- After block select, focus often moves to the **surface root**, not an editable.

---

## 6. Plugin system

Plugins are plain objects:

```ts
{
  id: "stable.id",
  setup(reactEditor) {
    // Register through the runtime; return cleanup for external resources.
  }
}
```

Plugins receive the complete `ReactEditor` runtime:

| API | Use |
| --- | --- |
| `reactEditor.events.on` / `.bind` | DOM + keyboard |
| `reactEditor.plugins.mount(Component)` | Mode-free headless or overlay UI beside the surface |
| `reactEditor.surfaces.registerEditorWrapper(Wrapper, mode?)` | Wrap the complete editor UI (e.g. DnD context) |
| `reactEditor.surfaces.register(mode, Surface)` | Page / edgeless root |
| `reactEditor.surfaces.registerBlockWrapper(mode, Wrapper)` | Ordered block decorator |
| `reactEditor.blocks.register(...)` | Atomic core definition + renderer + conversion command |
| `reactEditor.renderers.register(type, Renderer)` | Low-level renderer-only registration |
| `reactEditor.selection` | Active-root DOM selection conversion and highlighting |
| `reactEditor.slashCommands` | React-owned registration over the shared core slash manager |
| `reactEditor.events.getRoot()` | Read the current committed surface root |
| `reactEditor.editor` | Core runtime, including live mode and selection |

Presentation registrations are automatically owned by the active plugin and
may also be created dynamically after editor construction. Every method returns
an idempotent disposer. Mutable registration collections remain private.
Keyed managers additionally expose `delete(key)`; ordered wrappers, mounted
components, and DOM listeners use exact returned disposers because duplicates
are valid.

Factories in `plugin-factories.tsx` are the supported public catalog. Internal
implementations live under `src/plugins/`. Prefer factories in application code.

### Built-in groups (demo order is a good reference)

| Group | Examples | Notes |
| --- | --- | --- |
| Surfaces | `pageSurfacePlugin`, `edgelessSurfacePlugin` | Required for that mode |
| Cross-cutting | `historyPlugin`, `textSelectionPlugin`, `clipboardPlugin`, `slashCommandPlugin` | Both modes |
| Page structure | selection, caret, indent, enter, backspace/merge, collapse, drag | Mostly `mode: "block"` |
| Edgeless | selection, transform, deletion, movement | `mode: "edgeless"` |

`pageDragPlugin` is special: it **wraps the editor** in a DnD boundary and
registers the same block wrapper for both modes, so every wrapper has its
required context.

---

## 7. Events and keymaps (compact)

Public `reactEditor.events` is one object:

```text
EditorEventManager
  └─ DOMEventManager
       └─ KeyboardEventManager   ← this is what you hold
```

- Handlers return `true` to claim; claimed events get `preventDefault` and stop
  later Rivto handlers.
- `target`: `root` (default), `document`, or `window` — taken from the active
  root's owner document, not always `window` globals.
- Replacing the surface root reconnects the whole event realm.
- Keymap overrides are fixed at `createReactEditor({ keymap })` by binding ID.
  Empty array disables. See [`events.md`](./events.md) and `KEYBOARD_BINDING_IDS`.

IME: bindings default to `composing: "ignore"`. History uses `prevent` so native
contenteditable undo does not fight CRDT undo during composition.

---

## 8. DOM contracts non-frontend readers miss

These markers are the integration surface between React and delegated events:

| Attribute / selector | Meaning |
| --- | --- |
| `data-block-id` | Stable block identity on `BlockView` |
| `data-block-type` | Persisted native type |
| `data-selected` | Whole-block selection (attribute omitted when false) |
| `data-block-content` | Plain-text editable host for typing/selection |
| `data-block-selection-anchor` | Renderer region that may start structural drag selection |
| `data-text-selected` | Fallback highlight for cross-block text ranges |

Plugins and event utilities query these selectors. Do not replace them with CSS
class names if you want events and selection to keep working.

Custom controls opt into whole-block drag anchoring by placing
`data-block-selection-anchor` on the exact interactive region. A normal click
retains the control's behavior, while movement beyond the selection threshold
starts structural selection. Because browsers may still dispatch `click` after
pointer-up, the control must return early when `event.defaultPrevented` is true.

### Detached snapshots vs live CRDT

`useBlock` returns a **detached** snapshot. It is not a mutable live object.
After any command or remote update, a new snapshot appears on the next revision.
Commands on `operations` target the **ID**, so they always hit current document
state even if the snapshot in hand is stale.

### Why `contentEditable: "plaintext-only"`

Rivto persists plain text (Markdown source), not HTML. Rich formatting in the
DOM is presentation (`react-markdown` preview), not the source of truth.

### Why every block has its own contenteditable

Browsers do not reliably maintain a single native selection across multiple
editing hosts. `textSelectionPlugin` compensates: it synthesizes editor
selection (and sometimes whole-block selection) when the pointer crosses hosts.
Alt at gesture start keeps partial text across blocks.

### Collapse is page-only in practice

Page omits collapsed descendants from the DOM. Edgeless reuses `PageBlock` with
`ignoreCollapse` so canvas cards always show the full outline. Slash
collapse/expand commands check `editor.mode.get() === "block"`.

### Revision is the React heartbeat

There is no Redux-style store in this package. Core `subscribe` →
core subscription or manager `ReactEditor.invalidate()` → `revision++` →
`EditorView` context update → hooks
re-read. One subscription at the view boundary; hooks reuse that revision.

### Plugin order is behavior

Example: Backspace may try selection deletion, outdent-at-start, merge,
empty-block reset, then fall through to native deletion. Changing factory order
in `createReactEditor({ plugins })` changes product behavior without changing
plugin source.

### Wrappers must not re-create BlockView for the same ID

Decorators wrap the shell; they must render `children` once. Creating a second
`BlockView` with the same `data-block-id` breaks event resolution and DnD. See
[`block-wrappers.md`](./block-wrappers.md).

### Styles

`styles.css` ships functional layout/interaction styles and CSS variables
(including code highlighting). Product chrome and themes belong in the host
(demo). Import `@chulane/rivto-react/styles.css` from the app.

---

## 9. Source map (where to look)

```text
packages/react/
  src/
    react-editor.tsx          React runtime + plugin lifecycle
    editor-view.tsx           React provider / surface composition
    plugin-factories.tsx      Public plugins
    plugins/                  Plugin implementations
    managers/events/          DOM + keyboard runtime and event utilities
    blocks/                   BlockView, wrappers, Markdown
    surfaces/page|edgeless/   Mode presentations
    hooks/                    Document / block / editor / event hooks
    constants.ts              DOM attribute contract
  styles.css
  docs/                       This guide and focused topics
```

---

## 10. Practical change recipes

| Goal | Start here |
| --- | --- |
| New block type | `registerBlock` + renderer; see demo custom blocks |
| New keyboard action | Plugin `events.bind` + stable ID in keymap if overridable |
| New pointer UX | `events.on` or `useDOMEvent`; prefer root-scoped handlers |
| Decorate every block | `registerBlockWrapper` (+ `wrapEditor` if shared context is needed) |
| Change page layout | `PageSurface` / `PageBlock` shell only |
| Change canvas UX | `EdgelessSurface` / edgeless plugins |
| Persist different text model | Core + `useBlockEditing` / custom renderer together |
| Understand a shortcut | Binding ID → plugin factory → `demo/KEYMAP.md` |
| Understand selection | [`selection.md`](./selection.md), then `text-selection-plugin.tsx` |

---

## 11. Glossary

| Term | Meaning |
| --- | --- |
| Core / `RivtoEditorApi` | Document + commands runtime |
| ReactEditor | Presentation registries + events |
| Surface | Full-mode root renderer |
| BlockView | Stable block DOM node |
| Block wrapper | Plugin decorator around the surface shell |
| Renderer | Component for one block type's content |
| Detached snapshot | Immutable-looking block value for one render |
| Revision | Monotonic signal that React should re-read editor state |
| Claimed event | Handler returned `true`; Rivto owns the native event |
| Mode | `"block"` (page) or `"edgeless"` (canvas) |

When something feels “magic,” it is usually one of: revision invalidation,
delegated events via `data-*` markers, plugin declaration order, or selection
sync across multiple contenteditables. Trace those four first.
