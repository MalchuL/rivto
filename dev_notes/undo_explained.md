# Undo и redo в Rivto: учебный курс

Этот файл — короткая точка входа. Полный русскоязычный курс находится в
каталоге [`tutorials/undo-history`](./tutorials/undo-history/README.md).

Читайте главы по порядку:

1. [Простая модель Undo](./tutorials/undo-history/00-mental-model.md)
2. [Полный путь через runtime](./tutorials/undo-history/01-runtime-path.md)
3. [Transactions, scopes и origin](./tutorials/undo-history/02-transactions-and-origin.md)
4. [Lifecycle, тесты и отладка](./tutorials/undo-history/03-lifecycle-testing-debugging.md)

После курса будет понятно:

- почему история не является массивом JSON snapshots;
- как local origin отделяет свои операции от remote updates;
- какие CRDT structures входят в undo scopes;
- как одна command превращается в атомарную transaction;
- почему `HistoryManager` и `UndoManager` — два имени одной реализации;
- когда нужны `clear()`, `stopCapturing()` и `destroy()`;
- почему initial content и загруженный snapshot становятся baseline;
- как диагностировать слишком большой, пустой или не обновляющий UI Undo.

Не начинайте с native `Y.UndoManager`. Сначала прочитайте главы 00 и 01:
Rivto специально прячет adapter details за маленьким `CRDTUndoManager` contract.

