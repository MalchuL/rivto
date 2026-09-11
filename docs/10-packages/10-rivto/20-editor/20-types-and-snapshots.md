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

`SelectionManager` проверяет существование block при `set()`. Invalid offsets
не бросают exception и нормализуются в empty slice при copy/delete/paste.

### `Selection`

- **`type: "selection"`:** единый generic selection value.
- **`blocks`:** selected blocks с absolute UTF-16 `[start, end)` offsets;
  `end: -1` означает current block end, а `{ start: 0, end: -1 }` — structural coverage.
- **`elements`:** selected first-class element IDs.
- **`pluginData`:** extension-owned ephemeral metadata.
- **`anchorBlockId` / `focusBlockId`:** directed block endpoints, когда selection
  содержит blocks.

Caret — один block, у которого `start === end`. Multi-line text selection
хранится одним value: boundary blocks partial, middle blocks fully covered.
Anchor/focus описывают direction, а не порядок `blocks`.

### `Selection`

`Selection` содержит runtime
`Selection` instances. Это не multi-cursor model.

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
