# Связь DocumentModel и render в Rivto: учебный курс

Этот файл — точка входа в подробный русскоязычный курс
[`tutorials/document-model-to-render`](./tutorials/document-model-to-render/README.md).

Главы:

1. [Два направления движения данных](./tutorials/document-model-to-render/00-two-directions.md)
2. [От CRDT storage до portable Block](./tutorials/document-model-to-render/01-materializing-document.md)
3. [От model update до React render](./tutorials/document-model-to-render/02-subscription-pipeline.md)
4. [Как renderer выбирает представление block](./tutorials/document-model-to-render/03-render-resolution.md)
5. [Обратный путь и отладка полного круга](./tutorials/document-model-to-render/04-mutation-round-trip.md)

После курса будет понятно:

- почему `DocumentModelImpl` не возвращает React components;
- как CRDT maps, arrays и texts превращаются в обычный detached `Block[]`;
- зачем между model и React находится `EditorRuntime`;
- почему `revision` является сигналом invalidation, а не самим document state;
- как `useSyncExternalStore` узнаёт о local и remote updates;
- как `BlockRegistry` соединяет persisted `block.type` с renderer;
- почему block и edgeless modes показывают один и тот же document по-разному;
- как browser event проходит через command обратно к `DocumentModelImpl`;
- на каком шаге искать ошибку, если model изменилась, но DOM нет, или наоборот.

Это лучший стартовый курс, если общая архитектура пока выглядит как набор
manager-классов без очевидной связи.

