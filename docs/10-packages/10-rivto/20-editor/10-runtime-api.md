# `EditorRuntime` и `RivtoEditorApi`

`RivtoEditorApi` — public coordinator contract. `EditorRuntime` является его реализацией и владеет cross-cutting behavior; block/link/element operations остаются в focused managers.

Исходники: `editor/types.ts` и `editor/rivto-editor.ts`.

## Публичные свойства

### `mode`

- **Тип:** `ModeManager`, публичное `readonly`.
- **Значение:** local presentation mode, `get()`, `set(mode)` и `subscribe(listener)`.
- **Исключения при чтении:** отсутствуют.

Manager принадлежит single-document editor; `reactEditor.mode` ссылается на тот же
объект. EditorStorage не хранит общий mode для всех документов.

### `blocks`

- **Тип:** `BlockManager`, публичное `readonly`.
- **Значение:** typed block operations и block command owner.
- **Исключения при чтении:** отсутствуют.

### `blockRegistry`

- **Тип:** `BlockRegistryManager`, публичное `readonly`.
- **Значение:** native block definitions, defaults и props validation.
- **Исключения при чтении:** отсутствуют.

### `blockListProps`

- **Тип:** `BlockListPropsManager`, публичное `readonly`.
- **Значение:** editor-wide registrations, defaults и semantic validation для persisted `listProps`.
- **Исключения при чтении:** отсутствуют.

`register({ id, defaults?, isValid? })` возвращает idempotent disposer. `validate(candidate)` ничего не возвращает и выбрасывает ошибку для invalid input; `prepare(candidate)` применяет defaults и validation. `blocks.prepareInput(inputs)` принимает root forest и является complete recursive creation pipeline: применяет block definitions, list policy, processors и portable validation. Core block insertion и import используют этот pipeline перед первой записью. Snapshot loading передаёт данные напрямую в document-model и не запускает editor processors; migration или repair выполняются явно до `load`.

### `links`

- **Тип:** `LinkManager`, публичное `readonly`.
- **Значение:** typed first-class link operations.
- **Исключения при чтении:** отсутствуют.

### `elements`

- **Тип:** `ElementManager`, публичное `readonly`.
- **Значение:** typed first-class canvas element operations.
- **Исключения при чтении:** отсутствуют.

### `commands`

- **Тип:** `CommandRegistry`, публичное `readonly`; инициализируется до constructor body.
- **Значение:** named runtime command handlers.
- **Исключения при чтении:** отсутствуют.

### `selection`

- **Тип:** `SelectionManager`, публичное `readonly`.
- **Значение:** local detached text и structural selection.
- **Исключения при чтении:** отсутствуют.

### `history`

- **Тип:** `HistoryManager`, публичное `readonly`.
- **Значение:** local-origin undo/redo history document scopes.
- **Исключения при чтении:** отсутствуют.

### `clipboard`

- **Тип:** `ClipboardManager`, публичное `readonly`.
- **Значение:** framework-neutral copy/cut/paste behavior.
- **Исключения при чтении:** отсутствуют.

### `revision`

- **Тип:** `number`, публичный getter.
- **Значение:** monotonic runtime snapshot; начинается с `0` и увеличивается перед каждым runtime notification.
- **Исключения при чтении:** отсутствуют.

## Приватные свойства

### `listeners`

- **Тип:** `Listeners<{ editorChanged: void }>`, приватное `readonly`.
- **Значение:** subscribers общего revision stream.
- **Исключения при чтении:** публичного доступа нет.

### `unsubscribeFns`

- **Тип:** `Array<() => void>`, приватное `readonly`.
- **Значение:** cleanup callbacks block registry, fixed document subscription, hierarchy subscription и element membership subscription. Они принадлежат single core и удаляются при его destroy; caller или editor cache отдельно уничтожает модель.
- **Исключения при чтении:** отсутствуют.

### `currentRevision`

- **Тип:** `number`, приватное; initial `0`.
- **Значение:** backing value getter `revision`.
- **Исключения при чтении:** отсутствуют.

## Создание

### `constructor(options)`

- **Аргументы:** required `CreateRivtoEditorOptions` с единственной `document`.
- **Создаёт:** полностью связанный `EditorRuntime`.
- **Исключения:** передаёт ошибки managers, duplicate built-in commands и subscriptions.

Constructor создаёт managers, постоянно связанные с supplied document, и подписывается на её изменения, hierarchy и element membership. Definitions, defaults и processors принадлежат core managers. Constructor не открывает другие документы и не хранит presentation mode.

## Публичные методы

### `getDocument()` и `getSingleEditor(documentId)`

`getDocument()` всегда возвращает единственную модель, переданную в `createRivtoEditor({ document })`. Managers, retained callbacks, subscriptions, clipboard и history постоянно связаны с ней; смены document context нет. Single editor освобождает свои registrations и subscriptions, но не уничтожает caller-owned модель. Для нескольких документов `EditorStorage` принимает async `openDocument(documentId)` и optional `createEditor(editor)` returning ReactEditor; по умолчанию создаёт пустой Yjs-backed документ. `getSingleEditor(documentId)` открывает и кеширует отдельный core, сохраняя explicit ownership до `closeEditor(documentId)`. Loader передаёт EditorStorage владение моделью, а storage создаёт core перед вызовом React-фабрики: последний view consumer или shutdown закрывает сначала ReactEditor, затем core и модель. Views одного документа делят core, разные документы имеют собственные selection, clipboard policy и undo history.

### `subscribe(listener)`

- **Аргументы:** `listener: () => void`.
- **Возвращает:** `() => void` для unsubscribe.
- **Исключения:** subscription errors; исключение listener возникает при notification.

Метод подписывает на единственный runtime event `editorChanged`; payload не передаётся, поэтому после callback consumer читает `revision` и нужные managers. Разрешено любое число distinct listeners, и новая подписка не заменяет предыдущую. Внутренний `Listeners` хранит callbacks в `Set`: повторная регистрация той же function reference создаёт одну effective subscription, а разные functions вызываются независимо.

Возвращённый disposer удаляет этот callback и является idempotent. Подписка не вызывается сразу. Один document update, mode change или block-registry change сначала увеличивает `revision`, затем вызывает snapshot текущих listeners. Selection имеет собственный stream, а presentation mode хранится в локальном `editor.mode`. Вызов disposer во время notification безопасен, но iteration уже использует snapshot текущего списка.

### `blockRegistry.subscribe(listener)`

- **События:** один stream `blockRegistryChanged`, после успешного add/remove definition.
- **Количество подписчиков:** несколько distinct callbacks одновременно; следующий не заменяет предыдущий.
- **Повтор той же функции:** deduplicate-ится `Set`; любой её disposer удаляет effective registration.
- **Возвращает:** idempotent unsubscribe exact callback.
- **Начальный вызов:** отсутствует; текущее registry state читается отдельно.

### `commands.subscribe(listener)`

- **События:** один stream `commandExecuted`, только после успешного завершения command handler.
- **Количество подписчиков:** несколько distinct callbacks; подписки не override-ят друг друга.
- **Повтор той же функции:** одна effective registration по function identity.
- **Возвращает:** idempotent unsubscribe.
- **Не уведомляет:** failed/unknown command, register или remove command.

### Presentation state

Каждый core editor хранит локальный presentation mode в `editor.mode`: `get()` читает
текущий mode, `set(mode)` меняет его, `subscribe(listener)` возвращает unsubscribe.
Начальное значение задаётся через `createRivtoEditor({ document, mode })`, default — `"block"`.
Повторный `set()` активного mode — no-op. Mode не сохраняется в snapshot или CRDT.
React host выбирает surface через JSX; `useEditorMode()` подписывается на core manager,
а `SurfaceContext` сообщает kind ближайшего rendered surface, который может отличаться
у page embedding внутри canvas. Document subscriptions, clipboard, local selections
и histories постоянно привязаны к single editor.

### `selection.subscribe(listener)`

- **События:** один stream `selectionChanged` после effective `set()` или `clear()`.
- **Количество подписчиков:** несколько distinct callbacks без replacement.
- **Повтор той же функции:** одна effective registration.
- **Возвращает:** idempotent unsubscribe.
- **Не уведомляет:** `clear()` при уже пустой selection; initial selection читается через `get()`.

### `history.batchUpdates(operation)`

- **Аргументы:** synchronous `operation: () => Result`.
- **Возвращает:** generic `Result`, возвращённый callback.
- **Исключения:** передаёт исходное исключение operation и transaction/history errors; rollback не выполняется.

Outermost batch вызывает `stopCapturing()` до и после и выполняет callback в одной CRDT transaction. Nested batch сразу вызывает callback внутри текущей boundary.

### `load(snapshot)`

- **Аргументы:** `snapshot: EditorSnapshotUpdate` schema version 6.
- **Возвращает:** `void`.
- **Исключения:** document-model validation и CRDT write errors.

Передаёт snapshot напрямую в document-model без block/element processors, затем очищает history и делает загруженное состояние новым baseline. Migration, remapping и repair выполняются явно до `load()`.

Статический и runtime-контракты требуют literal `version: 6`. Любое другое значение отклоняется до записи supplied sections.

### `dump()`

- **Аргументы:** отсутствуют.
- **Возвращает:** complete detached `EditorSnapshot` schema version 6.
- **Исключения:** document materialization/validation/conversion errors.

### `destroy()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `Promise<void>`, завершённый после runtime cleanup, отключения всех providers и уничтожения CRDT document.
- **Исключения:** передаёт ошибку runtime cleanup, provider disconnect или CRDT destroy; subsequent manager cleanup после синхронной ошибки не гарантирован, но CRDT destroy выполняется через `finally`.

Удаляет owned subscriptions, затем уничтожает links, elements, blocks, block registry и history, очищает commands и listeners и ожидает `crdt.destroy()`.

## Factory

### `createRivtoEditor(options)`

- **Аргументы:** optional `CreateRivtoEditorOptions`.
- **Возвращает:** новый `EditorRuntime`.
- **Исключения:** те же, что у constructor.

Caller владеет runtime lifecycle.

## Несколько документов

Каждый core принимает одну модель: `createRivtoEditor({ document })`.
Для embedding, нескольких tabs и пользователей React-пакет предоставляет
`EditorStorage`. Он кеширует отдельный ReactEditor и core для каждого документа;
обычные команды по-прежнему выполняются напрямую в соответствующем core.
Definitions, defaults, processors, selection, clipboard и undo остаются в нём.

```ts
import { EditorStorage, createReactEditor, standardPreset } from "@chulane/rivto-react";
const editors = new EditorStorage({
  openDocument: (id) => storage.openDocument(id),
  createEditor: (editor) => createReactEditor({
    editor,
    extensions: [standardPreset()],
  }),
  lookupDocumentIds: (id, options) => storage.findDocumentIdsWithBlock(id, options),
});
const source = await editors.getSingleEditor("source");
source.blocks.updateBlock("existing-block", { content: "Changed" });
const destination = await editors.getSingleEditor("destination");
destination.blocks.insertBlock({ type: "paragraph" });
await editors.closeEditor("source");
await editors.destroy();
```

`getSingleEditor(id)` удерживает explicit ownership до `closeEditor(id)`.
Views используют независимые `acquireEditor/release`; concurrent opens делят
pending promise, отмена одного consumer не отменяет другого. Последний release
закрывает React registrations, core, затем модель. `getEditor(id)` и
`getDocument(id)` читают уже открытые instances без загрузки.
`findDocumentWithBlock(id)` возвращает первую открытую модель по сортировке ID.
Embedding хранит `targetDocumentId` и `targetBlockId`; `resolveBlock({ documentId, blockId })`
проверяет указанный документ первым, затем ищет кандидатов через application/database lookup.
Стандартный resolver показывает первый найденный документ и сообщает неоднозначность.
Callback `resolveBlock` в настройках кеша заменяет эту политику; props ссылки не меняются.

Clipboard использует policy своего core и получает ID mapping от model manager.
Application subclass проверяет занятые ID в документе назначения, включая его
удалённые записи. Другие документы имеют отдельные пространства ID. Clipboard
сохраняет sourceDocumentId и обновляет внутренние embedding-ссылки по ID mapping;
внешние ссылки сохраняют исходную пару document/block ID.
`crossDocumentBlockTransfer(source, destination, ids, placement)` явно проверяет
назначение до удаления источника и сохраняет ID. Истории остаются независимыми:
undo одного документа может восстановить блок в двух документах одновременно.
Распределённой transaction и общего selection manager нет; view ограничивает
DOM selection показанным subtree и активным occurrence.
