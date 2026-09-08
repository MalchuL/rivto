# Глава 01. Модель выделения внутри Rivto

В прошлой главе browser selection состоял из DOM-узлов. Rivto не может хранить
такие узлы как состояние редактора: React может заменить узел, другой renderer
может вообще не использовать тот же DOM, а DOM нельзя сериализовать.

Поэтому Rivto переводит browser selection в переносимую форму.

## 1. Что значит portable selection

Portable означает: значение не зависит от конкретного DOM-узла.

Вместо:

```ts
{ node: someTextNode, offset: 3 }
```

Rivto хранит:

```ts
{ blockId: "stable-block-id", offset: 3 }
```

`blockId` принадлежит данным документа и остаётся стабильным после React
rerender. `offset` отсчитывается от начала текстового содержимого блока.

## 2. Где живут типы

Откройте `src/editor/editor/types.ts`. Там определены `EditorPosition` и три
варианта `EditorSelection`.

```ts
interface EditorPosition {
  blockId: string;
  offset: number;
}
```

Позиция ничего не говорит о выделении. Это одна точка внутри одного блока.

## 3. TextSelection

```ts
interface TextSelection {
  type: "text";
  anchor: EditorPosition;
  head: EditorPosition;
}
```

Поле `type` называется discriminant. Благодаря ему TypeScript понимает, какие
остальные поля доступны:

```ts
const selection = editor.selection.get();

if (selection?.type === "text") {
  selection.anchor; // TypeScript знает, что поле существует
  selection.head;
}
```

### Пример обычного caret

```text
Alpha|
```

```ts
{
  type: "text",
  anchor: { blockId: "A", offset: 5 },
  head: { blockId: "A", offset: 5 },
}
```

Anchor и head совпадают, поэтому selection collapsed.

### Пример выделения внутри блока

```text
Al[ph]a
```

```ts
{
  type: "text",
  anchor: { blockId: "A", offset: 2 },
  head: { blockId: "A", offset: 4 },
}
```

### Пример между блоками

```text
A: Al[pha
B: Bet]a
```

```ts
{
  type: "text",
  anchor: { blockId: "A", offset: 2 },
  head: { blockId: "B", offset: 3 },
}
```

### То же выделение в обратном направлении

```ts
{
  type: "text",
  anchor: { blockId: "B", offset: 3 },
  head: { blockId: "A", offset: 2 },
}
```

Rivto не переставляет anchor и head. Направление является частью состояния.

## 4. BlockSelection

TextSelection означает часть текста. Иногда пользователь хочет выбрать блоки
как структурные объекты: удалить три блока, скопировать их типы и props или
переместить.

```ts
interface BlockSelection {
  type: "block";
  blockIds: string[];
  anchorBlockId: string;
  focusBlockId: string;
}
```

Тут есть две разные идеи.

### blockIds

Это выбранные блоки в видимом порядке документа.

```ts
blockIds: ["A", "B", "C"]
```

Порядок всегда сверху вниз, даже если пользователь начал с C и пошёл вверх.

### anchorBlockId и focusBlockId

Они хранят направление жеста:

```ts
{
  type: "block",
  blockIds: ["A", "B", "C"],
  anchorBlockId: "C",
  focusBlockId: "A",
}
```

Зачем одновременно хранить оба вида информации:

- clipboard нужен стабильный порядок A, B, C;
- Shift+Arrow должен знать, что активный конец сейчас A;
- UI должен уметь продолжить выделение от первоначального C.

## 5. Selection в edgeless mode

Page и edgeless используют один `BlockSelection`. Он может содержать root или
nested blocks и не меняется при переключении mode. Если canvas-команда должна
двигать карточку, React layer отдельно вычисляет owning root выбранного блока.

Важно различать:

```text
type: "text"    редактируем текст внутри canvas-карточки
type: "block"   выбраны целые root или nested blocks
```

## 6. Почему selection не хранится в DocumentModel

DocumentModel синхронизируется через CRDT. Selection туда не входит.

Причины:

1. Два пользователя могут выделять разные места одного документа.
2. Один пользователь может смотреть block mode, другой — edgeless mode.
3. Caret меняется очень часто; синхронизировать каждое движение дорого.
4. После перезагрузки старое выделение обычно не нужно.

Selection — локальное состояние одной сессии редактора.

## 7. SelectionManager

Откройте `src/editor/managers/selection-manager.ts`.

Менеджер хранит:

```ts
private value: EditorSelection | null = null;
```

`null` означает, что у runtime нет активного selection.

### get()

`get()` возвращает копию.

Почему нельзя вернуть внутренний объект напрямую:

```ts
const selection = editor.selection.get();
selection.blockIds.push("hacked");
```

Если бы вернулась внутренняя ссылка, состояние изменилось бы без команды,
валидации и уведомления React. Поэтому позиции и массивы копируются.

### set()

`set()` также копирует входное значение и вызывает всех listeners.

Менеджер не проверяет существование block ID. Он маленький и отвечает только за
хранение. Проверка находится в EditorRuntime.

### clear()

`clear()` устанавливает `null`. Если значение уже `null`, уведомления нет: UI и
так показывает правильное состояние.

### subscribe()

React и runtime подписываются на изменения:

```ts
const unsubscribe = editor.selection.subscribe(() => {
  // selection изменился
});
```

Возвращённую функцию нужно вызвать при cleanup.

## 8. Почему публичный код использует команды

Приложение не должно вызывать `SelectionManager.set()` напрямую. Оно выполняет:

```ts
editor.commands.execute("selection.set", { selection });
editor.commands.execute("selection.clear");
```

Путь выглядит так:

```text
renderer/plugin/application
        │
        ▼
CommandRegistry
        │
        ▼
EditorRuntime.setSelection()
        │ проверка
        ▼
SelectionManager.set()
        │ уведомление
        ▼
React rerender
```

Команда нужна не ради лишнего слоя. В runtime находится общая проверка для
React, plugins и внешнего приложения.

## 9. Проверка TextSelection

`EditorRuntime.setSelection()` проверяет anchor и head отдельно.

Для каждой позиции `validatePosition()`:

1. Рекурсивно ищет блок по ID.
2. Бросает ошибку, если блока нет.
3. Проверяет, что offset — целое число.
4. Проверяет `offset >= 0`.
5. Проверяет `offset <= block.content.length`.

Почему `<=`, а не `<`: offset после последнего символа является валидным
caret.

```text
Alpha|
offset = 5, length = 5
```

Runtime не сортирует anchor/head после проверки.

## 10. Проверка BlockSelection

Runtime выполняет следующие шаги:

1. `blockIds` не должен быть пустым.
2. Каждый ID должен существовать.
3. Anchor должен находиться среди выбранных ID.
4. Focus должен находиться среди выбранных ID.
5. Массив превращается в `Set`, поэтому дубликаты исчезают.
6. Runtime обходит document tree сверху вниз, включая вложенные children.
7. В новый массив добавляются только выбранные IDs.

Например, вход:

```ts
blockIds: ["C", "A", "C"]
```

при документе A, B, C станет:

```ts
blockIds: ["A", "C"]
```

Anchor и focus при этом сохраняются.

## 11. Проверка BlockSelection

Runtime требует непустой массив, существование всех блоков и присутствие
anchor/focus среди выбранных IDs. Проверка одинакова в обоих mode.

## 12. Что происходит при удалении блока

Runtime подписан на document updates:

```ts
this.document.subscribe(() => {
  this.reconcileSelection();
  this.changed();
});
```

`reconcileSelection()` собирает все ID текущего selection. Если хотя бы одного
блока больше нет, selection полностью очищается.

Это работает и для локального удаления, и для remote CRDT update. Без cleanup
clipboard или toolbar могли бы обратиться к несуществующему блоку.

## 13. Что происходит при смене mode

Selection не очищается и не конвертируется. Оба renderer показывают тот же
document, поэтому TextSelection и BlockSelection сохраняют IDs и endpoints.

## 14. Важное текущее ограничение

При первоначальном `selection.set` text offsets проверяются. Но
`reconcileSelection()` после remote text update проверяет только существование
IDs и совместимость mode.

Если collaborator сильно укоротил текст, сохранённый offset временно может быть
больше новой длины. DOM restoration безопасно прижимает такую позицию к концу
текста, но manager сам значение не переписывает.

Это нужно помнить при изменении remote-selection поведения.

## 15. Какой блок считается активным для toolbar

В `react/rivto-editor.tsx` active block выбирается так:

```text
TextSelection       anchor.blockId
BlockSelection      focusBlockId
```

Почему для block selection используется focus: это активный конец, который
пользователь только что перемещал.

## 16. Итог главы

Теперь вы должны видеть три слоя:

```text
types               описывают возможные формы
EditorRuntime       проверяет IDs, offsets и порядок
SelectionManager    хранит detached локальное значение и уведомляет listeners
```

В следующей главе мы разберём самый сложный путь: как мышь и browser selection
превращаются в этот runtime value и обратно.

Продолжение: [как работает выделение текста](./02-text-selection.md).
