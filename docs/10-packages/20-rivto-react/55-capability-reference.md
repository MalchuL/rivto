# React capability reference

`ReactEditor` раскрывает узкие capabilities вместо forwarding methods. Registrations, созданные внутри extension `setup`, автоматически удаляются при cleanup.

Все публичные React `subscribe(listener)` capabilities используют один stream на manager и Set-семантику: разрешено несколько distinct callbacks, новый callback не заменяет старые, одинаковая function reference имеет одну effective registration, returned unsubscribe idempotent, immediate вызова нет. После notification consumer читает соответствующий `revision`/snapshot/getter. Исключения listener не перехватываются.

## `blocks`

### `register(registration)`

- **Аргументы:** `ReactBlockRegistration`.
- **Возвращает:** idempotent disposer.
- **Исключения:** invalid/duplicate definition, renderer или slash command; partial registration откатывается.

### `registerListProps(registration)`

- **Аргументы:** `{ id; defaults?; validate? }`.
- **Возвращает:** disposer.
- **Исключения:** empty/duplicate ID или invalid registration.

### `hasListProps(id)` / `validateListProps(candidate)`

- **Аргументы:** registration ID либо complete `BlockListProps`.
- **Возвращают:** `boolean`.
- **Исключения:** отсутствуют в обычном manager path; ошибки custom validator превращаются в `false`.

### `prepareBlock(input)`

- **Аргументы:** recursive `EditorBlockInput`.
- **Возвращает:** новый recursive input с shallowly merged active list defaults; вложенные `props` не deep-clone.
- **Исключения:** метод сам не валидирует type/schema; возможны только ошибки чтения malformed/Proxy input или чрезмерной recursion.

### `insertBlock(input, afterId?)`

- **Аргументы:** input; optional sibling `afterId`, где `null` означает начало.
- **Возвращает:** stable block ID.
- **Исключения:** preparation/core insertion errors.

### `updateBlock(id, patch)`

- **Аргументы:** block ID и `EditorBlockPatch`.
- **Возвращает:** `boolean`, был ли target обновлён.
- **Исключения:** invalid props/list/type patch.

### `updateBlocks(updates)`

- **Аргументы:** readonly `{ id, patch }[]`.
- **Возвращает:** positional `BlockMutationResult` со status `applied | skipped` и reason `missing | invalid`.
- **Исключения:** infrastructure/core transaction errors; invalid entries обычно отражаются как skipped.

### `deleteListProps(id, keys)` / `deleteListPropsBatch(updates)`

- **Аргументы:** block ID + property keys либо batch таких записей.
- **Возвращают:** `boolean` либо `BlockMutationResult`.
- **Исключения:** store/transaction errors; invalid result обычно skipped/false.

### `delete(type)`

- **Аргументы:** registered block type.
- **Возвращает:** `boolean` removal result.
- **Исключения:** cleanup errors owned registrations.

## `renderers`

- `register(type, renderer)` → disposer; throws для empty/duplicate type.
- `delete(type)` → `boolean`.
- `get(type)` → `BlockRenderer | undefined`.
- `has(type)` → `boolean`.
- readonly `revision: number` увеличивается при registry change.
- `subscribe(listener)` → unsubscribe; listener errors propagate.

## `surfaces`

- `register(mode, Surface)` → disposer; throws, если mode уже занят.
- `delete(mode)` → `boolean`.
- `get(mode)` → `SurfaceComponent | undefined`.
- `registerBlockWrapper(mode, Wrapper)` → disposer.
- `getBlockWrappers(mode)` → detached readonly ordered list.
- `registerEditorWrapper(Wrapper, mode?)` → disposer; omitted mode означает все modes.
- `getEditorWrappers(mode)` → ordered list.
- readonly `revision` и `subscribe(listener)` обслуживают React external store.

Первый wrapper в registration order является outermost.

## `extensions`

- `mount(Component)` → disposer; duplicate component registrations разрешены.
- `getComponents()` → readonly ordered list.
- readonly `revision` и `subscribe(listener)` уведомляют mounted UI changes.

## `events`

- `register(definition, listener)` → disposer; throws для empty/duplicate ID и invalid definition.
- `delete(id)` → `boolean`.
- `setRoot(root)` → `void`; переносит active native listeners на новый surface root.
- `getRoot()` → `HTMLElement | null`.

Listener возвращает `true | void`; `true` прекращает Rivto dispatch и вызывает native `preventDefault()` для cancelable event. Если default нужно предотвратить без claim или до завершения handler, можно вызвать `event.raw.preventDefault()` явно.

## `keyboard`

- `register(definition, listener)` → disposer; throws для invalid/duplicate ID или shortcut.
- `delete(id)` → `boolean`.
- `replaceKeymap(keymap)` → `void`.
- `setKeymapOverride(id, keys)` → `void`; `undefined` restores defaults, `[]` disables.

Handler errors передаются native dispatch caller. Higher `priority` выполняется первым.

## `selection`

- `readDOM()` → `EditorSelection | undefined`; DOM resolution errors возможны для malformed host tree.
- `restoreDOM(selection?)` → `boolean`; `false`, если endpoints нельзя отобразить в active root.
- `clearDOMHighlight()` → `void`.
- `updateDOMHighlight(selection?)` → `void`.

Все methods используют current surface root; до mount операции возвращают empty/false либо безопасно ничего не делают согласно конкретной операции.

## `clipboard`

- `registerFormatter(formatter)` → disposer; throws для empty/duplicate ID.
- `registerParser(parser)` → disposer; throws для empty/duplicate ID.
- `format(blocks)` → `{ plain, markdown, html }`; formatter errors propagate.
- `parse({ html, text })` → first matched inputs или `undefined`; parser errors propagate.

## `slashCommands`

- `register(command)` → disposer; throws для empty/duplicate ID.
- `delete(id)` → `boolean`.
- `getAll(context)` → available commands в registration order; predicate errors propagate.
- `execute(id, context)` → `void`; throws для unknown ID и command errors.
- readonly `revision` и `subscribe(listener)` поддерживают menu rendering.
