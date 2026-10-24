# Block layout primitives

These components separate the block's DOM boundary, its main content, and
extension contributions. The registered layout determines where they appear.

- `BlockView` is the DOM boundary for the whole block. It supplies block identity
  and presentation attributes, background, border, rounded corners, and selection
  styling. It renders the supplied layout without selecting a renderer or
  traversing children.
- `BlockContent` renders the host component registered for the block's type,
  passing its `blockId`. If no registration or fallback exists, its content host
  remains empty. The memoized renderer boundary skips unchanged props while the
  renderer's own state, context, and subscriptions can still trigger updates.
- `BlockBody` renders matching extension contributions registered at the `body`
  slot position. It returns nothing when no contribution matches. It does not
  render the main content or child blocks, and remains independent of the child
  subtree's collapse state.

The standard layout places them as follows:

```text
BlockView
├─ BlockRow
│  └─ BlockContent   Main host renderer, surrounded by the row's slots
├─ BlockBody        Additional body slot contributions
└─ BlockChildren    Child blocks
```

`BlockView` is created by the shared rendering pipeline. `DefaultBlockLayout`
supplies the row, body, and child group inside it. Custom layouts can rearrange or
omit those primitives.

`BlockItem` is an optional outer placement wrapper around an already-rendered
block, including its `BlockView`. It provides a place for item dimensions and
host controls, and keeps sibling list counters from counting the same block twice.
It does not create slots or render the block again.

`BlockChildren.controlsPlacement` sets the default left-top slot placement for
its children and their descendants. Omission inherits the nearest explicit child
layout, or `outside` at the editor root. A nested child layout can reset it to
`outside`. `BlockItem.controlsPlacement` remains an override for only that item's
own row; omission inherits the child layout and does not change descendant rows.
These contexts add no DOM boundaries
and do not change renderer selection or child traversal.

`BlockList` iterates an ordered list of block IDs and renders one keyed `BlockNode`
per ID. It is shared by the host-selected display list and child lists. It adds no
outer list element. Optional `item` components wrap each already-rendered node;
they can compose `BlockItem` to supply placement geometry. Optional `gap`
components receive neighboring IDs and are rendered only when a real `parentId`
is supplied. A canonical child list must retain document order for those gap
destinations to be meaningful; an arbitrary display list does not imply a parent.

The distinction is scope: `BlockList` renders the collection, while `BlockItem`
wraps a single member. Neither is the block's main content renderer.

`BlockNode` is the internal React component in `block-node.tsx` that connects one
block ID to its presentation. It observes the node snapshot and selection, resolves
the registered layout or `DefaultBlockLayout`, and provides context for slots and
children. It composes registered wrappers around one `BlockView` containing that
layout. A missing node renders nothing. Unlike `BlockView`, it owns React
subscriptions; it borrows the editor node and does not destroy it. This component
is distinct from the `BlockEditorNode` object providing snapshots and commands.

```text
BlockList                         No outer list DOM element
├─ optional item component
│  └─ BlockItem                   Optional placement element
│     └─ BlockNode
│        └─ BlockView
│           └─ block layout
└─ ...remaining nodes and optional gaps
```

`BlockChildren` supplies the current block's child IDs and parent ID to `BlockList`
and handles the child host and collapse behavior. `BlockItem` needs either the
placement context supplied to a list's `item` component or an explicit `block`
snapshot. It is therefore tied to a block ID, even though its `children` may contain
arbitrary JSX; it is not a generic wrapper for temporary UI without block identity.

`useBlockLayoutState` reads `BlockLayoutContext` provided by `BlockNode`: the
current block snapshot, borrowed node API, selection, slot entries, and child-host
DOM ID. Row, body, and content primitives use it internally. Child traversal uses
the separate `BlockChildrenContext`, whose value stays unchanged during selection
and slot-only updates. Both hooks require their corresponding provider.

`BlockChildren.hoverBoundary` defines row-hover scope independently of drag
installation and block type. The default is true: a custom child host bounds
hover to its local layout, and adjacent horizontal/grid items retain their own
native rectangles. `DefaultBlockLayout` uses false so an ordinary indented
outline inherits its available horizontal area. Page's view-owned `BlockRowHover`
marks only the resolved row with `data-block-row-hover`; it adds no hit-test
pseudo-elements and does not clip controls. Native row/control targets take
precedence, nested editor occurrences stay independent, and root replacement
releases listeners and hover feedback. Header and exposed gutter ownership does
not imply that the complete parent body highlights its handle. Keyboard focus
feedback is independent of pointer hover.

Layout primitives register their mounted elements with the editor's region
registry. Row, body, slot and child-host ownership no longer requires a direct
DOM relationship to the shell: neutral JSX wrappers may separate them. Keep one
primary row and one canonical child host per block. The registry is addressed by
block identity within an editor occurrence; refs release registrations on unmount,
and the controller releases remaining references on destruction. Standalone
BlockView still needs no editor dependency.

`BlockRow slots="manual"` renders only supplied JSX. Compose `BlockSlot` with a
`position` to place an owner-bound contribution explicitly, including in a
separate wrapper. `BlockSlot` accepts native style/class attributes, so a perimeter
slot may use `style={{ position: "static" }}` when placed in flow. Avoid mounting
the same position manually and automatically. `BlockBody` remains the convenient
body-contribution primitive. Moving contributions does not change their owner,
predicates or registration lifetime.

`BlockChildren.dropPlacement` defaults to `outline`: each physical gap declares
separate horizontal sibling and child-append bands. Terminal subtrees additionally
expose their ancestor insertion bands. Choose `siblings` to keep a list's gaps at
its own parent. This is independent of `dropAxis`, which describes actual flow.
Linear lists generate item-owned regions; grid items compose BlockDropWrapper.
`dropGaps` enables physical free gaps independently; `dropBackground` declares append on unoccupied host space.

BlockNode declares inside insertion on its existing shell, including headers, text
and controls. Layouts declare background append independently. Override intentional
areas with BlockDropTarget, or exclude an existing subtree using BlockDropExclude
or BlockDropTarget.exclude. Control tags do not implicitly exclude drop targets. Resolution reads the
native hit, registered ancestors and logarithmically many local mounted gap anchors.
The nearest layout bounds discovery; anchor priority then edge rank and registration
order choose its winner. Source permission
is applied to that winner; rejection does not search another structural level.
Commit validates the destination again through host commands and transactions.

Feedback stays on the selected physical region when moving roots are excluded
from its canonical neighbors. Filtering removes an item's standard regions with
its content; hidden neighbors still remain in the destination. Virtual spacers
are inert. Root projections read their actual parents instead of treating their
visible roots as a synthetic sibling list. The empty-view receiving parent is
explicitly supplied with BlockEditor.emptyDropParentId.

`BlockDropWrapper.axis` defaults to `grid` (four inset edges). `vertical` enables
block edges and `horizontal` enables inline edges. All variants retain the existing
child subtree and canonical placement. `targetSize` and --rivto-drop-target-size
change only hit geometry; native padding, gap and indentation continue to own layout.
No declaration inserts a strip or contributes minimum height. Explicit exclusions
stop ancestor fallback while preserving matching descendant regions and ordinary
control events. A deeper exclusion bounds those descendant regions in turn.
Physical gap search requires monotone flow; grids require aligned row-major ordering.
Bento disables gaps and appends on unoccupied board background. Empty and filtered
hosts use existing geometry without creating a spacer. Feedback uses the selected
region; ordinary row hover and handle presentation remain independent.
