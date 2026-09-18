# Persistence, history и lifecycle

Editor runtime соединяет versioned document snapshots с local history и явным cleanup. Snapshot и lifecycle CRDT document остаются отдельными понятиями.

## `dump()`

- **Аргументы:** отсутствуют.
- **Возвращает:** complete detached `EditorSnapshot` version 6.
- **Исключения:** malformed shared storage, conversion или materialization errors.

Метод напрямую вызывает `document.getSnapshot()`. Результат можно сериализовать и позже передать в `load()`.

## `load(snapshot)`

- **Аргументы:** `EditorSnapshotUpdate` version 6.
- **Возвращает:** `void`.
- **Исключения:** command отсутствует, invalid command payload, validation supplied sections, manager или CRDT write errors.

Built-in `document.load` заменяет только supplied sections, затем вызывает `history.clear()`. Поэтому state до load нельзя вернуть через `editor.history.undo()`.

Public TypeScript shape и runtime loader требуют `version: 6`. Другая версия отклоняется до document mutations.

```ts
const snapshot = editor.dump();

editor.load({
  version: 6,
  blocks: snapshot.blocks,
});
```

В примере links, elements и pluginData не меняются.

## `history.undo()` и `history.redo()`

- **Аргументы:** отсутствуют.
- **Возвращают:** `void`.
- **Исключения:** missing command или CRDT history errors.

History отслеживает собранные managers CRDT scopes только с приватным runtime origin. Remote updates и mutations с другим origin не становятся локальными history items.

Standalone document commands разделяются через `documentCommand()`. `history.batchUpdates()` объединяет несколько commands в один capture step.

## `destroy()` порядок

1. Вызвать и удалить runtime subscription cleanups.
2. `links.destroy()`.
3. `elements.destroy()`.
4. `blocks.destroy()`.
5. `blocksRegistry.destroy()`.
6. `commands.clear()`.
7. `listeners.clear()`.
8. `await document.destroy()`, который освобождает history, subscriptions, providers и CRDT state.

Метод возвращает `Promise<void>`. Caller должен использовать `await`, чтобы дождаться асинхронного отключения providers. Если синхронный manager cleanup выбросил исключение, последующие manager steps не гарантированы, однако CRDT destroy всё равно выполняется через `finally`. После destroy runtime и его document считаются непригодными для дальнейшего использования.

## CRDT ownership

Runtime владеет переданным `DocumentModel`. Document model, в свою очередь, владеет CRDT adapter и его lifecycle.

```ts
const crdt = new YjsDoc("shared");
const document = new DocumentModelImpl(crdt);
const editor = createRivtoEditor({ document });

// ...работа...

await editor.destroy();
```

`YjsDoc.destroy()` сам отключает все зарегистрированные providers, ждёт их завершения и после этого уничтожает `Y.Doc`. Ручной `detachProvider()` нужен только для отключения отдельного provider до завершения всего editor lifecycle.

## Factory `createRivtoEditor()`

- **Аргументы:** `{ document: DocumentModel; mode?: EditorMode }`.
- **Возвращает:** owned `EditorRuntime`.
- **Исключения:** constructor initialization errors.

Host обязан создать document model. Переданный model уничтожается через `await editor.destroy()`.

## Test helper `createTestEditor()`

- **Аргументы:** optional `CreateRivtoEditorOptions`.
- **Возвращает:** `EditorRuntime` с зарегистрированным local block type `paragraph`.
- **Исключения:** editor construction или block definition registration errors.

Helper находится в `editor/test-utils.ts` и не экспортируется public editor barrel. Production host/React extensions сами владеют writing block definitions; core factory не устанавливает `paragraph` автоматически.

## Данные вне snapshot

После load сохраняются или управляются отдельно:

- active mode;
- selection, хотя document update может её reconcile;
- registered commands и block definitions;
- runtime subscribers;
- provider connection;
- revision продолжает расти;
- history очищается.
