# Модель документа

Каталог `store/document-model` определяет каноническую прикладную структуру Rivto поверх абстрактного `CRDTDoc`. CRDT-слой предоставляет совместные контейнеры, а document model решает, какие сущности существуют, как они связаны, какие операции допустимы и как выглядит переносимый snapshot.

## Архитектурная граница

```text
EditorRuntime
  -> DocumentModelImpl
    -> DocumentBlockManager
    -> DocumentElementManager
    -> DocumentLinkManager
    -> DocumentPluginDataManager
      -> CRDTDoc
        -> CRDTMap / CRDTArray / CRDTText
```

`EditorRuntime` создаёт модель и предоставляет более высокий API через публичные editor managers. React-пакет вызывает эти операции, но не меняет persisted storage напрямую.

## Основные обязанности

- хранить блоки как дерево стабильных ID;
- хранить first-class canvas elements отдельно от блоков;
- хранить связи между существующими блоками;
- предоставлять namespaced document-level plugin data;
- выполнять семантические изменения в CRDT-транзакциях;
- агрегировать undo scopes и единый локальный origin;
- проверять входные данные до destructive snapshot replacement;
- преобразовывать shared storage в detached schema-v6 snapshots;
- нормализовать дерево после конкурентных изменений.

## Корневые CRDT-контейнеры

- `rivto.editor.roots` — порядок корневых блоков;
- `rivto.editor.blocks` — записи всех блоков;
- `rivto.editor.elements` — edgeless elements;
- `rivto.editor.links` — first-class связи;
- `rivto.editor.plugins` — document-level namespaces плагинов.

Менеджеры получают эти контейнеры через `CRDTDoc`, создают вложения через `document.crdt.instantiator` и не импортируют Yjs.

## Пример использования

```ts
const crdt = new YjsDoc("handbook");
const document = new DocumentModelImpl(crdt);

const introduction = document.blocks.insertBlock({
  type: "paragraph",
  content: "Введение",
});

const details = document.blocks.insertBlock({
  type: "paragraph",
  content: "Подробности",
}, introduction);

document.blocks.indentBlock(details);

const snapshot = document.getSnapshot();
document.loadSnapshot(snapshot);
```

Обычно приложение не создаёт `DocumentModelImpl` напрямую: `createRivtoEditor()` делает это внутри `EditorRuntime` и предоставляет `editor.blocks`, `editor.elements`, `editor.links` и другие focused managers.

Вложенные страницы описывают все классы, свойства, методы, аргументы, результаты, исключения, persisted-типы, utilities и реальные consumers модели документа.
