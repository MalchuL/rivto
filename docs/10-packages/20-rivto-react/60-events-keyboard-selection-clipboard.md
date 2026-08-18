# Events, keyboard, selection и clipboard

## DOM events

`useDOMEvent()` и `reactEditor.events.register()` используют один delegated runtime. Native listener привязан к active surface, document или window и автоматически переносится при switch surface.

### `DOMEventDefinition` properties

- **`id: string`:** unique registration ID.
- **`type`:** native event name, typed по target realm.
- **`target?: "surface" | "document" | "window"`:** default `surface`.
- **`scope?: "surface" | "block" | "content"`:** требуемая resolved boundary.
- **`mode?: EditorMode | EditorMode[]`:** mode filter.
- **`capture?`, `passive?`:** native listener options.
- **`when?(event)`:** dynamic predicate.

Handler получает immutable-by-convention `EditorEvent`: `raw`, `editor`, `root`, `mode`, `selection`, `eventTarget`, `insideRoot`, `blockElement`, `blockId`, `contentElement`. Return `true` claims dispatch для последующих Rivto handlers и вызывает `preventDefault()` для cancelable native event.

## Keyboard

```ts
useKeyboardEvent({
  id: "app.publish",
  keys: ["Primary+Enter"],
  scope: "surface",
}, ({ raw }) => {
  raw.preventDefault();
  publish();
  return true;
});
```

`KeyboardEventDefinition` дополнительно принимает `phase`, `target`, `composing`, `priority`, `when`. `Primary` нормализует Meta на Apple platforms и Control в остальных environments.

### Keymap overrides

```ts
createReactEditor({
  editor,
  keymap: {
    [KEYBOARD_BINDING_IDS.blockIndent]: ["Primary+ArrowRight"],
    [KEYBOARD_BINDING_IDS.blockOutdent]: [],
  },
  extensions: [standardPreset()],
});
```

- `replaceKeymap(map)` заменяет все overrides.
- `setKeymapOverride(id, keys)` меняет один; `undefined` восстанавливает defaults, `[]` отключает.
- Unknown binding ID может быть заранее overridden и начнёт действовать после registration.

## Два уровня selection

```text
core editor.selection     blockId + UTF-16 offsets, portable local state
React DOM selection       browser nodes/ranges/highlights текущей surface
```

`reactEditor.selection` methods:

- `readDOM()` возвращает `EditorSelection | undefined`;
- `restoreDOM(selection?)` возвращает `boolean` success;
- `clearDOMHighlight()` возвращает `void`;
- `updateDOMHighlight(selection?)` возвращает `void`.

Все methods без явного root используют текущий root из EventManager. Core selection всегда меняйте через `editor.selection`.

Text selection extension синхронизирует caret/ranges. Обычный cross-block drag создаёт block selection; Alt-drag сохраняет partial text endpoints. Selection локален и не синхронизируется между collaborators.

## Clipboard

Built-in `clipboardExtension()` связывает browser MIME data с core structured bundle. React capability добавляет portable formats для external apps.

### Formatters

`registerFormatter(formatter)` принимает `{ id, matches?, format(context, current) }`, возвращает idempotent disposer и throws для empty/duplicate ID. Все matching formatters применяются по порядку.

`format(blocks)` возвращает `{ plain, markdown, html }`, рекурсивно сохраняя hierarchy. `ClipboardFormatContext` содержит `block`, `siblings`, `index`, `depth`, уже formatted `children`.

### Parsers

`registerParser({ id, parse })` возвращает disposer и throws для empty/duplicate ID. `parse({ html, text })` возвращает первый matched `EditorBlockInput[] | undefined`.

Core custom MIME сохраняет lossless Rivto structure; portable React formats предназначены для обмена с внешними applications.

## Slash commands

`reactEditor.slashCommands.register({ id, title, group?, keywords?, isAvailable?, execute })` возвращает disposer. `getAll({ blockId })` фильтрует context; `execute(id, context)` запускает command или throws для unknown ID. `standardPreset()` монтирует searchable menu и generic list/duplicate/delete/collapse actions.
