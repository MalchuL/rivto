# Интеграция модели документа в Rivto

CRDT-каталог предоставляет механику хранения. Document model задаёт смысл корней, проверяет иерархию, предоставляет focused operations и создаёт версионированные snapshots приложения.

## Владение во время выполнения

Host создаёт `DocumentModelImpl` поверх выбранного `CRDTDoc` и передаёт готовую модель в `EditorRuntime`. Core editor не создаёт и не знает конкретный CRDT adapter.

```text
EditorRuntime
  владеет DocumentModelImpl
    владеет CRDTDoc
      владеет shared-корнями и подключениями провайдеров
```

`await editor.destroy()` освобождает runtime subscriptions, managers, commands и undo history, затем вызывает `crdt.destroy()`. Для `YjsDoc` это отключает все providers и уничтожает `Y.Doc`; переданный editor-у document поэтому считается owned ресурсом runtime.

## `DocumentModelImpl`

Основной потребитель контракта `CRDTDoc`.

### Транзакции

Каждая мутация выполняется через `crdt.transact(operation)`. CRDT adapter назначает приватный стабильный local origin. Группировка сохраняет инварианты и позволяет undo отличать локальные операции.

### Подписки

`subscribe()` регистрирует `crdt.on("update", handler)`. React и другие потребители получают общий сигнал invalidation, не импортируя события Yjs.

### Области undo

Каждый storage manager объявляет принадлежащие ему `undoScopes`. `DocumentModelImpl` объединяет их в constructor-local массив и один раз передаёт в `DocumentHistoryManager`; core runtime повторно использует `document.history` и не получает aggregate scopes или origin.

### Snapshots

`getSnapshot()` и `loadSnapshot()` модели используют версионированную схему Rivto: блоки, элементы, связи, plugin data и порядок корней. Это не бинарные методы `YjsDoc` с похожими именами.

## Корни хранилища

### `roots`: `CRDTArray<string>`

Упорядоченные ID верхнеуровневых блоков. Перемещение и вложение транзакционно изменяет этот массив и массивы детей.

### `blocks`: `CRDTMap<BlockStorage>`

Карта ID блоков к shared-записям. Запись содержит:

- атомарные `id` и `type`;
- `content` как `CRDTText`;
- `children` как `CRDTArray<string>`;
- `props`, `listProps` и `pluginData` как `CRDTMap`.

Block manager создаёт вложенные значения через `crdt.createDetached*()`, присоединяет их к карте блока и изменяет через focused contracts.

### `elements`: `CRDTMap<ElementStorage>`

Карта edgeless-элементов. Запись содержит атомарные идентичность и тип, а также shared-карты `frame` и `props`. Элементы и блоки являются разными сущностями, даже если edgeless-элемент отображает содержимое блока.

### `links`: `CRDTMap<LinkStorage>`

Карта связей с endpoints и metadata. Правила и cleanup принадлежат link manager; CRDT-карта отвечает только за совместное хранение.

### `plugins`: `CRDTMap`

Namespaced-данные плагинов. Plugin-data manager выделяет отдельную вложенную карту каждому namespace.

## Ответственность менеджеров

### Block manager

Использует `getArray("roots")`, `getMap("blocks")` и `createDetached*()`. Поддерживает связи parent/child, стабильные ID, content, props и порядок. Изменение иерархии обновляет все затронутые массивы одной транзакцией.

### Element manager

Использует `getMap("elements")` и создаёт shared-карты элемента, frame и props. Владеет геометрией и жизненным циклом edgeless-элементов.

### Link manager

Использует `getMap("links")` и shared-запись каждой связи. Владеет правилами endpoints и очисткой удалённых сущностей.

### Plugin-data manager

Использует `getMap("plugins")` и вложенные карты. Это поддерживаемая точка расширения совместного состояния плагинов.

### History manager

Управляет `batchUpdates` и `batchUpdatesWithoutHistory` через `CRDTDoc`, а `undo`, `redo`, `clear`, `stopCapturing` и `destroy` делегирует в `CRDTUndoManager`. Нативный `Y.UndoManager` остаётся скрыт в adapter layer.

## Присваивание при загрузке snapshot

Helpers модели обновляют существующие shared-значения вместо замены всего Yjs-документа:

- карта очищается через `clear()`, затем получает клонированные записи через `set()`;
- старый диапазон текста удаляется, после чего вставляется новый;
- старый диапазон массива удаляется, после чего вставляются новые элементы.

Все операции выполняются транзакционно. Повторное использование корней сохраняет ссылки менеджеров и отделяет восстановление схемы от бинарной репликации.

## Добавление persisted-поля

1. Определите смысл и проверку в `store/document-model/core`.
2. Выберите атомарное значение или shared map/array/text согласно ожидаемым конкурирующим изменениям.
3. Создавайте shared-значения через `crdt.createDetached*()`.
4. Изменяйте их через владеющий manager и `DocumentModelImpl.transact()`.
5. Добавьте контейнер в undo scopes, если изменение должно отменяться.
6. Обновите dump/load snapshot, clipboard и rendering consumers.
7. Добавьте локальный regression test и browser test только для межслойного поведения.

Не импортируйте Yjs в manager. Если общему контракту не хватает операции, расширьте узкий CRDT-контракт и адаптер, а не обходите границу.

## Атомарное или совместное значение

Обычный примитив или объект подходит, когда значение заменяется только целиком. CRDT-wrapper нужен для независимого редактирования частей:

- `CRDTText` — объединение правок символов;
- `CRDTArray` — независимые вставки и удаления в порядке;
- `CRDTMap` — независимые изменения именованных полей.

Выбор влияет на конфликты, snapshots, clipboard cloning, undo scopes и rendering, поэтому относится к инварианту документа, а не к UI.

## Пользовательские адаптеры

Другую реализацию `CRDTDoc` можно передать в `createRivtoEditor({ document })`. Она должна сохранять ожидаемую семантику:

- стабильная идентичность корневых контейнеров;
- транзакционные update-уведомления;
- живые wrapper вложенных значений;
- рекурсивная JSON-совместимая сериализация;
- undo с учётом origin;
- детерминированный cleanup;
- объединяемые snapshots конкретной реализации.

Встроенные broadcast и WebRTC providers не заработают автоматически с не-Yjs адаптером. Для него нужны соответствующие провайдеры, либо документ останется локальным.
