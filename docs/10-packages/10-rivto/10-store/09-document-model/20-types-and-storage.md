# Публичные данные и persisted storage

Файл `core/types/document.ts` описывает detached API и snapshots. `core/types/storage.ts` описывает live CRDT-форму тех же сущностей.

Все properties на этой странице являются TypeScript data fields, а не getters. Чтение самого поля не выбрасывает исключений. Validation и возможные ошибки возникают при передаче структуры в manager; для persisted schemas — при чтении соответствующего key из `CRDTMap`.

## Canvas element types

### `ElementFrame`

Все свойства обязательны, имеют тип `number` и читаются без исключений:

- **`x`:** конечная горизонтальная координата;
- **`y`:** конечная вертикальная координата;
- **`width`:** конечная положительная ширина;
- **`height`:** конечная положительная высота.

`DocumentElementManager` выбрасывает `Error("Element frame requires finite coordinates and positive dimensions")` при записи некорректной geometry.

### `DocumentElement<Props>`

- **`id: string`:** стабильная collaborative identity.
- **`type: string`:** renderer-defined discriminator.
- **`frame: ElementFrame`:** detached geometry.
- **`zIndex: number`:** конечный stacking order.
- **`props: Props`:** opaque type-specific record.

Все поля обязательны. Чтение detached-объекта не выбрасывает исключений.

### `ElementInput<Props>`

- **`id?: string`:** необязательный caller ID; без него используется `crypto.randomUUID()`.
- **`type: string`:** обязательный непустой type.
- **`frame: ElementFrame`:** обязательная полная geometry.
- **`zIndex: number`:** обязательное конечное число.
- **`props?: Props`:** optional record; по умолчанию `{}`.

### `ElementPatch`

- **`frame?: Partial<ElementFrame>`:** shallow patch поверх текущей geometry.
- **`zIndex?: number`:** replacement stacking order.
- **`props?: Record<string, unknown>`:** shallow merge в live props map.

### `ElementUpdate`

- **`id: string`:** target element.
- **`patch: ElementPatch`:** применяемое изменение.

## Block types

### `BlockListProps`

Alias `Record<string, unknown>` для opaque outline/page presentation. Перед storage значения проходят `validateBlockListProps()` и должны быть portable, finite, plain и acyclic.

### `Block`

- **`id: string`:** стабильный ID.
- **`type: string`:** native block discriminator.
- **`listProps: BlockListProps`:** detached outline properties.
- **`props: Record<string, unknown>`:** detached type-specific properties.
- **`pluginData: Record<string, unknown>`:** namespaces конкретного блока.
- **`content: string`:** Markdown source, materialized из `CRDTText`.
- **`children: Block[]`:** рекурсивное detached-дерево.

### `BlockInput`

- **`type: string`:** обязательный непустой type.
- **`id?: string`:** caller ID или generated UUID.
- **`listProps?: BlockListProps`:** initial outline properties.
- **`props?: Record<string, unknown>`:** initial type-specific properties.
- **`pluginData?: Record<string, unknown>`:** initial block namespaces.
- **`content?: string`:** initial Markdown; по умолчанию `""`.
- **`children?: BlockInput[]`:** recursive initial subtree.

### `BlockPatch`

- **`listProps?: BlockListProps`:** shallow merge выбранных keys.
- **`props?: Record<string, unknown>`:** validated shallow merge; `undefined` result удаляет key.
- **`pluginData?: Record<string, unknown>`:** shallow merge namespaces.
- **`content?: string`:** replacement полного plain text через minimal CRDT diff.

`id` и `type` намеренно отсутствуют. Type меняется отдельным `setBlockType()`.

### `BlockUpdate`

- **`id: string`:** target block.
- **`patch: BlockPatch`:** partial update.

## Link type

### `Link`

- **`id: string`:** стабильный ID связи.
- **`from: { blockId: string; port?: string }`:** source block и optional port.
- **`to: { blockId: string; port?: string }`:** destination block и optional port.
- **`meta?: Record<string, unknown>`:** detached opaque metadata.

Создание требует существования обоих block IDs. Core не интерпретирует `port` или `meta`.

## Snapshot types

### `Snapshot`

- **`version: 6`:** обязательный literal.
- **`blocks: Block[]`:** полное block tree.
- **`links: Link[]`:** полный link set.
- **`elements: DocumentElement[]`:** полный element set.
- **`pluginData?: Record<string, unknown>`:** document namespaces.

### `SnapshotUpdate`

Содержит обязательный **`version: 6`** и optional **`blocks`**, **`links`**, **`elements`**, **`pluginData`** тех же типов. Присутствующая секция заменяется полностью; отсутствующая остаётся без изменений.

## Validator type

### `BlockPropsValidator(type, props)`

- **Аргументы:** `type: string`; `props: Record<string, unknown>`.
- **Возвращает:** validated/normalized `Record<string, unknown>`.
- **Исключения:** validator может отклонить props исключением; block manager передаёт его caller-у до shared write, где это возможно.

По умолчанию manager возвращает props без изменений. `EditorRuntime` устанавливает validator из `BlockRegistryManager`.

## Persisted CRDT types

### `BlockStorage`

- **`id: string`:** атомарный stable ID.
- **`type: string`:** атомарный native type.
- **`listProps: CRDTMap<BlockListPropsStorage>`:** shared outline fields.
- **`props: CRDTMap<Record<IDProp, CRDTType>>`:** shared block props.
- **`content: CRDTText`:** collaborative Markdown text.
- **`children: CRDTArray<IDBlock>`:** ordered direct child IDs.
- **`pluginData: CRDTMap<Record<IDPlugin, CRDTType>>`:** block-level plugin namespaces.

Children хранят IDs, а не вложенные block maps. Перемещение меняет только ownership arrays и сохраняет identity payload.

`listProps`, `props` и `pluginData` являются CRDT maps, но это не означает, что каждый произвольный object внутри них автоматически является CRDT object. `DocumentBlockManager` записывает значения их top-level keys через `assignMap()` или эквивалентный `clone()` + `set()`: вложенные records/arrays остаются plain и заменяются целиком на уровне содержащего key. `content` отличается: plain input string записывается операциями attached `CRDTText`.

### `ElementStorage`

- **`id: string`:** атомарный ID.
- **`type: string`:** атомарный discriminator.
- **`frame: CRDTMap<ElementFrameStorage>`:** independently editable geometry fields.
- **`zIndex: number`:** атомарный layer.
- **`props: CRDTMap<Record<IDProp, CRDTType>>`:** shared properties.

`frame` содержит только base numbers, и каждый coordinate/dimension является отдельным shared key. `props` также granular по top-level key, но manager clone-ит object/array prop value как plain data. Например, `props.style` shared отдельно от `props.title`, однако `style.color` не является самостоятельным CRDT key.

### `LinkStorage`

- **`id: string`:** атомарный ID.
- **`from: Link["from"]`:** атомарный cloned endpoint.
- **`to: Link["to"]`:** атомарный cloned endpoint.
- **`meta: Record<string, BasicType>`:** атомарная cloned metadata.

Outer link record является `CRDTMap`, но manager не использует `assignMap()` для partial link updates: `createLink()` создаёт новую record map и заменяет root `links[id]`. Endpoints и `meta` остаются plain objects, их внутренние properties не генерируют updates.

### Alias types

- `ElementFrameStorage = Record<keyof ElementFrame, number>`.
- `BlockListPropsStorage = BlockListProps`.
- `IDBlock`, `IDLink`, `IDElement`, `IDPlugin` и `IDProp` являются aliases `string`.

У aliases нет runtime properties или исключений: они ограничивают TypeScript API и документируют назначение строк.

## Внутренний `LocatedBlock`

- **`array: CRDTArray<string>`:** ownership array, содержащий ID.
- **`index: number`:** текущий sibling index.
- **`parentId?: string`:** отсутствует для root.
- **`path: readonly number[]`:** индексы от roots до блока.

Объект используется только алгоритмами `DocumentBlockManager` и не экспортируется.
