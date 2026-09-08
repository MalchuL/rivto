# Карта модулей document model

## Public entry point

`store/document-model/index.ts` экспортирует core implementation и types. Package root повторно экспортирует этот barrel, поэтому applications получают public types через `@chulane/rivto`.

## Coordinator

- `core/document-model.ts` — `DocumentModelImpl`, manager ownership, transaction origin, update subscription, undo scope aggregation и schema-v6 snapshot orchestration.
- `core/types/document.ts` — public detached records, inputs, patches, snapshots и `DocumentModel` contract.
- `core/types/storage.ts` — точные live CRDT fields и ID aliases.

## Managers

- `core/managers/block-manager/block-manager.ts` — payload, Markdown text, tree ownership, move/merge/indent/outdent, normalization и block snapshot.
- `core/managers/block-manager/utils.ts` — listProps validation, array ID materialization и initial content normalization.
- `core/managers/element-manager/element-manager.ts` — generic edgeless elements, geometry, z-index и props.
- `core/managers/link-manager/link-manager.ts` — block endpoint links и cascading cleanup.
- `core/managers/plugin-data-manager/plugin-data-manager.ts` — namespaced document-level data и promotion plain object в shared map.

## Shared utilities

- `core/utils/crdt.ts` — structural type guards и in-place map/text/array assignment.
- `core/utils/clone.ts` — recursive detachment portable values, включая cross-realm arrays.

## Tests

- `core/__tests__/document-model.v5.test.ts` — несмотря на историческое имя файла, проверяет текущий schema version 6: storage roots, snapshots, hierarchy, convergence, elements, links, text, props и normalization.
- `core/__tests__/plugin-data-manager.test.ts` — namespace isolation, shared map promotion, undo и convergence.

## Поток вызова

```text
React extension / demo / host application
  -> public editor manager or command
    -> DocumentModel focused manager
      -> DocumentModel.transact(origin)
        -> CRDT wrapper mutation
          -> update subscribers / undo / provider
```

## Ownership rules

- Domain invariants и persisted shape меняются в `store/document-model/core`.
- Public user operations проходят через focused core managers, а не через forwarding methods editor.
- Managers создают shared values только через `document.crdt.instantiator`.
- Mutations используют `document.transact()` и стабильный `origin`.
- Snapshot validation выполняется до destructive writes, поскольку CRDT transaction не гарантирует rollback.
- Blocks и elements остаются отдельными entity families.
- Native Yjs imports запрещены за пределами `store/crdt-doc/yjs-doc`.

## Основные consumers

- `EditorRuntime` создаёт модель, подписывается на updates и управляет persistence/history.
- core `BlockManager`, `ElementManager` и `LinkManager` регистрируют commands и делегируют document operations.
- React page surface использует ordered block tree, hierarchy operations и text updates.
- React edgeless surface materializes elements и их geometry.
- Clipboard переносит detached blocks/links между документами через public managers.
- Demo создаёт blocks, nested outlines, links и canvas elements как integration host.

## Checklist изменения schema

1. Обновить public input/output и storage types.
2. Создать новые shared fields через instantiator.
3. Добавить validation до первой destructive write.
4. Сохранить nested container identity при patch/load.
5. Обновить snapshot version и migration boundary, если форма меняется несовместимо.
6. Проверить clone/materialization, undo scopes и link cleanup.
7. Проверить page и edgeless consumers.
8. Добавить colocated regression tests; Playwright нужен только для browser/cross-layer behavior.
