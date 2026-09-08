# Использование `CRDTInstantiator` внутри CRDT-объектов

`CRDTInstantiator` нужно использовать для создания вложенных совместно редактируемых контейнеров: `CRDTMap`, `CRDTArray` и `CRDTText`. Получайте фабрику через `document.instantiator`, чтобы созданные wrapper-объекты соответствовали CRDT-адаптеру документа.

Утверждение «любое значение для `set()` обязательно создаётся через `CRDTInstantiator`» не совсем верно. Примитивы, `null`, plain objects и plain arrays можно передавать напрямую. Разница заключается в семантике дальнейших изменений:

- CRDT-wrapper синхронизирует внутренние изменения независимо;
- plain object или plain array хранится как атомарное значение и заменяется целиком;
- строка, переданная напрямую, является атомарной строкой;
- `CRDTText`, созданный через `createText()`, поддерживает посимвольное объединение изменений.

## Зачем нужна фабрика

Document model зависит от интерфейсов `CRDTMap`, `CRDTArray` и `CRDTText`, а не от Yjs. Поэтому код модели не должен вызывать `new Y.Map()`, `new Y.Array()` или `new Y.Text()`.

```ts
const metadata = document.instantiator.createMap();
const children = document.instantiator.createArray<string>();
const content = document.instantiator.createText();
```

Это даёт три гарантии:

- используется та же реализация CRDT, что и у документа;
- наружу не протекают нативные типы адаптера;
- значение можно передать в `CRDTMap.set()` или `CRDTArray.insert()` без ручного преобразования.

`YjsMap.set()` и `YjsArray.insert()` намеренно отклоняют raw `Y.Map`, `Y.Array` и `Y.Text`. Сначала их пришлось бы обернуть, но прикладной код должен сразу использовать `CRDTInstantiator`.

## Методы `CRDTInstantiator`

### `createMap<Schema>()`

- **Аргументы:** отсутствуют; `Schema extends object` задаётся generic-параметром.
- **Возвращает:** detached-`CRDTMap<Schema>`.
- **Исключения:** контракт фабрики не задаёт; реализация может передать ошибку конструктора CRDT-адаптера.

Создаёт пустой detached-`CRDTMap<Schema>`. Используйте его для записи с независимо изменяемыми полями или для реестра значений.

```ts
interface SettingsStorage {
  theme: string;
  flags: CRDTMap<Record<string, boolean>>;
}

const settings = document.instantiator.createMap<SettingsStorage>();
```

### `createArray<Item>()`

- **Аргументы:** отсутствуют; `Item extends CRDTType` задаётся generic-параметром.
- **Возвращает:** detached-`CRDTArray<Item>`.
- **Исключения:** контракт фабрики не задаёт; реализация может передать ошибку конструктора адаптера.

Создаёт пустой detached-`CRDTArray<Item>`. Он подходит для совместно изменяемого порядка, вставок и удалений.

```ts
const children = document.instantiator.createArray<string>();
```

### `createText()`

- **Аргументы:** отсутствуют.
- **Возвращает:** detached-`CRDTText`.
- **Исключения:** контракт фабрики не задаёт; реализация может передать ошибку конструктора адаптера.

Создаёт пустой detached-`CRDTText`. Используйте его, когда параллельные изменения должны объединяться на уровне символов и форматирования.

```ts
const title = document.instantiator.createText();
```

### `convertBasicToCRDTType(item, options?)`

- **Аргументы:** `item: BasicType`; необязательный `options: WrapBasicTypeToCRDTOptions`.
- **Возвращает:** `CRDTType`.
- **Исключения:** Yjs-реализация выбрасывает `YjsConvertError` для неподдерживаемого значения и передаёт ошибки создания нативных типов.

Рекурсивно преобразует обычное дерево в CRDT-типы. По умолчанию строки становятся `CRDTText`, массивы — `CRDTArray`, а plain objects и JS `Map` — `CRDTMap`.

```ts
const root = document.getMap<Record<string, CRDTType>>("root");
const collaborative = document.instantiator.convertBasicToCRDTType({
  title: "Документ",
  tags: ["architecture", "crdt"],
  metadata: { reviewed: false },
});

root.set("document", collaborative);
```

Если часть дерева должна оставаться атомарной, отключите соответствующее преобразование:

```ts
const atomicStrings = document.instantiator.convertBasicToCRDTType(
  { title: "Документ", tags: ["architecture"] },
  { string2crdttext: false },
);
```

Если wrapping родительского объекта или массива отключён, вложенные значения под ним также остаются plain values: нативные shared-типы нельзя размещать внутри атомарного JS-контейнера.

### `isPlainRecord(item)`

- **Аргументы:** `item: BasicType`.
- **Возвращает:** `boolean`.
- **Исключения:** для обычных данных отсутствуют; exotic object или `Proxy` может передать ошибку встроенной операции обхода.

Проверяет, можно ли безопасно использовать значение как поддерживаемый deep plain record. Циклические объекты, экземпляры классов, функции и другие неподдерживаемые значения возвращают `false`.

## Detached-состояние и присоединение

Фабрика создаёт shared-типы без документа. Создание само по себе не меняет CRDT и не отправляет update. Тип становится частью документа после вставки в присоединённый корень или другой присоединённый shared-контейнер.

Правильная последовательность:

1. Получить присоединённый root через `document.getMap()`, `getArray()` или `getText()`.
2. Создать необходимые вложенные типы через `document.instantiator`.
3. Собрать detached-дерево с помощью операций записи.
4. Вставить верхний wrapper в присоединённый root.
5. Читать и дальше изменять присоединённые wrapper-объекты.

Методы записи Yjs-wrapper могут подготовить содержимое detached-типа. Методы чтения `get()`, `length`, `toJSON()` и аналогичные методы защищены и выбрасывают `YjsNotAttachedError` до интеграции.

## Полный пример вложенной записи

```ts
interface TaskStorage {
  id: string;
  title: CRDTText;
  children: CRDTArray<string>;
  metadata: CRDTMap<Record<string, CRDTType>>;
}

const document = new YjsDoc("tasks");
const tasks = document.getMap<Record<string, CRDTMap<TaskStorage>>>("tasks");
const origin = Symbol("task-manager");

document.transact(() => {
  const task = document.instantiator.createMap<TaskStorage>();
  const title = document.instantiator.createText();
  const children = document.instantiator.createArray<string>();
  const metadata = document.instantiator.createMap<Record<string, CRDTType>>();

  // Запись в detached-карту подготавливает всё вложенное дерево.
  task.set("id", "task-1");
  task.set("title", title);
  task.set("children", children);
  task.set("metadata", metadata);

  // Одна вставка присоединяет task и все вложенные shared-типы.
  tasks.set("task-1", task);

  // Теперь чтение и дальнейшие shared-изменения безопасны.
  title.insert(0, "Написать документацию");
  children.push("task-1-1");
  metadata.set("priority", "high");
}, origin);
```

Все создание, присоединение и начальное заполнение выполняются одной транзакцией. Другие consumers увидят согласованную запись, а undo сможет отменить операцию как одну группу, если root входит в его scopes и `origin` отслеживается.

## Когда прямой `set()` правильный

Прямые plain values подходят для полей, которые логически заменяются целиком:

```ts
const record = document.instantiator.createMap<Record<string, CRDTType>>();
root.set("record", record);

record.set("id", "task-1");
record.set("position", { x: 100, y: 240 });
record.set("visible", true);
```

Изменение исходного объекта после `set()` не является CRDT-операцией:

```ts
const position = { x: 100, y: 240 };
record.set("position", position);

position.x = 300; // Не использовать: CRDT update не создаётся.

record.set("position", { ...position, x: 300 }); // Атомарная замена.
```

Если `x` и `y` должны параллельно редактироваться и объединяться независимо, вместо plain object создайте вложенный `CRDTMap` через `createMap()`.

## Как это делает Rivto

Block manager создаёт одну карту записи и все совместные вложения через `document.crdt.instantiator`:

```ts
const model = document.crdt.instantiator.createMap<BlockStorage>();
const props = document.crdt.instantiator.createMap();
const content = document.crdt.instantiator.createText();
const children = document.crdt.instantiator.createArray<string>();

model.set("id", id);           // атомарный примитив
model.set("props", props);     // shared map
model.set("content", content); // shared text
model.set("children", children); // shared array
storage.set(id, model);         // присоединение полного дерева
```

Element manager тем же способом создаёт карты `frame` и `props`, link manager создаёт карту записи связи, а plugin-data manager — карту namespace. Благодаря этому ни один manager не зависит от Yjs напрямую.

## Частые ошибки

- Не создавайте нативные `Y.Map`, `Y.Array` или `Y.Text` в document model.
- Не пытайтесь читать wrapper до его присоединения.
- Не вставляйте один shared-wrapper в два разных места: после интеграции у него один parent.
- Не передавайте wrapper от несовместимого CRDT-адаптера.
- Не изменяйте plain object или array «на месте» после `set()`; передавайте новое значение повторным `set()`.
- Помните, что `convertBasicToCRDTType()` по умолчанию превращает даже вложенные строки в `CRDTText`.
- Выполняйте присоединение и связанные начальные изменения внутри `document.transact()` с нужным undo origin.

## Правило выбора

Используйте `CRDTInstantiator`, если части значения должны редактироваться, синхронизироваться или отменяться независимо. Передавайте plain value напрямую, если оно является одним атомарным полем и всегда заменяется целиком.
