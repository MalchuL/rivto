# `useBlockEditing`

`useBlockEditing` composes the data and DOM hooks for one text block. It returns:

- `block` and `operations` from `useBlockNode`;
- typed native-property commands under `operations`;
- DOM `attributes` for text editing;
- `preventTextEditingAttributes` for nested interactive controls.

The important rule is:

> Spread `attributes` on the single DOM element that owns editing or selection.

Do not spread them on every element in a renderer.

## Text blocks

Text editing uses the composite hook:

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

Use node state and a structural anchor for blocks such as Counter:

```tsx
interface CounterProps {
  count: number;
}

function CounterBlock({ blockId }: { blockId: string }) {
  const editing = useBlockNode<CounterProps>(blockId);
  const attributes = useBlockSelectionAnchor(blockId);
  const editorView = useEditorView();
  const count = editing.block?.props.count ?? 0;

  return (
    <div {...attributes} className="counter-selection-region">
      <button
        type="button"
        onClick={(event) => {
          if (event.defaultPrevented) return;
          const current = editorView.blocks.getBlockNode(blockId)?.props as CounterProps | undefined;
          editing.operations.setProp("count", (current?.count ?? 0) + 1);
        }}
      >
        Count: {count}
      </button>
    </div>
  );
}
```

Put `attributes` on the region from which whole-block pointer selection should
begin. A plain click on its non-interactive space selects the complete block;
dragging may extend that selection. Using an outer block-level `<div>` lets
empty space around the compact button select the block while the button keeps
its own action. Putting the attributes directly on an interactive control keeps
that control's native click instead of turning the click into block selection.

Both hooks provide `data-block-selection-anchor`. With `useBlockSelectionAnchor`, the
anchor element is not contenteditable, so the selection plugin interprets its
gesture structurally. Interactive descendants must ignore a click whose event
is already `defaultPrevented`, because a completed selection drag claims the
browser's follow-up click. Plain clicks on those descendants are not claimed.

Do not put a structural selection anchor around a nested text editor. The outer
anchor could claim pointer gestures intended for `data-block-content`.

## Blocks with text and controls

Keep each interaction on its owning element:

```tsx
interface SliderProps {
  value: number;
}

function SliderBlock({ blockId }: { blockId: string }) {
  const editing = useBlockNode<SliderProps>(blockId);
  const value = editing.block?.props.value ?? 50;

  return (
    <div className="slider-block">
      <MarkdownContent blockId={blockId} />
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => {
          editing.operations.setProp("value", Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}
```

`MarkdownContent` owns and spreads its text-editing attributes internally. The
outer Slider renderer uses `useBlockNode` for typed property access, without
allocating another text controller or spreading a second set of attributes.

## Returned state and methods

```ts
const editing = useBlockEditing<MyProps>(blockId);
```

- `editing.block` is the reactive snapshot for the current render.
- `editorView.blocks.getBlockNode(blockId)?.content` reads the latest document content, including
  updates since the last render. It returns `undefined` for an unknown or deleted
  block and an empty string for an existing block without text. It does not read
  uncommitted DOM edits.
- `editing.block?.listProps.collapsed` reads the extension-owned collapse state.
- `editing.operations` contains commands such as `remove`, `setType`, `indent`,
  and `outdent`.
- `editorView.blocks.getBlockNode(blockId)?.props` reads the latest complete property object, or undefined after deletion.
- `editorView.blocks.getBlockNode(blockId)?.props[key]` reads one latest property, or undefined after deletion/removal.
- `editing.operations.setProps(patch)` validates and patches several supplied keys.
- `editing.operations.setProp(key, value)` validates one key.
- `editing.operations.setProp(key, undefined)` removes that key when its block schema
  permits it.

Read the manager again inside event handlers instead of incrementing a value
captured by an older render:

```tsx
const editorView = useEditorView();
const current = editorView.blocks.getBlockNode(blockId)?.props as CounterProps | undefined;
editing.operations.setProp("count", (current?.count ?? 0) + 1);
```

Property validation is performed by the registered core block definition.
Invalid updates throw and do not change the document.

## Choosing the smallest hook

- `useBlockOperations<Props>(blockId)` returns stable commands without subscribing.
  Use it when the block snapshot already arrives through component props.
- `useBlockNode<Props>(blockId)` returns a reactive node and those commands.
  Read `block.props` during render; the generic describes the registered schema
  and does not perform runtime validation of reads.
- `useBlockTextEditing(blockId, block?.content)` binds one editable without
  another document subscription. It synchronizes even when the DOM element is
  replaced while content stays unchanged.
- `useBlockSelectionAnchor(blockId)` supplies structural selection attributes
  and pending focus restoration without creating a text controller.
- `usePreventTextEditing()` supplies nested control attributes independently;
  temporary pointer listeners are released when the consumer unmounts.

Property methods now live only under `operations`. The old `textEdit` option and
imperative getters on `useBlockEditing` were removed. Read current manager state
inside callbacks when an update since the last render must be preserved.
