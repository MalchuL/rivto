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
- **Исключения:** document-model validation или CRDT write errors.

`load()` передаёт snapshot напрямую в document-model, не запускает editor processors, заменяет только supplied sections, затем вызывает `history.clear()`. Поэтому state до load нельзя вернуть через `editor.history.undo()`. Migration, remapping и repair выполняются явно до вызова `load()`.

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
- **Исключения:** CRDT history errors.

History отслеживает собранные managers CRDT scopes только с приватным runtime origin. Remote updates и mutations с другим origin не становятся локальными history items.

Typed manager mutations создают собственные capture steps. `history.batchUpdates()` объединяет несколько mutations в один capture step.

## `destroy()` порядок

1. Вызвать и удалить runtime subscription cleanups.
2. `links.destroy()`.
3. `elements.destroy()`.
4. `blocks.destroy()`.
5. `blockRegistry.destroy()`.
6. `commands.clear()`.
7. `listeners.clear()`.
Document model не уничтожается. Метод возвращает `Promise<void>` только для совместимости lifecycle API; после destroy runtime непригоден, а caller-owned document остаётся доступен.

## CRDT ownership

Host владеет `DocumentStorage`; storage подключает CRDT providers и передаёт модель caller-у; editor cache владеет editor consumers и закрывает core/model после последнего release.

```ts
const storage = new DocumentStorage({ registry: new YjsDocumentRegistry("workspace") });
const document = await storage.create("shared");
const editor = createRivtoEditor({ document });

// ...работа...
await editor.destroy();
await document.destroy();
await storage.destroy();
```

Последний consumer release отключает providers и уничтожает live model; registry сохраняет document ID. Базовый DocumentStorage не сохраняет content: при reacquisition он приходит от оставшихся peers. Модель приложения может восстанавливать его через `createDocumentModel`; в демо DBDocumentModel воспроизводит CRDT updates из базы в памяти. `YjsDoc.destroy()` ждёт все provider disconnect operations и затем уничтожает `Y.Doc`. Ручной `detachProvider()` нужен только для отдельного provider до завершения lifecycle.

## Factory `createRivtoEditor()`

- **Аргументы:** required `{ document: DocumentModel }`.
- **Возвращает:** `EditorRuntime`, который использует, но не уничтожает переданный document.
- **Исключения:** constructor initialization errors.

Host может использовать single editor с caller-owned моделью или EditorStorage с callback loader-ом. Host владеет EditorStorage; views получают document-bound EditorViewApi и автоматически удерживают consumers. После shutdown всех core/model host закрывает registry storage.

## `getDocument()` и `openCoreEditor(documentId)`

`getDocument()` всегда возвращает единственную модель, переданную в `createRivtoEditor({ document })`. Managers, retained callbacks, subscriptions, clipboard и history постоянно связаны с ней; смены document context нет. Single editor освобождает свои registrations и subscriptions, но не уничтожает caller-owned модель. Для нескольких документов `EditorStorage` принимает async `openDocument(documentId)` и optional `createEditor(editor)` returning EditorRuntime; по умолчанию создаёт пустой Yjs-backed документ. `openCoreEditor(documentId)` открывает и кеширует отдельный core, сохраняя explicit ownership до `releaseCoreEditor(documentId)`. Loader передаёт EditorStorage владение моделью, а storage создаёт core перед вызовом React-фабрики: последний view consumer или shutdown закрывает сначала EditorRuntime, затем core и модель. Views одного документа делят core, разные документы имеют собственные selection, clipboard policy и undo history.

## Test helper `createTestEditor()`

- **Аргументы:** optional `Partial<CreateRivtoEditorOptions>`.
- **Возвращает:** `Promise<TestEditor>` с явным document-bound API, raw `runtime` и зарегистрированным local block type `paragraph`.
- **Исключения:** editor construction или block definition registration errors.

Helper находится в `editor/test-utils.ts` и не экспортируется public editor barrel. Production host/React extensions сами владеют writing block definitions; core factory не устанавливает `paragraph` автоматически.

## Данные вне snapshot

После load сохраняются или управляются отдельно:

- host React state, выбирающий surface;
- selection, хотя document update может её reconcile;
- registered commands и block definitions;
- runtime subscribers;
- provider connection;
- revision продолжает расти;
- history очищается.
