# Selection reconciliation и revision

Selection является local runtime state. Remote updates, undo, direct document calls и mode changes могут сделать её endpoints недействительными, поэтому `EditorRuntime` reconciles selection с актуальным block tree.

## Приватный `reconcileSelection()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** block materialization, selection get/set validation или listener errors.

Алгоритм сначала materializes visible IDs depth-first и строит document order map.

### Text selection

- Если anchor или head block удалён, selection item удаляется.
- Offset ограничивается новой длиной block content.
- Direction anchor/head сохраняется.
- Неизменившийся item переиспользуется; изменившийся копируется.

### Block selection

- Missing IDs фильтруются.
- Surviving IDs сортируются в текущем visible order.
- Пустой item удаляется.
- Existing anchor/focus сохраняются, если blocks ещё существуют.
- Missing endpoint заменяется соответствующим directional edge: first/last зависит от исходного gesture direction.

`selection.set(valid)` вызывается только при реальном изменении, чтобы не публиковать лишнюю revision.

## `deleteSelection()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** command/selection normalization и block mutation errors.

Исполняет built-in `selection.delete`. `SelectionManager` нормализует heterogeneous selection в document order и удаляет её одной undoable operation.

## Property `revision`

- **Тип:** monotonic `number`.
- **Начальное значение:** `0`.
- **Изменение:** `notifyChanges()` сначала increment, затем вызывает listeners.
- **Исключения при чтении:** отсутствуют.

Revision является snapshot token для UI subscriptions, а не persisted document version. Он может измениться из-за local-only mode/selection/registry state без CRDT update.

## Источники runtime notification

### Document update

Constructor подписывается на `document.subscribe()`. Callback сначала вызывает `reconcileSelection()`, затем `notifyChanges()`. Сюда входят local commands, direct document mutations, remote provider updates и undo/redo.

### Selection update

`selection.subscribe()` напрямую вызывает `notifyChanges()`. Если reconciliation изменила selection, возможна отдельная selection revision перед document callback revision.

`SelectionManager` поддерживает несколько distinct listeners одновременно и не хранит «текущий единственный callback». Повторная подписка другой function добавляет observer; одинаковая function reference deduplicate-ится. Каждый returned unsubscribe удаляет эту function и безопасен при повторном вызове. Подписка не сообщает initial selection автоматически.

### Mode update

`mode.subscribe()` закрывает history capture, reconciles selection, уведомляет runtime и снова закрывает capture. Mode сам не persisted.

`ModeManager` использует ту же Set-семантику: несколько distinct listeners, без override; одна effective registration для одинаковой function reference; idempotent unsubscribe; никакого immediate callback. Повторная установка текущего mode не создаёт notification.

### Block registry update

Изменение registered block definitions уведомляет runtime, потому что rendering/validation behavior могло измениться без document mutation.

## Приватный `notifyChanges()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** listener exception передаётся вызывающему коду после increment revision.

```ts
const unsubscribe = editor.subscribe(() => {
  render(editor.revision, editor.blocks.getBlocks());
});
```

Можно вызвать `editor.subscribe()` несколько раз с разными callbacks — все получат следующую revision. Возвращённые disposers независимы для разных functions. Runtime subscription также не выполняет initial render: consumer должен сначала прочитать `editor.revision`/state либо использовать механизм вроде React `useSyncExternalStore`, который читает snapshot отдельно.

## Что не вызывает revision само по себе

Successful arbitrary command execution обновляет state `CommandRegistry`, но `EditorRuntime` не подписан на registry command-executed events. Revision изменится только если command также изменил document, selection, mode или block registry.

## Direction examples

```ts
editor.selection.set([{
  type: "block",
  blockIds: ["a", "b", "c"],
  anchorBlockId: "c",
  focusBlockId: "a",
}]);
```

Если `c` удалён, reconciliation сохраняет reverse intent и выбирает surviving directional edge вместо безусловного первого block.
