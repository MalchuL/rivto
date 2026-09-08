# Commands, batching и clipboard bridge

`EditorRuntime` использует string command registry как integration boundary. Typed convenience methods и managers регистрируют/исполняют те же commands, а host может добавить собственные.

## Command lifecycle

```ts
const registration = editor.register("app.publish", (payload) => {
  return publish(payload);
});

const result = editor.execute("app.publish", { target: "preview" });
registration.dispose();
```

`RegisteredCommand` владеет только своей registration: `dispose()` повторно безопасен и не удалит позднюю replacement registration. `removeCommand(name)` удаляет по имени без ownership check.

## `batchUpdates(operation)`

- **Аргументы:** synchronous `operation: () => Result`.
- **Возвращает:** exact `Result` callback.
- **Исключения:** исходное исключение callback, document transaction или history boundary.

Outermost batch создаёт одну `DocumentModel.transact()` и закрывает Yjs undo capture до/после. Nested calls используют уже активный batch.

```ts
editor.batchUpdates(() => {
  const first = editor.blocks.insertBlock({ type: "paragraph" });
  const second = editor.blocks.insertBlock({ type: "paragraph" }, first);
  editor.blocks.indentBlock(second);
});

editor.undo(); // Отменяет весь batch одним шагом.
```

Это batching, а не rollback. Если callback выбросил исключение после CRDT writes, writes сохраняются, но `finally` корректно уменьшает `batchDepth` и закрывает capture group.

## Приватный `documentCommand(handler)`

- **Аргументы:** `handler: CommandHandler`.
- **Возвращает:** wrapped `CommandHandler`.
- **Исключения:** передаёт ошибку handler/history; `finally` пытается закрыть capture boundary.

Standalone document command вызывает `history.stopCapturing()` до и после. В explicit batch boundary принадлежит outer operation.

## Приватный `registerRuntimeCommands()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** duplicate/invalid command registration errors.

Регистрирует:

### `document.load`

- **Payload:** `{ snapshot: SnapshotUpdate }`.
- **Возвращает:** `void`.
- **Исключения:** `Error("Command payload must be an object")` для отсутствующего/non-object payload, validation supplied snapshot sections и document load errors.

После successful load вызывает `history.clear()`.

Поле `version` должно равняться `6`; `DocumentModelImpl.loadSnapshot()` проверяет его до применения supplied sections.

### `selection.set`

- **Payload:** `{ selection: EditorSelection }`.
- **Возвращает:** `void`.
- **Исключения:** command payload или selection validation errors.

### `selection.delete`

- **Payload:** не используется.
- **Возвращает:** результат `SelectionManager.delete()`, фактически `void`.
- **Исключения:** selection/document command errors.

### `selection.clear`

- **Payload:** не используется.
- **Возвращает:** `void`.
- **Исключения:** selection notification errors.

### `history.undo` и `history.redo`

- **Payload:** не используется.
- **Возвращает:** `void`.
- **Исключения:** CRDT history errors.

Block, link и element commands регистрируются их public managers, а не `EditorRuntime`.

## Приватный `registerClipboardCommands()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** duplicate command registration errors.

Метод устанавливает compatibility bridge между DOM-like events, legacy string payloads и typed `ClipboardManager`.

### Local helper `payload(value)`

- **Аргументы:** `value: unknown`; generic desired payload type.
- **Возвращает:** `Partial<Payload>` для non-array object, иначе `{}`.
- **Исключения:** Proxy/property access errors.

### Local helper `text(value)`

- **Аргументы:** `value: unknown`.
- **Возвращает:** `string | undefined`.
- **Исключения:** отсутствуют.

### Local helper `clipboardEvent(value)`

- **Аргументы:** `value: unknown`, сам event или object с полем `event`.
- **Возвращает:** structural `ClipboardEventLike | undefined`.
- **Исключения:** Proxy/property access errors.

## Clipboard commands

### `clipboard.copy`

- **Payload:** optional event; optional `{ clipboardData: { setData } }` compatibility transfer.
- **Возвращает:** serialized `ClipboardBundle` JSON или `""`, если selection нельзя скопировать.
- **Исключения:** selection normalization, serialization или host `setData` errors.

При DOM-like event вызывает `preventDefault()` и пишет structured MIME `RIVTO_CLIPBOARD_MIME`.

### `clipboard.cut`

- **Payload:** optional DOM-like clipboard event.
- **Возвращает:** serialized bundle JSON или `""`.
- **Исключения:** copy/delete/serialization и host clipboard errors.

При успешном cut clipboard manager удаляет selected content как document mutation.

### `clipboard.paste`

- **Payload:** optional fields `bundle`, `structured`, `mergeText`, `preserveNewlines`, `defaultBlockType`, `text`, `placement`; либо DOM-like event.
- **Возвращает:** `void`.
- **Исключения:** invalid structured JSON/bundle, placement collision, missing block type и document operations.

Priority structured source: explicit `structured`, затем custom MIME event. Explicit `text` имеет priority над event `text/plain`. Defaults: `mergeText !== false`, `preserveNewlines === false`.

```ts
editor.execute("clipboard.paste", {
  text: "Первый\nВторой",
  preserveNewlines: true,
  defaultBlockType: "paragraph",
  placement: { parentId: null, afterId: null },
});
```

Event `preventDefault()` вызывается при наличии `clipboardData`, даже если дальше paste завершится ошибкой.

## Источники ошибок command registry

- empty или duplicate name при registration;
- unknown name при execution;
- payload validation конкретного command;
- handler exception;
- listener exception после successful handler.

Если handler выбросил исключение, `CommandRegistry.lastExecuted` не обновляется и command-executed notification не отправляется.
