# Kanban, Bento, Columns, and Table: reimplementation reference

## Status and scope

The user rejected the current container rendering/placement result and intends to
reimplement these four containers. This document records the current code and
behavior so that useful functionality is not lost during that work. It is an
inventory, **not approval of the current implementation or a specification for
its replacement**.

The previous [default-rendering experiment](container-default-rendering.md) is
superseded as a design direction. Its test results describe that experiment's
assertions; they do not establish that its UI or architecture was correct.
The precise replacement design and visual behavior have not yet been agreed.
No container code was removed, reverted, or reimplemented while writing this
reference. TODO storage is outside this reimplementation request.

## Current document representation

All four use ordinary persisted blocks with stable IDs, ordered children,
`content`, `props`, and `listProps.collapsed`. There is no separate persisted
card, lane, tile, row, or column collection alongside the block hierarchy.

| Container | Current hierarchy                                                        | Persisted container-specific values                                                             |
| --------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Kanban    | `kanban` → `kanban-column` → ordinary blocks/subtrees                    | Column title is its `content`; a card has no special native type.                               |
| Bento     | `bento` → ordinary blocks/subtrees                                       | Preferred width is `props.bentoWidth` on the direct child block, not on a separate tile record. |
| Columns   | `columns` → `columns-column` → ordinary blocks/subtrees                  | Board `props.showDividers`, boolean, defaults to true.                                          |
| Table     | `table` → `table-row` → `table-cell` → optional ordinary blocks/subtrees | Cell text is its `content`; `props.tableColumnWidth` is stored separately on each cell.         |

Factories create empty `content` on structural nodes except Kanban column titles.
Conversion from an existing writing block can retain its original text even when
the container renderer does not display it. Do not infer that every persisted
container has empty text merely from the factory defaults.

**Policy is not schema enforcement:** the current React behavior classes restrict
interactive moves and outline operations. Their registrations do not declare
`allowedParents`. The core table test explicitly moves a cell directly under a
table through the core API. The replacement must decide where to enforce its
structural invariants; do not assume that arbitrary loaded/core-created data
already satisfies the intended visual hierarchy. Backward compatibility and
schema migration are not required by the repository unless separately requested.

## Kanban

Source directory: [kanban](../packages/react-rivto-editor/src/extensions/containers/kanban/).

- `createKanbanBlockInput()` creates a contentless board with three empty columns:
  **To do**, **In progress**, **Done**. It does not seed placeholder cards.
- The board arranges columns horizontally with horizontal scrolling. Each column
  has an editable title, a count of its direct cards, and an add-card control.
- Add-column appends a `kanban-column` titled **New column**, expands the board,
  and focuses the title after rendering. The updates are grouped for undo.
- Add-card uses the editor's default writing-block factory, inserts directly into
  the column, sets a caret selection, and focuses the new block after rendering.
- Add-column/add-card controls are local DOM portals into child hosts. Add-card
  explicitly keeps its button last after block updates. Collapsed hosts hide the
  corresponding controls. Queries start from the owning occurrence because a
  synced view or modal can render the same model ID more than once.
- The collapsed board summary shows column count and the sum of direct card
  counts, not a recursive descendant count.
- `KanbanBehavior` rejects indent/outdent of direct column shells. Its move policy
  accepts only `kanban-column` roots as board children.
- `KanbanColumnBehavior` keeps column shells inside Kanban boards and rejects
  outdenting direct cards past the column through outline commands. Cards can
  still nest and move through independently permitted pointer operations,
  including between columns and back to the page.
- The board has an expand button and a shared `BlockModal` wrapper in page and
  edgeless modes.

Current layout composition is in `kanban-layout.tsx`: a horizontal `BlockChildren`
with `HorizontalDropGap` at board level and a vertical list inside each column.
The rejected experiment removed ordinary-card padding, borders, shadows, custom
handle styling/positioning, and the separate card gap. That visual result is not
an accepted requirement for the replacement.

## Bento

Source directory: [bento](../packages/react-rivto-editor/src/extensions/containers/bento/).

- `createBentoBlockInput()` creates an empty `bento` root. Direct children are
  actual document blocks, including containers; there is no `bento-tile` type.
- The layout wraps width-aware tiles into rows. `BentoTileItem` currently composes
  Page's `BlockDropWrapper`, with the actual block rendered once inside it.
  Resize controls belong to the placement wrapper.
- Missing/nonfinite width reads as **280 CSS px**. Valid numeric values clamp to
  **160–960 CSS px**. The value persists on the child as `bentoWidth`.
- Left and right resize edges preview width without committing each pointer move.
  The controller freezes sibling placement during the gesture, handles viewport
  scale, and commits the width on a successful release.
- Escape, blur, pointer cancellation, lost capture, replacement, and component
  detach release gesture resources and restore temporary styles. Escape must
  cancel resizing before it can dismiss the containing modal.
- Keyboard resize uses Left/Right with **10 px** steps, or **50 px** with Shift;
  direction depends on the chosen edge. Commands read the latest model width.
- `BentoBehavior` rejects direct-child Tab indent/outdent. Pointer moves have
  separate policy and may reorder tiles, move them out, or nest them into another
  block. These are distinct operations, not equivalent meanings of an axis.
- The collapsed summary counts direct tiles. Bento has an expand button and
  `BlockModal` wrappers for both surfaces.

Files to preserve as references: `bento-resize-controller.ts`, its tests,
`bento-constants.ts`, `bento.tsx`, and `bento.css`. Grid placement between tiles
and ordinary writing inside a tile are separate design decisions.

## Columns

Source directory: [columns](../packages/react-rivto-editor/src/extensions/containers/columns/).

- `createColumnsBlockInput(count = 2, writingBlock?)` creates headerless,
  equal-width lanes. Factory counts must be integers from **1 through 6**;
  invalid values throw. An optional writing-block input is cloned into each lane.
- Board `showDividers` has a registered boolean schema and defaults to true.
  Dividers visually span the tallest lane; their presence is a board preference,
  not persisted separator blocks.
- `setColumnsCount` returns false for a missing/wrong-type board or nonfinite
  count; otherwise it rounds and clamps to 1–6. It expands the board and adds or
  removes shells in a history batch.
- Reducing the count first relocates contents of removed lanes to the last
  retained lane. IDs and nested subtrees survive.
- `relocateColumnContents` also handles structural deletion: if no lanes survive,
  it moves contents after the board before the shells are removed. This special
  preservation policy currently belongs to Columns, not all container deletion.
- Empty lanes expose a keyboard-accessible click/Enter/Space writing control.
  Writing starts through the default writing-block factory. Populated lanes omit
  the empty row so its minimum height does not remain above their contents.
- Board behavior rejects indent/outdent of direct lane shells and only accepts
  `columns-column` roots in interactive moves. Lane behavior constrains shell
  parent type and rejects outline outdent past the lane. Ordinary nested writing
  retains its own behavior.
- The right-side settings control changes count and divider visibility. Unlike
  Kanban/Bento/Table, this extension does not register a `BlockModal` wrapper.

Current composition is in `columns-layout.tsx`; board placement uses horizontal
gaps, while lanes render vertical `BlockChildren` and an explicit empty drop row.
Do not lose empty-lane interaction or content relocation when replacing the JSX.

## Table

Source directory: [table](../packages/react-rivto-editor/src/extensions/containers/table/).

- `createTableBlockInput(rows = 3, columns = 3, width = 180)` builds a rectangular
  hierarchy of empty editable cells. Dimensions must be positive integers;
  the implementation does not impose an upper dimension limit.
- Width reads default to **180 CSS px** and clamp finite numeric values to
  **80–1200 CSS px**. `tableColumnWidth` lives on each cell.
- `insertTableRow` inserts after a referenced row, using the maximum existing
  cell count and widths read from existing cells at each column index.
- `insertTableColumn` inserts after a referenced cell's column index across all
  rows. It expands the table and rows and groups the operation for undo. Its
  fallback for a shorter row is that row's last cell or empty child list.
- `setTableColumnWidth` updates every existing cell at a column index through one
  grouped block update. There is no separate persisted column-width array.
- Rectangle creation and coordinated column commands do not imply that all
  arbitrary row/cell moves preserve a rectangle. The implementation tolerates
  missing cells in several width/index operations. Reconsider this explicitly.
- A cell contains editable text and can also own ordinary child blocks. Enter
  always appends a nested writing block rather than splitting the cell's text;
  Shift+Enter retains native handling in the current binding.
- Table and row behaviors reject indent/outdent of their structural children.
  Their move policy limits table children to rows and row children to cells;
  cells must remain under rows for those interactive move paths. Cells reject
  outline outdent of direct children past the cell.
- Hover/focus controls add rows at row boundaries and columns at cell boundaries.
  Accessible resize separators support pointer and 10/50-pixel keyboard steps.
- `TableResizeController` previews all mounted cells in the active column and
  commits once on release. A changed source column or membership cancels the
  write. Escape/blur/cancel/detach release capture, styles, and listeners.
- Table has an expand button and `BlockModal` wrappers on both surfaces. Horizontal
  overflow belongs to the table, not the page.

Current composition uses `TableLayout`, `TableRowLayout`, and width-owning
`TableCellItem`; cells themselves use the default block layout. In the rejected
experiment, removing the structural cell's own control positioning made its drag
handle unreachable in the clipped table. This is evidence to retain during the
redesign, not a mandate to keep that particular CSS solution.

## Shared implementation dependencies

- Concrete schemas, renderers, controls, CSS, and `canMove`/outline policy currently
  live in React's `extensions/containers/`. Source public exports are in
  [index.ts](../packages/react-rivto-editor/src/index.ts) and
  [extensions.ts](../packages/react-rivto-editor/src/extensions.ts).
- Page owns the current `BlockView`, `BlockNode`, `BlockList`, `BlockChildren`, row,
  body/slot composition, addressed subscriptions, collapse, selection, and drag
  feedback. See its [layout contract](../packages/rivto-page/src/presentation/components/block-layout/README.md).
- Shared drop resolution currently combines explicit targets/wrapper boundaries
  with `BlockOutlineDropTargets`. The last experiment routes every vertical
  container background into `listGap`. This generalization is part of the
  rejected result and must be reconsidered, not silently assumed correct.
- `ContainerBlockBehavior` supplies empty-container Enter and default-writing
  insertion, including expansion, model selection, and deferred DOM focus.
  Whether that default makes sense on every structural shell needs review.
- [convertLeafToContainer](../packages/react-rivto-editor/src/extensions/containers/convert-leaf-to-container.ts)
  is used by Kanban/Columns/Table slash conversions. It keeps the original ID
  and text, uses a temporary subtree, transfers children, and removes the
  temporary root in one history batch. It skips missing/populated blocks. Only
  destination type and children are transferred from the template; batching
  does not promise rollback if a delegated operation throws. Bento uses the
  ordinary registered slash conversion for its empty container.
- [BlockModal](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx)
  owns expanded subtree presentation; an embedded panel has occurrence-local
  DOM interaction even when it shares document state and history.
- Width gesture owners borrow narrow block operations. Their mounted controls
  own attachment and cancellation; they must not destroy the borrowed panel.

## Existing evidence and reimplementation checklist

Treat existing tests as a searchable description of assumptions, not automatic
acceptance criteria for a new design.

| Area                                                            | Existing references                                                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factories, conversion, identity, undo, width/prop serialization | Each container's colocated `*.test.ts`; Columns tests include divider history/snapshot/clipboard and deletion relocation.                                                         |
| Resize lifecycle and cancellation                               | Bento/Table resize controller unit tests; `e2e/bento.spec.ts`, `e2e/table-resize.spec.ts`.                                                                                        |
| UI controls, empty states, syncing, expansion                   | `e2e/kanban.spec.ts`, `e2e/columns.spec.ts`, `e2e/container-summaries.spec.ts`.                                                                                                   |
| Nesting and structural interaction                              | `e2e/parent-outline.spec.ts`, `e2e/nested-containers.spec.ts`, `e2e/page-container-pointer.spec.ts`, `e2e/page-drag-container-boundary.spec.ts`, `e2e/bento-drag-target.spec.ts`. |
| Rejected experiment's assumptions                               | `e2e/container-outline.spec.ts` and [experiment report](container-default-rendering.md). Rewrite/remove assertions that encode a rejected behavior.                               |

Before implementing replacements, define each container's accepted DOM/layout,
its structural versus ordinary children, and the actual meaning of pointer
placement. Decide separately about row-center nesting, sibling gaps, container
rims, empty body drops, grid wrapping, clipping, and drag-out. Sharing a renderer
alone does not answer these questions.

For the replacement, exercise page and edgeless modes, nested containers, collapse,
modal occurrences where applicable, keyboard editing, selection/copy/paste,
undo/redo, deletion/content preservation, and accessible controls. Check small
and large documents with real pointer/keyboard input and default virtualization.
Keep structural identity and permission checks independent of visual geometry.

The previous run reported eight baseline browser failures in empty Columns
highlight assertions, Kanban modal lane drag, and the synced Kanban selector.
Those are historical observations, not checks rerun for this documentation task.
This document does not claim that the current implementation is ready or correct.
