# Слой CRDT-документа

Каталог `store/crdt-doc` — независимая от UI граница Rivto для совместно редактируемых данных. Остальная часть core-пакета зависит от небольших контрактов `CRDTDoc`, `CRDTMap`, `CRDTArray` и `CRDTText`, а не импортирует Yjs напрямую.

Сейчас эти контракты реализованы через [Yjs](https://yjs.dev/). Импорты нативного Yjs остаются внутри `store/crdt-doc/yjs-doc`. Благодаря этому модель документа проще тестировать, а в будущем можно добавить другую CRDT-реализацию.

## Место в архитектуре

```text
createRivtoEditor
  -> EditorRuntime
    -> DocumentModelImpl
      -> контракт CRDTDoc
        -> YjsDoc
          -> Y.Doc

DocumentModelImpl
  -> BlockManager: roots + blocks
  -> ElementManager: elements
  -> LinkManager: links
  -> PluginDataManager: plugins
  -> UndoManager: области CRDT undo

YjsDoc <-> BroadcastChannelProvider или WebRTCProvider
```

`DocumentModelImpl` владеет схемой документа и транзакциями. CRDT-слой отвечает за совместные контейнеры, распространение изменений, бинарное состояние, примитивы undo и подключение провайдеров. React-рендеринг и браузерный ввод сюда не относятся.

## Минимальный пример

```ts
import { YjsDoc } from "@chulane/rivto";

const document = new YjsDoc("example");
const root = document.getMap("root");
const title = document.instantiator.createText();

root.set("title", title); // Присоединяет detached-текст к документу.
title.insert(0, "Совместный заголовок");

const unsubscribe = document.on("update", () => {
  console.log(document.toJSON());
});

unsubscribe();
await document.destroy();
```

Новые массивы, карты и тексты создаются `instantiator` в неприсоединённом состоянии. Перед чтением вставьте их в корневой или другой уже присоединённый CRDT-контейнер. После присоединения изменяйте сам wrapper, чтобы Yjs мог объединять параллельные изменения. Обычный JS-объект внутри контейнера заменяется целиком как атомарное значение.

## Две границы снимков

- `YjsDoc.getSnapshot()` и `applySnapshot()` передают бинарные Yjs updates в виде `Uint8Array`. Они сохраняют CRDT-состояние и подходят для репликации.
- `editor.dump()` и `editor.load()` работают с версионированным прикладным snapshot Rivto. Он описывает блоки, элементы, связи и данные плагинов и является обычным API персистентности для приложений.
- `YjsDoc.toJSON()` и `fromJSON()` — общие вспомогательные функции преобразования дерева. Они не заменяют версионированный snapshot Rivto.

Вложенные страницы описывают все контракты, классы реализации, методы, преобразования, провайдеры и реальные места использования этого каталога в проекте.
