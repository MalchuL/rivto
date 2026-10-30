---
name: rivto-blocks
description: Implement or review ordinary Rivto block types and renderers using shared Page primitives and editor behavior. Use for leaf renderers in packages/react-rivto-editor or host extensions; use rivto-containers when the block owns child layout.
---

# Rivto Blocks

A renderer owns content, while Page owns the block occurrence, row, child traversal,
selection frame and shared pointer/drop behavior. An ordinary block must work in
an outline, column, tile, cell or Edgeless card without learning its parent type.
Fix missing shared behavior in the primitive or interaction owner, rather than
adding a renderer-specific handler or a list of container exceptions.

## Read the current owning path

Paths below are relative to the repository root. Inspect the current implementation
and consumers; old `.page-block` examples and the former React BlockTree/DnD path
are not the current Page contract.

- `packages/rivto-page/AGENTS.md` and
  `packages/rivto-page/src/presentation/components/block-layout/README.md` — layout
  ownership and the shared block interaction contract.
- `packages/rivto-page/src/presentation/components/block-layout/` — BlockNode,
  BlockView, BlockRow, BlockContent, BlockChildren and occurrence-local region refs.
- `packages/rivto-page/src/editor/drag-and-drop/` and
  `packages/rivto-page/src/presentation/drag-and-drop/` — declared regions,
  geometry, native hit testing, destination validation and feedback.
- `packages/react-rivto-editor/src/managers/blocks/block-types-api.ts` and
  `types.ts` — definition, content renderer, optional layout/behavior and cleanup.
- `packages/react-rivto-editor/src/hooks/blocks/use-block.ts`,
  `use-block-editing.ts` and `use-block-selection-anchor.ts` — addressed snapshots,
  mutation commands, text ownership and structural selection anchors.
- `packages/react-rivto-editor/docs/styling.md` — host appearance and package CSS.

Use nearby complete examples: Markdown under `src/blocks/markdown/`, the native
separator under `src/extensions/built-ins/separator/`, default-writing registration
under `src/extensions/built-ins/page/default-writing-block/`, or Counter/Slider in
`demo/src/blocks/custom-blocks.tsx`. Read `rivto-containers` when the block arranges
children; a leaf renderer must not take over their layout.

## Preserve one canonical block occurrence

Page creates the existing structure through its registered layout:

```text
BlockView (.rivto-block[data-block-id][data-block-type])
├─ BlockRow (.rivto-block-row)
│  ├─ registered controls and slots
│  └─ BlockContent (.rivto-block-content)
│     └─ host renderer output
├─ BlockBody (optional body-slot contributions)
└─ BlockChildren (.rivto-block-children)
   └─ Page-owned child occurrences
```

Return renderer content only. Do not recreate BlockView, a row, recursive children,
handles, selection chrome or drop regions inside a content renderer. Do not keep a
parallel child-ID list in React state or props. A registered layout may compose
Page primitives differently, but the renderer remains the content owner and each
canonical child is rendered once.

The shared contract distinguishes the whole hierarchy shell from its own row and
content. Adding descendants must not enlarge an insertion edge over the middle of
the block's content. Content/row refs declare those bounds to Page; generic geometry
uses their registered ownership rather than searching for a convenient descendant.
Body/background inside regions outline their complete receiving shell, including
descendants. Boundary regions display their insertion line at the selected depth,
including an inside destination proposed by an indented edge or physical gap.
Destination kind alone cannot distinguish these gestures. A container or renderer
must not reinterpret that action to repair its own feedback.

Controls do not implicitly exclude drops. Use BlockDropExclude or an explicit
BlockDropTarget exclusion for intentional areas; registered descendants can remain
eligible inside an excluded ancestor. Permission remains in the source/receiving
behavior and commit path. Geometry does not grant a move, and rejection must not
fall through to a different parent.

## Use shared geometry and flexible content

Read the package theme and owning surface defaults instead of copying numeric
padding or handle widths from a screenshot. Shared geometry lives in Page CSS;
the host supplies theme parameters and concrete renderer appearance.

`--rivto-drop-target-size` controls inset insertion strips in local CSS pixels;
its fallback is **12px**. This changes hit geometry, not layout spacing. Actual
thickness is scaled with the viewport and limited by the block's own content so
its body remains available for inside drops. Without `BlockChildren.targetSize`,
the variable inherits from ancestors. `targetSize` sets that same variable locally;
an explicit variable in the host's `style` overrides the prop, and a region's
explicit `size` takes precedence over the variable. Do not add renderer-specific
drop calculations to tune this distance. Kanban, Bento and TODO storage currently
set `targetSize={16}`; ordinary outlines and Columns use the 12px fallback.

- Use the existing block-height, padding, indentation, control-size and slot-gap
  tokens. Renderer padding is internal decoration, not compensation for controls.
- Add no outer renderer margin or page-width assumption. Keep layout roots
  shrinkable with `min-width: 0` and, when appropriate, `max-width: 100%`.
- Use `box-sizing: border-box` where width combines with padding or borders.
  Prefer internal `gap` to vertical root margins that change measured row bounds.
- Keep structural selection anchors full-width so blank body space remains usable.
  Use a larger minimum height only for the actual control or empty-state UI.
- Do not clip the shared row/shell to conceal overflowing controls or indicators.
  Put scrolling/overflow on the component owning that content.
- Control width and child indentation are separate responsibilities. A leaf has
  no empty collapse control; outline layout must still preserve its text depth.
  Check both first-child insertion and final-child removal, not only collapse.

An ordinary block needs no container-specific drag code. Keep the visible body,
selection anchor and registered Page content aligned, and let shared geometry
handle its current placement. Do not seed blank paragraphs to create height.

## Choose one editing owner

For ordinary rich text, prefer the existing Markdown renderer. For custom plain
text, use `useBlockEditing(blockId)` and spread its attributes onto exactly one
contenteditable element. The `page-block-content` renderer hook remains available
for text styling; it is not the shared `.rivto-block-content` layout host.
Do not render persisted `block.content` as React children inside an editable owned
by the hook. Preserve its ref, input/composition handlers and selection lifecycle.
The hook reconciles commands, undo/redo and remote updates; IME composition owns
the DOM until it completes.

For contentless or control-only UI, compose `useBlockNode<Props>(blockId)` with
`useBlockSelectionAnchor(blockId)` and spread the anchor on the actual whole-body
region. Keep persisted content empty when the block has no text. Do not add hidden
editable text or a fake paragraph merely to obtain selection or dragging.

Give text and independent controls separate owners. Keep a nested rich editor on
its own editing path using the existing prevention attributes, rather than spreading
a second plain-text editing attribute set or wrapping that editor in a structural
selection anchor. Native buttons retain their pointer/keyboard behavior. Respect
`event.defaultPrevented` when an existing selection gesture claims an event; do not
introduce click IDs or blanket post-DnD click suppression.

Use semantic controls, accessible names, disabled states and visible focus styles.
Buttons need `type="button"`. A non-button keyboard control needs its appropriate
role, focusability and Enter/Space behavior. Icons should be hidden from accessibility
when decorative and should not steal the owning button's pointer target.

## Register and mutate through the current APIs

Register a complete definition and presentation through
`reactEditor.blockTypes.register({ definition, render, layout, behavior, slashCommand })`
in extension setup. A leaf ordinarily omits `layout` and inherits DefaultBlockLayout.
Use one stable native type constant, a human-readable title, validated props and
creation defaults. A factory is appropriate when creation needs fresh values.
The registration owns its definition and presentation; an already registered type
is a conflict, not a second place to supplement metadata.

Inspect the current behavior contract before adding constraints. Do not resurrect
removed fields such as `allowedParents` or old drag metadata. Real movement policy
belongs to the applicable behavior/core path; a custom renderer is not authorization.
Behavior instances must select their own types in `isAvailable` when provided.

Use ID-bound hook operations or the panel's block manager for document mutations.
Snapshots are detached/read-only. In callbacks, read current values through
`panel.blocks.getBlockNode(blockId)` instead of relying on an older render capture.
Keep compound changes in the existing history/batch boundary so one undo restores
the operation. Use the registered default writing-block factory when creating an
ordinary writing child instead of embedding a paragraph policy in a generic helper.

Keep resize/slider previews transient and commit validated props through managers.
Clean up listeners, previews and explicit registrations on unmount/destruction.
Return owned setup disposers and release them in reverse order. Borrowed nodes and
managers are not destroyed by content renderers. Export only public types/factories
with present consumers.

A simple slash conversion retains the source ID. Seeded conversions and preservation
of authored descendants belong to the container workflow. Add clipboard conversion
when a custom/contentless block needs meaningful portable text or structured formats;
do not replace the editor's canonical structured-copy behavior.

## Keep containment inside content

Put `content-visibility: auto` on renderer-owned content, never the shared shell,
row, content host, child host or controls. Those regions must remain measurable
for native input and placement. Apply containment separately to fields outside a
contained root, such as a TODO description.

Markdown editor, preview, links and code controls belong in one contained root;
containing overlapping layers separately can change stacking and block input.
Use an intrinsic-size fallback near normal field height and verify long-content
scroll restoration. CSS paint skipping does not mount virtualized blocks or make
unmounted text available to native find-in-page.

Use existing shadcn and lucide primitives according to the styling guide. Feature
CSS stays beside its owner and is imported through the package stylesheet. Define
repeated HTML classes once in their owning scope. Renderer-specific colors and
appearance stay in the host; structural Page geometry must work without demo CSS.

## Verify the shared contract

Read and execute `rivto-performance-testing` for runtime changes. Choose model tests
for defaults, validation, factories and transactions; use browser input for layout,
selection, controls, actual DnD and Page/Edgeless integration.

A shared interaction change needs an ordinary-block case as well as its affected
containers. Cover both a leaf and a populated block, own-row body versus placement
edges, committed parent/order and undo. Verify the visible frame matches the actual
destination. For indentation, compare content coordinates at multiple levels under
default geometry and a meaningful override; shell bounds alone can hide cancelled
text indentation. Include RTL when logical geometry changes.

Do not weaken a failing body assertion into a block-edge assertion or repair one
container's renderer when the same primitive fails elsewhere. New renderers should
inherit the verified behavior without another drag handler, pointer callback,
container-type check or duplicate selection tree.
