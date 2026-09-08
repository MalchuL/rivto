# Учебные материалы по внутренностям Rivto

Эта папка — не справочник API, а набор последовательных курсов для
разработчика, который впервые открывает код редактора. Здесь сначала строится
простая модель в голове, затем по шагам разбирается настоящий путь выполнения
в исходниках, и только после этого обсуждаются изменение кода, тесты и отладка.

## С чего начать

Если вы пока плохо знакомы с устройством редакторов, проходите курсы в таком
порядке:

1. [DocumentModel и render](./document-model-to-render/README.md) — полный
   круг данных от CRDT storage до DOM и обратно.
2. [React editor](./react-editor/README.md) — общая граница между React, DOM и
   `EditorRuntime`.
3. [Selection и clipboard](./selection-and-clipboard/README.md) — курсор,
   выделение, Copy, Cut и Paste.
4. [Undo и redo](./undo-history/README.md) — транзакции, origin и локальная
   история CRDT.
5. [Plugins](./plugins/README.md) — расширение runtime блоками, командами,
   событиями и UI.

Если editor нужно собрать заново после удаления реализации, используйте
[план переимплементации editor](./editor-reimplementation-plan.md) как дорожную
карту по фазам.

Порядок не является строгим. Если задача касается только plugin, можно сразу
открыть соответствующий курс. Все специальные термины объясняются внутри.

## Главная архитектурная линия

```text
пользователь
    ↓
DOM-событие в React renderer
    ↓
EventRouter или CommandRegistry
    ↓
EditorRuntime
    ↓
DocumentModelImpl
    ↓
CRDTDoc
    ↓
Yjs adapter
```

Обратное направление работает через подписки:

```text
изменился CRDT document
    ↓
EditorRuntime увеличил revision
    ↓
useSyncExternalStore запросил новый snapshot
    ↓
React снова построил DOM
```

Если при чтении кода непонятно, где должна жить новая логика, сначала найдите
её место на этих двух цепочках.
