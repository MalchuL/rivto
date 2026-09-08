# `DocumentModel` и `DocumentModelImpl`

`DocumentModel` — adapter-neutral контракт координатора документа. `DocumentModelImpl` создаёт focused managers, назначает им общий CRDT-документ и объединяет их состояние в snapshot.

Исходники: `core/types/document.ts` и `core/document-model.ts`.

## Свойства

### `id`

- **Тип:** `string`, публичное `readonly`-свойство.
- **Значение:** описательный ID модели; не управляет персистентностью или provider room.
- **Исключения при чтении:** отсутствуют.

### `crdt`

- **Тип:** `CRDTDoc`, публичное `readonly`-свойство.
- **Значение:** adapter-neutral каноническое shared storage.
- **Исключения при чтении:** отсутствуют.

### `origin`

- **Тип:** `symbol`, публичное `readonly`-свойство.
- **Значение:** один `Symbol("rivto-document")` для локальных транзакций этой модели.
- **Исключения при чтении:** отсутствуют.

### `undoScopes`

- **Тип:** `CRDTUndoScope[]`, публичное `readonly`-свойство.
- **Значение:** объединённые scopes `blocks`, `elements`, `links` и `pluginData`.
- **Исключения при чтении:** отсутствуют.

### `blocks`

- **Тип:** `DocumentBlockManager`, публичное `readonly`-свойство.
- **Значение:** владелец block storage, content и hierarchy.
- **Исключения при чтении:** отсутствуют.

### `elements`

- **Тип:** `DocumentElementManager`, публичное `readonly`-свойство.
- **Значение:** владелец first-class canvas elements.
- **Исключения при чтении:** отсутствуют.

### `links`

- **Тип:** `DocumentLinkManager`, публичное `readonly`-свойство.
- **Значение:** владелец связей между блоками.
- **Исключения при чтении:** отсутствуют.

### `pluginData`

- **Тип:** `DocumentPluginDataManager`, публичное `readonly`-свойство.
- **Значение:** владелец namespaced document-level plugin data.
- **Исключения при чтении:** отсутствуют.

## Создание

### `constructor(crdt)`

- **Аргументы:** `crdt: CRDTDoc`.
- **Создаёт:** модель с `id === crdt.id`.
- **Исключения:** ошибки получения CRDT roots и нормализации дерева передаются.

### `constructor(id, crdt)`

- **Аргументы:** `id: string`; `crdt: CRDTDoc`.
- **Создаёт:** модель с явно заданным описательным ID.
- **Исключения:** `Error("DocumentModelImpl requires a CRDTDoc")`, если второй аргумент отсутствует; также передаются ошибки CRDT initialization.

Обе overload-формы создают managers в порядке `blocks`, `elements`, `links`, `pluginData`, собирают их `undoScopes`, затем вызывают `blocks.normalize()`.

## Методы

### `subscribe(listener)`

- **Аргументы:** `listener: () => void`.
- **Возвращает:** `Unsubscribe`.
- **Исключения:** передаёт ошибки `crdt.on("update", listener)`; исключения listener возникают при доставке события.

Подписывается на общий CRDT update. `EditorRuntime` использует сигнал для reconciliation selection и увеличения revision после локальных и remote mutations.

Listener не получает snapshot или описание patch: это общий invalidation signal. Если consumer-у нужны новые данные, он повторно читает focused manager после вызова. Возвращённый `Unsubscribe` нужно вызвать при teardown, иначе callback останется зарегистрированным до уничтожения CRDT document. Метод не фильтрует updates по `origin`, поэтому listener видит и локальные, и provider-delivered изменения.

`DocumentModel.subscribe()` предоставляет **один вид notification — document update** и всегда делегирует `crdt.on("update", listener)`. Одновременно можно зарегистрировать несколько distinct listeners; новая подписка не заменяет существующие. В `YjsDoc` одинаковая function reference deduplicate-ится native `Set`, поэтому для независимых подписок используйте разные callback functions.

Каждый вызов возвращает cleanup только соответствующего callback. Повторный cleanup безопасен. Регистрация не вызывает listener немедленно; initial data нужно получить через `getSnapshot()` или focused managers. Несколько writes одной `document.transact()` обычно приводят к одному update notification, тогда как разные transactions могут дать несколько последовательных вызовов.

### `transact(operation)`

- **Аргументы:** `operation: () => void`.
- **Возвращает:** `void`.
- **Исключения:** передаёт исходное исключение `operation` и ошибки `CRDTDoc.transact`; rollback не гарантируется.

Выполняет callback через `crdt.transact(operation, origin)`. Все managers используют эту границу вместо собственных адаптер-specific транзакций.

`operation` выполняется синхронно и ничего не возвращает через API модели. Stable `origin` позволяет undo manager отслеживать именно локальные изменения Rivto. Вложенные manager transactions остаются частью adapter transaction, если adapter поддерживает nesting. Atomic delivery означает один согласованный update для observers, но не rollback: исключение callback-а передаётся caller-у, а уже выполненные CRDT writes могут сохраниться.

### `getSnapshot()`

- **Аргументы:** отсутствуют.
- **Возвращает:** detached `Snapshot` с `version: 6`.
- **Исключения:** передаёт ошибки materialization manager-ов, malformed shared fields и cloning.

Собирает blocks, links, elements и plugin data. Snapshot не содержит selection, mode, undo history или provider state.

Каждый manager сначала materializes live shared structures в plain values; `clone()` дополнительно отделяет blocks, links и elements от adapter-owned objects. Результат можно сериализовать и менять без влияния на документ. Метод является read-only относительно domain state, кроме возможных ошибок при чтении malformed shared data; он не получает бинарный Yjs update и не фиксирует causal history.

### `loadSnapshot(snapshot)`

- **Аргументы:** `snapshot: SnapshotUpdate`.
- **Возвращает:** `void`.
- **Исключения:** `Error("Unsupported Rivto document snapshot version: <version>")`, если `version !== 6`; `Error("Unsupported Rivto document snapshot")`, если переданные `blocks` или `elements` не являются массивами; также validation errors каждого manager.

Проверяет supplied sections до первой записи и заменяет только присутствующие секции в одной модели-транзакции. Однако CRDT transaction не является rollback boundary: поэтому каждый manager должен валидировать destructive replacement заранее.

Порядок применения фиксирован: blocks, links, elements, затем document plugin data. Links загружаются после blocks, чтобы endpoint validation проверяла уже новое block storage. Проверка presence основана на truthy значении секции; пустые arrays truthy и корректно очищают соответствующую коллекцию. Отсутствующее поле оставляет live root без изменений, а supplied `pluginData: {}` очищает namespaces через recursive merge.

**Примечание об assignment:** `loadSnapshot()` является верхним транзитивным caller-ом `assignMap()` и `assignText()` через `blocks.loadBlocks()`/recursive `insertInto()`, а также `assignMap()` через `elements.loadElements()`/`insertElement()`. Каждый block/element получает новые CRDT containers, но значения внутри `listProps`, `props` и block-level `pluginData` сохраняются как cloned plain values под top-level shared keys. Вложенные поля этих plain objects не становятся самостоятельными CRDT objects. `assignArray()` этот путь не использует.

```ts
document.loadSnapshot({
  version: 6,
  pluginData: { comments: { enabled: true } },
});
```

В этом примере blocks, links и elements не меняются.

## Использование в проекте

`EditorRuntime` создаёт модель так:

```ts
this.document = new DocumentModelImpl(
  options.document ?? new YjsDoc(`rivto-${crypto.randomUUID()}`),
);
```

Затем public editor managers делегируют focused operations в `document.blocks`, `document.links` и `document.elements`. `UndoManager` использует `document.undoScopes` и `[document.origin]`, а persistence API вызывает `getSnapshot()` и `loadSnapshot()`.
