# Ordered block wrappers

Block wrappers are React decorators registered by functional extensions:

```tsx
const commentsExtension = (): ReactEditorExtension => ({
  id: "comments",
  setup: (reactEditor) => {
    reactEditor.surfaces.registerBlockWrapper("block", CommentWrapper);
  },
});

function CommentWrapper({ block, children }: BlockWrapperProps) {
  return (
    <CommentBoundary blockId={block.id}>
      {children}
    </CommentBoundary>
  );
}
```

Each mode may have any number of wrappers. Registration order defines nesting:

```text
register A
register B
register C

A(
  B(
    C(
      shared block shell
    )
  )
)
```

The first registered wrapper is outermost. A wrapper must render `children`
exactly once. Extension cleanup removes its exact registration and preserves the
relative order of remaining wrappers.

Page owns the single `BlockNode`, content renderer, controls, and recursive
descendants for every surface. Wrappers must not create another `BlockNode` with
the same block ID.

Selection presentation belongs to the shared shell, so decorators do not
receive an `isSelected` prop. A decorator that truly needs current selection
behavior can resolve it explicitly with `useBlockSelection(block.id)`.

## Block controls and geometry

Controls that belong to a block use `surfaces.registerBlockSlot`. Page supplies
one occurrence-local slot and its canonical block context; the component does
not need a ref provider or a second structural shell. Registered layouts use
`BlockRow`, `BlockContent`, `BlockBody`, and `BlockChildren` to place that content.
The same registrations render inside writing pages and Edgeless block cards.

A component that must measure its own rendered control can retain a normal React
ref and release its observer when unmounted. Structural hit testing belongs to
Page's attached controller, which resolves the block DOM through its occurrence
root. Nested editors have separate roots, so their blocks cannot enter the outer
editor's input chain. The pointer drag extension uses that shared attachment and
Page's handle marker; it does not attach a second drag sensor to every row.
