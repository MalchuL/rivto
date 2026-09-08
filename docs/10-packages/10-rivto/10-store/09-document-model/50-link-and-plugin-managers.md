# Link и plugin-data managers

Оба manager владеют отдельным root map и предоставляют focused API. Link manager знает только о block endpoints; plugin-data manager не знает schema отдельных плагинов.

## Что такое link

Link — first-class направленная domain-связь между двумя существующими blocks. `from` задаёт source, `to` — destination, а stable `id` позволяет хранить несколько разных связей между одной парой blocks и обращаться к каждой независимо.

Endpoint всегда содержит `blockId` и может содержать `port`. Core проверяет существование blocks, но не интерпретирует port: для одного extension это может быть логический input/output, для другого — именованный anchor. Optional `meta` хранит portable данные связи, например `{ kind: "dependency" }`, label или настройки конкретного plugin-а.

Link не является:

- parent/child отношением — outline hierarchy хранится в `children` и `roots` block manager-а;
- HTML hyperlink — URL обычно является content или prop соответствующего block type;
- canvas connector — визуальная линия является element типа `"connector"` и может связывать spatial elements;
- ссылкой на CRDT map блока — endpoints содержат только stable string IDs.

`DocumentLinkManager` владеет integrity этих отношений: разрешает создание только между имеющимися block payloads, materializes detached links, удаляет records и очищает все связи при удалении или merge endpoint block. Он не рисует связи, не запрещает self-link, не требует уникальности пары endpoints и не интерпретирует направление или metadata — это ответственность вызывающего manager-а/extension.

В clipboard link переносится только тогда, когда операция может сохранить оба endpoint blocks; внешняя половина связи отбрасывается, чтобы в целевом документе не появился dangling ID.

## Как links хранятся в CRDT

```text
rivto.editor.links: CRDTMap<linkId, CRDTMap<LinkStorage>>
  linkId -> CRDTMap
    id   -> string                         (base type, атомарное поле)
    from -> { blockId: string, port?: string } (plain object, атомарное поле)
    to   -> { blockId: string, port?: string } (plain object, атомарное поле)
    meta -> Record<string, BasicType>       (plain object, атомарное поле)
```

**CRDT objects:** root `links` и map отдельной связи. Link record создаётся через `document.crdt.instantiator.createMap<LinkStorage>()` и присоединяется к root по `link.id`.

**Base/plain values:** `id` — base string; `from`, `to` и `meta` — cloned portable plain objects. Они не являются вложенными `CRDTMap`. Поэтому замена `from` является одной операцией для всего endpoint, а изменение отдельного `meta` key текущим manager API потребовало бы создать link заново и заменить whole record. Одновременные изменения разных полей outer link map теоретически имеют отдельную CRDT-гранулярность, но public API предоставляет только `createLink()` с полной записью.

**Detached API:** возвращаемый `Link` целиком plain и clone-ится при чтении. Изменение `link.meta` у результата не меняет storage. Связи содержат block IDs, но не block CRDT objects и не ссылки на их maps. Integrity поддерживается manager-ом: create проверяет endpoints, а block delete/merge вызывает cascading cleanup.

### Гранулярность каждого persisted key link

| Key | Live-тип | Можно изменить | Как изменять | Что получает CRDT update |
| --- | --- | --- | --- | --- |
| root `links[linkId]` | `CRDTMap<LinkStorage>` | создать, заменить или удалить record | `createLink`, `removeLink`, snapshot load | public `createLink` заменяет значение root key `linkId` новой record map |
| `id` | `string` | внутри существующей record — нет | передаётся в `createLink` | атомарное поле новой record |
| `from` | plain endpoint object | только через replacement link | повторный `createLink` с тем же ID | весь link record заменяется public API; `from.blockId` и `from.port` не редактируются отдельно |
| `to` | plain endpoint object | только через replacement link | повторный `createLink` | та же replacement semantics |
| `meta` | plain record | только через replacement link | прочитать link, создать новый `meta`, вызвать `createLink` | весь record заменяется; keys `meta` не являются nested shared keys |

Например, metadata обновляется так:

```ts
const link = document.links.getLink("dependency-1");
if (link) {
  document.links.createLink({
    ...link,
    meta: { ...link.meta, label: "blocks" },
  });
}
```

Mutation `link.meta.label = "blocks"` без `createLink()` не сохранится, потому что `getLink()` возвращает detached clone. Также нельзя получить live link record из public manager-а. Хотя outer record технически является `CRDTMap`, focused API намеренно рассматривает link как complete value и при update заменяет record целиком.

Каждый `createLink()`/`removeLink()` проходит через `document.transact()`, поэтому создаёт общий document update, синхронизируется providers и учитывается link undo scope. Cascading `removeForBlockIds()` выполняется внутри block transaction, поэтому удаление block и его links наблюдается как одно согласованное изменение.

## `DocumentLinkManager`

Исходник: `core/managers/link-manager/link-manager.ts`.

### Свойство `document`

- **Тип:** `DocumentModel`, приватное `readonly`-свойство конструктора.
- **Значение:** owning model, используемая для endpoint validation и transactions.
- **Исключения при чтении:** отсутствуют.

### Свойство `storage`

- **Тип:** `CRDTMap<Record<IDLink, CRDTMap<LinkStorage>>>`, приватное `readonly`.
- **Значение:** root `rivto.editor.links`.
- **Исключения при чтении:** CRDT adapter errors.

### Свойство `undoScopes`

- **Тип:** readonly tuple `[storage]`, публичное.
- **Значение:** link root для document undo history.
- **Исключения при чтении:** отсутствуют.

### `constructor(document)`

- **Аргументы:** `document: DocumentModel`.
- **Создаёт:** link manager над root текущего документа.
- **Исключения:** ошибки `crdt.getMap("rivto.editor.links")`.

### `getLink(id)`

- **Аргументы:** `id: string`.
- **Возвращает:** detached `Link | undefined`.
- **Исключения:** clone/CRDT read errors; non-map top-level value возвращает `undefined`.

Метод не проверяет, что endpoints всё ещё существуют: он materializes каноническую link record как есть. `readLink()` clone-ит endpoint objects и metadata, поэтому caller не может изменить CRDT через возвращённые ссылки.

### `getLinks()`

- **Аргументы:** отсутствуют.
- **Возвращает:** detached `Link[]` в shared map iteration order.
- **Исключения:** clone/materialization или CRDT errors.

Top-level values, которые не являются CRDT maps, пропускаются. Метод не сортирует links и не фильтрует dangling endpoints; нормальный invariant обеспечивают create и cleanup block manager-а, но malformed/внешне записанные данные могут быть возвращены.

### `createLink(link)`

- **Аргументы:** полный `link: Link`.
- **Возвращает:** `void`.
- **Исключения:** `Error("Link endpoints must reference existing blocks")`, если `from.blockId` или `to.blockId` отсутствует; также clone/instantiator/CRDT errors.

Создаёт `LinkStorage` через instantiator. Существующий record с тем же link ID заменяется; отдельной duplicate validation нет. Endpoints и meta сохраняются как cloned атомарные values.

Проверка `hasBlock()` смотрит наличие payload в block storage, а не placement в tree; это позволяет не отклонять endpoint во время промежуточного concurrent move. В transaction создаётся новая outer map, в неё записываются четыре plain поля, затем root key `link.id` указывает на новую map. При совпадающем ID старая record и её identity заменяются целиком.

```ts
document.links.createLink({
  id: "depends-on",
  from: { blockId: "task-a", port: "output" },
  to: { blockId: "task-b", port: "input" },
  meta: { kind: "dependency" },
});
```

### `removeLink(id)`

- **Аргументы:** link `id: string`.
- **Возвращает:** `void`.
- **Исключения:** transaction/CRDT delete errors.

Missing ID безопасен.

Удаляется только root entry links map. Blocks, elements и plugin data не меняются. Метод всегда открывает document transaction, даже если ID отсутствует.

### `loadLinks(links)`

- **Аргументы:** `links: readonly Link[]`.
- **Возвращает:** `void`.
- **Исключения:** invalid endpoint и create/CRDT errors.

Очищает storage, затем вызывает `createLink()` для каждого значения. Метод должен выполняться после загрузки blocks, как делает `DocumentModelImpl.loadSnapshot()`. Текущая реализация не prevalidates всю коллекцию до `clear()`: invalid later link может оставить частично заменённое состояние, потому что CRDT transaction не откатывает writes.

Каждый link получает новую CRDT record map, то есть identities прежних records не сохраняются; root `links` остаётся тем же объектом. Duplicate IDs во входе разрешены, и последняя запись заменяет предыдущую.

### `removeForBlockIds(blockIds)`

- **Аргументы:** `blockIds: ReadonlySet<string>` удалённых blocks.
- **Возвращает:** `void`.
- **Исключения:** materialization или CRDT delete errors.

Удаляет каждую связь, у которой source или destination входит в set. Block removal и merge вызывают метод внутри своей active transaction.

Метод сам не открывает transaction и рассчитан на вызов owner-ом уже внутри block mutation. Он materializes detached links через `getLinks()`, сравнивает только `from.blockId`/`to.blockId` и удаляет совпавшие root keys. Ports и metadata на решение не влияют.

### `readLink(value)`

- **Аргументы:** `value: CRDTMap<LinkStorage>`.
- **Возвращает:** detached cloned `Link`.
- **Исключения:** clone и CRDT read errors.

Приватный method преобразует ID через `String`, clone endpoints и default meta `{}`.

Он не выполняет schema validation endpoint objects: malformed `from`/`to` может проявиться у consumer-а позже. Отсутствующий `meta` нормализуется в пустой plain object, поэтому materialized `Link` фактически всегда содержит metadata object, хотя public type помечает поле optional.

## `DocumentPluginDataManager`

Исходник: `core/managers/plugin-data-manager/plugin-data-manager.ts`.

### Как хранится document-level plugin data

```text
rivto.editor.plugins: CRDTMap<pluginId, CRDTType>
  pluginId -> BasicType | plain object/array | CRDTMap | CRDTArray | CRDTText
```

В отличие от block-level `pluginData`, этот manager позволяет plugin-у получить live shared namespace через `getMap(pluginId)`. Поэтому доступны два разных режима хранения:

| Операция | Что хранится | Гранулярность updates |
| --- | --- | --- |
| `set(pluginId, value)` | cloned `BasicType`/plain value под одним root key | весь namespace `pluginId` заменяется атомарно; вложенные свойства plain object не независимы |
| `getMap(pluginId)` впервые | новая attached `CRDTMap` под root key | создание/promotion namespace создаёт update root map |
| `namespace.set(key, value)` | отдельный key live namespace map | property `key` меняется независимо от соседних keys |
| `namespace.delete(key)` | удаление одного shared key | отдельная map operation для key |
| nested map/array/text из instantiator | attached CRDT object внутри namespace | его keys, позиции или text ranges получают собственные CRDT operations |
| `get()`/`getAll()` | detached materialized value | mutation результата не создаёт update |

### Как изменять отдельные свойства plugin namespace

```ts
const comments = document.pluginData.getMap("comments");

document.transact(() => {
  comments.set("enabled", true);
  comments.set("unresolvedCount", 4);
});
```

`enabled` и `unresolvedCount` являются разными shared keys: peers могут менять их независимо, а `comments.observe()` получает deep events namespace. `document.subscribe()` получает общий document update после завершения transaction.

Вызвать `comments.set()` можно и без `document.transact()`: attached CRDT adapter всё равно создаст update и providers смогут его синхронизировать. Но такая автоматическая transaction не использует `document.origin`, поэтому стандартный editor undo manager, настроенный только на этот origin, не обязан записать изменение. Для grouping и undo plugin должен выполнять mutations внутри `document.transact()`.

Если под key снова записать plain object, глубина заканчивается на этом key:

```ts
document.transact(() => {
  comments.set("display", { color: "red", compact: false });
});
```

`display` является shared key, но `display.color` и `display.compact` — части одного plain value. Чтобы сделать их independently collaborative, создайте nested map тем же document instantiator и присоедините её один раз:

```ts
const display = document.crdt.instantiator.createMap<{
  color: string;
  compact: boolean;
}>();

document.transact(() => {
  comments.set("display", display);
  display.set("color", "red");
  display.set("compact", false);
});
```

После attachment `display.set("color", "blue")` меняет только `color`. Shared object нельзя переиспользовать в двух parents или создавать adapter-specific `Y.Map` напрямую; нужно использовать `document.crdt.instantiator`. Подробный lifecycle описан на странице `CRDT instantiator usage`.

Итого: `set()` подходит для небольшого namespace, который всегда заменяется целиком. `getMap()` нужен, когда свойства plugin-а изменяются независимо. Nested `CRDTMap`/`CRDTArray`/`CRDTText` нужны только при необходимой granular collaboration ещё на один уровень глубже.

### Свойство `document`

- **Тип:** `DocumentModel`, приватное `readonly`.
- **Значение:** owning model для transactions и instantiator.
- **Исключения при чтении:** отсутствуют.

### Свойство `root`

- **Тип:** `CRDTMap<Record<string, CRDTType>>`, приватное `readonly`.
- **Значение:** root `rivto.editor.plugins`.
- **Исключения при чтении:** CRDT adapter errors.

### Свойство `undoScopes`

- **Тип:** `CRDTUndoScope[]`, публичное.
- **Значение:** `[root]`.
- **Исключения при чтении:** отсутствуют.

### `constructor(document)`

- **Аргументы:** `document: DocumentModel`.
- **Создаёт:** manager namespaced plugin data.
- **Исключения:** ошибки `crdt.getMap("rivto.editor.plugins")`.

### `get<Value>(pluginId)`

- **Аргументы:** `pluginId: string`; optional generic `Value = unknown` задаёт caller expectation.
- **Возвращает:** detached cloned `Value | undefined`.
- **Исключения:** `Error("Plugin data ID is required")` для whitespace-only ID; clone/CRDT conversion errors.

Shared map namespace materializes через `toObject()`. Generic cast не выполняет runtime schema validation.

### `set(pluginId, value)`

- **Аргументы:** непустой `pluginId: string`; `value: BasicType`.
- **Возвращает:** `void`.
- **Исключения:** required ID, clone, transaction или CRDT conversion errors.

Заменяет только namespace этого plugin атомарным cloned value и не затрагивает соседей.

### `getMap(pluginId)`

- **Аргументы:** непустой `pluginId: string`.
- **Возвращает:** attached `CRDTMap<Record<string, CRDTType>>`.
- **Исключения:** required ID; `Error("Plugin data <id> is not an object namespace")` для существующего primitive/array/null; instantiation/conversion errors.

Если namespace уже shared map, возвращает его. Existing plain object один раз переносится в новый CRDTMap и присоединяется к root, поэтому сам getter в этом случае изменяет persisted state.

**Примечание об assignment:** при promotion existing plain namespace `assignMap()` копирует только его top-level properties в новую detached map, clone-ит их values и оставляет nested objects/arrays plain. После этого root attachment делает namespace live. Например, properties `enabled` и `display` становятся разными shared keys, но поля plain `display.color` и `display.compact` не становятся CRDT keys автоматически.

```ts
const comments = document.pluginData.getMap("comments");
comments.set("thread-1", { resolved: false });
```

### `delete(pluginId)`

- **Аргументы:** непустой `pluginId: string`.
- **Возвращает:** `boolean`, существовал ли namespace.
- **Исключения:** required ID или CRDT errors.

Transaction создаётся только для существующего key.

### `getAll()`

- **Аргументы:** отсутствуют.
- **Возвращает:** detached `Record<string, unknown>`.
- **Исключения:** `toObject`, clone или CRDT conversion errors.

### `load(values)`

- **Аргументы:** `values: Record<string, unknown>`.
- **Возвращает:** `void`.
- **Исключения:** clone/conversion, malformed shared maps или transaction errors.

Рекурсивно merge-ит snapshot, сохраняя identity existing child maps, и удаляет keys, отсутствующие в input.

### `requireId(pluginId)`

- **Аргументы:** `pluginId: string`.
- **Возвращает:** trimmed non-empty ID.
- **Исключения:** `Error("Plugin data ID is required")`.

Приватный normalization method.

### `mergeMap(map, values)`

- **Аргументы:** destination `CRDTMap<Record<string, CRDTType>>`; plain `values: Record<string, unknown>`.
- **Возвращает:** `void`.
- **Исключения:** clone/conversion и CRDT iteration/write errors.

Приватный recursive merge сохраняет existing shared child map, если новое значение является non-array object. Missing keys удаляются. Key, явно присутствующий со значением `undefined`, текущая реализация не записывает и не удаляет.

## Consumers в проекте

- core `LinkManager` и `Element/Block commands` обращаются к соответствующим document managers;
- block deletion и merge каскадно вызывают `removeForBlockIds()`;
- cross-document clipboard переносит только links, обе endpoints которых входят в copied subtree;
- plugin extensions могут хранить generic document state через `document.pluginData`;
- `DocumentModelImpl` materializes и восстанавливает обе секции snapshot;
- plugin-data tests проверяют namespace isolation, undo и convergence shared maps.
