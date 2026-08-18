# `BlockManager` и `RendererManager`

## `BlockManager`

`reactEditor.blocks` соединяет core block definition, React renderer, slash conversion и React-owned list-property policy. Сам block content хранится только в core.

### Properties

Public mutable properties отсутствуют. Manager хранит registrations, separator types и ordered list-property registrations внутри runtime; прямого доступа к collections нет.

### `register(registration)`

- **Аргументы:** `ReactBlockRegistration { definition, render, slashCommand?, separatesBlockElements? }`.
- **Возвращает:** idempotent disposer exact registration.
- **Исключения:** duplicate renderer/type/slash ID, invalid definition, destroyed runtime; partial work rollback.

Если core definition уже существует, manager переиспользует её и добавляет presentation.

### `registerListProps(registration)`

- **Аргументы:** `{ id: string; defaults?: BlockListProps; validate?(candidate): boolean }`.
- **Возвращает:** disposer.
- **Исключения:** empty/duplicate ID или destroyed runtime.

Defaults объединяются shallowly в registration order. Ошибка validator считается rejection, а не передаётся наружу.

### Read methods

- `hasListProps(id)` принимает ID, возвращает `boolean`, не throws.
- `validateListProps(candidate)` принимает complete record, возвращает `false` при portability/validator error.
- `separatesBlockElements(type)` возвращает `boolean`.
- `getDefaultBlockElementSeparatorType()` возвращает первый separator type или `undefined`.

### Mutation methods

- `prepareBlock(input)` → recursive copied input с list defaults; не выполняет core schema validation.
- `insertBlock(input, afterId?)` → new root ID; throws для invalid list props/core insertion.
- `updateBlock(id, patch)` → `false` для missing/invalid list state, иначе applies и возвращает `true`; core errors propagate.
- `updateBlocks(updates)` → positional best-effort result; accepted subset выполняется одним core batch.
- `deleteListProps(id, keys)` → `boolean`.
- `deleteListPropsBatch(updates)` → positional result.
- `delete(type)` → `boolean`; удаляет complete React-owned definition/renderer/slash registration.

### Modes

Один registration действует в обеих surfaces: `BlockTree` выбирает тот же renderer. `separatesBlockElements` влияет только на разбиение root flow в edgeless; page hierarchy не меняется.

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
