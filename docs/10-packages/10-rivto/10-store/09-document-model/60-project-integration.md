# Интеграция модели документа в Rivto

CRDT-каталог предоставляет механику хранения. Document model задаёт смысл корней, проверяет иерархию, предоставляет focused operations и создаёт версионированные snapshots приложения.

## Владение во время выполнения

`EditorRuntime` принимает необязательный `CRDTDoc`. Если его нет, runtime создаёт `YjsDoc` и передаёт в `DocumentModelImpl`. Это точка подключения другого CRDT-адаптера или заранее настроенной синхронизации.

```text
EditorRuntime
  владеет DocumentModelImpl
    владеет CRDTDoc
      владеет shared-корнями и подключениями провайдеров
```

`await editor.destroy()` освобождает runtime subscriptions, managers, commands и undo history, затем вызывает `document.crdt.destroy()`. Для `YjsDoc` это отключает все providers и уничтожает `Y.Doc`; переданный editor-у document поэтому считается owned ресурсом runtime.

## `DocumentModelImpl`

Основной потребитель контракта `CRDTDoc`.

### Транзакции

Каждая мутация выполняется через `crdt.transact(operation, origin)`. У модели один стабильный origin. Группировка сохраняет инварианты и позволяет undo отличать локальные операции.

### Подписки

`subscribe()` регистрирует `crdt.on("update", handler)`. React и другие потребители получают общий сигнал invalidation, не импортируя события Yjs.

### Области undo

Менеджеры добавляют shared-контейнеры, которые должны участвовать в истории. `DocumentModelImpl` собирает их, а публичный undo manager вызывает `crdt.createUndoManager(scopes, [origin])`. Поэтому в истории оказываются только локальные транзакции модели.

Текущий агрегированный массив строится так:

```ts
this.undoScopes = [
  ...this.blocks.undoScopes,    // blocks map и roots array
  ...this.elements.undoScopes,  // elements map
  ...this.links.undoScopes,     // links map
  ...this.pluginData.undoScopes // plugins map
];
```

Scope — это сам живой CRDT-контейнер, а не его имя. Например, block manager сохраняет `[this.storage, this.roots]`, где `storage` получен через `getMap("blocks")`, а `roots` — через `getArray("roots")`. Новый manager должен аналогично предоставить массив своих корневых `CRDTMap`, `CRDTArray` или `CRDTText`.

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

Block manager создаёт вложенные значения через `crdt.instantiator`, присоединяет их к карте блока и изменяет через focused contracts.

### `elements`: `CRDTMap<ElementStorage>`

Карта edgeless-элементов. Запись содержит атомарные идентичность и тип, а также shared-карты `frame` и `props`. Элементы и блоки являются разными сущностями, даже если edgeless-элемент отображает содержимое блока.

### `links`: `CRDTMap<LinkStorage>`

Карта связей с endpoints и metadata. Правила и cleanup принадлежат link manager; CRDT-карта отвечает только за совместное хранение.

### `plugins`: `CRDTMap`

Namespaced-данные плагинов. Plugin-data manager выделяет отдельную вложенную карту каждому namespace.

## Ответственность менеджеров

### Block manager

Использует `getArray("roots")`, `getMap("blocks")` и instantiator. Поддерживает связи parent/child, стабильные ID, content, props и порядок. Изменение иерархии обновляет все затронутые массивы одной транзакцией.

### Element manager

Использует `getMap("elements")` и создаёт shared-карты элемента, frame и props. Владеет геометрией и жизненным циклом edgeless-элементов.

### Link manager

Использует `getMap("links")` и shared-запись каждой связи. Владеет правилами endpoints и очисткой удалённых сущностей.

### Plugin-data manager

Использует `getMap("plugins")` и вложенные карты. Это поддерживаемая точка расширения совместного состояния плагинов.

### Undo manager

Делегирует `undo`, `redo`, `clear`, `stopCapturing` и `destroy` в `CRDTUndoManager` и ничего не знает о `Y.UndoManager`.

## Присваивание при загрузке snapshot

Helpers модели обновляют существующие shared-значения вместо замены всего Yjs-документа:

- карта очищается через `clear()`, затем получает клонированные записи через `set()`;
- старый диапазон текста удаляется, после чего вставляется новый;
- старый диапазон массива удаляется, после чего вставляются новые элементы.

Все операции выполняются транзакционно. Повторное использование корней сохраняет ссылки менеджеров и отделяет восстановление схемы от бинарной репликации.

## Добавление persisted-поля

1. Определите смысл и проверку в `store/document-model/core`.
2. Выберите атомарное значение или shared map/array/text согласно ожидаемым конкурирующим изменениям.
3. Создавайте shared-значения через `document.crdt.instantiator`.
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
