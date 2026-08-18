# Public React hooks

Все hooks требуют ancestor `<EditorView>`. Вне provider они выбрасывают context error.

## Runtime hooks

### `useEditor()`

- **Аргументы:** отсутствуют.
- **Возвращает:** stable core `RivtoEditorApi`.
- **Исключения:** `Editor hooks must be used inside EditorView`.

### `useReactEditor()`

- **Аргументы:** отсутствуют.
- **Возвращает:** stable `ReactEditor`.
- **Исключения:** та же provider error.

### `useEditorMode()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `{ mode; setMode(mode): void }`.
- **Исключения:** provider или mode manager errors.

Mode локален и не входит в snapshot.

### `useEditorSelection()`

- **Аргументы:** отсутствуют.
- **Возвращает:** detached `EditorSelection`.
- **Исключения:** provider/selection errors.

### `useEditorRoot()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `{ element: HTMLElement | null; ref }`.
- **Исключения:** `Editor root hooks must be used inside EditorView`.

Нужен прежде всего custom surface: container назначает `ref` и становится DOM scope.

## Document hooks

### `useDocument()`

- **Аргументы:** отсутствуют.
- **Возвращает:** stable `DocumentModel`.
- **Исключения:** provider error.

### `useRootBlockIds()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `readonly string[]` в root order.
- **Исключения:** provider/document materialization errors.

## Block hooks

### `useBlock(blockId)`

- **Аргументы:** `blockId: string`.
- **Возвращает:** `{ block: EditorBlock | undefined; operations: BlockOperations }`.
- **Исключения:** provider error; operations передают validation/store errors.

Detached `block` обновляется по revision. Operations привязаны к ID: `update`, `setContent`, `setType`, `setProp`, `setPluginData`, `remove`, `mergeInto`, `moveAfter`, `moveBefore`, `moveInside`, `indent`, `outdent`.

### `useBlockChildren(blockId)`

- **Аргументы:** parent `blockId`.
- **Возвращает:** `{ children; operations: { add, remove, move } }`.
- **Исключения:** missing parent, non-direct child и core errors.

`add(block, afterId?)` возвращает ID; `undefined` означает append, `null` — first. Остальные operations принимают только direct children.

### `useBlockSelection(blockId)`

- **Аргументы:** `blockId`.
- **Возвращает:** containing `BlockSelection | null`.
- **Исключения:** provider/selection errors.

Text selection намеренно возвращает `null`.

### `useBlockEditing(blockId, options?)`

- **Аргументы:** `blockId`; optional `{ textEdit?: boolean }`, default `true`.
- **Возвращает:** block/operations, `getProps`, `getProp`, `setProps`, `setProp`, `attributes`, `preventTextEditingAttributes`.
- **Исключения:** provider error; setters передают schema/store errors.

Imperative getters читают latest state и безопасны в event closures. `setProp(key, undefined)` удаляет property, если schema разрешает. `preventTextEditingAttributes` назначается nested interactive editor, который не должен активировать raw block editing.

## Interaction hooks

### `useDOMEvent(definition, listener)`

- **Аргументы:** typed `DOMEventDefinition`; handler возвращает `true | void`.
- **Возвращает:** `void`, cleanup автоматический.
- **Исключения:** duplicate/invalid ID и listener errors.

Latest listener хранится в ref: rerender не reconnects native listeners.

### `useKeyboardEvent(binding, listener)`

- **Аргументы:** `KeyboardEventDefinition`; `KeyboardEditorEvent` handler.
- **Возвращает:** `void`.
- **Исключения:** invalid/duplicate binding, shortcut parsing и listener errors.

Binding ID позволяет application переопределить keys без изменения extension.
