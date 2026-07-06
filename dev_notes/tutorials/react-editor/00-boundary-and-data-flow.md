# Глава 00. Граница React и EditorRuntime

## 1. Почему runtime не является React state

Collaborative editor должен использоваться не только React component:

- commands вызываются plugins;
- provider применяет remote updates;
- persistence читает snapshot;
- tests работают без DOM;
- в будущем другой renderer может использовать тот же runtime.

Поэтому core state находится в framework-independent `EditorRuntime`, а React
подписывается на него.

```text
React component       зависит от EditorRuntime
EditorRuntime         НЕ зависит от React
DocumentModel         НЕ зависит от React
CRDT adapter          НЕ зависит от React
```

## 2. Public component

Основная binding:

```tsx
<RivtoEditor
  editor={editor}
  defaultBlockType="paragraph"
/>
```

Props:

### `editor`

Long-lived `EditorRuntime`, созданный host application.

### `defaultBlockType`

Registered type для generic actions: Add block, Enter и plain text paste.
Binding не угадывает product default самостоятельно.

### `className`

Дополнительный CSS class root элемента.

### `renderers`

Optional replacements для page/block presentation и edgeless presentation.

В type renderer key пока называется `page`, хотя runtime mode называется
`block`. Это имя prop strategy, а не поддерживаемый alias mode: в command
`mode.set` допустимы только `block` и `edgeless`.

## 3. Верхний DOM root

Binding возвращает:

```tsx
<div
  ref={root}
  className={`rivto ${className}`}
  data-rivto-editor
>
  ...
</div>
```

Root нужен для:

- ограничения DOM selection текущим editor instance;
- поиска editable blocks;
- делегированных copy/paste events;
- встроенных CSS selectors;
- `editor.focus()` через `data-rivto-editor`.

Если на странице два editors, root boundary не даёт selection одного принять
DOM nodes другого.

## 4. Data flow при обычном вводе

Пользователь печатает `A` внутри `contentEditable`.

```text
1. Browser сам меняет DOM text
2. React onInput читает element.innerText
3. renderer вызывает command text.set
4. command handler вызывает DocumentModelImpl.setBlockText
5. model выполняет CRDT transaction с local origin
6. CRDT document публикует update
7. EditorRuntime увеличивает revision
8. useSyncExternalStore просит React rerender
9. renderer читает новый detached block.content
10. layout effect сверяет DOM и model
```

Критически важно: browser меняет DOM до model. Поэтому editable component на
короткий момент имеет DOM value новее, чем render props.

## 5. Data flow при toolbar action

Пользователь нажимает Add block:

```text
React onClick
  → commands.execute("block.insert")
  → runtime validates payload и mode availability
  → DocumentModel inserts CRDT block
  → runtime revision
  → React получает новый blocks snapshot
  → renderer создаёт BlockView
  → editor.focus(newId) после microtask находит committed DOM
```

React не делает `setBlocks([...blocks, newBlock])`. Источник истины — document.

## 6. Data flow при keyboard event

`EditableText.onKeyDown` строит normalized runtime event:

```ts
const handled = editor.events.dispatch({
  type: "keydown",
  blockId: block.id,
  key: event.key,
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  payload: {
    defaultBlockType,
    empty: block.content === "",
  },
});
```

Если router вернул `true`, React вызывает `event.preventDefault()`.

Разделение обязанностей:

```text
React            извлекает browser data и может preventDefault
EventRouter      выбирает policy handler
CommandRegistry  выполняет action/mutation
DocumentModel    меняет collaborative data
```

## 7. Data flow при remote update

Здесь нет DOM event:

```text
provider
  → CRDTDoc применяет remote update
  → document subscription
  → runtime.changed()
  → revision
  → React rerender
  → EditableText замечает, что focused DOM text отличается от block.content
  → DOM синхронизируется с model
```

Именно поэтому renderer не может считать DOM единственным источником истины.

## 8. Detached blocks

Binding каждый render читает:

```ts
const blocks = editor.document.document;
```

Это detached portable values, а не живые Y.Map/Y.Text. React может безопасно
читать props и строить JSX, но изменение объекта `block` не изменит document.

Mutation делается command:

```ts
editor.commands.execute("block.prop.set", ...);
```

## 9. Local presentation state

Не всё должно быть collaborative.

Binding хранит:

```ts
const [zoom, setZoom] = useState(1);
```

Zoom — настройка текущего view. Другой collaborator может иметь другой zoom,
поэтому это обычный React state.

А mode и selection находятся в runtime managers, потому что их должны видеть
разные renderer components и plugins в рамках одной local editor session.

## 10. Выбор renderer strategy

```ts
const PageRenderer = renderers?.page ?? BlockDOMRenderer;
const CanvasRenderer = renderers?.edgeless ?? EdgelessCanvasRenderer;
```

Затем:

```tsx
{mode === "block"
  ? <PageRenderer {...rendererProps} />
  : <CanvasRenderer {...rendererProps} />}
```

Оба получают одни detached blocks и один runtime. Смена mode не создаёт второй
document.

## 11. Shared renderer props

`EditorRendererProps` содержит:

- `editor`;
- root `blocks`;
- `defaultBlockType`;
- slash state;
- selected canvas object;
- setter canvas selection;
- zoom.

Custom strategy может изменить layout DOM, но mutation должна оставаться в
runtime command path.

## 12. Главный архитектурный тест

Для любого UI behavior спросите:

> Если завтра React renderer заменить другим adapter, сможет ли runtime policy
> остаться прежней?

Если да, граница выбрана хорошо. Если command validation или plugin policy
живёт только внутри JSX handler, её, вероятно, нужно опустить в runtime.

