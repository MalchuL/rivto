# `DocumentBlockManager`

`DocumentBlockManager` владеет block records, collaborative Markdown content и ordered tree placement. Публичный core `BlockManager` и React page extensions вызывают его операции через `document.blocks`.

Исходник: `core/managers/block-manager/block-manager.ts`.

## Что такое block

Block — основная содержательная единица документа Rivto. Это не DOM-элемент и не React-компонент, а persisted domain record со стабильным `id`. Presentation layer находит зарегистрированное определение по `type` и решает, как показать и редактировать этот record.

Один block объединяет несколько видов данных:

- `type` определяет семантику и renderer: например, writing block, separator или custom counter;
- `content` содержит collaborative Markdown source; для нетекстового типа строка может оставаться пустой;
- `props` содержит данные конкретного типа, например URL изображения или значение counter;
- `listProps` описывает положение/поведение блока среди siblings, например collapsed state или вид списка;
- `pluginData` хранит block-level namespaces расширений, не смешивая их с native props;
- `children` задаёт ordered outline subtree.

Block существует независимо от способа показа. В page mode root blocks и их children образуют линейный outline. В edgeless mode те же blocks могут отображаться внутри element типа `"block"`: такой element хранит geometry карточки и диапазон block IDs, но не заменяет сами blocks. Один и тот же block payload поэтому не нужно дублировать для разных surfaces.

`DocumentBlockManager` — владелец полного жизненного цикла blocks: создаёт payload, валидирует props, редактирует text, поддерживает parent/child ownership, перемещает и объединяет blocks, удаляет subtrees и очищает links к удалённым IDs. Consumers не должны менять block storage напрямую.

Важно отличать block от соседних сущностей:

- **block** отвечает на вопрос «какое содержимое находится в документе и в каком outline-порядке?»;
- **element** отвечает на вопрос «какой объект расположен на canvas, где и на каком слое?»;
- **link** отвечает на вопрос «какая именованная направленная связь существует между двумя blocks?».

## Как блоки хранятся в CRDT

Блок в snapshot выглядит как обычный рекурсивный объект `Block`, но каноническое live-состояние не хранит вложенное дерево объектов. Оно разделено на payload-карту и массивы ownership:

```text
rivto.editor.blocks: CRDTMap<blockId, CRDTMap<BlockStorage>>
  blockId -> CRDTMap
    id         -> string                         (base type, атомарное поле)
    type       -> string                         (base type, атомарное поле)
    listProps  -> CRDTMap<key, portable value>   (CRDT object)
    props      -> CRDTMap<key, portable value>   (CRDT object)
    content    -> CRDTText                       (CRDT object)
    children   -> CRDTArray<string>              (CRDT object; только ID)
    pluginData -> CRDTMap<pluginId, value>        (CRDT object)

rivto.editor.roots: CRDTArray<string>            (CRDT object; ID корней по порядку)
```

**Что здесь является CRDT object:** обе root-структуры, отдельная map каждого блока, а также вложенные `listProps`, `props`, `content`, `children` и `pluginData`. Эти объекты создаются только через `document.crdt.instantiator`, затем присоединяются к родительской map. Их identity сохраняется при patch и materialization.

**Что является base/plain value:** `id`, `type`, элементы массивов `roots`/`children` и значения, записанные в `listProps`, `props` и `pluginData` публичными методами manager-а. Примитивы (`string`, finite `number`, `boolean`, `null`) являются base types. Plain arrays и records — portable plain values: adapter сериализует их, но изменение внутри такого объекта не является отдельной CRDT-операцией. Независимо объединяются top-level keys содержащей их `CRDTMap`; чтобы изменить вложенный plain object, manager записывает значение соответствующего key заново.

**Итого:** весь `Block` из `getBlock()` — detached plain snapshot, а не CRDT object. В live storage CRDT-гранулярность есть на уровне полей record, top-level keys maps, символов `content` и позиций ID в arrays. `children` не содержит дочерние block maps: payload ребёнка лежит в общей `blocks` map, поэтому move меняет ownership arrays, но не пересоздаёт блок.

Пример: два клиента могут независимо изменить `props.color` и `props.title`, потому что это разные keys shared map. Но если `props.style` — plain `{ color, fontSize }`, конкурентные изменения `style.color` и `style.fontSize` заменяют одно значение `style`; для независимого merge потребовалась бы отдельная вложенная `CRDTMap`, которой текущий публичный block API не создаёт.

### Гранулярность каждого persisted key блока

| Key | Live-тип | Можно изменить | Как изменять | Что получает отдельный CRDT update |
| --- | --- | --- | --- | --- |
| root `roots` | `CRDTArray<string>` | порядок и состав root IDs | `insertBlock`, `moveBlock(s)`, `indentBlock(s)`, `outdentBlock(s)`, `removeBlock` | вставка/удаление ID в конкретной позиции; block payload не переписывается |
| root `blocks[blockId]` | `CRDTMap<BlockStorage>` | создание или удаление record | `insertBlock`, `removeBlock`, snapshot load | key конкретного `blockId` в root map |
| `id` | `string` | после создания — нет | задаётся в `BlockInput`, иначе UUID | атомарная запись только при создании нового record |
| `type` | `string` | да, целиком | `setBlockType` | одно атомарное поле `type`; одновременно manager заменяет содержимое `props` |
| `listProps` | `CRDTMap` | да, по top-level key | `updateBlock(s)`, `deleteListProps(Batch)` | каждый изменённый key, например `collapsed`; nested plain object под одним key остаётся атомарным |
| `props` | `CRDTMap` | да, по top-level key | `updateBlock(s)`, `setBlockProp`, `setBlockType` | каждый изменённый prop key; `setBlockType` очищает/заполняет map, но сохраняет identity map |
| `content` | `CRDTText` | да, по диапазону символов | `setBlockText`, `insertText`, `deleteText` | character insert/delete; независимые text edits могут merge-иться внутри одной строки |
| `children` | `CRDTArray<string>` | порядок, parent ownership и состав | hierarchy methods и subtree operations | вставка/удаление child ID в позиции; payload child остаётся прежним |
| `pluginData` | `CRDTMap<pluginId, value>` | да, по namespace | `setPluginData` | key конкретного `pluginId`; значение namespace записывается целиком |

### Можно ли изменить свойство внутри `pluginData`

На block-level — не через текущий public API. Вызов:

```ts
document.blocks.setPluginData("task-1", "comments", {
  resolved: false,
  count: 3,
});
```

создаёт отдельный shared key `comments`, но его значение `{ resolved, count }` является plain object. Следующий вызов должен передать новое значение namespace целиком:

```ts
document.blocks.setPluginData("task-1", "comments", {
  resolved: true,
  count: 3,
});
```

`comments` и `review` меняются независимо, потому что это разные keys `pluginData` map. Однако `comments.resolved` и `comments.count` не являются отдельными CRDT keys. Изменение объекта из `getBlock(id).pluginData` также ничего не сохранит: это detached snapshot.

Если plugin-у нужна независимая collaborative запись каждого внутреннего свойства, используйте document-level `document.pluginData.getMap(pluginId)` либо расширьте block manager отдельным API, который создаёт nested map через instantiator. Записывать CRDT wrappers через `setPluginData()` нельзя: метод clone-ит portable значение и предназначен для plain namespace data.

### Когда consumer получает update

Каждая mutation manager-а проходит через `document.transact()` со стабильным `document.origin`. После завершения transaction подписка `document.subscribe()` получает общий update signal; providers могут отправить CRDT update peers, а editor undo manager видит операцию в block scopes. Batch и hierarchy methods группируют несколько map/array/text операций в один document transaction.

Изменение detached результата `getBlock()`/`getBlocks()` не создаёт update. Так же не работает mutation исходного plain object после передачи в manager: перед storage значения clone-ятся. Для persisted изменения всегда вызывайте focused manager method.

## Свойства

### `document`

- **Тип:** `DocumentModel`, приватное `readonly`-свойство конструктора.
- **Значение:** модель, предоставляющая CRDT, sibling managers и transaction boundary.
- **Исключения при чтении:** отсутствуют; публичного доступа нет.

### `undoScopes`

- **Тип:** readonly tuple `[blocksMap, rootsArray]`, публичное свойство.
- **Значение:** `storage` и `roots`, передаваемые в общий undo manager.
- **Исключения при чтении:** отсутствуют.

### `validateProps`

- **Тип:** `BlockPropsValidator`, приватное изменяемое свойство.
- **Значение:** validator block props; по умолчанию возвращает input.
- **Исключения при вызове:** определяются установленным validator.

### `blockPaths`

- **Тип:** `Map<IDBlock, readonly number[]>`, приватное `readonly`-свойство.
- **Значение:** lazy cache sibling-index paths. Cached path перепроверяется при чтении и может быть заменён после remote move.
- **Исключения при чтении:** отсутствуют.

### `roots`

- **Тип:** `CRDTArray<IDBlock>`, приватное `readonly`-свойство.
- **Значение:** root `rivto.editor.roots`.
- **Исключения при чтении:** ошибки CRDT adapter.

### `storage`

- **Тип:** `CRDTMap<Record<IDBlock, CRDTMap<BlockStorage>>>`, приватное `readonly`-свойство.
- **Значение:** root `rivto.editor.blocks` со всеми block payloads.
- **Исключения при чтении:** ошибки CRDT adapter.

### `isEmpty`

- **Тип:** `boolean`, публичный getter.
- **Значение:** `true`, когда `roots.length === 0`; orphaned storage records не учитываются.
- **Исключения при чтении:** ошибки чтения CRDT array.

## Создание и настройка

### `constructor(document)`

- **Аргументы:** `document: DocumentModel`.
- **Создаёт:** manager над существующими roots `rivto.editor.roots` и `rivto.editor.blocks`.
- **Исключения:** передаёт ошибки `crdt.getArray()` и `crdt.getMap()`.

### `setPropsValidator(validator)`

- **Аргументы:** `validator: BlockPropsValidator`.
- **Возвращает:** `void`.
- **Исключения:** собственных проверок нет.

`EditorRuntime` устанавливает validator `BlockRegistryManager`, чтобы document storage не зависел от registry или React.

После установки каждый create/update/type-change сначала передаёт validator-у полный предполагаемый набор props. Возвращённый объект считается нормализованным состоянием; исключение останавливает операцию. Метод не перепроверяет уже сохранённые блоки и не запускает транзакцию.

## Чтение

### `hasBlock(id)`

- **Аргументы:** `id: string`.
- **Возвращает:** `boolean` по наличию payload в `storage`.
- **Исключения:** ошибки `CRDTMap.has`.

Метод не требует, чтобы ID сейчас находился в tree array. Это важно для link validation во время конкурентного move.

### `getBlock(id)`

- **Аргументы:** `id: string`.
- **Возвращает:** detached `Block | undefined`.
- **Исключения:** ошибки malformed required fields, listProps validation или CRDT reads.

Orphaned или отсутствующий block возвращает `undefined`; результат включает рекурсивно materialized children.

Сначала `findContainer()` подтверждает, что block размещён в `roots` или одном из `children`. Затем `readBlock()` читает payload из общей map, превращает `CRDTText` в строку и рекурсивно собирает detached subtree. Изменение возвращённого объекта не изменяет документ.

### `getBlocks()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `Block[]` корневых деревьев в collaborative order.
- **Исключения:** те же materialization errors, что у `getBlock()`.

Метод проходит только ID из `roots`, поэтому порядок результата совпадает с документом. Missing/malformed top-level payload пропускается, а обязательное malformed nested-поле найденного блока вызывает исключение. Для persistence `DocumentModelImpl.getSnapshot()` дополнительно clone-ит результат.

### `getRootIds()`

- **Аргументы:** отсутствуют.
- **Возвращает:** detached `string[]`.
- **Исключения:** ошибки чтения/преобразования `roots`.

Это дешёвое структурное чтение: payload, content и descendants не materialize-ятся. Метод подходит для navigation и incremental UI, когда consumer-у нужен только top-level order. Каждый item проходит `String()`, поэтому malformed non-string adapter value будет coerced, а не отброшен.

### `getChildIds(id)`

- **Аргументы:** `id: string` parent block.
- **Возвращает:** ordered `string[]`; `[]`, если block отсутствует или не размещён.
- **Исключения:** `Error("Expected CRDTArray at children")` для malformed placed block; также ошибки CRDT reads.

Как и `getRootIds()`, метод возвращает только detached IDs и не читает payload children. Сначала проверяется placement parent через `findContainer()`; orphaned payload поэтому даёт `[]`, даже если его own `children` map существует.

### `getParentId(id)`

- **Аргументы:** `id: string`.
- **Возвращает:** parent ID, `null` для root или `undefined` для отсутствующего/unplaced block.
- **Исключения:** ошибки traversal malformed tree.

Parent не хранится отдельным полем: manager выводит его из ownership array, найденного обходом/кэшем path. Поэтому результат всегда отражает текущую структуру, а не денормализованную ссылку. Три значения различают root (`null`), child (`string`) и missing/unplaced payload (`undefined`).

## Создание и обновление блоков

### `insertBlock(block, afterId?)`

- **Аргументы:** `block: BlockInput`; optional `afterId: string | null`, где `null` означает начало roots, а отсутствие — конец roots.
- **Возвращает:** stable inserted ID.
- **Исключения:** пустой type, duplicate ID, invalid `listProps`, validator rejection, malformed CRDT storage и ошибки insertion.

Если `afterId` существует, новый block вставляется после него в том же sibling array. Метод рекурсивно создаёт children через `insertInto()` в одной транзакции.

Важная семантика `afterId`: он выбирает не только позицию, но и sibling container. Например, если target является child, новый блок станет его соседом с тем же parent. При `null` вставка всегда идёт в начало `roots`; вставить первым child публично можно последующим `moveBlock(..., parentId, "inside")` и reorder.

**Примечание об assignment:** метод транзитивно вызывает recursive `insertInto()`, а тот использует `assignMap()` для `listProps`, `props`, `pluginData` и `assignText()` для `content`. Каждый child получает собственные CRDT maps/text/children array, однако nested objects внутри map values остаются cloned plain objects. Их property mutation не создаёт update; менять нужно соответствующий top-level key через manager.

### `updateBlock(id, patch)`

- **Аргументы:** `id: string`; `patch: BlockPatch`.
- **Возвращает:** `void`.
- **Исключения:** отсутствующий/malformed block, invalid listProps, validator rejection и CRDT errors.

Делегирует `updateBlocks([{ id, patch }])`.

**Примечание об assignment:** это транзитивный caller `assignMap()` для `listProps`/`pluginData` и `assignText()` для `content`. Map helper создаёт updates только для supplied top-level keys; их nested object values остаются plain. Props используют эквивалентную per-key запись вручную.

### `updateBlocks(updates)`

- **Аргументы:** `updates: readonly BlockUpdate[]`.
- **Возвращает:** `void`.
- **Исключения:** любой missing target, malformed shared field, invalid listProps/props или CRDT write error.

Все targets и patches подготавливаются до первой shared write. Duplicate IDs разрешены и видят результат предыдущего patch в том же batch. Меняются только supplied keys; live nested maps и text сохраняют identity.

Подготовка симулирует accumulated `listProps` и `props`, поэтому validator получает тот же итог, который получился бы при последовательных вызовах. На фазе записи `undefined`, возвращённый validator-ом для ключа из `patch.props`, удаляет этот key. `pluginData` merge-ится по namespace, а `content` заменяется через in-place `assignText`; другие поля блока не затрагиваются.

**Примечание об assignment:** `assignMap(..., false)` применяется к `listProps` и block-level `pluginData`. Каждый supplied top-level key получает отдельный map operation, но его object/array value clone-ится и остаётся plain. `props` реализует ту же plain-value семантику вручную через `clone()` + `set()`. `assignText()` превращает полный plain `patch.content` в delete/insert operations существующего `CRDTText`.

### `setBlockType(id, type, props = {})`

- **Аргументы:** `id: string`; непустой `type: string`; полные destination `props: Record<string, unknown>`.
- **Возвращает:** `void`.
- **Исключения:** `Error("Block type is required")`, missing block, validator rejection или malformed props map.

Сохраняет ID, listProps, content, children и pluginData, но заменяет type и полное содержимое props map.

Validator вызывается с destination type и supplied полным props object до записи type. `assignMap(..., clear = true)` очищает прежние keys и записывает нормализованные новые, сохраняя identity самой props CRDT map. Consumers используют метод для semantic conversion блока, а не для обычного partial patch.

**Примечание об assignment:** top-level keys normalized `props` снова становятся independently editable map entries. Object под одним prop key остаётся cloned plain object, поэтому его внутренние properties меняются только replacement-ом этого prop key.

### `setBlockProp(id, key, value)`

- **Аргументы:** `id: string`; `key: string`; `value: unknown`, где validator result `undefined` удаляет key.
- **Возвращает:** `void`.
- **Исключения:** missing/malformed block, validator rejection, clone или CRDT write errors.

Manager materializes текущую props map, накладывает один key и валидирует полный результат. После validation записывается только caller-owned key: соседние keys не перезаписываются. Если validator удалил/нормализовал другие поля как побочный эффект, эти несвязанные изменения этим методом не сохраняются.

### `deleteListProps(id, keys)`

- **Аргументы:** `id: string`; `keys: readonly string[]`.
- **Возвращает:** `true`, если block существует и transaction выполнена; иначе `false`.
- **Исключения:** malformed `listProps` или CRDT errors. Missing keys безопасны.

Existence проверяется по payload map через `hasBlock()`, а не по placement. Для существующего orphaned блока операция всё равно может изменить listProps. После guard метод делегирует strict batch variant; пустой `keys` всё ещё открывает transaction и возвращает `true`.

### `deleteListPropsBatch(updates)`

- **Аргументы:** `readonly { id: string; keys: readonly string[] }[]`.
- **Возвращает:** `void`.
- **Исключения:** `Error("Block ... not found")`, wrong map type или CRDT errors.

Сначала разрешает все blocks; missing target отклоняет batch до первой записи. Duplicate keys удаляются один раз.

Подготовленная коллекция хранит прямые ссылки на live `listProps` maps. После успешного resolve всех targets одна transaction удаляет перечисленные keys; validator не вызывается, потому что удаление list properties не относится к type-specific block props.

### `setPluginData(id, pluginId, value)`

- **Аргументы:** block `id`; namespace `pluginId`; `value: unknown` или `undefined` для удаления.
- **Возвращает:** `void`.
- **Исключения:** missing/malformed block, clone error для unsupported/cyclic data или CRDT write error.

Изменяет только один namespace block-level plugin data.

`pluginId` не trim-ится и не проверяется на пустоту на этом уровне. Значение clone-ится и хранится как одно portable значение выбранного key; вложенные поля namespace не получают отдельной CRDT-гранулярности.

## Текст

### `setBlockText(id, text)`

- **Аргументы:** `id: string`; полный `text: string`.
- **Возвращает:** `void`.
- **Исключения:** missing block, `Error("Expected CRDTText at content")` или CRDT text errors.

Находит общий prefix/suffix и выполняет минимальные delete/insert, сохраняя identity и неизменённые formatted runs. Равный текст является no-op.

Например, замена `hello world` на `hello Rivto` удалит только `world` и вставит `Rivto` с позиции 6. Метод принимает полный plain-text результат view, но преобразует его в узкий CRDT diff; форматирование в неизменившихся prefix/suffix остаётся прикреплённым к прежним символам.

### `insertText(id, offset, text)`

- **Аргументы:** `id: string`; `offset: number`; `text: string`.
- **Возвращает:** `void`.
- **Исключения:** missing/malformed block или CRDT text errors.

Offset ограничивается диапазоном `0..content.length`. Пустой text завершает метод без транзакции.

Отрицательный offset становится `0`, слишком большой — текущей длиной. Метод не округляет и отдельно не валидирует `NaN`/fractional offset; окончательная семантика такого некорректного runtime input зависит от CRDT adapter, поэтому caller должен передавать целое finite смещение.

### `deleteText(id, offset, length)`

- **Аргументы:** `id: string`; `offset: number`; `length: number`.
- **Возвращает:** `void`.
- **Исключения:** missing/malformed block или CRDT text errors.

Offset и фактическая длина ограничиваются bounds. `length <= 0` является no-op.

Удаление за концом текста превращается в delete длины `0`; слишком большой `length` сокращается до оставшегося suffix. Как и `insertText()`, метод ожидает целые finite offsets от editor layer и не выполняет runtime normalization `NaN` или дробных значений.

## Удаление и merge

### `removeBlock(id)`

- **Аргументы:** root ID удаляемого subtree.
- **Возвращает:** `void`.
- **Исключения:** malformed descendants/children, link cleanup или CRDT errors.

Missing/unplaced ID — no-op. Удаляет payload всего subtree, ownership reference и links, касающиеся любого удалённого ID, одной транзакцией.

Сначала собираются все descendant IDs, затем рекурсивно удаляются payload records, после чего удаляется единственная ownership-ссылка корня subtree. `removeForBlockIds()` очищает links на любой удалённый ID до завершения той же transaction. Elements не удаляются: их props считаются opaque, даже если содержат block ID.

### `mergeBlocks(targetId, sourceId)`

- **Аргументы:** ID сохраняемого target и удаляемого source.
- **Возвращает:** исходную длину target text — caret boundary между старым target и добавленным source.
- **Исключения:** одинаковые IDs, missing block, target внутри source subtree, malformed content/children или CRDT errors.

Добавляет source text и children в target, удаляет source payload/tree reference и links source. Type, props и pluginData target сохраняются; соответствующие поля source отбрасываются.

Children сначала удаляются из source ownership array, затем дописываются в target `children`; payload каждого ребёнка остаётся прежним. Метод запрещает target внутри source subtree, иначе удаление source создало бы цикл/потерю ownership. Возвращаемый offset вычисляется до вставки текста и используется UI для восстановления caret на границе объединения.

## Перемещение и hierarchy

### `moveBlock(id, targetId, position = "after")`

- **Аргументы:** `id: string`; `targetId: string | null`; `position: "before" | "after" | "inside"`.
- **Возвращает:** `void`.
- **Исключения:** missing source/target, попытка move относительно собственного descendant, malformed target children или CRDT errors.

Одинаковые `id` и `targetId` — no-op. `inside` добавляет block в конец children target; `null` перемещает его в начало текущего sibling array.

Операция удаляет ID из source array и вставляет тот же ID в destination array; `storage` и nested payload не меняются. Для `before`/`after` target обязан быть размещён в дереве. Значение `position` ограничено TypeScript union, но runtime не выполняет отдельную проверку произвольной строки.

### `moveBlocks(ids, targetId, position = "after")`

- **Аргументы:** `ids: string[]`; `targetId: string | null`; placement position.
- **Возвращает:** `void`.
- **Исключения:** selected roots имеют разных direct parents, target входит в selected subtree или вложенный `moveBlock()` завершается ошибкой.

Selected descendants исключаются, потому что перемещаются с ancestor. Порядок обработки зависит от placement и сохраняет visible order.

После фильтрации оставшиеся roots обязаны иметь одного direct parent. Для `after` и `targetId === null` список обрабатывается в обратном порядке, потому что повторная вставка в одну позицию иначе развернула бы визуальный порядок. Вызовы вложенного `moveBlock()` остаются частью outer transaction с тем же origin.

### `indentBlock(id)`

- **Аргументы:** `id: string`.
- **Возвращает:** `void`.
- **Исключения:** передаёт ошибки `indentBlocks()`.

Делегирует grouped operation с одним ID.

Сам wrapper не проверяет возможность indent и не возвращает success flag. Поэтому UI определяет доступность по hierarchy либо вызывает метод безопасно: first sibling, missing ID и некорректный structural range будут no-op в `indentBlocks()`.

### `indentBlocks(ids)`

- **Аргументы:** `ids: string[]` в любом порядке.
- **Возвращает:** `void`.
- **Исключения:** malformed previous sibling/children или CRDT errors.

Перемещает consecutive selected roots под previous sibling первого root. Неконsecutive selection, missing block или отсутствие previous sibling — полный no-op.

Consecutive означает непрерывный depth-first диапазон с учётом полных selected subtrees, а не просто соседство входных IDs. IDs сначала приводятся к visible order и очищаются от descendants выбранных ancestors. Затем все roots отсоединяются и в исходном порядке дописываются в `children` предыдущего sibling.

### `outdentBlock(id)`

- **Аргументы:** `id: string`.
- **Возвращает:** `void`.
- **Исключения:** передаёт ошибки `outdentBlocks()`.

Это single-selection wrapper без собственного transaction. Root block, missing/unplaced block или блок без разрешимого parent container приводит к no-op grouped operation; успешный вызов использует те же adoption rules для later siblings, что и batch variant.

### `outdentBlocks(ids)`

- **Аргументы:** `ids: string[]`.
- **Возвращает:** `void`.
- **Исключения:** malformed parents/children или CRDT errors.

Поднимает consecutive nested roots сразу после parent. Не выбранные later siblings становятся children последнего moved root, сохраняя visible outline order. Root-level и discontinuous selections — no-op.

Если переданный диапазон уже захватывает блоки destination depth, они не поднимаются ещё на уровень: manager обрезает moving group перед первым таким ID. Later siblings старого parent отсоединяются и становятся детьми последнего поднятого root; это сохраняет тот же depth-first порядок, который пользователь видел до outdent.

## Snapshot и repair

### `validateBlocks(blocks)`

- **Аргументы:** `blocks: readonly Block[]`.
- **Возвращает:** `void`.
- **Исключения:** `TypeError` invalid/cyclic/nonportable `listProps`; `Error("Snapshot block children must be an array")`.

Рекурсивно проверяет listProps и children до destructive replacement.

### `loadBlocks(blocks)`

- **Аргументы:** `blocks: readonly Block[]`.
- **Возвращает:** `void`.
- **Исключения:** validation errors, duplicate/missing type/invalid props и CRDT write errors.

Очищает roots/storage и рекурсивно вставляет supplied tree. Метод сам не открывает transaction; обычный caller — `DocumentModelImpl.loadSnapshot()`.

Каждый detached nested `Block` заново превращается в shared record и ownership ID. Старые CRDT identities намеренно теряются при полной замене секции, поэтому callers не должны держать ссылки на block-level nested containers через snapshot load. Ссылки manager-а на root `storage` и `roots` при этом сохраняются.

**Примечание об assignment:** это транзитивный caller `assignMap()`/`assignText()` через recursive `insertInto()`. Рекурсивно создаются CRDT records blocks, а не CRDT wrappers для каждого поля произвольных plain `props`, `listProps` или plugin namespace objects.

### `normalize()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** malformed children container или CRDT errors.

Удаляет missing и duplicate references, а orphaned stored blocks детерминированно добавляет в roots. Вызывается constructor модели после создания managers.

Очистка идёт с конца каждого ownership array, чтобы deletion не сдвигал ещё не просмотренные indexes. Один общий `seen` set оставляет первое встретившееся ownership-вхождение и удаляет последующие. После обхода каждый payload ID, которого нет в `seen`, дописывается в roots; payload никогда не удаляется repair-операцией.

## Приватные методы

### `transact(operation)`

- **Аргументы:** `operation: () => void`.
- **Возвращает:** `void`.
- **Исключения:** передаёт ошибки `document.transact()` и callback.

### `insertInto(block, container, afterId?)`

- **Аргументы:** `BlockInput`; destination `CRDTArray<string>`; optional sibling ID/null.
- **Возвращает:** assigned `string` ID.
- **Исключения:** empty type, duplicate ID, invalid listProps/props, target/insertion и CRDT errors.

Создаёт `BlockStorage` и все nested containers через instantiator, присоединяет payload к storage, заполняет поля, рекурсивно вставляет children и затем ID в ownership array.

**Примечание об assignment:** после attachment record-а `assignMap()` записывает top-level keys `listProps`, `props` и `pluginData` как cloned portable values; nested records/arrays под этими keys остаются plain. `assignText()` заполняет attached `CRDTText`. Recursion создаёт новый CRDT record для каждого `children` item, но не выполняет deep CRDT conversion пользовательских objects.

### `readBlock(id, visited)`

- **Аргументы:** `id: IDBlock`; `visited: Set<IDBlock>`.
- **Возвращает:** detached `Block | undefined`.
- **Исключения:** malformed required fields и conversion errors.

`visited` обрывает malformed cycles.

### `findContainer(id)`

- **Аргументы:** block ID.
- **Возвращает:** `LocatedBlock | undefined`.
- **Исключения:** malformed traversal fields или CRDT reads.

Проверяет cached path, при необходимости ищет актуальный и обновляет cache.

### `resolvePath(path)`

- **Аргументы:** `readonly number[]` sibling indexes.
- **Возвращает:** current `{ id, array, index, parentId } | undefined`.
- **Исключения:** malformed required children map может привести к ошибке; stale/invalid indexes возвращают `undefined`.

### `findPath(id)`

- **Аргументы:** block ID.
- **Возвращает:** root-to-block indexes или `undefined`.
- **Исключения:** malformed children container или CRDT reads.

Выполняет depth-first traversal с защитой от повторного посещения IDs.

### `selectedTopLevelRoots(ids)`

- **Аргументы:** candidate IDs.
- **Возвращает:** valid selected roots в visible order без selected descendants.
- **Исключения:** traversal/CRDT errors.

### `isConsecutiveSelection(roots)`

- **Аргументы:** selected top-level root IDs.
- **Возвращает:** `boolean`.
- **Исключения:** malformed subtree traversal.

### `visibleBlockIds()`

- **Аргументы:** отсутствуют.
- **Возвращает:** depth-first `string[]`, включая descendants независимо от collapsed UI state.
- **Исключения:** malformed tree/CRDT errors.

### `removeTree(id)`

- **Аргументы:** subtree root ID.
- **Возвращает:** `void`.
- **Исключения:** malformed children или CRDT delete errors; missing/non-map payload — no-op.

### `collectTreeIds(id)`

- **Аргументы:** subtree root ID.
- **Возвращает:** root и descendants depth-first; `[]` для missing/non-map payload.
- **Исключения:** malformed children/CRDT reads.

### `patchProps(type, props, patch)`

- **Аргументы:** block type; live props `CRDTMap`; caller-owned key patch.
- **Возвращает:** `void`.
- **Исключения:** validator, clone или CRDT errors.

### `requiredBlock(id)`

- **Аргументы:** block ID.
- **Возвращает:** `CRDTMap<BlockStorage>`.
- **Исключения:** `Error("Block <id> not found")`.

### `requiredType(block, id)`

- **Аргументы:** stored block map и ID для сообщения.
- **Возвращает:** непустой `string` type.
- **Исключения:** `Error("Block <id> has no type")`.

### `requiredMap(parent, key)`

- **Аргументы:** parent `CRDTMap`; field key.
- **Возвращает:** nested `CRDTMap` нужного schema type.
- **Исключения:** `Error("Expected CRDTMap at <key>")`.

### `requiredArray(parent, key)`

- **Аргументы:** parent `CRDTMap`; field key.
- **Возвращает:** nested `CRDTArray`.
- **Исключения:** `Error("Expected CRDTArray at <key>")`.

### `requiredText(parent, key)`

- **Аргументы:** parent `CRDTMap`; field key.
- **Возвращает:** nested `CRDTText`.
- **Исключения:** `Error("Expected CRDTText at <key>")`.

## Consumers в проекте

- core `BlockManager` делегирует сюда public editor commands;
- React page keyboard, drag-and-drop и selection extensions вызывают merge/move/indent/outdent;
- clipboard cross-document transfer читает subtrees и переносит их через `insertBlock()`/`moveBlocks()`;
- `DocumentLinkManager` использует `hasBlock()` для endpoint validation;
- `DocumentModelImpl` вызывает `normalize()`, snapshot reads и `loadBlocks()`;
- demo создаёт hierarchy, list variants и custom block content через public editor facade.
