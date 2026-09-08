# Карта editor-модулей

## `editor/rivto-editor.ts`

Владеет `EditorRuntime`, composition order, subscriptions, batching, built-in runtime/clipboard commands, selection reconciliation, persistence facade и destroy sequence. Также экспортирует `createRivtoEditor()`.

## `editor/types.ts`

Определяет `EditorMode`, selection shapes, creation options и `RivtoEditorApi`. Типы не зависят от React/DOM.

## `editor/model.ts`

Определяет public element/link/snapshot shapes и aliases canonical block types из document model. Current snapshot literal — version 6.

## `editor/index.ts`

Public barrel экспортирует model/types, clipboard-manager API и runtime factory/class. `test-utils.ts` намеренно не входит в него.

## `editor/test-utils.ts`

Создаёт test runtime и регистрирует `paragraph`, чтобы core tests не зависели от React writing extension.

## Tests

- `block-commands.test.ts` — runtime command delegation, props validation и hierarchy operations.
- `clipboard-commands.test.ts` — event/string compatibility bridge.
- `element-commands.test.ts` — first-class element commands.
- `rivto-editor-methods.test.ts` — public convenience API, snapshots и subscriptions.
- `selection-manager.test.ts` — direction, ordering, reconciliation и heterogeneous ranges.
- `undo-manager.test.ts` — capture boundaries, remote origin filtering и load baseline.

## Ownership между слоями

```text
EditorRuntime
  owns runtime lifecycle and cross-cutting state

DocumentModel
  owns canonical persisted schema and transactions

Focused managers
  own public operations and named domain commands

React package
  owns rendering, DOM selection and browser events
```

## Добавление cross-cutting editor behavior

1. Определить, является ли state persisted или local.
2. Persisted operation разместить во focused manager/document model.
3. Local mode/selection behavior оставить в соответствующем manager.
4. Runtime method добавлять только для действительно cross-cutting lifecycle operation.
5. Named command должен валидировать unknown payload на своей boundary.
6. Document mutation обернуть `documentCommand()` или explicit `batchUpdates()`.
7. Добавить cleanup subscription в `unsubscribeFns`.
8. Проверить revision notification, undo boundary, snapshots и destroy.

## Основные consumers

- React hooks используют `subscribe()` и `revision` через external-store pattern.
- Page/edgeless surfaces читают `blocks`, `elements`, `mode` и `selection`.
- Keyboard, slash, clipboard и drag extensions вызывают typed methods или named commands.
- Demo использует public managers и factory как integration host.
- Applications могут внедрить custom `CRDTDoc`, persistence и provider lifecycle.
