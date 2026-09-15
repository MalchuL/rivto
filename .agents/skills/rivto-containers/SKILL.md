---
name: rivto-containers
description: Implement or review native layout-container blocks in the Rivto repository, including boards, lanes, grids, columns, tables, cells, nested content, collapse summaries, slash conversion, drag/drop, resizing, and structural deletion. Use for container work in packages/react-rivto-editor; do not use for ordinary leaf-only blocks.
---

# Rivto Containers

Build containers from Rivto's ordinary block hierarchy. Keep persistence and
mutations in the existing document/core layers, behavior in block views, and
presentation in React extensions. Do not create a parallel child store, custom
tree renderer, or container-specific drag system.

## Start from the current implementation

Patterns can evolve. Before changing code, trace the complete path and all
callers with `rg`; do not rely only on this guide.

Read these shared owners first:

- `packages/react-rivto-editor/src/blocks/block-tree.tsx` — recursive rendering,
  collapse visibility, slots, wrappers, and stable DOM shells.
- `packages/react-rivto-editor/src/hooks/blocks/use-block-editing.ts` — text and
  structural selection anchors.
- `packages/react-rivto-editor/src/views/container-view.ts` and
  `src/views/types.ts` — container keyboard and drop behavior.
- `packages/react-rivto-editor/src/views/ops/outline-ops.ts` — shared hierarchy
  operations and seeded in-place conversion.
- `packages/react-rivto-editor/src/managers/blocks/block-types.ts` — block
  registration and containment metadata.
- `packages/rivto-editor-core/src/managers/block-registry-manager/types.ts` —
  defaults, property schemas, and `allowedParents`.
- `packages/react-rivto-editor/styles.css` — shared block-tree geometry.

Then inspect the closest example end to end:

| Need | Primary example |
| --- | --- |
| Flat wrapping tiles and per-child resize props | `extensions/bento/` |
| Horizontal lanes containing ordinary cards | `extensions/kanban/` |
| Headerless equal-width lanes and safe shell removal | `extensions/columns/` |
| Multi-level fixed structure, row/column changes, synchronized widths | `extensions/table/` |

## Choose the container shape

Use the smallest shape that enforces the real invariant:

- A free container owns ordinary child blocks directly. Bento is the model.
- A fixed-shell container owns structural children such as lanes or rows. Those
  shells may own ordinary content or another structural level. Kanban, Columns,
  and Table are the models.
- A visual control around a single value is a leaf block, not a container. Follow
  Counter-style registration instead.

Every persisted node must be a native block with a stable ID. Children belong in
`EditorBlock.children`; layout-only relationships must not live in React state,
plugin data, or a second CRDT structure.

## Define the data contract

For each native type:

- Export one type constant and reuse it everywhere.
- Register a `title` for UI and accessibility.
- Put creation defaults in `defaultProps`; validate meaningful props with the
  existing Zod-backed `propSchema` facility.
- Add `allowedParents` to structural shell types when they are invalid elsewhere.
  It is enforced during insert, move, and load. Include `null` only if root
  placement is valid.
- Keep container and layout-shell `content` as `""` unless the node genuinely has
  an editable persisted title, such as a Kanban column.
- Provide an `EditorBlockInput` factory when creation needs children or caller
  parameters. Construct the full portable subtree there.
- Seed only meaningful structure. Do not add empty paragraph children merely to
  produce height or click targets.

Do not import Yjs in React. Persisted shape belongs in the document model only
when it introduces a new canonical invariant; ordinary containers need no new
document type.

## Register through one React extension

Return a `ReactEditorExtension` whose `setup` registers the complete feature:

- `runtime.blocks.register` for every native type, renderer, optional behavior
  view, and simple slash conversion.
- `runtime.surfaces.registerBlockSlot` for controls anchored to a block.
- `runtime.surfaces.registerBlockWrapper` for subtree-level presentation such as
  a modal, in both `"block"` and `"edgeless"` modes when applicable.
- `runtime.extensions.mount` for extension-local styles.

Let runtime registration own cleanup. When collecting explicit disposers, return
one cleanup that invokes them in reverse order. Export the public extension,
factory, constants, operations, and public prop types from `src/extensions.ts`
and `src/index.ts`; add the extension to a preset only when that preset is meant
to include the feature. Follow repository documentation rules: detailed
module-level JSDoc on every source file and semantic JSDoc on every function or
method, including `@param` and applicable `@returns` tags.

## Render content, never the subtree

`BlockTree` is the only recursive renderer. A container renderer supplies the
root content region; it must not map `block.children`, mount nested `BlockTree`
instances, duplicate drag targets, or manage collapse visibility.

For a contentless root or structural shell:

```tsx
const editing = useBlockEditing(blockId, { textEdit: false });
return <div {...editing.attributes}>{/* structural UI */}</div>;
```

Spread `editing.attributes` on the region representing the block so selection
and dragging retain a `data-block-selection-anchor`. Do not add
`contentEditable` to contentless roots.

For a collapsed root, derive the label and cheap statistics directly from the
reactive `editing.block` snapshot. Render only the name and useful counts or
dimensions. Do not add subscriptions, mirrored state, effects, or custom
rerendering for summaries.

Render the summary only while `block.listProps.collapsed === true`. Expanded
contentless roots should leave the structural anchor empty; the shared block-row
CSS overlays that row instead of reserving a blank line above children.

Editable structural titles use ordinary `useBlockEditing(blockId)` and persisted
`content`. Interactive nested controls use the hook's
`preventTextEditingAttributes` where needed.

## Declare behavior with block views

Extend `ContainerBlockView` instead of adding type switches to page keyboard or
drag extensions. It already:

- exposes a full-body empty-container drop target;
- inserts and focuses a host-provided default writing block on Enter when empty;
- falls through to `BaseBlockView` for ordinary outline behavior.

Set `dropAxis` to match direct-child layout:

- `"vertical"` for stacked children;
- `"horizontal"` for lanes or cells in a row;
- `"grid"` for wrapping tiles;
- `undefined` when sibling sorting is not meaningful.

Set `acceptsDropContainer = false` when the shell itself must not accept body
drops. Override semantic methods only for a demonstrated difference. Examples:

- Table cells override `onSplit` because Enter always inserts a nested writing
  block rather than splitting cell text.
- Columns shells override `onStructuralDelete` to relocate nested content before
  deletion.

Register containment metadata on definitions:

- `childOutline: "fixed"` prevents direct structural children from being
  indented into or outdented past siblings.
- `childOutline: "free"` permits ordinary nesting within the container.
- `outlineFloor: true` prevents Shift+Tab from lifting descendants past the
  owning lane or cell.

Containment metadata governs outline interactions. `allowedParents` governs
model validity. They solve different problems and fixed structures commonly
need both.

## Create and convert correctly

Insertion factories are also used by APIs, tests, and demo seed data. Slash
commands have an additional invariant: “Turn into” must preserve the current
block ID and create no sibling root.

- If conversion only changes the type and destination props, provide
  `slashCommand` in `runtime.blocks.register`; the manager uses
  `editor.blocks.setBlockType`.
- If conversion must attach initial children, register a manual slash command
  and call `convertLeafToContainer(runtime, blockId, factory())`.
- Make seeded conversion available only for leaf blocks. Converting a populated
  block to a fixed structure needs a separate, explicit content-placement policy.

`convertLeafToContainer` exists because `setBlockType` preserves identity but
cannot attach initial children, while restricted rows, cells, or lanes cannot be
created temporarily at the document root. It builds one valid temporary subtree,
changes the original root type, transfers the structural children, and removes
the temporary shell inside one undo transaction. Do not replace it with
insert-after behavior or remove-and-recreate using the same ID.

Do not enlarge the core conversion API for one extension. Reconsider a core
replace-with-subtree command only when multiple non-React consumers require the
same atomic operation.

## Mutate through managers

Use `runtime.blocks` and `runtime.editor.blocks`; never mutate detached snapshots
or call `editor.document` from a view or extension.

- Wrap multi-step user actions in `editor.batchUpdates` so undo sees one action.
- Use `runtime.createDefaultBlock()` rather than hardcoding `paragraph`.
- The insertion API creates siblings. When adding the first nested block or a
  restricted shell, insert through a valid portable subtree or insert a legal
  root and move it `"inside"` in the same batch.
- Expand affected ancestors before adding content that must become visible.
- Set portable selection in the transaction when possible; perform DOM focus
  after rendering with existing focus helpers or `requestAnimationFrame`.
- Preserve child IDs and order during layout changes.
- Before deleting a structural shell, explicitly relocate user-authored
  descendants if deletion should not mean data loss.
- Persist resize results as block props through existing setters. DOM/CSS custom
  properties may preview pointer movement, but commit one validated model update.

## Empty states and controls

An empty container must remain selectable and usable without fake children.

- Give the empty expanded root or lane a CSS minimum height.
- Scope that minimum height to the empty state; populated containers should wrap
  tightly around their real content unless the design explicitly requires a
  floor.
- If clicking an empty lane starts writing, expose a keyboard-accessible control
  (`role`, `tabIndex`, label, Enter/Space), then use its view's
  `insertFirstChild` behavior.
- Remove or hide the empty control after a child exists.
- Buttons need `type="button"`, accessible names, disabled states where relevant,
  and visible focus styles.

Use registered block slots for settings, add, collapse-adjacent, or expand
controls. If a control must participate inside the shared child layout, portal
only that control into `#block-children-${blockId}`; do not portal or remount the
block subtree. Use `BlockModal` for the existing native-dialog expansion pattern.

## Style against the shared DOM contract

Prefer extension-local mounted CSS for a new container. Change global
`styles.css` only for a rule that genuinely belongs to every block tree or when
maintaining an existing globally styled extension.

Use named constants for every HTML class referenced by JSX, selectors, or
`classList`, following the repository rule. Prefer stable attributes such as
`[data-block-type]`, direct-child selectors, and slot ownership attributes for
structural relationships.

Check these geometry rules:

- Reset `.page-block-children`'s default `margin-left: 24px` on layout roots and
  internal shells that should align with the container edge.
- Do not add top padding to compensate for the empty root row. The shared
  `:has(> .rivto-block-content-flow > [data-block-selection-anchor]:empty)` rule
  already overlays its 24px hit target.
- Keep top and bottom selection insets visually balanced.
- Clip the page-wide `.page-block-row::before` hover slab only below the layout
  root (for example `> .page-block-children .page-block-row::before`). A broad
  descendant selector also clips the root row and breaks its handle hover area.
- Treat full-height lateral hover as an invariant of every layout root. Its
  ordinary root row is only 24px tall, so add transparent left and right hit
  regions beside the rendered container body in the shared container selector.
  Keep the regions outside the container border so they reveal the direct root
  handle without covering nested content or controls, and let the surface clip
  their page-wide extent.
- Keep root drag handles visually hidden at rest like ordinary blocks. Expanded
  contentless roots may reveal only their direct handle on root hover and keep
  only that handle's small hitbox pointer-active while transparent, so entering
  or re-entering the handle can recover hover without a fast mouse movement.
- Keep descendant handles hover-only. When a root handle overlaps the first
  descendant, prefer a lane gutter that preserves the ordinary absolute
  `left-top` slot. Put the slot in row flow only when the layout genuinely needs
  it, and verify that an optional collapse toggle neither shifts sibling handles
  nor inserts control-width space before block content. Do not translate or
  raise the root handle to win the overlap.
- Anchor absolute insertion indicators to the intended lane or tile with a
  positioned child shell.
- Keep horizontal overflow on the layout owner, not the page.
- Style empty expanded roots separately from collapsed summaries. Existing
  containers distinguish them by the absence of `.page-block-children` and the
  presence of an empty summary anchor.
- Use pseudo-elements for purely visual dividers; inset their ends rather than
  adding persisted separator blocks.
- Respect `prefers-reduced-motion` when adding transitions.

Verify page and edgeless DOM because they share `BlockTree` but use different
wrappers and available width.

## Test the invariant, then the browser

Add one focused colocated Jest test for model and operation behavior. Cover the
parts that apply:

- factory shape and property validation;
- exact structural types and parent restrictions;
- stable IDs and child order across moves or resizing;
- one-step undo for compound actions;
- snapshot round trip and clipboard preservation;
- safe relocation before shell deletion;
- slash conversion retains the original ID.

Use Playwright only for browser/cross-layer behavior:

- actual slash-menu conversion changes the current root and does not add a root;
- collapse summary label and reactive statistics;
- expanded contentless roots have no top-only gap;
- empty state has a usable height and creates content on click/keyboard;
- populated lanes lose empty-state minimum height and wrap content;
- selection, drag/drop axis and acceptance, overflow, separators, resize handles,
  slots, or modal behavior;
- page and edgeless parity when the feature supports both.

For drag-handle regressions, test interaction rather than computed visibility
alone. Start outside the container, verify the root handle is transparent but
its hitbox is recoverable, enter the hitbox directly, then hover the body and
move to the handle in roughly one-pixel steps. At the body's vertical midpoint,
enter from both the left and right surface whitespace and require the root
handle to appear; checking only the 24px root-row Y coordinate misses the
full-height regression. Use `elementFromPoint` to prove the intended accessible
handle receives the pointer. Also verify the first descendant handle remains
separately reachable and its rectangle does not overlap the root handle. For
lane layouts, pair a collapsed block with a plain sibling and assert equal
handle X positions plus no control-width content offset. Build the demo and use
a fresh or isolated preview; `reuseExistingServer` can otherwise serve stale CSS
and produce a false result.

Run the narrowest relevant tests first, then React type checking, lint for touched
files, the affected build, and focused E2E. Check `git diff --check` and preserve
the dirty worktree; never rewrite unrelated changes.

## Reject these shortcuts

- Rendering children inside the extension renderer.
- Keeping child IDs or layout membership in component state.
- Manually forcing rerenders for counts available on the reactive block snapshot.
- Inserting a new container after the slash target.
- Creating blank paragraph children for spacing.
- Encoding structural policy only in CSS or only in drag checks.
- Making every container handle permanently visible to mask a broken hover path.
- Moving or stacking a root handle over a descendant instead of separating their
  owning slot geometry.
- Treating a coarse synthetic pointer jump or an opacity assertion as proof that
  a real mouse can reach the correct handle.
- Calling document-model internals from React.
- Adding container-specific keyboard or drag type switches to shared page code
  when a block view can express the behavior.
- Deleting structural shells without deciding what happens to authored content.
