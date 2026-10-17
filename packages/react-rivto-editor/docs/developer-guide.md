# `@chulane/rivto-react` developer guide

Rivto separates persisted data, document commands, and React presentation:

| API                                                   | Owns                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DocumentModel`                                       | Persisted blocks, elements, hierarchy and CRDT transactions                                                               |
| `DocumentEditorAPI`                                   | Document-wide commands, validation, history, portable selection and clipboard                                             |
| `ReactEditorApi` (`ReactEditor`)                      | Shared renderers, extensions, surfaces and browser infrastructure                                                         |
| `PanelAPI` (`ChildrenPanel` / `EmbeddingPanel`, core) | Bounded blocks/elements and independent subtree roots                                                                     |
| `ReactPanelApi` (`ReactPanel`, React)                 | Bounded `blocks`/`elements`, shared `editor`, local mode, DOM selection, events, keyboard, clipboard and edgeless actions |

## Shared editor and panels

`createReactEditor({ editor: documentApi, extensions })` installs shared infrastructure once.
Use `panel` for a core `PanelAPI` and `reactPanel` for a `ReactPanelApi`; the latter extends the core contract and exposes `reactPanel.blocks` and `reactPanel.elements` directly. Events, behavior contexts, clipboard contexts and element render/property props expose the React occurrence as `reactPanel`.

Pass it as `<EditorPanel editor={editor}>`. `usePanel()` returns the bounded core panel;
`useReactPanel()` and event payloads return its browser API. Document-wide operations
are explicit through `usePanel().document` or `reactEditor`; rendering
registrations are on `useReactPanel().editor`, and canvas actions on its `edgeless`.

`EditorPanel` displays the children of `rootBlockId`, or document roots for null.
`EditorEmbed` displays its required block root and descendants, protecting the root
from removal, moving, cutting and merge removal. Its text and properties remain editable,
and it can be copied. Both implementations independently restrict elements using
`rootElementId`; the container itself is excluded. There is no public scope object.

`panel.blocks` and `panel.elements` expose bounded reads and editing operations. `panel.subscribe(listener)` forwards the document-editor change stream, including changes outside the panel and block-definition updates. It does not emit on registration or selection changes; the returned function unsubscribes. Use the focused block and element subscriptions when a component observes only specific data. `panel.batchUpdates(callback)` groups synchronous changes into one shared document undo step; `panel.batchUpdatesWithoutHistory(callback)` runs maintenance changes without an undo entry. Both return the callback result and propagate errors without rolling back earlier writes. Nested transactions retain the outer capture policy. For components that only read or edit content, use `usePanel()`; use `useReactPanel()` for DOM interaction, selection, events, mode or presentation registrations. Read `panel.blocks.getBlockNode(id)` or `panel.elements.getElementNode(id)` inside deferred handlers to obtain current values and check that the entity still belongs to the panel before writing. Rendered hook snapshots are for rendering, not later read-modify-write operations.
Top-level parents are null relative to the panel; DocumentEditorAPI returns actual parents.
Outside destinations and targets are rejected before batch writes. Panel insertion uses
`{ root: true, beforeId? }` or `{ parentId, beforeId? }`; document insertion uses actual
`{ parentId: string | null, beforeId? }`. Omitted destinations append to the corresponding roots.

Each React panel owns its mode; pass a `ModeManager` explicitly to retain or share mode.
The shared editor and core have no mode. An extension's `setup(editor)` installs shared
behavior; handlers receive `event.reactPanel` or `context.reactPanel` for local actions.
A global toolbar chooses an existing panel through `editor.panels` before executing
DOM-dependent actions. Closing a panel releases only local subscriptions and registrations.

## React-owned lifetime

```tsx
function CustomEditor({ document }: { document: DocumentModel }) {
  const state = useReactEditor({ document, extensions: [standardPreset()] });
  if (state.status === "loading") return <p>Loading…</p>;
  if (state.status === "error") return <p>Could not create editor</p>;
  return <EditorPanel editor={state.editor}><PageSurface /></EditorPanel>;
}
```

Import `DocumentModel` from `@chulane/document-model` and the hook, preset, view and
surface from `@chulane/rivto-react`. The hook creates core and ReactEditor after commit,
cleans both up on document replacement or unmount, and keeps the borrowed model alive.
StrictMode setup/cleanup is supported. One hook result can serve several editor panels.
Extensions and keymap are creation settings; remount the owner with a new key to replace
them. `onError` receives setup/cleanup failures. No preset or surface is installed implicitly.

For loaded/cached documents use `await storage.acquireEditor(id)`: it returns
`{ editor, document, release }`. Keep the acquisition until all dependent panels unmount.
Each call owns one idempotent release; the last release closes editor, core and model.
EditorPanel never acquires an additional reference from context. EditorStorageContext is
used by embeddings to acquire their source documents. `openCoreEditor` and
`releaseCoreEditor` are removed; use the acquisition's `editor` for core operations.

React components must obtain ReactEditor through `useReactEditor` and panels
through `EditorPanel`/`EditorEmbed`; do not construct either instance manually,
including in render, `useMemo`, or a `useState` initializer. `useReactPanel` reads
an existing panel from context. Panel construction and subscription setup happen
in the owning effect, whose cleanup calls `destroy()`. StrictMode replay creates
a new instance, and the first render and SSR show loading. Low-level factories
remain for managed storage infrastructure and internal tests.

## Normal setup

The host loads and owns the document model; the React hook owns both editor layers.

```tsx
import { DocumentStorage, type DocumentModel } from "@chulane/document-model";
import { YjsDocumentRegistry } from "@chulane/crdt-doc";
import {
  useReactEditor,
  EditorPanel,
  PageSurface,
} from "@chulane/rivto-react";
import {
  blockExtension,
  edgelessPreset,
  pageDragExtension,
  standardPreset,
} from "@chulane/rivto-react/extensions";

const storage = new DocumentStorage({ registry: new YjsDocumentRegistry("workspace-id") });
storage.registerDocument("document-id");
const document = await storage.openDocument("document-id");
function DocumentView({ document }: { document: DocumentModel }) {
  const state = useReactEditor({
    document,
    extensions: [
      standardPreset({
        writing: {
          slashCommand: { group: "Formatting" },
        },
      }),
      pageDragExtension(),
      ...edgelessPreset(),
      blockExtension({
        definition: cardDefinition,
        render: CardContent,
        slashCommand: { title: "Card" },
      }),
    ],
  });

  if (state.status !== "ready") return <p>{state.status}</p>;
  return <EditorPanel editor={state.editor}><PageSurface /></EditorPanel>;
}

root.render(<DocumentView document={document} />);

// Host teardown:
root.unmount();
await document.destroy();
await storage.destroy();
```

`standardPreset({ writing })` installs the default writing block (paragraph +
Markdown renderer + slash conversion) and can override that command's `id`,
`title`, `group`, keywords, or availability while omitted fields retain their
defaults. Hosts that skip `standardPreset` must install
`defaultWritingBlockExtension` (or call `installDefaultWriting` with a `BlockFactory`) before
keyboard/clipboard paths that create writing blocks.

`writing.factory` accepts a `BlockFactory` with `createEmptyBlock()`, `isBlock(block)`,
and `isEmptyBlock(block)`. Access the installed object through
`reactEditor.defaultWritingBlockFactory`. The default emptiness policy checks the configured
native type and empty text; properties, plugin data, and children do not change that
policy. Clipboard creation and reset conversion retain their type-only use of the
writing factory, while ordinary insertion uses the complete returned input.

Custom reset keeps its empty-text eligibility check and the installed writing
predicate. Specialized blocks may refuse reset through the existing `onResetEmpty()`
behavior; general block registrations have no factory field or factory lookup.
Separator registrations retain `separatesBlockElements: true` metadata. Automatic
card insertion reads the first registered separator type and uses a type-matching
factory to create its input; factories are not stored with block types. Separator
commands still reuse any empty leaf, while keyboard caret fallback still checks
text length independently of semantic block emptiness.

For seed construction without a React runtime, import `paragraphBlockFactory`,
`separatorBlockFactory`, or `createBlockFactory(type)` from
`@chulane/rivto-react/block-factories`. Each creation returns a fresh detached input;
insertion or snapshot builders remain responsible for IDs and placement.

`standardPreset()` installs page editing: the page surface, selection bridges,
history, clipboard, slash commands, navigation, indent/outdent,
creation/merge/delete, collapse, the explicit separator block, and the page's
trailing paragraph-creation affordance. Block drag is opt-in through
`pageDragExtension()`; the edgeless surface and interactions are opt-in through
`...edgelessPreset()`.
`/Separator` or `Primary+Shift+Enter` inserts a real separator plus a focused
paragraph below it. Root separators partition edgeless cards; nested separators
remain ordinary rendered blocks.
Individual built-ins are exported from `@chulane/rivto-react/extensions`.

`edgelessPreset()` includes `edgelessVisualsExtension()` and its registered built-in element types. Its categorized
picker creates shapes, text, styled stickies, brush drawings, and attached
connectors. Exact-type multi-selections share one property panel, groups use
progressive child entry, and canvas transforms expose snapping guides. See
[First-class edgeless elements](edgeless-elements.md) for element props and
configuration.

Empty documents remain empty in core. `trailingBlockExtension(N)` owns the
page-end targets whose labels and highlights appear on hover or keyboard focus.
`trailingBlockExtension(N)` renders N targets; activating target K creates K
paragraphs as one undo step and focuses the last. `standardPreset({ trailingBlockCount: N })` includes
the same behavior with a default of three targets. It deliberately does not
appear on the edgeless canvas.

## Data flow

```text
Yjs transaction
  → DocumentModel publishes a document update
  → DocumentEditorAPI increments its global revision
  → EditorPanel rerenders the active React tree
  → hooks resolve fresh detached values through document getters
  → renderer calls editor operations for the next mutation
```

Core storage uses ordered root and child ID arrays:

```text
rivto.editor.roots:  Y.Array<blockId>
rivto.editor.blocks: Y.Map<blockId, {
  type, content, props, pluginData,
  listProps: Y.Map<Record<string, portableValue>>,
  children: Y.Array<blockId>
}>
```

Every block has an opaque first-class `listProps` group. Core preserves its
portable values without interpreting individual keys. React extensions define
defaults, validation, rendering, selection, and clipboard behavior. The
standard list extension defines `type` and `checked`; the collapse extension
defines `collapsed`. Numbering is computed from sibling order:
start resets to one, numbered follows an adjacent numbered sibling, and
continue resumes the latest numbered sibling through a gap. The standard
preset adds matching slash commands plus `- `, `[ ] `, `[x] `, and `1. ` input
shortcuts.

The root array is top-level order. A block's collaborative `children` array is
its direct child order. For example:

```text
roots = ["a", "b"]
blocks[a].children = ["a1", "a2"]
```

These arrays are persisted order, not derived copies. The model does not build
an eager whole-document index. Instead it lazily caches a sibling-index path
for each requested block, such as `[2, 0, 3]`. Every access validates that path
against the current root/children arrays. A stale or absent path causes a
depth-first tree search and caches only that ID. This makes a cache hit
proportional to tree depth, while a miss is O(N), without adding O(N) work to
text transactions. Moves, deletes, undo/redo, and remote changes self-repair
on the next access.

The block record remains canonical. Getters return detached recursive
`EditorBlock` values; React must not mutate them.

Useful direct queries are:

```ts
editor.getBlock(id);
editor.getRootIds();
editor.blocks.getBlockNode(id)?.childIds;
editor.getParentId(id);
```

Never walk `editor.getBlocks()` to find one ID and never mutate a snapshot.
Use `panel.batchUpdates(() => { ... })` when several panel operations must
produce one collaborative update and one undo step.

## Rendering and subscriptions

`EditorPanel` provides a stable React runtime. Block hooks subscribe to their
focused document snapshots, while the view subscribes to surface, extension,
and mode changes. A block edit therefore does not invalidate the whole tree.

Hooks resolve current values through public getters:

| Hook                                     | Value                                                         |
| ---------------------------------------- | ------------------------------------------------------------- |
| `useBlock(id)`                           | One detached recursive block snapshot                         |
| `useBlockNode(id)`                       | One detached node with direct `childIds` and bound operations |
| `useBlockOperations(id)`                 | Bound commands without a document subscription                |
| `useBlockTextEditing(id, content)`       | Plain-text DOM binding without another subscription           |
| `useBlockSelectionAnchor(id)`            | Structural selection marker and pending focus restoration     |
| `useRootBlockIds()`                      | Ordered root IDs                                              |
| `usePanel()`                             | Bounded core operations for the nearest panel                 |
| `useReactPanel()`                        | Browser operations for the nearest rendered occurrence        |
| `useContext(SurfaceContext)`             | Current surface kind                                          |
| `useEditorSelection()` / selection hooks | Detached selection                                            |
| slash hooks                              | Slash-command manager                                         |

Renderer, surface, and extension registries keep independent ownership and
lifecycle state.

The shared block render stack is:

```text
PageSurface or EdgelessBlockElement
  → ordered root block IDs
  → BlockTree(blockIds)
    → useBlockNode(blockId)
    → renderer for block.type
    → ordered BlockWrapper decorators
    → one BlockView DOM boundary
    → recursive child blocks
```

`BlockView` owns stable `data-block-*` DOM markers. A block renderer owns only
its content. `BlockTree` owns traversal and block layout while each surface owns
only its outer page or canvas geometry. A wrapper decorates the shared shell and
must render its children exactly once.

Visible per-owner chrome belongs in ordered block or element slots rather than
wrappers. See [Ordered owner slots](./slots.md) for positions, priorities,
filters, and CSS layout overrides.

## Extensions and capabilities

An extension is a setup function with a stable ID:

```ts
const commentsExtension = (): ReactEditorExtension => ({
  id: "acme.comments",
  setup(reactEditor) {
    const disposeExternalResource = connectComments();
    reactEditor.keyboard.register(definition, handler);
    reactEditor.surfaces.registerBlockWrapper("block", CommentWrapper);
    return disposeExternalResource;
  },
});
```

Extensions receive public capabilities:

- `blocks`: atomic definition + renderer + optional slash conversion
- `events`: delegated native DOM registrations
- `keyboard`: semantic bindings and runtime keymap overrides
- `surfaces`: surfaces and ordered block/editor wrappers
- `selection`: document model selection; DOM conversion belongs to the occurrence editor
- `slashCommands`: shared typed slash registry
- `renderers`: lower-level renderer lookup/registration
- `extensions`: mounted visual components

Concrete manager classes and lifecycle bookkeeping are internal package
implementation. Registrations are owned automatically during extension setup,
return idempotent disposers, roll back on setup failure, and unwind in reverse
order during `ReactEditor.destroy()`. Closing a view cancels its DOM work and
local registrations while the shared runtime stays available to other views.

Use `blockExtension()` for a normal custom block. It prevents half-installed
types by registering the core definition, React renderer, and slash conversion
as one unit. Use `renderers.register()` only when definition ownership genuinely
lives elsewhere.

Event-only behavior belongs directly in `setup`; it does not need a headless
React component. Mount a component only when it renders UI or supplies a React
provider boundary. The built-ins currently mount the slash popup and edgeless
selection overlay, plus a drag provider through a surface wrapper.

## Events and selection

`EventManager` attaches one ordered delegated runtime to the active surface.
Definitions select target (`surface`, `document`, or `window`), optional DOM
scope, editor mode, capture phase, and condition. Returning `true` claims and
prevents the event; returning `false` lets later handlers/native behavior run.

Keyboard definitions use stable binding IDs and semantic key strings. Hosts can
override keys in `createReactEditor({ keymap })` without replacing behavior.

There are two selection representations:

- core `Selection`: portable local runtime data used by commands;
- browser `Selection`: DOM ranges used for caret painting and native editing.

The text-selection extension keeps them aligned. Page and edgeless extensions
add their mode-specific whole-block gestures. Selection code should use
`reactPanel.selection` for DOM conversion and `editor.selection` for portable
state.

## Source map

All feature files use lowercase names and shallow paths:

```text
src/
  blocks/                 shared block DOM/rendering primitives
  extensions/             built-in extension setup and behavior
  hooks/                  focused external-store subscriptions
  managers/
    blocks/               internal block/renderer registries
    events/               delegated browser event runtime
    extensions/           setup ownership and mounted UI
    selection/            DOM selection bridge
    slash/                React-owned slash-command registry
    surfaces/             surface/wrapper registry
  surfaces/
    page/
    edgeless/
  capabilities.ts         public contract re-exports
  editor/                 shared runtime, storage and creation options
  panels/                 concrete panels, bounded block/element operations and contracts
  components/editor-panel/ document/subtree component, props and shared contexts
  components/editor-embed/ protected embedding component and its props
  hooks/editor/           public editor hooks and internal context readers
```

Recommended reading order:

1. `demo/src/App.tsx`
2. `src/editor/react-editor.ts` and `src/panels/types.ts`
3. `src/extensions/built-ins/built-ins.ts`
4. `src/components/editor-panel/editor-panel.tsx`
5. `src/hooks/blocks/use-block.ts`
6. `src/surfaces/page/page-block.tsx`
7. `src/managers/events/event-manager.ts`
8. [`selection.md`](./selection.md) and [`events.md`](./events.md)
9. [`styling.md`](./styling.md) for the Tailwind stylesheet, tokens, and shadcn/ui workflow

## Adding behavior

| Goal                                  | Correct boundary                                       |
| ------------------------------------- | ------------------------------------------------------ |
| New persisted field or tree operation | Core `DocumentModel` + `DocumentEditorAPI` method      |
| Custom block                          | `blockExtension({ definition, render, slashCommand })` |
| Keyboard/pointer action               | Extension `setup` + `events.register`                  |
| Block chrome                          | `surfaces.registerBlockWrapper`                        |
| Modal, popup, overlay                 | `extensions.mount`                                     |
| New root layout                       | `surfaces.register`                                    |
| React hook                            | Resolve from the stable editor context/global revision |

Before adding another manager or state container, check whether a core
operation or existing capability already owns the concern.

## Verification

Run from the repository root:

```sh
pnpm check-types
pnpm lint
pnpm test
pnpm --filter @chulane/rivto-react test
pnpm --filter @chulane/rivto-react build
pnpm demo
pnpm test:e2e
```

The minimum regression coverage for subscription work is:

- content and structural changes advance the global editor revision;
- lazy paths repair after local, remote, and history changes;
- registry changes update consumers of that registry;
- extension setup rollback and Strict Mode teardown leave no registrations.

## Shared document operations

Use `ReactEditor` for operations on shared document managers and registrations.
A rendered occurrence supplies it explicitly as `reactPanel.editor`; the view
itself no longer repeats the document API. The broad SharedEditorApi alias is
removed. Cross-document transfer retains one local Pick of blocks, history, and
getDocument because that algorithm also accepts a framework-neutral core editor.
Use `ReactPanelApi` for occurrence-specific browser interaction, `PanelAPI` for bounded core editing, `ReactEditor` for
runtime ownership, or an existing manager contract when only that manager is needed.

## Block behavior and manager contracts

A rendered `EditorPanel` is different from the behavior of a block type.
Use `runtime.blockBehaviors` to register or resolve `BlockBehavior` implementations;
`DefaultBlockBehavior` supplies ordinary outline actions and
`ContainerBlockBehavior` supplies the shared container behavior. A complete block
registration uses `behavior`, alongside `definition` and `render`.
The `BlockView` React component still renders the block shell.
Several behaviors can be registered with
`runtime.blockBehaviors.register(behavior, priority = 0)`. Each implements
`isAvailable({ editor, block })` using current detached block fields. Every method
uses the same availability context without a discriminator or operation name.
During movement, the registry tests source blocks and the receiving parent and
calls each matching registration's canMove method once. Only canMove receives
sources, destination, editor, and the resolved parent as its BlockMoveContext.
The called method owns any operation-specific eligibility. Higher priorities run first,
with stable registration order at ties. Native behaviors use `0`, list/collapse
use `-100`, and `DefaultBlockBehavior` is an ordinary registration at `-1000`.
Container behaviors implement their own native-type predicates and do not inherit
generic outline actions. Inherited methods receive no special dispatch treatment.
Use `dispatch()` for actions, `resolveAll(context)` for applicable instances, and
`canMove({ sources, destination })` for semantic movement permissions. The move
query is independent of dragging; all applicable hooks must allow it. Geometry
belongs to `definition.metadata[PAGE_DRAG_METADATA_KEY]` and is read by the optional drag
extension through `blockTypes.getDefinition(type)?.metadata`. Universal handle
hover uses `metadata[BLOCK_HANDLE_METADATA_KEY]` independently of dragging. React registration
owns the complete definition and passes its metadata directly to the existing core
registry; core API stays unchanged. Registering an already defined native type is
a conflict. Cleanup removes the owned definition together with its presentation.
`blockTypes.subscribe()` observes creation and removal of definitions, including their
metadata, and disconnects automatically when its React runtime is destroyed. Parent
`onChildIndent`/`onChildOutdent` chains run before child outline handlers; all use
shallow `BlockOutlineContext`, and handled/rejected stop the complete operation. Availability is not cached by native type. List split inheritance and Enter transitions belong to separate
checkbox, numbered-list, and ordinary-list behaviors; property defaults and
validation remain in `blockListProps`.

Public manager contracts use the `Api` suffix and live next to their owning
manager: for example, `BlocksApi`, `BlockBehaviorsApi`, `PanelEventsApi`,
`PanelSelectionApi`, and `PanelClipboardApi`. They remain available from the main
package entry point. Internal code imports them directly from their owner;
`capabilities.ts` only collects type re-exports.

The agreed sequence and implementation status are recorded in
[`react-api-architecture-ru.md`](../../../dev_notes/react-api-architecture-ru.md).
Core panel classes now own bounded editing; ReactPanel owns browser lifecycle.
Element registrations live on `ReactEditor.elementTypes`, while canvas actions live
in the edgeless representation through `useEdgelessOperations()`. Extensions install behavior and no longer return a visual controller facade.
