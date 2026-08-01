# Курс: связь DocumentModel и render в Rivto

## Для кого этот курс

Курс рассчитан на junior frontend-разработчика, который понимает React props и
state, но пока не видит, как collaborative document вообще оказывается на
экране.

Мы пройдём полный круг:

```text
CRDT storage
  → DocumentModelImpl
  → EditorRuntime
  → React binding
  → renderer
  → DOM
  → browser event
  → command
  → DocumentModelImpl
  → CRDT storage
```

## Порядок чтения

| Глава | Что изучаем | Главные файлы |
| --- | --- | --- |
| [00](./00-two-directions.md) | Архитектурные слои и два data flows | общая карта проекта |
| [01](./01-materializing-document.md) | CRDT containers → detached `Block[]` | `document-model.ts`, document types |
| [02](./02-subscription-pipeline.md) | CRDT update → runtime revision → React render | `rivto-editor.ts`, React binding |
| [03](./03-render-resolution.md) | block type → definition → mode renderer → DOM | `block-registry.ts`, `renderers.tsx` |
| [04](./04-mutation-round-trip.md) | DOM event → command → transaction и debugging | runtime commands и renderers |

## Одна мысль заранее

Между model и render нет постоянной живой ссылки на один mutable block object.

При каждом чтении:

```ts
editor.getBlocks()
```

`DocumentModelImpl` заново материализует обычный detached tree. После изменения
runtime сообщает React: «старый render может быть неактуален». React перечитывает
tree и строит DOM заново там, где это необходимо.

## Связанные курсы

- [React editor](../react-editor/README.md) подробно разбирает hooks,
  `contentEditable` и renderer interactions.
- [Selection и clipboard](../selection-and-clipboard/README.md) разбирает
  синхронизацию browser DOM selection с portable runtime selection.
- [Undo и redo](../undo-history/README.md) объясняет, как model transactions
  попадают в local CRDT history.

## Карта основных файлов

```text
src/store/
├── crdt-doc/                         adapter-neutral CRDT interfaces
└── document-model/core/
    ├── document-model.ts             storage ↔ portable values
    └── types/document.ts             Block, Link, Snapshot

src/editor/
├── editor/rivto-editor.ts            commands и invalidation stream
├── blocks/
│   ├── block-definition.ts           presentation contract
│   └── block-registry.ts             type → definition/renderer
└── react/
    ├── rivto-editor.tsx              subscription и renderer selection
    └── renderers.tsx                 Block tree → DOM
```
