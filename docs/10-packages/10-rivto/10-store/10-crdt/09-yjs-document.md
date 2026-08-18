# `YjsDoc`

`YjsDoc` — встроенная реализация `CRDTDoc`. Класс владеет нативным `Y.Doc`, предоставляет его через независимые от адаптера wrapper-объекты и выбирается редактором как стандартное Yjs-хранилище.

Исходник: `packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/yjs-doc.ts`.

## Создание и свойства

### `constructor(id, doc?)`

- **Аргументы:** `id: string`; необязательный `doc: Y.Doc`.
- **Создаёт:** новый `YjsDoc`, использующий переданный `Y.Doc` или новый нативный документ.

Создаёт адаптер с логическим идентификатором `id`. Переданный `Y.Doc` будет обёрнут; без него создаётся новый документ. Конструктор также создаёт `YjsInstantiator` и реестр провайдеров.

```ts
const fresh = new YjsDoc("fresh-document");
const wrapped = new YjsDoc("imported-document", existingYDoc);
```

### `doc`

- **Тип:** `Y.Doc`, публичное `readonly`-свойство.
- **Значение:** нативный документ, переданный конструктору или созданный им.
- **Исключения при чтении:** отсутствуют.

Публичный нативный `Y.Doc`. Провайдеры используют его для подписки на Yjs updates и обмена состоянием. Обычный код модели должен работать через `CRDTDoc`.

### `id`

- **Тип:** `string`, публичный getter.
- **Значение:** приватное поле `_id` из конструктора.
- **Исключения при чтении:** отсутствуют.

Возвращает логический ID из конструктора. Если пользователь не передал документ, `EditorRuntime` создаёт ID с префиксом `rivto-`.

### `instantiator`

- **Тип:** `CRDTInstantiator`, публичное `readonly`-свойство.
- **Значение:** один экземпляр `YjsInstantiator` на `YjsDoc`.
- **Исключения при чтении:** отсутствуют.

Возвращает `YjsInstantiator` через общий контракт `CRDTInstantiator`. Менеджеры блоков, элементов, связей и плагинов создают через него вложенные shared-типы.

## Жизненный цикл провайдера

### `attachProvider(provider)`

- **Аргументы:** `provider: Provider`.
- **Возвращает:** `Promise<ProviderCleanup>`, где `ProviderCleanup` — асинхронная функция `() => Promise<void>` для отключения этого экземпляра провайдера.
- **Исключения:** обычный `Error`, если `provider.id` уже зарегистрирован; также передаёт rejection или синхронную ошибку `provider.connect`.

Проверяет уникальность `provider.id`, сохраняет провайдер и ожидает `provider.connect(this)`. Если подключение завершается ошибкой, запись удаляется и тот же ID можно использовать снова. Встроенные провайдеры проверяют, что документ является `YjsDoc`, прежде чем обращаться к `doc`.

Возвращённый cleanup отключает только тот экземпляр, для которого он был создан. Повторный вызов является no-op; cleanup также не отключит более новый провайдер, который позднее использовал тот же ID.

```ts
const cleanup = await document.attachProvider(provider);
// ...
await cleanup();
```

### `detachProvider(id?)`

- **Аргументы:** необязательный `id: string`.
- **Возвращает:** `Promise<void>` после `provider.disconnect(this)` и удаления записи.
- **Исключения:** без ID — обычный `Error("Storage is empty")`, если провайдеров нет, или `Error("Storage has multiple items")`, если их больше одного; с ID — `Error`, если такой провайдер не зарегистрирован; также передаёт ошибку `disconnect`.

Без ID выбирает единственный зарегистрированный провайдер. Если подключено несколько провайдеров, вызывающий код должен явно передать ID. Метод ожидает `disconnect(this)` и только затем удаляет запись, поэтому после ошибки отключения провайдер остаётся зарегистрированным и операцию можно повторить.

```ts
await document.detachProvider(); // когда провайдер ровно один
await document.detachProvider(provider.id); // явный выбор среди нескольких
```

## Транзакции и undo

### `transact(operation, origin?)`

- **Аргументы:** `operation: () => void`; необязательный `origin: unknown`.
- **Возвращает:** `void`.
- **Исключения:** передаёт исключение callback и ошибки `Y.Doc.transact`.

Вызывает `Y.Doc.transact`. Yjs группирует уведомления наблюдателей и помечает транзакцию значением `origin`. `DocumentModelImpl` передаёт один стабильный origin для всех локальных изменений.

Callback не получает объект транзакции или `meta`: adapter-neutral контракт принимает только `() => void`. Для классификации изменений, включая область локального undo, используется отдельный `origin`.

### `createUndoManager(scopes, trackedOrigins?)`

- **Аргументы:** `scopes: CRDTUndoScope[]`; `trackedOrigins: unknown[] = []`.
- **Возвращает:** объект `CRDTUndoManager` с пятью делегирующими методами.
- **Исключения:** `unwrapCRDTtoYJS` может выбросить `Error` или `YjsConvertError` для несовместимой области; ошибки конструктора `Y.UndoManager` также передаются.

Разворачивает каждый `CRDTUndoScope` в нативный Yjs-тип и создаёт `Y.UndoManager`. `trackedOrigins` преобразуется в `Set`. Возвращаемый facade делегирует `undo`, `redo`, `clear`, `stopCapturing` и `destroy`, не раскрывая Yjs верхним слоям.

Rivto собирает области хранения в `DocumentModelImpl`. Публичная история отслеживает только локальный origin модели, поэтому удалённые изменения не попадают в локальный undo.

#### Что входит в `scopes`

Каждый элемент массива должен быть `YjsMap`, `YjsArray` или `YjsText`, полученным из того же `YjsDoc`. Метод разворачивает wrapper через `unwrapCRDTtoYJS`, поэтому plain object, строковый path, raw `Y.Map` и wrapper другого адаптера не подходят.

Передавайте минимальный набор корней, владеющих нужным состоянием:

- `blocks` и `roots` для записей блоков и их верхнеуровневого порядка;
- `elements` для edgeless-элементов;
- `links` для связей;
- `plugins` для document-level plugin data;
- отдельный `CRDTText`, если история должна отслеживать только этот текст.

Вложенный `CRDTText`, `CRDTMap` или `CRDTArray`, интегрированный под отслеживаемым корнем, покрывается областью этого корня. Перечислять каждое вложенное значение обычно не требуется.

#### Ручное создание

```ts
const document = new YjsDoc("article");
const article = document.getMap("article");
const body = document.instantiator.createText();
article.set("body", body); // Сначала присоединяем вложенный scope.

const origin = Symbol("article-editor");
const history = document.createUndoManager([article], [origin]);

document.transact(() => {
  body.insert(0, "Первая версия");
}, origin);

history.undo();
```

`origin` сравнивается по identity, а не по описанию. Сохраните один объект или `Symbol` и повторно используйте его во всех локальных транзакциях. Если `trackedOrigins` оставить пустым, текущий `YjsDoc` передаст Yjs пустой `Set`; для предсказуемой локальной истории Rivto всегда передаёт собственный origin явно.

Создавайте manager после того, как scopes присоединены и известен их окончательный набор. При добавлении новой независимой корневой области создайте history заново либо включите эту область в агрегированный `document.undoScopes` до создания публичного `UndoManager`.

## Корневые shared-типы

### `getArray(path)`

- **Аргументы:** `path: string`; generic `Item extends CRDTType`.
- **Возвращает:** новый wrapper `YjsArray<Item>` над стабильным корнем `Y.Array`.
- **Исключения:** Yjs выбрасывает ошибку при конфликте типа существующего корня; ошибки wrapping передаются вызывающему коду.

Вызывает `Y.Doc.getArray(path)` и оборачивает присоединённый массив в `YjsArray`. Менеджер блоков использует `getArray("roots")`.

### `getMap(path)`

- **Аргументы:** `path: string`; generic `Schema extends object`.
- **Возвращает:** новый wrapper `YjsMap<Schema>` над стабильным корнем `Y.Map`.
- **Исключения:** Yjs выбрасывает ошибку при конфликте типа существующего корня; ошибки wrapping передаются.

Вызывает `Y.Doc.getMap(path)` и возвращает `YjsMap`. Этим методом создаются основные реестры модели документа.

### `getText(path)`

- **Аргументы:** `path: string`.
- **Возвращает:** новый wrapper `YjsText` над стабильным корнем `Y.Text`.
- **Исключения:** Yjs выбрасывает ошибку при конфликте типа существующего корня; ошибки wrapping передаются.

Вызывает `Y.Doc.getText(path)` и возвращает `YjsText`.

Для одного корневого имени в Yjs должен использоваться один стабильный тип. Нельзя запрашивать один `path` как контейнеры разных видов.

## События

### `on(event, handler)`

- **Аргументы:** `event: "update" | "sync"`; `handler: (event: any) => void`.
- **Возвращает:** `Unsubscribe`, вызывающий `doc.off(event, handler)`.
- **Исключения:** ошибки `doc.on` передаются сразу; исключения handler возникают при отправке события. `sync` не является обычным событием `Y.Doc`, поэтому его фактическая поддержка зависит от runtime Yjs.

Регистрирует обработчик на нативном документе и возвращает функцию отписки. `DocumentModelImpl.subscribe()` слушает `update`, чтобы уведомлять редактор и о локальных, и об удалённых изменениях.

Реализация напрямую передаёт имена `update` и `sync`. В проекте проверено событие `update`; состояние синхронизации лучше получать от провайдера, а не предполагать его наличие у `Y.Doc`.

Один экземпляр поддерживает любое число distinct handlers одного события. Новый `on("update", secondHandler)` добавляет `secondHandler` и не заменяет первый. Native Yjs хранит handlers в `Set`, поэтому одна и та же function reference для того же event эффективно присутствует один раз:

```ts
const first = document.on("update", () => invalidatePreview());
const second = document.on("update", () => persistDraft());

// Оба callback получат следующий update.
first(); // Удаляет только первый callback.
second();
```

Если передать одну и ту же function reference дважды, два независимых registrations не создаются; вызов любого полученного cleanup удалит эту единственную effective registration. Две разные arrow functions считаются разными handlers. Повторный cleanup безопасен, а подписка не вызывается немедленно при регистрации.

`update` обычно emitted один раз после завершения одной Yjs transaction, даже если внутри выполнено несколько map/array/text writes. Handler получает native update payload первым аргументом; public type намеренно оставляет его как `any`. Исключение одного handler не изолируется этим wrapper-ом и может прервать текущую цепочку доставки.

Поддержка имён по built-in implementation:

- `update` — реальное и протестированное событие `Y.Doc`;
- `sync` — принимается сигнатурой wrapper-а, но обычный `Y.Doc` его не emits; sync events принадлежат provider-у;
- `snapshot` — присутствует в общем `CRDTDoc` contract, но отсутствует в сигнатуре `YjsDoc.on()` и не emitted `getSnapshot()`/`applySnapshot()`.

## Бинарное состояние

### `getSnapshot()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `Uint8Array` (в сигнатуре пока указан `any`).
- **Исключения:** передаёт ошибки `Y.encodeStateAsUpdate`.

Вызывает `Y.encodeStateAsUpdate(doc)` и возвращает `Uint8Array`. Несмотря на имя метода, результат является объединяемым Yjs update с текущим состоянием.

### `applySnapshot(snapshot)`

- **Аргументы:** `snapshot: any`; значение сначала передаётся в `new Uint8Array(snapshot)`.
- **Возвращает:** `void`.
- **Исключения:** `TypeError`/`RangeError` при невозможном преобразовании и ошибки `Y.applyUpdate` для повреждённого update.

Вызывает `Y.applyUpdate(doc, snapshot)`. Метод принимает только совместимые байты Yjs update и объединяет их с текущим состоянием, а не заменяет документ как прикладная операция загрузки.

```ts
const update = source.getSnapshot();
target.applySnapshot(update);
```

## Преобразование в обычные данные

### `toJSON()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `BasicType`, фактически `Record<string, BasicType>` корней.
- **Исключения:** обычный `Error`, если корень остаётся `AbstractType`; `YjsConvertError` для неподдерживаемого значения.

Обходит реестр корневых shared-типов, разрешает каждый корень через `doc.get(key)` и преобразует его в `BasicType`. Если синхронизированный корень остался абстрактным типом, текущая реализация выбрасывает обычный `Error` с указанием нужного типизированного getter.

Перед использованием общего JSON-представления корни следует явно получить через `getMap`, `getArray` или `getText`.

### `fromJSON(data)`

- **Аргументы:** `data: BasicType`; необязательный `options: WrapBasicTypeToCRDTOptions`.
- **Возвращает:** `void`.
- **Исключения:** обычный `Error` для `null`, примитивного/массивного корня или неподдерживаемого типа корневого значения; `YjsConvertError` и ошибки wrapper/Yjs для неподдерживаемых вложений.

Проверяет, что `data` — объект, но не массив, очищает реестр корней и восстанавливает поддерживаемые типы в одной Yjs-транзакции. Корневыми значениями могут быть объекты, JS `Map`, массивы или строки; примитивные корни отклоняются. Вложенные значения преобразуются через `wrapBasicTypeToCRDTType`. Некорректные данные сейчас приводят к обычному `Error`.

Метод восстанавливает общие CRDT-корни, но не проверяет инварианты блоков и элементов Rivto. Для прикладной персистентности используйте `editor.load()`.

## Уничтожение

### `destroy()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `Promise<void>` после отключения всех providers и уничтожения `Y.Doc`.
- **Исключения:** первая ошибка `provider.disconnect()`; `Y.Doc.destroy()` всё равно вызывается после завершения всех disconnect operations.

Сначала удаляет provider registrations и параллельно ожидает каждый `provider.disconnect(this)`. Затем вызывает `Y.Doc.destroy()`, удаляя нативные listeners и освобождая ресурсы. Если providers отсутствуют, native document уничтожается синхронно, а метод возвращает resolved Promise.

## Создание в проекте

Если в `createRivtoEditor()` не передан `document`, `EditorRuntime` создаёт `YjsDoc` со случайным ID и передаёт его в `DocumentModelImpl`:

```ts
const editor = createRivtoEditor();
```

Приложение может внедрить заранее настроенный документ:

```ts
const document = new YjsDoc("team-handbook");
const cleanupProvider = await document.attachProvider(
  new BroadcastChannelProvider("team-handbook"),
);

const editor = createRivtoEditor({ document });

// При завершении жизненного цикла:
await cleanupProvider();
```

Именно возможность такого внедрения объясняет, почему менеджеры зависят от `CRDTDoc`, а не создают Yjs-типы напрямую.
