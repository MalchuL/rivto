# Ordered block wrappers

Block wrappers are React decorators registered by functional plugins:

```tsx
const commentsPlugin = (): ReactEditorPlugin => ({
  id: "comments",
  setup: (reactEditor) => {
    reactEditor.surfaces.registerBlockWrapper("block", CommentWrapper);
  },
});

function CommentWrapper({ block, selected, children }: BlockWrapperProps) {
  return (
    <CommentBoundary blockId={block.id} selected={selected}>
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
      surface block shell
    )
  )
)
```

The first registered wrapper is outermost. A wrapper must render `children`
exactly once. Plugin cleanup removes its exact registration and preserves the
relative order of remaining wrappers.

The surface still owns the single `BlockView`, content renderer, controls, and
recursive descendants. Wrappers must not create another `BlockView` with the
same block ID.

## Observing the BlockView element

A decorator that needs the real block element can contribute a ref without
adding layout DOM:

```tsx
function MeasurementWrapper({ children }: BlockWrapperProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (element) measure(element);
  }, [element]);

  return (
    <BlockElementRefProvider elementRef={setElement}>
      {children}
    </BlockElementRefProvider>
  );
}
```

Multiple ref providers compose. Surface recursion resets the ref scope, so a
parent wrapper observes only its own `BlockView`, never nested child elements.
The page drag plugin uses this contract to attach dnd-kit to the existing row
and portal its handle without replacing the surface shell.
