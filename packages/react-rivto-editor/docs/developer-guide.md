# `@chulane/rivto-react` developer guide

Rivto has two deliberately separate layers:

| Package | Owns |
| --- | --- |
| `@chulane/rivto` | Yjs document storage, root/children tree model, commands, history, portable selection |
| `@chulane/rivto-react` | React rendering, browser events, DOM selection, surfaces, and extensions |

The React package never owns or duplicates document data. It presents a core
`RivtoEditorApi` and translates browser interactions into editor operations.

## Runtime and rendered editors

`createEditorRuntime` creates shared document infrastructure and installs extensions
once. Pass it to `<EditorView runtime={runtime}>`. Each occurrence constructs its own
`EditorViewApi`; `useEditorView()` and event payloads return that occurrence editor.
Blocks, history, rendering definitions, and extension registrations remain shared.
DOM selection, local event registrations, and clipboard/slash execution belong to
the receiving occurrence. Closing one view does not destroy its shared runtime.

An extension's `setup(runtime)` registers behavior. Its event handlers use
`event.editorView`, and slash callbacks use `context.editorView`, for operations
that depend on a rendered surface. A global toolbar must explicitly choose a
mounted editor through `runtime.events.getDocumentView()` before restoring DOM
selection or executing a view command; absence means there is no mounted target.

`createViewApi` and `ViewApiFactory` are removed. View managers are constructed
inside `EditorViewApi`, with their shared registries supplied as dependencies.
Hosts replace `createReactEditor` with `createEditorRuntime` and the `EditorView`
prop `reactEditor` with `runtime`. The core editor and persisted document formats
are unchanged.

## Normal setup

```tsx
import { createRivtoEditor } from "@chulane/rivto";
import { DocumentStorage } from "@chulane/document-model";
import { YjsDocumentRegistry } from "@chulane/crdt-doc";
import {
  createEditorRuntime,
  EditorView,
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
const editor = createRivtoEditor({ document });
const editorRuntime = createEditorRuntime({
  editor,
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

root.render(<EditorView runtime={editorRuntime}><PageSurface /></EditorView>);

// Host teardown:
editorRuntime.destroy();
editor.destroy();
await document.destroy();
await storage.destroy();
```

`standardPreset({ writing })` installs the default writing block (paragraph +
Markdown renderer + slash conversion) and can override that command's `id`,
`title`, `group`, keywords, or availability while omitted fields retain their
defaults. Hosts that skip `standardPreset` must install
`defaultWritingBlockExtension` (or call `installDefaultWriting`) before
keyboard/clipboard paths that create writing blocks.

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

Canvas visuals are opt-in through `edgelessVisualsExtension()`. Its categorized
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
  → RivtoEditorApi increments its global revision
  → EditorView rerenders the active React tree
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
Use `editor.history.batchUpdates(() => { ... })` when several editor operations must
produce one collaborative update and one undo step.

## Rendering and subscriptions

`EditorView` provides a stable React runtime. Block hooks subscribe to their
focused document snapshots, while the view subscribes to surface, extension,
and mode changes. A block edit therefore does not invalidate the whole tree.

Hooks resolve current values through public getters:

| Hook | Value |
| --- | --- |
| `useBlock(id)` | One detached recursive block snapshot |
| `useBlockNode(id)` | One detached node with direct `childIds` and bound operations |
| `useBlockOperations(id)` | Bound commands without a document subscription |
| `useBlockTextEditing(id, content)` | Plain-text DOM binding without another subscription |
| `useBlockSelectionAnchor(id)` | Structural selection marker and pending focus restoration |
| `useRootBlockIds()` | Ordered root IDs |
| `useEditorView()` | Operations for the nearest rendered occurrence |
| `useContext(SurfaceContext)` | Current surface kind |
| `useEditorSelection()` / selection hooks | Detached selection |
| slash hooks | Slash-command manager |

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
  setup(editorRuntime) {
    const disposeExternalResource = connectComments();
    editorRuntime.keyboard.register(definition, handler);
    editorRuntime.surfaces.registerBlockWrapper("block", CommentWrapper);
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
order during `EditorRuntime.destroy()`. Closing a view cancels its DOM work and
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
override keys in `createEditorRuntime({ keymap })` without replacing behavior.

There are two selection representations:

- core `Selection`: portable local runtime data used by commands;
- browser `Selection`: DOM ranges used for caret painting and native editing.

The text-selection extension keeps them aligned. Page and edgeless extensions
add their mode-specific whole-block gestures. Selection code should use
`editorView.selection` for DOM conversion and `editor.selection` for portable
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
  capabilities.ts         public capability interfaces
  react-editor.tsx        small runtime coordinator
  editor-view.tsx         stable provider + active surface
```

Recommended reading order:

1. `demo/src/App.tsx`
2. `src/editor-view-api.ts`
3. `src/extensions/built-ins/built-ins.ts`
4. `src/editor-view.tsx`
5. `src/hooks/blocks/use-block.ts`
6. `src/surfaces/page/page-block.tsx`
7. `src/managers/events/event-manager.ts`
8. [`selection.md`](./selection.md) and [`events.md`](./events.md)
9. [`styling.md`](./styling.md) for the Tailwind stylesheet, tokens, and shadcn/ui workflow

## Adding behavior

| Goal | Correct boundary |
| --- | --- |
| New persisted field or tree operation | Core `DocumentModel` + `RivtoEditorApi` method |
| Custom block | `blockExtension({ definition, render, slashCommand })` |
| Keyboard/pointer action | Extension `setup` + `events.register` |
| Block chrome | `surfaces.registerBlockWrapper` |
| Modal, popup, overlay | `extensions.mount` |
| New root layout | `surfaces.register` |
| React hook | Resolve from the stable editor context/global revision |

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

Use the exported `SharedEditorApi` type when an operation accepts either
`EditorRuntime` or `EditorViewApi` and only needs their shared document managers
and registrations. It excludes DOM events, selection, clipboard/slash execution,
and destruction because those contracts differ between runtime and view.
Use `EditorViewApi` for occurrence-specific interaction, `EditorRuntime` for
runtime ownership, or an existing manager capability when only that manager is needed.
