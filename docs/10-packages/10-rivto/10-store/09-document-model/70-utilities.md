# Utilities модели документа

Utilities выполняют adapter-neutral narrowing, in-place assignment, portable cloning и block-specific validation. Managers используют их вместо повторения CRDT conversion logic.

## CRDT type guards

Исходник: `core/utils/crdt.ts`.

### `isCRDTMap(value)`

- **Аргументы:** `value: unknown`.
- **Возвращает:** type predicate `value is CRDTMap<any>`.
- **Исключения:** обычные значения безопасны; Proxy может выбросить ошибку при проверке properties.

Duck typing требует object с `set` и `entries`. Это сохраняет adapter neutrality, но не является nominal identity check и может принять посторонний объект с теми же полями.

### `isCRDTArray(value)`

- **Аргументы:** `value: unknown`.
- **Возвращает:** type predicate `value is CRDTArray<any>`.
- **Исключения:** обычные значения безопасны; Proxy traps могут выбросить ошибку.

Проверяет наличие `insert` и `toArray`.

### `isCRDTText(value)`

- **Аргументы:** `value: unknown`.
- **Возвращает:** type predicate `value is CRDTText`.
- **Исключения:** обычные значения безопасны; Proxy traps могут выбросить ошибку.

Проверяет наличие `format` и `toDelta`.

## In-place assignment

Все три helper-а изменяют уже существующий destination CRDT container. Они не превращают произвольный plain object в independently editable CRDT tree. Гранулярность определяется только непосредственным destination container:

- у `assignMap()` независимо обновляются top-level keys map;
- у `assignArray()` независимо обновляются позиции/items array;
- у `assignText()` обновляются character ranges;
- поля внутри plain object, помещённого в map или array, не создают updates сами по себе.

Если destination уже attached к document, его операции входят в текущую CRDT transaction и приводят к document update. Если destination ещё detached, изменения только подготавливают его initial state; update появляется при последующем attachment к attached parent.

### `assignMap(map, values, clear = true)`

- **Аргументы:** destination `CRDTMap<Schema>`; `values: Record<string, unknown>`; optional `clear: boolean`.
- **Возвращает:** `void`.
- **Исключения:** clone/conversion и `clear`/`set` errors CRDT adapter.

При `clear === true` сначала удаляет все keys. Затем clone-ит и записывает каждое значение, кроме `undefined`. При `false` выполняет merge supplied keys и сохраняет остальные.

`values` — всегда plain input record. Helper обрабатывает только первый уровень: каждая пара `[key, value]` становится отдельным `map.set(key, ...)`, но `value` рекурсивно clone-ится как portable plain value. Вложенные objects и arrays не преобразуются в `CRDTMap`/`CRDTArray`/`CRDTText`.

```ts
assignMap(props, {
  title: "Card",
  style: { color: "red", width: 2 },
}, false);
```

Здесь `title` и `style` — два независимо обновляемых map keys. `style.color` и `style.width` — поля одного plain object: присваивание `style.color = "blue"` не является CRDT operation, не вызывает observers и не синхронизируется. Нужно снова вызвать `assignMap(props, { style: { ...oldStyle, color: "blue" } }, false)` либо заранее использовать nested map, созданную через instantiator, но сам `assignMap()` не предназначен для записи CRDT wrappers.

Семантика `clear`:

- `true` — `map.clear()`, затем `set()` каждого defined key; отсутствующие и `undefined` keys исчезают;
- `false` — existing keys сохраняются; supplied defined keys заменяются; supplied `undefined` пропускается и поэтому не удаляет существующий key;
- identity destination map всегда сохраняется, но при `clear: true` observers видят удаления и новые записи её keys.

### `assignText(text, content)`

- **Аргументы:** live `CRDTText`; полный `content: string`.
- **Возвращает:** `void`.
- **Исключения:** CRDT length/delete/insert errors.

Удаляет старый диапазон и вставляет новый, не заменяя identity wrapper. В отличие от `setBlockText()`, helper не вычисляет минимальный diff.

`content` является обычной входной строкой, но после `insert()` её символы становятся содержимым `CRDTText`, а не одним атомарным string field. При непустом старом и новом тексте helper создаёт delete старого диапазона и insert нового диапазона. Он не сохраняет formatting старых символов и не сравнивает общий prefix/suffix.

### `assignArray(array, values, clear = true)`

- **Аргументы:** destination `CRDTArray<Item>`; ordered `readonly Item[]`; optional `clear`.
- **Возвращает:** `void`.
- **Исключения:** CRDT length/delete/insert и conversion errors.

При clear заменяет полную последовательность. Без clear добавляет supplied values в конец.

Helper не clone-ит array items и не выполняет recursive conversion. Переданные primitives остаются base values; переданные plain objects/arrays остаются plain values внутри одной позиции. Их внутренние свойства нельзя collaborative-редактировать:

```ts
assignArray(items, [{ id: "a", done: false }]);
```

CRDT отслеживает вставку item в позицию `0`, но не последующее присваивание `item.done = true`. Для изменения нужно вставить новое полное plain значение вместо старого либо хранить item как явно созданный и attached `CRDTMap`. Поскольку helper не clone-ит items, caller должен считать переданные plain objects immutable после вставки; mutation той же JavaScript reference не является поддерживаемым способом записи и не создаёт CRDT update.

Семантика `clear`:

- `true` — удаляется старый диапазон `0..length`, затем все supplied items вставляются с позиции `0`;
- `false` — existing items сохраняются, а supplied items одной вставкой добавляются в конец;
- identity destination array сохраняется в обоих случаях;
- пустой `values` при `false` является no-op, при `true` очищает array.

В текущем `document-model` у `assignArray()` нет call sites: block hierarchy использует focused `CRDTArray.insert/delete/push`, чтобы выражать move и ownership точечно. Helper остаётся общей utility для полной/append assignment portable array values.

## Call graph assignment helpers

### `assignMap()`

```text
assignMap
├─ DocumentBlockManager.updateBlocks
│  └─ updateBlock
├─ DocumentBlockManager.setBlockType
├─ DocumentBlockManager.insertInto (recursive)
│  ├─ insertBlock
│  └─ loadBlocks
│     └─ DocumentModelImpl.loadSnapshot
├─ DocumentElementManager.insertElement
│  └─ loadElements
│     └─ DocumentModelImpl.loadSnapshot
├─ DocumentElementManager.updateElements
│  └─ updateElement
└─ DocumentPluginDataManager.getMap (promotion plain namespace -> shared map)
```

Во всех этих ветках plain records остаются plain ниже top-level key destination map. Рекурсивность `insertInto()` относится к обходу block children: она создаёт отдельный CRDT record для каждого child, но не превращает nested plain fields внутри `props`, `listProps` или `pluginData` в shared maps.

### `assignText()`

```text
assignText
├─ DocumentBlockManager.updateBlocks
│  └─ updateBlock
└─ DocumentBlockManager.insertInto (recursive)
   ├─ insertBlock
   └─ loadBlocks
      └─ DocumentModelImpl.loadSnapshot
```

Вход остаётся plain string в API, но destination является `CRDTText`, поэтому после assignment изменения происходят на уровне text operations.

### `assignArray()`

Прямых или транзитивных callers в текущем `store/document-model` нет.

## Portable cloning

Исходник: `core/utils/clone.ts`.

### `clone(value)`

- **Аргументы:** generic `value: T`.
- **Возвращает:** structurally detached `T`.
- **Исключения:** cyclic graph приводит к recursion overflow; getters/Proxy traps и property access errors передаются.

Примитивы и `null` возвращаются напрямую. Arrays создаются через local-realm `Array.from`, что важно для iframe/vm data. Objects копируются по own enumerable string keys в plain record.

Функция предназначена для portable arrays/records. Она не сохраняет prototypes, symbols, non-enumerable properties, `Date`, `Map`, `Set` или class identity; такие значения не относятся к supported document data.

## Block utilities

Исходник: `core/managers/block-manager/utils.ts`.

### `validateBlockListProps(value)`

- **Аргументы:** `value: unknown`.
- **Возвращает:** исходный object, narrowed до `BlockListProps`.
- **Исключения:** `TypeError` для non-object top level, unsupported/nonfinite values, nonplain objects или cycles.

Разрешены finite numbers, strings, booleans, `null`, arrays и recursively nested plain records. Метод валидирует без clone или normalization.

```ts
validateBlockListProps({
  collapsed: false,
  list: { type: "checkbox", checked: true },
});
```

### `strings(array)`

- **Аргументы:** `array: CRDTArray<string>`.
- **Возвращает:** detached `string[]`.
- **Исключения:** ошибки `array.toArray()` или `String()` exotic value.

Каждое materialized значение преобразуется через `String`. Tree algorithms используют helper для adapter-neutral traversal ownership arrays.

### `contentFrom(content)`

- **Аргументы:** `content: BlockInput["content"]`, то есть `string | undefined`.
- **Возвращает:** supplied string или `""`.
- **Исключения:** отсутствуют.

## Почему assignment сохраняет identity

Managers не заменяют nested `CRDTMap`, `CRDTArray` и `CRDTText` при snapshot load или patch. Они меняют содержимое существующего container. Это сохраняет:

- ссылки, удерживаемые managers и observers;
- granular CRDT merge behavior;
- undo scopes;
- concurrent updates к независимым keys;
- renderer access к тому же live wrapper.

Выбирайте `assignMap`/`assignArray` для полной или partial assignment, `assignText` для unconditional replacement и focused manager methods для domain validation и minimal diffs.

`assignMap` и `assignArray` не являются deep-promotion API. Если внутреннее свойство plain object должно самостоятельно генерировать updates, создайте соответствующий nested `CRDTMap`/`CRDTArray`/`CRDTText` через `document.crdt.instantiator` и присоедините его явной CRDT operation.
