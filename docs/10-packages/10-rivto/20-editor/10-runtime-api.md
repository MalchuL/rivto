# `EditorRuntime` и `RivtoEditorApi`

`RivtoEditorApi` — public coordinator contract. `EditorRuntime` является его реализацией и владеет cross-cutting behavior; block/link/element operations остаются в focused managers.

Исходники: `editor/types.ts` и `editor/rivto-editor.ts`.

## Публичные свойства

### `document`

- **Тип:** `DocumentModel`, публичное `readonly`.
- **Значение:** canonical collaborative storage и persistence boundary.
- **Исключения при чтении:** отсутствуют.

### `blocks`

- **Тип:** `BlockManager`, публичное `readonly`.
- **Значение:** typed block operations и block command owner.
- **Исключения при чтении:** отсутствуют.

### `blocksRegistry`

- **Тип:** `BlockRegistryManager`, публичное `readonly`.
- **Значение:** native block definitions, defaults и props validation.
- **Исключения при чтении:** отсутствуют.

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

### `mode`

- **Тип:** `ModeManager`, публичное `readonly`.
- **Значение:** local `block`/`edgeless` presentation state.
- **Исключения при чтении:** отсутствуют.

### `selection`

- **Тип:** `SelectionManager`, публичное `readonly`.
- **Значение:** local detached text и structural selection.
- **Исключения при чтении:** отсутствуют.

### `history`

- **Тип:** `UndoManager`, публичное `readonly`.
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
- **Значение:** cleanup callbacks block registry, document, selection и mode subscriptions.
- **Исключения при чтении:** отсутствуют.

### `currentRevision`

- **Тип:** `number`, приватное; initial `0`.
- **Значение:** backing value getter `revision`.
- **Исключения при чтении:** отсутствуют.

### `batchDepth`

- **Тип:** `number`, приватное; initial `0`.
- **Значение:** nesting depth explicit batch. Положительное значение отключает отдельные history boundaries nested document commands.
- **Исключения при чтении:** отсутствуют.

## Создание

### `constructor(options = {})`

- **Аргументы:** `options: CreateRivtoEditorOptions` с optional `document` и `mode`.
- **Создаёт:** полностью связанный `EditorRuntime`.
- **Исключения:** передаёт ошибки создания `YjsDoc`, `DocumentModelImpl`, managers, duplicate built-in commands и subscriptions.

Без document создаётся `YjsDoc("rivto-" + crypto.randomUUID())`. Default mode — `"block"`. Constructor создаёт managers, устанавливает block props validator, регистрирует runtime/clipboard commands и подписывает revision на document, registry, selection и mode changes.

## Публичные методы

### `subscribe(listener)`

- **Аргументы:** `listener: () => void`.
- **Возвращает:** `() => void` для unsubscribe.
- **Исключения:** subscription errors; исключение listener возникает при notification.

Метод подписывает на единственный runtime event `editorChanged`; payload не передаётся, поэтому после callback consumer читает `revision` и нужные managers. Разрешено любое число distinct listeners, и новая подписка не заменяет предыдущую. Внутренний `Listeners` хранит callbacks в `Set`: повторная регистрация той же function reference создаёт одну effective subscription, а разные functions вызываются независимо.

Возвращённый disposer удаляет этот callback и является idempotent. Подписка не вызывается сразу. Один document update, selection/mode change или block-registry change сначала увеличивает `revision`, затем вызывает snapshot текущих listeners. Вызов disposer во время notification безопасен, но iteration уже использует snapshot текущего списка.

### `blocksRegistry.subscribe(listener)`

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

### `mode.subscribe(listener)`

- **События:** один stream `modeChanged` после effective смены `block`/`edgeless`.
- **Количество подписчиков:** несколько distinct callbacks без replacement.
- **Повтор той же функции:** deduplicate-ится.
- **Возвращает:** idempotent unsubscribe.
- **Не уведомляет:** `set()` с уже активным mode; immediate initial callback отсутствует.

### `selection.subscribe(listener)`

- **События:** один stream `selectionChanged` после effective `set()` или `clear()`.
- **Количество подписчиков:** несколько distinct callbacks без replacement.
- **Повтор той же функции:** одна effective registration.
- **Возвращает:** idempotent unsubscribe.
- **Не уведомляет:** `clear()` при уже пустой selection; initial selection читается через `get()`.

### `batchUpdates(operation)`

- **Аргументы:** synchronous `operation: () => Result`.
- **Возвращает:** generic `Result`, возвращённый callback.
- **Исключения:** передаёт исходное исключение operation и transaction/history errors; rollback не выполняется.

Outermost batch вызывает `history.stopCapturing()` до и после, а callback выполняет через `document.transact()`. Nested batch сразу вызывает callback внутри текущей boundary.

### `register(name, handler)`

- **Аргументы:** непустой unique `name: string`; `handler: CommandHandler`.
- **Возвращает:** `RegisteredCommand` ownership handle.
- **Исключения:** `Error("Command name is required")` или `Error("Command <name> is already registered")`.

### `execute(name, payload?)`

- **Аргументы:** command `name: string`; optional `payload: unknown`.
- **Возвращает:** `unknown`, фактический result handler.
- **Исключения:** `Error("Unknown command <name>")` или исходное исключение handler.

Successful execution обновляет `commands.lastExecuted` и уведомляет command subscribers, но общий editor revision меняется только если соответствующее состояние также вызвало runtime notification.

### `removeCommand(name)`

- **Аргументы:** command `name: string`.
- **Возвращает:** `void`.
- **Исключения:** отсутствуют; missing name безопасен.

Удаление built-in command разрешено. После этого соответствующий convenience method может выбросить `Unknown command`.

### `deleteSelection()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** errors command `selection.delete`; `Unknown command`, если registration удалена.

### `load(snapshot)`

- **Аргументы:** `snapshot: EditorSnapshotUpdate` schema version 6.
- **Возвращает:** `void`.
- **Исключения:** unknown command, invalid command payload, validation supplied sections и manager/CRDT write errors.

Выполняет `document.load` command. Successful load очищает history, делая загруженное состояние новым baseline.

Статический и runtime-контракты требуют literal `version: 6`. Любое другое значение отклоняется до записи supplied sections.

### `dump()`

- **Аргументы:** отсутствуют.
- **Возвращает:** complete detached `EditorSnapshot` schema version 6.
- **Исключения:** document materialization/validation/conversion errors.

### `undo()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** unknown `history.undo` command или CRDT undo errors.

### `redo()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** unknown `history.redo` command или CRDT redo errors.

### `destroy()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `Promise<void>`, завершённый после runtime cleanup, отключения всех providers и уничтожения CRDT document.
- **Исключения:** передаёт ошибку runtime cleanup, provider disconnect или CRDT destroy; subsequent manager cleanup после синхронной ошибки не гарантирован, но CRDT destroy выполняется через `finally`.

Удаляет owned subscriptions, затем уничтожает links, elements, blocks, block registry и history, очищает commands и listeners и ожидает `document.crdt.destroy()`.

## Factory

### `createRivtoEditor(options = {})`

- **Аргументы:** optional `CreateRivtoEditorOptions`.
- **Возвращает:** новый `EditorRuntime`.
- **Исключения:** те же, что у constructor.

Caller владеет runtime lifecycle.
