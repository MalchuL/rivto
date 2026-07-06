# Глава 01. Полный путь Undo через runtime

Теперь проследим одно нажатие кнопки от React до Yjs.

## 1. Публичный контракт команды

В `src/editor/editor/types.ts` команда объявлена в `BuiltInCommandMap`:

```ts
"history.undo": CommandSpec;
"history.redo": CommandSpec;
```

У `CommandSpec` без type arguments payload равен `undefined`, а result —
`void`. Поэтому TypeScript разрешает:

```ts
editor.commands.execute("history.undo");
```

и запрещает лишний payload:

```ts
editor.commands.execute("history.undo", { something: true });
```

TypeScript помогает разработчику, но сам алгоритм Undo от этого типа не
зависит. Типы исчезают после сборки.

## 2. React-кнопка

В `src/editor/react/rivto-editor.tsx` toolbar содержит:

```tsx
<button onClick={() => editor.commands.execute("history.undo")}>
  ↶
</button>
```

React adapter не вызывает `editor.history.undo()` напрямую. Это важно:

- runtime inspector видит выполненную command;
- все UI entry points используют один публичный путь;
- plugin или другой renderer может вызвать ту же command;
- позже policy вокруг команды можно изменить в одном месте.

## 3. Регистрация handler

Во время создания `EditorRuntime` вызывается
`registerBuiltInCommands()`. Там есть:

```ts
this.commands.register("history.undo", () => this.history.undo());
this.commands.register("history.redo", () => this.history.redo());
```

`CommandRegistry` хранит handler в `Map` по строковому имени.

Когда UI вызывает `execute`, registry:

1. находит handler;
2. выбрасывает ошибку, если имени нет;
3. вызывает handler;
4. только после успешного вызова записывает `lastExecuted`;
5. уведомляет subscribers команды.

То есть `lastExecuted = "history.undo"` означает, что handler завершился без
синхронной ошибки.

## 4. Что такое `editor.history`

В constructor runtime:

```ts
this.history = new HistoryManager(this.document);
```

Но `history-manager.ts` не содержит второго класса:

```ts
export { UndoManager as HistoryManager } from "./undo-manager";
```

Это alias при export. Причина проста:

- старый внутренний класс уже назывался `UndoManager`;
- публичная ответственность runtime называется `history`;
- дублировать одну и ту же реализацию двумя классами не нужно.

Следовательно:

```text
HistoryManager и UndoManager — не два вложенных manager.
Это два имени одной реализации на разных смысловых границах.
```

## 5. Constructor UndoManager

Ключевая строка:

```ts
this.manager = document.crdt.createUndoManager(
  document.undoScopes,
  [document.origin],
);
```

Она передаёт adapter два ответа:

1. `undoScopes`: какие shared structures отслеживать;
2. `[document.origin]`: операции с каким origin считать локальными.

`UndoManager` больше не знает, используется Yjs, Automerge или другой CRDT.
Он зависит только от интерфейса `CRDTUndoManager`.

## 6. Adapter-neutral контракт

В `src/store/crdt-doc/types/undo.ts`:

```ts
interface CRDTUndoManager {
  undo(): void;
  redo(): void;
  clear(): void;
  stopCapturing(): void;
  destroy(): void;
}
```

Это маленький порт между editor layer и конкретным CRDT adapter.

Editor layer знает только смысл методов. Он не импортирует `Y.UndoManager` и
не может пользоваться Yjs-specific API.

## 7. Реализация в Yjs adapter

`YjsDoc.createUndoManager()` сначала разворачивает wrapper scopes в native Yjs
types, затем создаёт:

```ts
const manager = new Y.UndoManager(nativeScopes, {
  trackedOrigins: new Set(trackedOrigins),
});
```

После этого возвращается простой объект-адаптер:

```ts
{
  undo: () => manager.undo(),
  redo: () => manager.redo(),
  clear: () => manager.clear(),
  stopCapturing: () => manager.stopCapturing(),
  destroy: () => manager.destroy(),
}
```

Таким образом native Yjs остаётся внутри `src/store/crdt-doc/yjs-doc/**`.

## 8. Что происходит после `manager.undo()`

Yjs изменяет CRDT document. Изменение вызывает document update event.

Дальше работает обычный путь обновления view:

```text
Y.UndoManager.undo()
    ↓
Y.Doc изменился
    ↓
DocumentModelImpl subscription
    ↓
EditorRuntime.reconcileSelection()
    ↓
EditorRuntime.changed()
    ↓
revision увеличился
    ↓
React useSyncExternalStore получает новый snapshot
    ↓
renderer читает editor.document.document заново
```

Undo manager не вызывает React и не знает о компонентах.

## 9. Keyboard shortcut идёт тем же путём

`EditorRuntime.handleKeydown()` проверяет:

```ts
if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
  this.commands.execute(event.shiftKey ? "history.redo" : "history.undo");
}
```

Путь получается таким:

```text
DOM keydown
  → React EditableText
  → EventRouter.dispatch
  → built-in fallback handleKeydown
  → CommandRegistry history.undo/history.redo
  → HistoryManager
  → CRDT adapter
```

Если plugin event handler вернёт `true` раньше fallback, built-in shortcut не
выполнится. Это часть общей event routing policy, а не особенность history.

## 10. Undo не меняет selection напрямую

Команда `history.undo` не содержит:

```ts
this.selection.set(...)
```

Но после CRDT update runtime вызывает `reconcileSelection()`. Если Undo удалил
блок, на который ссылался selection, selection будет очищен как несовместимый.
Если блок сохранился, selection остаётся локальным текущим состоянием.

Это важное различие:

```text
история не восстанавливает старый selection;
runtime только не позволяет selection ссылаться на несуществующие данные.
```

## 11. Redo stack

После Undo обратная операция становится доступна через Redo. После Redo она
снова возвращается в undo-направление. Точное устройство двух stack принадлежит
Yjs.

Для Rivto важно только правило использования:

```ts
editor.commands.execute("history.undo");
editor.commands.execute("history.redo");
```

Не следует обращаться к native Yjs manager из renderer или plugin.

