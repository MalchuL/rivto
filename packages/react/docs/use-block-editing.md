# `useBlockEditing`

`useBlockEditing` is the renderer-facing hook for one block. It returns:

- `block` and `operations` from `useBlock`;
- typed native-property readers and writers;
- DOM `attributes` for either text editing or structural selection.

The important rule is:

> Spread `attributes` on the single DOM element that owns editing or selection.

Do not spread them on every element in a renderer.

## Text blocks

Text editing is the default:

```tsx
function TextBlock({ blockId }: { blockId: string }) {
  const editing = useBlockEditing(blockId);

  return (
    <div
      {...editing.attributes}
      className="text-block"
      aria-label="Block content"
    />
  );
}
```

Put the attributes on the actual editable `<div>`, not on its outer layout
wrapper. They provide:

- the contenteditable ref;
- `contentEditable="plaintext-only"`;
- input and IME composition handlers;
- `data-block-selection-anchor`, which permits a selection gesture to begin;
- `data-block-content`.

The hook writes the current block content into that element. Do not also render
`editing.block.content` as React children, because React and the browser would
then both try to own the same text node.

Properties such as `className`, ARIA attributes, and `spellCheck` can be placed
beside the spread. Do not replace the returned `ref`, `onInput`,
`onCompositionStart`, or `onCompositionEnd`; they perform synchronization.

## Contentless or control blocks

Disable text editing for blocks such as Counter:

```tsx
interface CounterProps {
  count: number;
}

function CounterBlock({ blockId }: { blockId: string }) {
  const editing = useBlockEditing<CounterProps>(
    blockId,
    { textEdit: false },
  );
  const count = editing.getProp("count") ?? 0;

  return (
    <div {...editing.attributes} className="counter-selection-region">
      <button
        type="button"
        onClick={(event) => {
          if (event.defaultPrevented) return;
          editing.setProp("count", (editing.getProp("count") ?? 0) + 1);
        }}
      >
        Count: {count}
      </button>
    </div>
  );
}
```

Put `attributes` on the region from which a pointer drag should begin. Using an
outer block-level `<div>` lets empty space around the compact button start
whole-block selection. Putting the attributes on the button limits the
selection anchor to the button's own rectangle.

Both modes provide `data-block-selection-anchor`. With `textEdit: false`, the
anchor element is not contenteditable, so the selection plugin interprets its
gesture structurally. Interactive descendants must ignore a click whose event
is already `defaultPrevented`, because a completed selection drag claims the
browser's follow-up click.

Do not put a structural selection anchor around a nested text editor. The outer
anchor could claim pointer gestures intended for `data-block-content`.

## Blocks with text and controls

Keep each interaction on its owning element:

```tsx
interface SliderProps {
  value: number;
}

function SliderBlock({ blockId }: { blockId: string }) {
  const editing = useBlockEditing<SliderProps>(blockId);
  const value = editing.getProp("value") ?? 50;

  return (
    <div className="slider-block">
      <MarkdownContent blockId={blockId} />
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => {
          editing.setProp("value", Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}
```

`MarkdownContent` owns and spreads its text-editing attributes internally. The
outer Slider renderer uses the hook for typed property access, but does not
spread a second set of attributes.

## Returned state and methods

```ts
const editing = useBlockEditing<MyProps>(blockId);
```

- `editing.block` is the reactive snapshot for the current render.
- `editing.block?.collapsed` reads the reactive top-level collapse state.
- `editing.operations` contains commands such as `remove`, `setType`, `indent`,
  and `outdent`.
- `editing.getProps()` reads the latest complete property object.
- `editing.getProp(key)` reads one latest property.
- `editing.setProps(patch)` validates and patches several supplied keys.
- `editing.setProp(key, value)` validates one key.
- `editing.setProp(key, undefined)` removes that key when its block schema
  permits it.

Use `getProp` again inside event handlers instead of incrementing a value
captured by an older render:

```tsx
editing.setProp("count", (editing.getProp("count") ?? 0) + 1);
```

Property validation is performed by the registered core block definition.
Invalid updates throw and do not change the document.
