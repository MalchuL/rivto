---
name: rivto-containers
description: Implement or review Rivto blocks that own child layout, such as boards, columns, task storage, and tables, using the shared Page layout components. Use for native blocks in packages/react-rivto-editor; use rivto-blocks for leaf blocks.
---

# Rivto Containers

A container is an ordinary block whose registered layout arranges its children.
There is no separate container tree or rendering engine. `ContainerBlockBehavior`
implements `BlockBehavior`; it is interaction policy, not a renderer or a second
model entity.

Keep persisted hierarchy in document-model, user operations in core/panel managers,
concrete block definitions and UI in React extensions, and generic rendering,
placement, hover and selection in `@chulane/rivto-page`.

## Read the affected path

Paths below are relative to the repository root. Inspect callers and current
contracts before editing; examples are not proof that every interaction is correct.

- `packages/rivto-page/AGENTS.md` — Page ownership and layout contracts.
- `packages/rivto-page/src/presentation/components/block-layout/` — `BlockNode`,
  `BlockView`, `BlockRow`, `BlockContent`, `BlockBody`, `BlockChildren`, `BlockList`,
  `BlockItem`, and layout-bounded row hover.
- `packages/rivto-page/src/presentation/drag-and-drop/` — explicit drop regions,
  gaps and wrapping-item boundaries.
- `packages/react-rivto-editor/src/managers/blocks/block-types-api.ts` and
  `packages/react-rivto-editor/src/managers/blocks/types.ts` — registration contract.
- `packages/react-rivto-editor/src/block-behaviors/container-block-behavior.ts`,
  `default-block-behavior.ts`, and `types.ts` — interaction policy and fallback.
- `packages/react-rivto-editor/src/hooks/blocks/use-block.ts` and
  `use-block-editing.ts` — addressed snapshots, text editing and selection anchors.
- `packages/react-rivto-editor/src/extensions/containers/convert-leaf-to-container.ts`
  — identity-preserving seeded conversion and its transaction limitations.
- `packages/react-rivto-editor/docs/styling.md` — stylesheet ownership, tokens and
  the whole-block selection background contract.

Choose a nearby composition, then inspect its registration, behavior and tests:

| Need                                                               | Current implementation under `packages/react-rivto-editor/src/`        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Wrapping tiles with persisted preferred widths and resize previews | `extensions/containers/bento/bento-layout.tsx`, `bento-tile.tsx`       |
| Board lanes with ordinary cards and declarative add controls       | `extensions/containers/kanban/kanban-layout.tsx`, `kanban-content.tsx` |
| Equal-width lanes and dividers in canonical gaps                   | `extensions/containers/columns/columns-layout.tsx`                     |
| Layout-local query/filter state and direct-child visibility        | `extensions/todo-item/todo-storage.tsx`                                |
| Fixed row/cell hierarchy and synchronized widths                   | `extensions/containers/table/`                                         |

Bento, Kanban, Columns and TODO storage are undergoing a layout redesign. Consult
`dev_notes/container-layout-redesign-ru.md` for current scope and validation limits.
Table was not part of that rewrite. Do not copy obsolete DOM assumptions from an
example or claim that passing selection tests validates all of its features.

## Define the block and register its layout

Use native blocks with stable IDs for structural lanes, rows and cells. Store
children in the canonical hierarchy, never in a parallel list of IDs in props,
React state, or plugin data. Persist meaningful layout preferences such as widths
and divider visibility as block props; keep temporary interaction state local.

Register through `reactEditor.blockTypes.register({ definition, render, layout,
behavior, slashCommand })` in a `ReactEditorExtension.setup`:

- `definition` owns the native type, accessible title, defaults, property schema
  and applicable semantic metadata. Check the current `BlockDefinition` contract;
  do not resurrect removed fields such as `allowedParents`.
- `render` supplies the content region, not descendants.
- `layout` composes shared Page regions around that content.
- `behavior` supplies demonstrated semantic differences from ordinary blocks.
- Optional `slashCommand` handles simple type conversion. Seeded structures use
  an explicit slash registration and the existing conversion helper.

The registration owns the complete core definition and presentation; a duplicate
native type is a conflict, not an opportunity to supplement someone else's type.
Return owned disposers from extension setup and release them in reverse order.
Register slots through `reactEditor.surfaces.registerBlockSlot`. Use surface
wrappers only for actual subtree decoration, such as `BlockModal`, in supported
surfaces; wrappers do not own child traversal, placement, widths or filtering.

Export factories, extension entrypoints and required public types through the
existing package entrypoints. Add a preset contribution only when that preset
should include the feature. Do not add runtime stylesheet injection: feature CSS
belongs in the package stylesheet entry.

## Compose one canonical subtree

Page creates one `BlockNode` / `BlockView` per block. A typical layout returns:

```tsx
<>
  <BlockRow className="rivto-example-header">
    <BlockContent />
  </BlockRow>
  <BlockBody />
  <BlockChildren className="rivto-example-children" dropAxis="vertical" emptyDropTarget>
    {/* Optional non-block footer controls. */}
  </BlockChildren>
</>
```

- Keep one primary row and one canonical child host per block. Their committed
  refs register ownership, so neutral DOM wrappers, fragments and context
  providers may separate them from the shell without changing hover or placement
  ownership. `BlockDropTarget asChild` can register an existing region without
  another shell. Use `BlockRow slots="manual"` and owner-bound `BlockSlot` when
  contributions need explicit JSX placement; do not duplicate automatic slots.
- Let `BlockChildren` traverse child IDs once. Do not map descendants in a content
  renderer, mount a second `BlockNode`/`BlockView`, or manually reimplement collapse.
- Headers and management rows participate in normal flow. Do not overlay an empty
  parent row on its first child with negative margins or absolute positioning.
  Whether a header is visible while expanded is a product choice, not a universal
  collapsed-summary rule.
- Use `useBlockSelectionAnchor(blockId)` for contentless structural UI and spread
  the attributes onto its actual selectable region. Do not make it contenteditable.
  Editable titles use `useBlockEditing(blockId)` and persisted content. Protect
  nested controls using the existing editing attributes when appropriate.
- Derive summaries from the narrowest reactive source that supplies their data.
  `useBlockNode` is shallow; recursive counts need an appropriate structural
  subscription or recursive snapshot. Do not mirror derived counts into state
  or subscribe to the entire document for a direct-child count.

### Items, gaps and footer controls

`BlockChildren.item` receives `{ blockId, children }`, with the existing child node
as `children`. Render it once inside `BlockItem` for placement/counter-aware chrome,
or `BlockDropWrapper` when a wrapping item needs explicit sibling boundaries.
Declare item and gap components outside render so their identities remain stable.

`BlockChildren.gap` receives canonical `parentId`, `previousId` and `nextId`.
Use `BlockDropGap` or the existing `HorizontalDropGap`; never infer model neighbors
from DOM siblings. Wrapped grid items already reserve insertion strips: do not
also add separate grid gap cells or accidentally double their spacing.

Width and resize previews belong to the item, not a global block wrapper. Keep
visual card bounds aligned with the actual child block. Extra item padding must
not leave visible card areas outside selection, hover or drop bounds. Commit
resize props once at gesture completion; cancel/unmount must release listeners
and restore temporary styles. Reuse existing resize controllers where applicable.

Pass add-card/add-column controls directly as JSX children of `BlockChildren`.
They appear after canonical child nodes and disappear with them on collapse.
Do not find `#block-children-*`, portal controls into it, append DOM nodes or reorder
them in effects. Portalled dialogs for genuine modal UI are a different concern.

### Empty, collapsed and filtered children

`BlockChildren` defaults to `renderEmpty=true` and `hoverBoundary=true`.
`emptyDropTarget` defaults to false; enable it when the retained empty host should
accept an inside drop. `renderEmpty=false` removes the entire empty host, including
footer controls. On collapse, the host is hidden and descendants and footers unmount.
Do not infer expansion solely from the host's presence in the DOM.

Keep empty states selectable without fake paragraph children. Give the empty region
an appropriate minimum size; remove an empty-only writing control once content
exists. An empty-lane writing action must support keyboard activation, accessible
labelling and focus restoration. Use the existing behavior/manager insertion path.

For TODO-style filtering, place the query/filter provider inside the owning layout
without an extra DOM shell. Its item component decides whether to render its supplied
direct child. Do not register a global visibility wrapper or filter grandchildren
recursively. Nested storages receive their own provider. Query/filter state remains
transient; persist only intentional document settings such as ordering mode.
Filtering does not redefine canonical order: verify DnD against hidden neighbors,
empty filtered results, nested storage isolation and model-backed selection.

## Keep geometry separate from permission

Choose `BlockChildren.dropAxis` for actual child flow: vertical, horizontal or grid.
Vertical layout retains ordinary outline depth placement. Register explicit regions
with `BlockDropTarget`, canonical gaps with `BlockDropGap`, and wrapping boundaries
with `BlockDropWrapper`. Do not reintroduce `PAGE_DRAG_METADATA_KEY`,
`acceptsDropContainer` or per-type axis switches in shared Page code.

Choose `dropPlacement="siblings"` when background gaps must stay at the list's
own level; the default `outline` preserves horizontal depth selection. This is
independent of flow axis. `BlockDropWrapper.axis` selects top/bottom strips for
vertical flow, inline strips for horizontal flow, or all four for its default grid.
Use the public `BlockEditorTheme` geometry tokens to customize padding, gutters,
child gaps and strip thickness without container-specific pointer calculations.

A drop region proposes a destination; it does not grant permission. Implement
`canMove` on the applicable concrete behaviors for source and receiving-parent
restrictions. Inspect the actual destination parent, not the neighboring block's
edge. Keep structural policy in the owning behavior/core path rather than CSS.

Custom-layout headers compare nearby insertion lines using the same bounds as
their feedback. The host supplies live source permission to the shared resolver;
forbidden structural levels descend into the nearest mounted child branch.
Explicit sibling strips and exposed outer rims retain their existing behavior.
Header padding and item bounds determine distance, without block-type checks or
a scan of every target in the document. Commit still revalidates the chosen move.

`ContainerBlockBehavior` provides empty-container Enter insertion and returns
`unhandled` where the ordinary behavior chain should continue. Override methods
only for actual semantic differences, for example a cell's Enter handling or a
column's content relocation on structural deletion. Parent `onChildIndent` and
`onChildOutdent` receive the requested group: `unhandled` continues the chain;
`handled` or `rejected` stops that operation. Check all affected operation paths;
UI move restrictions do not establish a persisted hierarchy invariant.

Page's row hover is layout-bounded. Custom child hosts normally keep
`hoverBoundary=true`; ordinary outlines may use false to inherit available width.
This controls hover geometry, not block width, indentation or drop permission.
Keep headers, children and gaps in their owning regions; do not add viewport-wide
pseudo-elements, transparent hit slabs or type-specific hover lists.

`BlockItem` supplies its own border box; in-flow slots contribute to its size,
but absolute slots overflowing that box do not. Hover over item padding and
placement strips reveals its block's handle, with native nested rows taking
priority. This is shared Page behavior, not an item-local pointer listener.

Keep handles hidden at rest and reachable from their own row/exposed gutter.
Hovering a child must not activate the whole parent. Do not translate or raise a
parent handle over the first child's handle to conceal overlapping geometry.
Keep horizontal overflow on the layout owner and dividers in actual gaps rather
than persisted separator blocks. Preserve ordinary sibling placement and outline
nesting wherever the concrete behavior allows them.

## Preserve selection color and subtree bounds

The shared Page shell owns one outline around the complete selected subtree.
Nested selected markers must not add separate outlines. Preserve the host's existing
selection color and outline; do not change radii or replace the palette to hide a
geometry defect.

Opaque layout/card backgrounds consume Page's inherited selection fill before
their ordinary background:

```css
.rivto-example-children {
  background: var(--rivto-block-selection-fill, var(--rivto-example-background));
}
```

Page sets this fill from `--rivto-block-selection-background` (`#e5dfff` in the
React host). Layouts read it; they do not assign it independently to descendants.
Account for priority-colored cards as well as plain surfaces. Removing selection
must restore each surface's original background. Do not use `mix-blend-mode`,
opacity or a tint overlay over text: retaining the token alone does not preserve
the rendered color. Text, icons and semantic control colors remain legible.

Follow the styling guide for feature CSS imports, scoped resets, shadcn primitives
and host tokens. Use named layout classes and direct relationships, not recursive
rules rewriting every descendant row's padding, slots or background. Shared Page
geometry belongs in Page, never in demo CSS or container-specific patches.

## Convert and mutate through existing managers

Factories return complete portable block inputs, with only meaningful initial
structure. A “Turn into” action must retain the original root ID and create no
additional root. Use simple registered slash conversion for type/prop changes;
use `convertLeafToContainer(reactPanel, blockId, input)` when initial children are
required. It ignores missing/populated sources, transfers the seeded children,
and uses a temporary subtree inside one history batch. It is not rollback on
failure and does not copy all factory root fields: read its current contract.

Use panel/block managers, not `editor.document` or detached snapshot mutations.
Insert directly with a valid `{ parentId }` destination where the API supports it;
do not create a temporary root merely to move a first child inside a container.
Use `defaultWritingBlockFactory.createEmptyBlock()` instead of hardcoding paragraph.
Expand the destination, insert and set portable selection in one history batch;
restore occurrence-local DOM focus after rendering through the existing helpers.

Preserve child IDs/order, snapshot and clipboard behavior, and one-step undo for
compound actions. Before removing a structural shell, decide whether authored
children are deleted or relocated; implement the intended policy explicitly.
Do not enlarge the core API for one presentation-only need.

## Validate the changed behavior

For implementation work, read and execute
`.agents/skills/rivto-performance-testing/SKILL.md`. Follow repository worker rules:
behavior checks use 12 workers, failed cases rerun with one worker before diagnosis;
performance measurements run serially on production builds at default size and
`?repeat=200`. Report architectural review separately from test results.

Choose focused model/operation checks for factories, props, structural permission,
stable identities, undo, snapshot/clipboard preservation, shell deletion and slash
conversion. Use browser tests for the behavior that depends on actual layout:

- Main demo integration in both Page and Edgeless, plus modal occurrences when
  supported; verify the preview serves the current build.
- Native pointer/keyboard access to empty writing controls, reactive summaries,
  collapse/expand and footer controls without a top-only gap or overlap.
- Real handle reachability: move from outside through exposed gutters and into
  the handle with small steps; check the hit target, not only opacity. Root and
  first-child handles must remain independently reachable.
- DnD between ordinary blocks, lanes and neighboring containers, including one-pixel
  sweeps across shared boundaries, overflow clipping and scrolling. Assert both
  feedback placement and persisted parent/order; test rejected destinations too.
- Width/resize persistence and cancellation, filters, menus, ordering and modal
  expansion when those features are in scope. A redesign preserves existing
  features unless the user explicitly chooses a smaller scope.
- Exact screenshot pixels on blank selected surfaces, including colored children
  and priority TODOs; one subtree outline; unchanged text color; restored backgrounds
  after deselection. Wait for transitions or finish animations for screenshot
  comparisons instead of loosening the expected color.

Useful current integration suites include `e2e/container-layout.spec.ts`,
`e2e/selection.spec.ts`, `e2e/block-row-hover.spec.ts`, `e2e/kanban.spec.ts`,
`e2e/bento.spec.ts`, `e2e/columns.spec.ts` and `e2e/todo-storage.spec.ts`.
Update obsolete selectors to the real layout contract without weakening behavioral
assertions to match an accidental implementation. Passing focused suites does not
establish that the full container redesign or host migration is complete.

Documentation-only skill edits do not require browser or performance runs: check
paths, contracts, formatting and skill validation, and verify no runtime changes.
