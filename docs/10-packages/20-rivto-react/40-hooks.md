# Public React hooks

Все hooks требуют ancestor `<EditorView>`. Вне provider они выбрасывают context error.

## Runtime hooks

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
- **Возвращает:** detached `Selection | undefined`.
- **Исключения:** provider/selection errors.

### `useEditorRoot()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `{ element: HTMLElement | null; ref }`.
- **Исключения:** `Editor root hooks must be used inside EditorView`.

Нужен прежде всего custom surface: container назначает `ref` и становится DOM scope.

## Document hooks

### `useRootBlockIds()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `readonly string[]` в root order.
- **Исключения:** provider/document materialization errors.

## Block hooks

### `useBlock(blockId)`

- **Аргументы:** `blockId: string`.
- **Возвращает:** `{ block: EditorBlock | undefined; operations: BlockOperations }`.
- **Исключения:** provider error; operations передают validation/store errors.

Detached `block` обновляется по подписке на его subtree. Operations привязаны к ID: `update`, `setContent`, `setType`, `setProp`, `setPluginData`, `remove`, `mergeInto`, `moveAfter`, `moveBefore`, `moveInside`, `indent`, `outdent`.

`block.children` содержит полные рекурсивные дочерние блоки. Используйте этот hook только когда нужны данные потомков.

### `useBlockNode(blockId)`

- **Аргументы:** `blockId: string`.
- **Возвращает:** `{ block: EditorBlockNode | undefined; operations: BlockOperations }`.

`block.childIds` содержит прямые дочерние ID; данные потомков не материализуются. Узел обновляется при изменении своих полей или списка прямых детей.

### `useBlockChildren(blockId)`

- **Аргументы:** parent `blockId`.
- **Возвращает:** `{ children: readonly string[]; operations: { add, remove, move } }`.
- **Исключения:** missing parent, non-direct child и core errors.

`add(block, afterId?)` возвращает созданный блок; `undefined` означает append, `null` — first. Остальные operations принимают только direct child ID.

### `useBlockSelection(blockId)`

- **Аргументы:** `blockId`.
- **Возвращает:** containing `Selection | null`.
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
