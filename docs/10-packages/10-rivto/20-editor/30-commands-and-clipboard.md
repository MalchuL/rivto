# Commands, batching и clipboard bridge

`CommandRegistry` остаётся integration boundary для динамических extension/app commands. Встроенные document, block, element, selection, history и clipboard операции вызываются через typed managers.

## Command lifecycle

```ts
const registration = editor.commands.register("app.publish", (payload) => {
  return publish(payload);
});

const result = editor.commands.execute("app.publish", { target: "preview" });
registration.dispose();
```

`RegisteredCommand` владеет только своей registration: `dispose()` повторно безопасен и не удалит позднюю replacement registration. `removeCommand(name)` удаляет по имени без ownership check.

## `history.batchUpdates(operation)`

- **Аргументы:** synchronous `operation: () => Result`.
- **Возвращает:** exact `Result` callback.
- **Исключения:** исходное исключение callback, document transaction или history boundary.

Outermost batch создаёт одну CRDT transaction и закрывает undo capture до/после. Nested calls используют уже активный batch.

```ts
editor.history.batchUpdates(() => {
  const first = editor.blocks.insertBlock({ type: "paragraph" });
  const second = editor.blocks.insertBlock({ type: "paragraph" }, first);
  editor.blocks.indentBlock(second);
});

editor.history.undo(); // Отменяет весь batch одним шагом.
```

Это batching, а не rollback. Если callback выбросил исключение после CRDT writes, writes сохраняются, но `finally` корректно уменьшает `batchDepth` и закрывает capture group.

`history.batchUpdatesWithoutHistory(operation)` использует ту же transaction boundary, но помечает её origin так, чтобы изменения не попадали в local undo history.

## Typed built-ins

- `editor.load(snapshot)` загружает supplied snapshot sections и очищает history.
- `editor.blocks` и `editor.elements` выполняют document mutations.
- `editor.selection.set/delete/clear` управляет local selection.
- `editor.history.undo/redo` управляет local history.
- `editor.clipboard.copy/copyText/cut/paste` работает с `ClipboardBundle` без string payload adapters.

```ts
editor.clipboard.paste({
  text: "Первый\nВторой",
  defaultBlockType: "paragraph",
  placement: { parentId: null, afterId: null, preserveNewlines: true },
});
```

## Источники ошибок command registry

- empty или duplicate name при registration;
- unknown name при execution;
- handler exception;
- listener exception после successful handler.

Если handler выбросил исключение, `CommandRegistry.lastExecuted` не обновляется и command-executed notification не отправляется.
