# Глава 03. Как portable Block превращается в DOM

## 1. Сначала выбирается outer renderer

`RivtoEditor` читает current mode:

```ts
const mode = editor.mode.get();
```

И выбирает strategy:

```tsx
mode === "block"
  ? <PageRenderer {...rendererProps} />
  : <CanvasRenderer {...rendererProps} />
```

Default strategies:

```text
block mode     BlockDOMRenderer
edgeless mode  EdgelessCanvasRenderer
```

Host может заменить их через props, не меняя DocumentModel.

## 2. Один data tree, разные layouts

### BlockDOMRenderer

Root blocks идут в normal DOM flow. Children recursively находятся внутри
parent `.rv-children`.

### EdgelessCanvasRenderer

React читает first-class `elements`. Element типа `block` содержит ordered
`props.startBlockId` / `props.endBlockId` и рендерит включительный диапазон
root blocks между ними как одну positioned card; frame и
z-index берутся из element envelope. Visual elements и links рисуются отдельно.

Block mode получает `Block[]`, а edgeless mode проецирует blocks через
`DocumentElement[]`. Сами blocks остаются одним источником content/hierarchy.

## 3. React key связывает renders по ID

```tsx
blocks.map((block) => (
  <BlockView key={block.id} block={block} ... />
))
```

`key` помогает React сопоставить старый и новый child между renders.

Хотя detached block object новый, stable `block.id` показывает, что это тот же
domain block. React может сохранить component-local state/ref, пока ID остаётся.

Не используйте array index как key: move block тогда ошибочно переносил бы
local component state между разными domain blocks.

## 4. DOM marker также использует ID

```tsx
data-rivto-block={block.id}
```

Этот marker нужен для:

- selection mapping;
- `editor.focus(blockId)`;
- block event context;
- tests;
- поиска active DOM host.

React key не появляется в DOM, поэтому отдельный data attribute необходим.

## 5. `BlockView` отделяет layout от content

`BlockView` решает:

- normal или canvas class/style;
- selected state;
- side menu;
- drag/drop/resize interactions;
- child recursion;
- slash popup.

Само semantic content делегируется `BlockContent`.

## 6. Связь persisted type с definition

```ts
const definition = editor.blocks.get(block.type);
```

Document хранит только строку `type`. Runtime-local `BlockRegistry` хранит
function/components/schema metadata.

```text
persisted Block.type "callout"
               ↓ lookup
BlockRegistry definition "callout"
               ↓
title, content kind, prop schema, renderer
```

Это и есть главная точка связи data model и extensible presentation.

## 7. Если definition отсутствует

```tsx
<div className="rv-unknown">
  Unknown block type: {block.type}
</div>
```

Renderer не падает и не меняет model. Unknown data остаются доступными для
snapshot и последующего plugin restoration.

## 8. Default content renderer

Definition сообщает:

```ts
content: "inline" | "none"
```

Built-in `BlockContent` сейчас имеет special presentation для divider,
image/file и generic editable content для writing blocks.

Для list types добавляется visual prefix. Text редактируется `EditableText`,
который получает `block.content` и editor command API.

## 9. Custom block renderer является обёрткой

Registry resolve:

```ts
const Renderer = editor.blocks.getRenderer(
  block.type,
  editor.mode.get(),
);
```

Custom component получает:

```ts
{
  block,
  editor,
  content,
}
```

`content` — default presentation, уже созданная Rivto. Callout renderer может
обернуть её:

```tsx
<aside className="callout">{content}</aside>
```

Так сохраняются built-in editing, commands и selection behavior.

## 10. Shared и mode-specific renderer

Definition может иметь одну function:

```ts
render: CalloutRenderer
```

Она используется в обоих modes.

Или map:

```ts
render: {
  block: BlockCallout,
  edgeless: CanvasCallout,
}
```

`BlockRegistry.getRenderer(type, mode)` выбирает current entry.

Renderer map также участвует в availability при создании: отсутствие entry
для mode означает, что block type в этом mode создавать нельзя.

## 11. Definition не хранится в DocumentModel

Почему нельзя записать renderer function вместе с block:

- function не сериализуется в JSON snapshot;
- remote client не должен исполнять присланный JavaScript;
- разные applications могут показывать type по-разному;
- plugin lifecycle local для runtime;
- document должен пережить отсутствие plugin.

Persisted schema и runtime implementation соединяются только через stable type
string.

## 12. Props как data для renderer

`block.props` — portable configuration конкретного block:

```ts
{
  tone: "warning",
  icon: "⚠"
}
```

Definition `defaultProps` и `propSchema` определяют правила при mutation.
Renderer только читает уже materialized props.

Изменение props:

```ts
editor.commands.execute("block.prop.set", {
  id: block.id,
  key: "tone",
  value: "warning",
});
```

После model update новый detached block приносит новое prop value в renderer.

## 13. ContentEditable имеет особую синхронизацию

Большинство JSX можно декларативно пересоздать из props. Focused
`contentEditable` нельзя безусловно переписывать: browser caret потеряется.

`EditableText` сравнивает actual DOM text с `block.content`:

- equal после local typing → DOM не трогать;
- mismatch после remote/programmatic update → обновить DOM;
- not focused → безопасно показать Markdown preview HTML.

Это локальная адаптация imperative browser state. Source of truth всё равно
DocumentModel.

## 14. Links render отдельно от blocks

Edgeless renderer читает `editor.getLinks()`, находит endpoint layouts и
рисует `<line>`.

Link renderer — projection relation data. Он не меняет links во время render.
Создание/удаление идёт commands `link.create` и `link.remove`.

## 15. UI contributions тоже влияют на render без document fields

Toolbar и side menu спрашивают `editor.ui.get(...)`. Contributions находятся
в runtime registry, не в block model.

Итоговый DOM является композицией двух видов state:

```text
DocumentModel data: blocks, props, content, layout, links
Runtime metadata: definitions, UI contributions, mode, selection, slash state
```

Revision/subscriptions делают обе части observable для React.

## 16. Render должен оставаться pure насколько возможно

Во время component function хорошо:

- читать detached values;
- вычислять JSX;
- выбирать definition;
- фильтровать UI metadata.

Не следует во время render:

- выполнять mutation command;
- подписываться вручную;
- менять CRDT;
- вызывать focus;
- добавлять window listener.

Side effects принадлежат event handlers или effects после commit.

## 17. Почему React может render несколько раз

Render не равен mutation. React может вызвать component function повторно,
прервать render или не commit его. Если render только читает values, это
безопасно.

Если бы component менял model во время render, повторный render создал бы
повторные blocks/operations.

## 18. Полная render resolution схема

```text
Block portable value
  │ id, type, content, props, children, layout
  ↓
outer mode strategy
  │ block flow или canvas
  ↓
BlockView
  │ layout/interactions/tree
  ↓
BlockRegistry.get(block.type)
  │ definition существует?
  ├── нет → Unknown block placeholder
  └── да
       ↓
  default BlockContent
       ↓
  optional mode-specific custom renderer wrapper
       ↓
  React DOM commit
```
