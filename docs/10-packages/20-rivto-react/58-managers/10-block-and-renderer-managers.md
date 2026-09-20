# Block type, list-property, block-operation, and renderer managers

## `BlockTypeManager`

`reactEditor.blockTypes` соединяет core block definition, React renderer, optional view, slash conversion и separator metadata. Сам block content хранится только в core.

### Properties

Public mutable properties отсутствуют. Manager хранит type registrations и separator types внутри runtime; прямого доступа к collections нет.

### `register(registration)`

- **Аргументы:** `ReactBlockRegistration { definition, render, slashCommand?, separatesBlockElements? }`.
- **Возвращает:** idempotent disposer exact registration.
- **Исключения:** duplicate renderer/type/slash ID, invalid definition, destroyed runtime; partial work rollback.

Если core definition уже существует, manager переиспользует её и добавляет presentation.

### Read and cleanup methods

- `separatesBlockElements(type)` возвращает `boolean`.
- `getDefaultBlockElementSeparatorType()` возвращает первый separator type или `undefined`.
- `delete(type)` удаляет complete React-owned definition/renderer/view/slash registration.

### Modes

Один registration действует в обеих surfaces: `BlockTree` выбирает тот же renderer. `separatesBlockElements` влияет только на разбиение root flow в edgeless; page hierarchy не меняется.

## `blockListProps` lifecycle adapter

`reactEditor.blockListProps` делегирует core `BlockListPropsManager`; React владеет только cleanup registrations extension lifecycle.

### `register(registration)`

- **Аргументы:** `{ id: string; defaults?: BlockListProps; validate?(candidate): boolean }`.
- **Возвращает:** disposer.
- **Исключения:** empty/duplicate ID или destroyed runtime.

Defaults объединяются shallowly в registration order. Ошибка validator считается rejection, а не передаётся наружу.

### Read methods

- `has(id)` принимает ID, возвращает `boolean`, не throws.
- `validate(candidate)` принимает complete record, возвращает `false` при portability/validator error.
- `prepare(candidate)` возвращает copied list-property record с defaults и validation.

## `BlockManager` operations

`reactEditor.blocks` владеет guarded mutations и делегирует core block reads/structure operations.

`prepareInput(input)` делегирует recursive preparation core `BlockManager`.

### Mutation methods

- `insertBlock(input, afterId?)` → complete persisted block; throws для invalid list props/core insertion.
- `importForest(blocks, afterId?, onError?)` accepts explicit `EditorBlock | EditorBlockInput` roots and returns `{ roots, idMap }`.
- `updateBlock(id, patch)` → complete persisted block; throws для missing/invalid operation.
- `updateBlocks(updates)` → complete persisted blocks in input order; strict atomic core batch, throws если любая entry invalid.
- `deleteListProps(id, keys)` → change `boolean`; throws для missing/invalid operation.
- `deleteListPropsBatch(updates)` → `void`; strict atomic core batch.

## `RendererManager`

`reactEditor.renderers` — lower-level lookup, когда definition установлен отдельно или persisted unknown type нужно отобразить без регистрации model rule.

### Properties

- readonly `revision: number`: registry snapshot token.
- configured fallback хранится privately и возвращается `get()` для unknown type.

### Methods

- `register(type, renderer)` принимает non-empty type/component, возвращает disposer, throws для duplicate/empty type/destroyed runtime.
- `delete(type)` возвращает `boolean`.
- `get(type)` возвращает exact renderer, fallback или `undefined`.
- `has(type)` возвращает наличие exact renderer, не учитывая fallback.
- `subscribe(listener)` возвращает unsubscribe; listener errors propagate.

Renderer manager предоставляет один registry-revision stream. Несколько distinct listeners могут быть активны одновременно; новая подписка не заменяет старую. Internal `RevisionStore` использует `Set`, поэтому одна и та же function reference регистрируется эффективно один раз. Unsubscribe idempotent, initial callback отсутствует, а listener после notification читает `revision` и `get()`/`has()`.

Renderer registry mode-independent. Page и edgeless rerenderятся по одной revision и получают одинаковый content component.
