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
