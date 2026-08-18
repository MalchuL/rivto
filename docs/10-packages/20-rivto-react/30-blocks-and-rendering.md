# Blocks и rendering

## `blockExtension()` — основной путь

Одна registration атомарно связывает core definition, React renderer и optional slash conversion:

```tsx
import { z } from "zod";

interface CounterProps { count: number }

function CounterBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<CounterProps>(blockId, { textEdit: false });
  if (!editing.block) return null;
  return <div {...editing.attributes}>
    <button onClick={(event) => {
      if (event.defaultPrevented) return;
      editing.setProp("count", (editing.getProp("count") ?? 0) + 1);
    }}>Count: {editing.getProp("count") ?? 0}</button>
  </div>;
}

const counterExtension = blockExtension({
  definition: {
    type: "counter",
    title: "Counter",
    defaultProps: { count: 0 },
    propSchema: z.object({ count: z.number().int().nonnegative() }).strict(),
  },
  render: CounterBlock,
  slashCommand: { title: "Counter", group: "Turn into" },
});
```

### `blockExtension(registration)`

- **Аргументы:** `ReactBlockRegistration`.
- **Возвращает:** extension с ID `block.<type>`.
- **Исключения:** при setup — duplicate/invalid definition, renderer или slash ID; выполненные части откатываются.

### `ReactBlockRegistration` properties

- **`definition: BlockDefinition`:** type, title, defaults и optional Zod `propSchema` validation в core.
- **`render: BlockRenderer`:** component с `{ blockId: string }`.
- **`slashCommand?: ReactBlockSlashCommand`:** conversion menu item.
- **`separatesBlockElements?: boolean`:** root block разделяет edgeless cards.

## Text renderer

Для plain-text editing spread `useBlockEditing().attributes` ровно на один contenteditable owner. Не рендерите `block.content` как children этого же element: browser и React не должны одновременно владеть text node.

```tsx
function TextBlock({ blockId }: { blockId: string }) {
  const editing = useBlockEditing(blockId);
  return <div {...editing.attributes} aria-label="Block content" />;
}
```

Для Markdown используйте `MarkdownContent`. В idle state он показывает formatted preview, при focus — raw collaborative Markdown.

## Control и mixed blocks

`textEdit: false` возвращает structural selection anchor без contenteditable. Interactive controls учитывают `event.defaultPrevented`, потому что completed selection drag может claim последующий click.

Если renderer сочетает Markdown и controls, `MarkdownContent` уже владеет editing attributes. Не добавляйте второй editable owner вокруг него. Такой pattern используется Slider в `demo/src/blocks/custom-blocks.tsx`.

## Rendering pipeline

```text
Surface → BlockTree(root IDs) → wrappers → BlockView → renderer + descendants
```

`BlockView` устанавливает `data-block-id`, `data-block-type`, optional `data-block-selected`. DOM events и selection bridge зависят от этого contract.

## Unknown types

Persisted неизвестный type не удаляется. Registry использует `unknownBlockRenderer` или built-in `UnknownBlock`. Low-level `reactEditor.renderers.register(type, renderer)` нужен только когда core definition установлен отдельно.

## Wrappers

Wrappers добавляют handles, overlays, contexts или measurement, не заменяя recursion:

```tsx
const extension: ReactEditorExtension = {
  id: "comments",
  setup(reactEditor) {
    reactEditor.surfaces.registerBlockWrapper("block", CommentWrapper);
  },
};
```

Первый registered wrapper — outermost. Wrapper выводит `children` ровно один раз. `BlockElementRefProvider` получает настоящий `BlockView` без дополнительного layout DOM; этот pattern применён в demo block-ID extension.
