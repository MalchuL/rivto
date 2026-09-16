# Создание detached CRDT-объектов

Вложенные `CRDTMap`, `CRDTArray` и `CRDTText` создаются непосредственно через
тот же `CRDTDoc`, к которому они будут присоединены:

```ts
const root = document.getMap<Record<string, CRDTType>>("root");
const metadata = document.createDetachedMap();
const children = document.createDetachedArray<string>();
const content = document.createDetachedText();

root.set("metadata", metadata);
root.set("children", children);
root.set("content", content);
```

Слово `Detached` важно: эти методы не создают именованный root и не возвращают
самостоятельно читаемый контейнер. Сначала получите присоединённого родителя
через `getMap()` или `getArray()`, затем вставьте значение с помощью `set()`,
`push()` или `insert()`. Записи могут подготовить значение заранее, но операции
чтения до присоединения выбрасывают `YjsNotAttachedError` в Yjs-адаптере.

## Методы `CRDTDoc`

- `createDetachedMap<Schema>()` возвращает пустую карту с compile-time schema.
- `createDetachedArray<Item>()` возвращает пустой упорядоченный массив.
- `createDetachedText()` возвращает collaborative text.

Все три метода не принимают путь. Именованные roots по-прежнему создаются или
получаются через `getMap(path)`, `getArray(path)` и `getText(path)`.

## Полный пример

```ts
interface TaskStorage {
  id: string;
  title: CRDTText;
  children: CRDTArray<string>;
}

const document = new YjsDoc("tasks");
const tasks = document.getMap<Record<string, CRDTMap<TaskStorage>>>("tasks");

document.transact(() => {
  const task = document.createDetachedMap<TaskStorage>();
  const title = document.createDetachedText();
  const children = document.createDetachedArray<string>();

  title.insert(0, "Написать документацию");
  task.set("id", "task-1");
  task.set("title", title);
  task.set("children", children);
  tasks.set("task-1", task);

  // После attachment чтение безопасно.
  children.push("task-1-1");
}, Symbol("task-manager"));
```

Один shared-wrapper нельзя повторно вставлять в другого parent или документ.
Generic-параметры ограничивают TypeScript-типы, но не добавляют runtime schema
validation.

## Прямые Yjs-конструкторы

Код, который сознательно зависит от Yjs, может импортировать wrapper-классы из
публичной точки входа:

```ts
import { YjsArray, YjsDoc, YjsMap, YjsText } from "@chulane/crdt-doc";

const document = new YjsDoc("example");
const root = document.getMap<Record<string, CRDTType>>("root");

root.set("items", new YjsArray<string>());
root.set("metadata", new YjsMap());
root.set("content", new YjsText());
```

Adapter-neutral слои, включая document model, используют только
`document.createDetached*()`. Примитивы, `null`, plain objects и plain arrays
можно передавать напрямую, когда значение должно заменяться атомарно.
