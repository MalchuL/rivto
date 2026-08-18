# `DocumentElementManager`

`DocumentElementManager` хранит generic first-class canvas elements. Core проверяет общую geometry и envelope props, но не знает renderer-specific types или meaning свойств.

Исходник: `core/managers/element-manager/element-manager.ts`.

## Что такое element

Element — first-class spatial object edgeless/canvas surface. Он имеет собственную stable identity, прямоугольную geometry (`frame`), слой (`zIndex`) и type-specific `props`. Document model знает только этот общий envelope; смысл `type` и props задают React extensions и renderers.

Примеры elements в проекте:

- `rectangle`, `ellipse`, `text` и `sticker` являются самостоятельными визуальными объектами;
- `connector` визуально соединяет canvas objects и хранит routing/style в props;
- `group` содержит IDs других elements в props и используется для совместного transform;
- `block` является canvas-карточкой, которая через `startBlockId`/`endBlockId` показывает диапазон существующих root blocks.

Последний пример особенно важен: block element и block — не одна сущность. Block хранит content и outline, а element типа `"block"` хранит расположение карточки этого content на canvas. Их IDs могут совпадать по соглашению конкретного consumer-а, но находятся в разных root maps и не обязаны быть одинаковыми. Удаление element не удаляет blocks; core element manager также не проверяет block IDs внутри opaque props.

`DocumentElementManager` владеет persisted spatial records: проверяет обязательную geometry и `zIndex`, создаёт и обновляет elements, применяет batch transforms и загружает element snapshot. Он намеренно не знает список допустимых types, правила renderer-а, rotation, group membership или connector endpoints — эти domain rules принадлежат соответствующим extensions.

Element следует отличать от link. `connector` — отображаемая canvas-фигура и поэтому является element. `DocumentLinkManager` хранит невизуальную domain-связь только между blocks; наличие link само по себе не создаёт connector на canvas.

## Как elements хранятся в CRDT

```text
rivto.editor.elements: CRDTMap<elementId, CRDTMap<ElementStorage>>
  elementId -> CRDTMap
    id      -> string                         (base type, атомарное поле)
    type    -> string                         (base type, атомарное поле)
    frame   -> CRDTMap<x | y | width | height, number>
    zIndex  -> number                         (base type, атомарное поле)
    props   -> CRDTMap<key, portable value>
```

**CRDT objects:** root `elements`, map отдельного element, вложенная `frame` map и вложенная `props` map. Все четыре создаются/получаются через CRDT API; новые nested maps создаёт `document.crdt.instantiator`. Изменение `frame.x` не заменяет `frame`, а изменение одного `props` key не заменяет соседние keys.

**Base/plain values:** `id`, `type`, `zIndex`, четыре числа geometry и значения отдельных props. Plain record/array внутри одного prop сериализуется как одно portable значение: его внутренние поля не являются отдельными CRDT objects. Например, `props.style = { color, opacity }` записывается под одним shared key `style`; независимо collaborative являются `props.style` и `props.title`, но не обязательно `style.color` и `style.opacity`.

**Detached API:** `DocumentElement`, который возвращают `getElement()`/`getElements()`, целиком plain. `frame` создаётся заново, `props` clone-ится. Мутация результата не пишет в CRDT; для записи нужны `updateElement()` или `updateElements()`.

Elements не образуют дерево и не используют отдельный ordering array. Их порядок отрисовки задаётся атомарным `zIndex`, а при равном значении presentation layer должен определить tie-breaker. Block и element — независимые entity families: element props могут логически ссылаться на block, но document model не создаёт и не поддерживает такую ссылку автоматически.

### Гранулярность каждого persisted key element

| Key | Live-тип | Можно изменить | Как изменять | Что получает отдельный CRDT update |
| --- | --- | --- | --- | --- |
| root `elements[elementId]` | `CRDTMap<ElementStorage>` | создать или удалить record | `insertElement`, `removeElement(s)`, snapshot load | key конкретного `elementId` в root map |
| `id` | `string` | после создания — нет | `ElementInput.id` или generated UUID | атомарная запись при создании; update API не разрешает rename |
| `type` | `string` | текущим update API — нет | только создание или полная snapshot replacement | атомарное поле record; отдельного `setElementType()` нет |
| `frame.x` | `number` | да | `updateElement(id, { frame: { x } })` | key `x` nested `frame` map |
| `frame.y` | `number` | да | `updateElement(id, { frame: { y } })` | key `y` независимо от `x`, `width`, `height` |
| `frame.width` | `number` | да, значение должно быть `> 0` | partial frame patch | key `width` nested map |
| `frame.height` | `number` | да, значение должно быть `> 0` | partial frame patch | key `height` nested map |
| `zIndex` | `number` | да, finite value целиком | `updateElement(id, { zIndex })` | атомарное поле `zIndex` |
| `props[propName]` | portable value в `CRDTMap` | да, по top-level prop key | `updateElement(s)(..., { props: { ... } })` | конкретный prop key; nested plain value под key атомарен |

`frame` особенно granular: перемещение по `x` и изменение `width` являются операциями над разными keys одной nested CRDT map. Batch update сохраняет identity `frame`, поэтому peer может получить оба изменения без replacement всего geometry object.

Для `props` правило такое же только на первом уровне. Например:

```ts
document.elements.updateElement("shape-1", {
  props: {
    fill: "red",
    style: { opacity: 0.5, dash: "solid" },
  },
});
```

`fill` и `style` — два независимых shared keys. Но `style.opacity` и `style.dash` находятся внутри одного plain object `style`: чтобы изменить opacity, consumer передаёт новое полное значение `style`. Текущий patch API не удаляет prop при `undefined`, потому что `assignMap()` пропускает undefined; отдельного public delete-prop method у element manager нет.

Любое успешное `insertElement`, `updateElement(s)` или `removeElement(s)` выполняется через `document.transact()`. После transaction общий subscriber получает update, attached providers синхронизируют его, а document undo tracking включает element root. Объекты из `getElement()`/`getElements()` detached: прямое присваивание `element.frame.x = 10` или `element.props.fill = "red"` не создаёт update.

## Свойства

### `document`

- **Тип:** `DocumentModel`, приватное `readonly`-свойство конструктора.
- **Значение:** owning model для CRDT factories и transactions.
- **Исключения при чтении:** отсутствуют; публичного доступа нет.

### `storage`

- **Тип:** `CRDTMap<Record<IDElement, CRDTMap<ElementStorage>>>`, приватное `readonly`-свойство.
- **Значение:** root `rivto.editor.elements`.
- **Исключения при чтении:** CRDT adapter errors.

### `undoScopes`

- **Тип:** readonly tuple `[storage]`, публичное свойство.
- **Значение:** element root, включённый в document undo history.
- **Исключения при чтении:** отсутствуют.

## Создание

### `constructor(document)`

- **Аргументы:** `document: DocumentModel`.
- **Создаёт:** manager над element root текущего CRDT document.
- **Исключения:** передаёт ошибки `crdt.getMap("rivto.editor.elements")`.

## Чтение

### `getElement(id)`

- **Аргументы:** `id: string`.
- **Возвращает:** detached `DocumentElement | undefined`.
- **Исключения:** invalid frame/zIndex/child maps, clone или CRDT read errors.

Malformed top-level non-map value рассматривается как отсутствующий; malformed fields существующей map отклоняются.

Manager читает record непосредственно по ID, затем `read()` materializes обязательные поля. Возвращённые `frame` и `props` detached: их можно безопасно менять локально, но это не обновит live document.

### `getElements()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `DocumentElement[]` в iteration order shared map.
- **Исключения:** materialization errors любого элемента.

Метод проходит values root map и пропускает только top-level записи, которые не являются `CRDTMap`. Он не сортирует результат по `zIndex`; сортировка и rendering order относятся к consumer-у. Ошибка одного валидного map-record прерывает materialization всей коллекции.

## Создание и изменение

### `insertElement(input)`

- **Аргументы:** `input: ElementInput` с type, полным frame, zIndex и optional props/ID.
- **Возвращает:** stable `string` ID, supplied или `crypto.randomUUID()`.
- **Исключения:** пустой type; duplicate ID; invalid frame, zIndex или props; instantiator/CRDT errors.

До транзакции валидирует envelope. Внутри создаёт `ElementStorage`, nested `frame`/`props` maps, присоединяет record и заполняет maps.

Порядок важен: type, props envelope, geometry и z-index проверяются до shared writes. В transaction manager создаёт record/frame/props через instantiator, кладёт nested maps в record, присоединяет record к root и только затем заполняет child maps. Supplied `input` не сохраняется по ссылке; значения props clone-ятся helper-ом `assignMap()`.

**Примечание об assignment:** `assignMap(frameMap, frame)` создаёт отдельные shared number keys `x`, `y`, `width`, `height`. `assignMap(props, input.props)` создаёт отдельный shared key для каждого top-level prop, но object/array под этим key clone-ится как plain value. Его внутренние properties не генерируют CRDT updates.

### `updateElement(id, patch)`

- **Аргументы:** `id: string`; `patch: ElementPatch`.
- **Возвращает:** `void`.
- **Исключения:** те же missing/validation/storage errors, что у `updateElements()`.

Делегирует batch из одного элемента.

Пустой patch допустим и создаёт batch/transaction без изменений. `frame` является partial: `{ x: 10 }` объединяется с текущими `y`, `width`, `height`. `props` shallow-merge-ится по keys; удалить prop через `undefined` этим методом нельзя, потому что `assignMap(..., false)` пропускает `undefined`.

**Примечание об assignment:** это single-item транзитивный caller `assignMap()` через `updateElements()`. Для frame и props сохраняются только top-level shared keys; nested prop objects остаются plain.

### `updateElements(updates)`

- **Аргументы:** `updates: readonly ElementUpdate[]`.
- **Возвращает:** `void`.
- **Исключения:** missing element, invalid accumulated frame/zIndex/props, malformed child map или CRDT write errors.

Сначала prevalidates весь ordered batch. Duplicate ID видит simulated frame предыдущего patch. Затем применяет frame fields и props keys без замены live maps в одной transaction.

Для каждого update manager заранее разрешает shared record и materializes текущий element. Accumulated simulation нужна для случая, когда несколько patches одного ID по очереди меняют разные части frame: второй patch валидируется уже поверх первого. После успешной подготовки всех updates одна transaction меняет только supplied frame keys, optional `zIndex` и props keys. Ошибка подготовки не оставляет частично применённый prefix batch.

**Примечание об assignment:** оба вызова используют `assignMap(..., false)`. Geometry numbers записываются непосредственно в nested `frame` map. Каждый supplied prop value clone-ится; plain object остаётся одним атомарно заменяемым значением своего prop key и не становится nested map.

### `removeElement(id)`

- **Аргументы:** `id: string`.
- **Возвращает:** `void`.
- **Исключения:** CRDT transaction/delete errors.

Делегирует `removeElements([id])`; missing ID безопасен.

### `removeElements(ids)`

- **Аргументы:** `ids: readonly string[]`.
- **Возвращает:** `void`.
- **Исключения:** CRDT transaction/delete errors.

Удаляет records одной транзакцией. Не каскадирует изменения в blocks, links или opaque props.

Duplicate IDs и missing IDs безопасны: повторный `delete()` не даёт дополнительного эффекта. Удаляется outer element record; его attached nested frame/props maps становятся недостижимы из document root и удаляются вместе с ним на уровне adapter-а.

## Snapshot

### `validateElements(elements)`

- **Аргументы:** `elements: readonly DocumentElement[]`.
- **Возвращает:** `void`.
- **Исключения:** missing ID/type, duplicate ID, invalid frame/zIndex или non-object props.

Проверяет полную коллекцию до destructive replacement.

Проверяются уникальность ID в пределах input, непустые ID/type, complete finite frame с положительными dimensions, finite `zIndex` и object envelope props. Содержимое props этим методом глубоко не проверяется; ошибки сериализации portable values могут проявиться позже при записи.

### `loadElements(elements)`

- **Аргументы:** `elements: readonly DocumentElement[]`.
- **Возвращает:** `void`.
- **Исключения:** validation и insert/CRDT errors.

Очищает storage и вставляет каждый element. Собственную outer transaction не создаёт; основной caller — `DocumentModelImpl.loadSnapshot()`.

`insertElement()` открывает transaction для каждой записи, но при стандартном вызове они вложены в transaction `loadSnapshot()`. Полная замена пересоздаёт record/frame/props CRDT objects; сохраняется только identity root `elements`, который удерживает manager и undo scope.

**Примечание об assignment:** метод транзитивно использует `assignMap()` через `insertElement()`. Snapshot `frame` раскладывается по shared number keys, а каждый snapshot prop остаётся cloned plain value под собственным key. Deep properties props не получают самостоятельной CRDT identity.

## Приватные методы

### `read(value)`

- **Аргументы:** `value: CRDTMap<ElementStorage>`.
- **Возвращает:** detached `DocumentElement`.
- **Исключения:** invalid required map/frame/zIndex, clone или CRDT errors.

Converts ID/type через `String`, валидирует detached geometry и clone props.

`frame.toObject()` сначала превращает shared keys в plain object, после чего `frame()` одновременно валидирует и создаёт новый объект. `props.toObject()` materializes nested CRDT values, а `clone()` отделяет результат от adapter-owned structures. `String()` для ID/type допускает coercion malformed scalar values; пустой type на read отдельно не проверяется.

### `required(id)`

- **Аргументы:** element ID.
- **Возвращает:** `CRDTMap<ElementStorage>`.
- **Исключения:** `Error("Element <id> not found")`.

Проверяется и наличие key, и то, что value является CRDT map. Поэтому malformed plain value под существующим ID диагностируется тем же сообщением, что и отсутствие element.

### `requiredMap(value, key)`

- **Аргументы:** element map; `key: "frame" | "props"`.
- **Возвращает:** typed nested `CRDTMap<Value>`.
- **Исключения:** `Error("Element <id> has invalid <key>")`.

### `frame(value)`

- **Аргументы:** `value: ElementFrame`.
- **Возвращает:** новый detached `{ x, y, width, height }`.
- **Исключения:** `Error("Element frame requires finite coordinates and positive dimensions")` для missing/nonfinite coordinates или nonpositive dimensions.

### `zIndex(value)`

- **Аргументы:** `value: unknown`.
- **Возвращает:** validated finite `number`.
- **Исключения:** `Error("Element z-index must be finite")`.

### `props(value)`

- **Аргументы:** `value: unknown`.
- **Возвращает:** `void`, одновременно TypeScript assertion `value is Record<string, unknown>`.
- **Исключения:** `Error("Element props must be an object")` для null, primitive или array.

## Пример

```ts
const id = document.elements.insertElement({
  type: "note",
  frame: { x: 20, y: 40, width: 240, height: 120 },
  zIndex: 1,
  props: { color: "yellow", title: "Идея" },
});

document.elements.updateElement(id, {
  frame: { x: 80 },
  props: { title: "Проверенная идея" },
});
```

## Consumers в проекте

- core `ElementManager` превращает editor commands в эти операции;
- edgeless surfaces и renderers читают detached elements;
- demo создаёт canvas elements;
- snapshot persistence вызывает `getElements()`, `validateElements()` и `loadElements()`;
- CRDT tests проверяют remote convergence frame и props maps.
