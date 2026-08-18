# Editor types и snapshots

Файлы `editor/types.ts` и `editor/model.ts` определяют framework-neutral public data. Все interface properties — обычные TypeScript fields: чтение само не выбрасывает исключений; runtime validation выполняют соответствующие managers.

## Mode и options

### `EditorMode`

Union `"block" | "edgeless"`. Mode локален, не сохраняется в CRDT snapshot и может отличаться у двух views одного документа.

### `CreateRivtoEditorOptions`

- **`document?: CRDTDoc`:** внешний document adapter; без него создаётся local `YjsDoc`.
- **`mode?: EditorMode`:** initial presentation mode; default `"block"`.

Оба свойства optional и не имеют getters. Переданный document становится owned runtime-ресурсом и уничтожается через `await editor.destroy()`.

## Selection types

### `EditorPosition`

- **`blockId: string`:** stable block с text position.
- **`offset: number`:** UTF-16 offset, совместимый с DOM Range APIs.

`SelectionManager` проверяет существование block и bounds offset при `set()`.

### `TextSelection`

- **`type: "text"`:** discriminator.
- **`anchor: EditorPosition`:** endpoint начала gesture.
- **`head: EditorPosition`:** active endpoint; может предшествовать anchor.

Direction сохраняется. Для caret anchor и head совпадают.

### `BlockSelection`

- **`type: "block"`:** discriminator.
- **`blockIds: string[]`:** selected IDs в visible document order; gaps разрешены.
- **`anchorBlockId: string`:** начало gesture, обязательно входит в `blockIds`.
- **`focusBlockId: string`:** active endpoint, обязательно входит в `blockIds`.

Anchor/focus описывают direction, а не порядок массива.

### `EditorSelectionItem` и `EditorSelection`

`EditorSelectionItem = TextSelection | BlockSelection`. `EditorSelection = EditorSelectionItem[]` — ordered heterogeneous local state. Несколько text items при normalization объединяются в один continuous range; это не multi-cursor model.

## Element types

### `EditorElementFrame`

- **`x: number`:** finite coordinate, может быть отрицательной.
- **`y: number`:** finite coordinate.
- **`width: number`:** positive finite width.
- **`height: number`:** positive finite height.

### `EditorElement<Props>`

- **`id: string`:** stable identity.
- **`type: string`:** extension-owned renderer discriminator.
- **`frame: EditorElementFrame`:** persisted geometry.
- **`zIndex: number`:** finite layer order.
- **`props: Props`:** opaque extension-owned record.

### `EditorElementInput<Props>`

- **`id?: string`:** caller ID или generated UUID.
- **`type: string`:** required non-empty type.
- **`frame: EditorElementFrame`:** complete geometry.
- **`zIndex: number`:** finite layer.
- **`props?: Props`:** optional initial record.

### `EditorElementPatch`

- **`frame?: Partial<EditorElementFrame>`:** shallow geometry patch.
- **`zIndex?: number`:** replacement layer.
- **`props?: Record<string, unknown>`:** shared-map patch.

### `EditorElementUpdate`

- **`id: string`:** target element.
- **`patch: EditorElementPatch`:** applied patch.

## Block aliases

- `EditorBlock = Block`.
- `EditorBlockInput = BlockInput`.
- `EditorBlockPatch = BlockPatch`.
- `EditorBlockUpdate = BlockUpdate`.

Aliases намеренно используют canonical document-model records и не создают вторую несовместимую block schema.

## `EditorLink`

- **`id: string`:** stable link ID.
- **`from: { blockId: string; port?: string }`:** source endpoint.
- **`to: { blockId: string; port?: string }`:** destination endpoint.
- **`meta?: Record<string, unknown>`:** opaque detached metadata.

## Snapshot types

### `EditorSnapshot`

- **`version: 6`:** current schema literal.
- **`blocks: EditorBlock[]`:** complete block tree.
- **`links: EditorLink[]`:** complete links.
- **`elements: EditorElement[]`:** complete canvas elements.
- **`pluginData?: Record<string, unknown>`:** document-level namespaces.

### `EditorSnapshotUpdate`

Имеет обязательный **`version: 6`** и optional **`blocks`**, **`links`**, **`elements`**, **`pluginData`**. `load()` заменяет только supplied sections. Selection, mode, commands, revision и history не входят ни в один snapshot.

`version: 6` — compile-time public contract и значение, которое создаёт `dump()`. `DocumentModelImpl.loadSnapshot()` также проверяет это значение на runtime и отклоняет другую версию до mutations.

## Clipboard bridge types

### `ClipboardDataLike`

Внутренний structural interface позволяет принимать DOM-like clipboard без зависимости core от browser types.

#### `getData(type)`

- **Аргументы:** MIME `type: string`.
- **Возвращает:** `string`, пустую строку при отсутствии по browser convention.
- **Исключения:** определяются host clipboard implementation.

#### `setData(type, value)`

- **Аргументы:** MIME `type: string`; serialized `value: string`.
- **Возвращает:** `void`.
- **Исключения:** определяются host clipboard implementation.

### `ClipboardEventLike`

- **`clipboardData: ClipboardDataLike | null`:** readonly host transfer.

#### `preventDefault()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** определяются host event implementation.
