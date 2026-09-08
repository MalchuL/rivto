# `ExtensionManager` и `SurfaceManager`

## `ExtensionManager`

`reactEditor.extensions` владеет setup order, rollback, cleanup и components, mounted рядом с active surface.

### Properties

- readonly `revision: number`: меняется при mounted component registration.
- Extension IDs, disposers и destroyed state приватны.

### Public methods

- `mount(Component)` принимает headless/visual React component, возвращает disposer, throws после destroy. Один Component можно mount несколько раз как разные registrations.
- `getComponents()` возвращает defensive readonly list в declaration order.
- `subscribe(listener)` возвращает unsubscribe.

`subscribe()` слушает один revision stream mounted components. Можно зарегистрировать несколько distinct listeners: `RevisionStore` добавляет их в `Set` и ничего не заменяет. Та же function reference имеет одну effective registration. Returned unsubscribe idempotent; initial callback отсутствует, поэтому current value читается через `revision`/`getComponents()`. `destroy()` очищает все оставшиеся listeners.

### Runtime methods класса

`initialize(extensions)` вызывается `ReactEditorImpl` один раз; repeated call или duplicate/empty extension ID throws. `own(release)` создаёт idempotent owned disposer. `assertActive()` throws `React editor is destroyed` после teardown. `destroy()` повторно безопасен и очищает custom cleanup/registrations в reverse order.

### Modes

Mounted components mode-independent и остаются в tree при surface switch. Component сам использует `useEditorMode()` либо mode-filtered events. Это сохраняет его React state между page и edgeless, если он не возвращает `null`/не remounts собственные children.

## `SurfaceManager`

`reactEditor.surfaces` владеет root component на каждый `EditorMode`, block wrappers и editor wrappers.

### Properties

- readonly `revision: number`.
- Surface map и wrapper lists private; getters возвращают components/defensive arrays.

### Surface methods

- `register(mode, Surface)` → disposer; throws для duplicate mode/destroyed runtime.
- `delete(mode)` → `boolean`.
- `get(mode)` → component или `undefined`.

`EditorView` вызывает `get(activeMode)` и throws, если surface отсутствует.

### Wrapper methods

- `registerBlockWrapper(mode, Wrapper)` → exact disposer.
- `getBlockWrappers(mode)` → readonly ordered list.
- `registerEditorWrapper(Wrapper, mode?)` → disposer; mode может быть one/many/omitted.
- `getEditorWrappers(mode)` → filtered ordered list.
- `subscribe(listener)` → unsubscribe.

Surface `subscribe()` имеет ту же семантику `RevisionStore`: один stream registry revision, несколько distinct callbacks без override, deduplication одинаковой function reference, idempotent unsubscribe и отсутствие immediate notification. Изменения surface, block wrappers и editor wrappers вызывают общий stream; subscriber перечитывает `revision` и нужный getter. Destroy очищает subscriptions.

Первый registered wrapper — outermost. Block wrappers применяются только к указанной surface и получают один и тот же persisted block snapshot. Editor wrapper оборачивает children, extension components и active surface целиком.

### Mode switch

Switch не переносит DOM root вручную: old surface ref передаёт `null`, new surface вызывает `useEditorRoot().ref`; `EditorView` обновляет EventManager. Core document и portable selection остаются теми же.
