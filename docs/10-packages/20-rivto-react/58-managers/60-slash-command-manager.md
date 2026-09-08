# `ReactSlashCommandManager`

`reactEditor.slashCommands` хранит ordered contextual actions. Он React-owned: commands не persist и не входят в core `CommandRegistry`.

## Properties

- readonly `revision: number`: увеличивается при register/dispose.
- Command map, ownership handles и revision store private.

## `register(command)`

- **Аргументы:** `SlashCommand`.
- **Возвращает:** idempotent disposer.
- **Исключения:** empty ID/title, duplicate ID, destroyed runtime.

Command properties:

- `id: string` stable identity;
- `title: string` display label;
- optional `group`, `keywords`;
- optional `isAvailable({ blockId })`;
- `execute({ blockId }): void`.

## Остальные methods

### `delete(id)`

- **Аргументы:** command ID.
- **Возвращает:** `boolean`.
- **Исключения:** throws после destroyed runtime; missing ID возвращает false.

### `getAll(context)`

- **Аргументы:** `{ blockId: string }`.
- **Возвращает:** available commands в declaration order.
- **Исключения:** errors `isAvailable` predicate.

### `execute(id, context)`

- **Аргументы:** ID и block context.
- **Возвращает:** `void`.
- **Исключения:** unknown command, unavailable command или errors user execute callback.

Availability проверяется повторно непосредственно перед execute.

### `subscribe(listener)` / `destroy()`

- `subscribe` возвращает unsubscribe; listener errors propagate при registry change.
- `destroy` возвращает void, очищает state/listeners, повторно безопасен.

`subscribe()` предоставляет один command-registry revision stream без payload. Несколько distinct callbacks сосуществуют и не override-ят друг друга. Одинаковая function reference deduplicate-ится internal `Set`; returned unsubscribe idempotent. Подписка не вызывается сразу — menu сначала читает `revision`/`getAll(context)`. `destroy()` удаляет все handlers независимо от сохранённых disposers.

## Связи с другими managers

`BlockManager.register()` может атомарно добавить type-conversion slash command. При rollback/dispose renderer, definition и command удаляются вместе. `slashCommandExtension()` монтирует menu UI и регистрирует generic list/duplicate/delete/collapse actions.

## Modes

Registry общий для page и edgeless. Context всегда block-local, поэтому slash menu открывается внутри editable block как на page, так и внутри edgeless card. Canvas object selection без active text block сама по себе не создаёт slash context.

Mode-specific command реализуется через `isAvailable`, читающий `reactEditor.editor.mode`, либо отдельный mounted UI. Manager автоматически по mode commands не фильтрует.
