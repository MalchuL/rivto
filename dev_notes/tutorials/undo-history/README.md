# Курс: undo и redo в Rivto

## Для кого этот курс

Курс рассчитан на junior frontend-разработчика, который уже умеет вызывать
функции и работать с объектами TypeScript, но может не знать:

- что такое транзакция;
- почему collaborative editor не хранит копию всего документа после каждого
  символа;
- чем локальное изменение отличается от удалённого;
- зачем транзакции нужен `origin`;
- почему одно нажатие Undo иногда отменяет несколько низкоуровневых операций.

## Как проходить курс

| Глава | Что изучаем | Главные файлы |
| --- | --- | --- |
| [00](./00-mental-model.md) | Простая модель истории и отличие от snapshots | сначала без кода |
| [01](./01-runtime-path.md) | Полный путь от кнопки до Yjs | `rivto-editor.ts`, `undo-manager.ts` |
| [02](./02-transactions-and-origin.md) | scopes, transactions, origin, grouping | `document-model.ts`, `yjs-doc.ts` |
| [03](./03-lifecycle-testing-debugging.md) | очистка, destroy, тесты и диагностика | runtime tests и demo |

## Одна мысль, которую нужно запомнить

Rivto не реализует алгоритм Undo самостоятельно.

```text
HistoryManager
    = публичное имя в EditorRuntime
    = тот же класс UndoManager
    = тонкая adapter-neutral обёртка
    = над Y.UndoManager в текущем Yjs adapter
```

Rivto решает не задачу «как обратить CRDT-изменение», а задачу «какие
изменения считать локальными, какие структуры включить в историю и через какой
публичный API запускать undo/redo».

## Карта кода

```text
src/editor/
├── editor/
│   ├── types.ts                 history.undo/history.redo contracts
│   └── rivto-editor.ts          регистрация команд и очистка baseline
└── managers/
    ├── history-manager.ts       публичный alias
    └── undo-manager.ts          adapter-neutral wrapper

src/store/
├── document-model/core/
│   └── document-model.ts        scopes, origin и transact()
└── crdt-doc/
    ├── types/
    │   ├── doc.ts               createUndoManager contract
    │   └── undo.ts              CRDTUndoManager contract
    └── yjs-doc/yjs-doc.ts       адаптация к Y.UndoManager
```

