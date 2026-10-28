# Block layout primitives

These components separate the block's DOM boundary, its main content, and
extension contributions. The registered layout determines where they appear.

- `BlockView` is the DOM boundary for the whole block. It supplies block identity
  and presentation attributes, background, border, rounded corners, and selection
  styling. It renders the supplied layout without selecting a renderer or
  traversing children.
- `BlockContent` renders the host component registered for the block's type,
  passing its `blockId`. If no registration or fallback exists, its content host
  remains empty. Its ref declares the owner's content bounds without an extra
  wrapper or recursive lookup. The memoized renderer boundary skips unchanged props while the
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

## Shared block interaction

Every block uses the same interaction model, independently of its type or parent
container. `BlockView` is the complete hierarchy boundary; `BlockRow` and
`BlockContent` declare the block's own primary content, and `BlockChildren`
declares its child layout. Their committed refs register occurrence-local bounds;
content renderers do not provide custom target-search functions.

The geometry resolver uses only those declared regions and canonical neighbors.
A placement edge cannot consume the middle third of the block's registered content
(or primary row when content is absent), even when children enlarge the shell or
a layout inherits a larger target-size token. Shell/item padding remains available
for sorting without adding any new hitbox DOM or presentation spacing. Missing
regions retain their declared shell geometry; unregistered anchors are never
searched for a descendant body. Virtualized, unmounted content is not measured.

`inside` and `between` are canonical destinations, not separate container
implementations or complete feedback descriptions. Body/background inside regions
outline their registered complete receiving shell. Boundaries retain their
shared/separate line at the selected depth, including an inside child-append
destination proposed by an indented edge or physical gap. Hit anchor, canonical
parent and feedback geometry are distinct: native discovery owns the hit, model
validation owns permission and neighbor identity, and feedback paints the resolved
region without discarding its line based on destination kind alone.
Exclusions, nested editor occurrences and rejection still bound discovery; a
rejected target does not redirect to an outer parent.

Layouts configure child order, flow, edge/gap/background declarations and control
placement. Concrete behaviors can reject semantic moves. Ordinary blocks, Kanban,
Bento, TODO storage and future layouts otherwise inherit this same model. Fix a
common geometry or feedback failure in Page instead of introducing another block-
or container-specific pointer algorithm.

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
they can compose `BlockItem` to supply placement geometry. Item-owned edge
registrations receive canonical neighbors when a real `parentId` is supplied,
and the owning layout declares physical gaps independently. A canonical child
list retains document order for those destinations to be meaningful; an arbitrary
display list does not imply a parent.

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
Both use the same canonical edge builder and inherit the list's placement policy.
Wrapping block-end edges expose ordinary sibling/child depth bands; inline grid
seams insert siblings. Terminal descendants inherit their item's trailing levels,
so nesting and outdenting do not require entering a card's content.
`dropGaps` enables physical free gaps independently; `dropBackground` declares append on unoccupied host space.

`BlockChildren.dropScope` separates the owner's outer boundary from its child-list
placement policy. The default `"local"` keeps sibling insertion across the whole
outer rim of a self-contained layout. `"outline"` retains the terminal child-append
band there; `DefaultBlockLayout` declares this mode for ordinary outlines. This is
independent of `dropPlacement`, which still controls nesting between children.
Body/inside declarations remain available under their own permission checks in
both modes. Scope is read from the existing registered child host, without type
checks, extra DOM, layout spacing, or a descendant search.

A shared sibling boundary keeps its declared strip while crossing into either
neighbor, ahead of inferred descendant endpoint padding. Neighbors captured as
moving roots do not reserve a stationary seam. Canonical neighbor IDs determine
this priority; the selected destination still undergoes live permission and move
validation once. Block-axis corner priority remains independent of this rule.

Linear lists with the default `"row"` continuation also extend their first/last
insertion boundaries through existing leading/trailing host space. This applies
to editor roots and container children alike, without adding layout space. Free
end space inserts at the list's level, with feedback fixed to its endpoint;
empty lists keep their declared inside action, and virtual holes remain inert. Explicit leading/trailing
areas declaring the same canonical boundary share the mounted endpoint's line,
including when sibling boundaries use separate feedback. Their hit bounds and
layout dimensions stay independent from the feedback anchor. Native background
hits inside an endpoint's declared inset retain ordinary outline depth choices.
An owned linear list using `"row"` continuation also resolves insertion on its
block's unoccupied padding and remaining extent along its flow, even when the
child host itself is shorter or narrower. Registered content keeps its inside action; nested blocks, exclusions
and numeric/disabled continuation retain their existing boundaries. A selected
shell edge still belongs to the shell's containing list, so child background
coverage cannot consume insertion between containers. A nearer explicit child
edge wins over a coincident ancestor rim; terminal outdent bands can still share
the ancestor's gap feedback. A real list-background gap also wins within its row's
inline span, so endpoint padding stays usable beneath an ancestor rim. A containing
perpendicular linear layout preserves the inner list's full background cross axis;
other exposed gutters retain ancestor sorting. The same rule applies to vertical
and horizontal inner lists, including logical start/end in RTL. Body/background append regions gain no priority.

Horizontal child hosts stretch an optional `BlockItem` and its existing block
together. The visual lane, selection shell and owner background therefore cover
the same available height without adding a spacer or a second block shell.

`dropGutterSize` controls how far item boundaries continue around all four item edges.
A finite nonnegative number is a distance in local CSS pixels, respecting viewport
scaling; zero disables continuation. `"row"` (the default) fills the host's available
cross axis. Beyond a numeric extent the declared background action remains eligible.
In numeric grid regions, left/right select inline edges with vertical feedback,
while top/bottom select block edges with horizontal feedback; block edges retain
corner priority. Native item edges and actual physical gaps stay enabled. Bento uses 32px so nearby
space on any side belongs to a tile boundary and farther board background appends tiles.
`targetSize` sets the inherited `--rivto-drop-target-size` in local CSS pixels for
linear and wrapping items. An explicit style token overrides this shorthand.
Use `dropPlacement="siblings"` only when boundaries intentionally retain their
list parent, such as structural columns. Ordinary container children retain
`outline`, including direct cards and tiles. Body-inside declarations are an
additional route to nesting, not a replacement for indented boundary placement.
Edge thickness never changes layout dimensions.

Rows with `controlsPlacement="inside"` size their control slot from the controls
actually rendered, using `--rivto-block-control-size` and `--rivto-slot-gap`.
In-flow host controls must use that control size. A branch adds its collapse
button and gap; a leaf keeps only its handle width without a reserved second
position. Collapsing a branch retains its toggle, while deleting the last child
removes it. Outline child-host indentation remains independent of control width.
Within an ordinary outline, a leaf row also accounts for its parent's inline
collapse width so the toggle cannot cancel the next text level. This moves the
row and handle together instead of adding an empty control position. Branch rows
already have their own toggle and need no compensation. The internal offset resets
at custom child hosts and autonomous editor roots, so direct container leaves keep
their natural control width. Collapse contributions expose `data-collapse-toggle`
so the shared layout can recognize their actual presence, including a standalone
toggle without a neighboring handle.

BlockNode declares inside insertion on its existing shell, including headers, text
and controls. Layouts declare background append independently. Override intentional
areas with BlockDropTarget, or exclude an existing subtree using BlockDropExclude
or BlockDropTarget.exclude. Control tags do not implicitly exclude drop targets. Resolution reads the
native hit, registered ancestors and logarithmically many local mounted gap anchors.
The nearest layout bounds body/background discovery. Declared ancestor sibling
rims remain reachable across nested layouts, so a child host cannot swallow the
outer insertion boundary. Indented inside bands retain their local layout behavior.
Anchor priority then edge rank and registration order choose the local winner. Source permission
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
Bento declares tile seams and appends on unoccupied board background. Empty and filtered
hosts use existing geometry without creating a spacer. Feedback uses the selected
region; ordinary row hover and handle presentation remain independent.
