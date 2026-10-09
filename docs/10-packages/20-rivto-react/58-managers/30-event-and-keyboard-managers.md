# `EventManager` и `KeyboardManager`

## `EventManager`

`runtime.events` владеет общим delegated transport и маршрутизирует события к зарегистрированным отображениям. `editor.events` — локальный ViewEventManager: он использует root и cleanup своего отображения.

### Properties

Public properties отсутствуют. Private state: ordered registrations, connected native listener groups, реестр корней отображений и claimed native events.

### `register(definition, listener)`

- **Аргументы:** `DOMEventDefinition` и `EditorEventHandler`.
- **Возвращает:** idempotent disposer.
- **Исключения:** empty/duplicate ID, destroyed runtime, connection/native listener errors.

Definition задаёт `id`, `type`, optional `target`, `scope`, `mode`, `capture`, `passive`, `when`. Default target — `surface`.

Handler получает `EditorEvent` со properties `raw`, `editor`, `root`, `mode`, `selection`, `eventTarget`, `insideRoot`, `blockElement`, `blockId`, `contentElement`. Return `true` claims event, прекращает дальнейший Rivto dispatch и вызывает `preventDefault()` для cancelable native event.

### Остальные methods

- `delete(id)` принимает registration ID, возвращает `boolean`, не throws для missing ID.
- `editor.events.setRoot(root)` принимает `HTMLElement | null` и обновляет root конкретного отображения через его контроллер; общие surface/document/window listeners переподключаются через реестр. У `runtime.events` этого метода нет.
- `getRoot()` возвращает current element или `null`.
- `destroy()` возвращает `void`, повторно безопасен.

### Modes

Registration без `mode` работает в обеих surfaces. `mode: "block"`, `"edgeless"` или array фильтруется на dispatch по поверхности отображения, получившего событие. При switch root заменяется, поэтому window/document listeners также переходят в realm нового surface document.

Scope означает:

- `surface` — target внутри root;
- `block` — найден nearest `[data-block-id]`;
- `content` — найден nearest `[data-block-content]`.

## `KeyboardManager`

`editorRuntime.keyboard` строит semantic actions поверх четырёх EventManager transports: surface/window × keydown/keyup.

### Properties

Public properties отсутствуют. Keymap, registrations и destroyed state private.

### `register(definition, listener)`

- **Аргументы:** `KeyboardEventDefinition`, handler `KeyboardEditorEvent => true | void`.
- **Возвращает:** disposer.
- **Исключения:** empty/duplicate ID, malformed shortcut, destroyed runtime.

Definition properties: `id`, `keys`, optional `phase`, `target`, `scope`, `mode`, `composing`, `priority`, `when`. Defaults: keydown, surface target, composing ignored, priority `0`.

`KeyboardEditorEvent` добавляет `shortcut` и `phase` к обычному `EditorEvent`.

### Keymap methods

- `replaceKeymap(keymap)` принимает complete override map, возвращает `void`, валидирует все shortcuts до atomic apply.
- `setKeymapOverride(id, keys)` принимает current/future ID; `undefined` restores declared defaults, `[]` disables; возвращает `void`.
- `delete(id)` возвращает `boolean`.
- `destroy()` повторно безопасен.

### Dispatch order и modes

Eligible registrations сортируются по descending priority, затем declaration order. Проверяются phase, target, mode, scope, exact shortcut, IME policy и `when`. Первый handler, вернувший `true`, claims keyboard event через EventManager.

Mode-specific bindings позволяют одинаковому shortcut иметь разные semantic handlers в page и edgeless. Например arrows внутри page двигают caret/selection, а edgeless movement extension двигает active canvas objects только при `mode: "edgeless"`.
