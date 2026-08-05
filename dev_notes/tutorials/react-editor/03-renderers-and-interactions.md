# Глава 03. Block renderer, canvas и interactions

## 1. Один BlockView для двух presentations

`BlockView` используется и в normal document flow, и на canvas.

Flag:

```ts
canvas = false
```

определяет presentation differences:

```text
block mode      обычный flow, nested children, side controls
canvas mode     absolute position, drag handle, resize handle
```

Content resolution остаётся общим.

## 2. DOM identity attributes

Root block element содержит:

```tsx
data-rivto-block={block.id}
data-type={markdownType(block)}
data-block-selected={blockSelected}
```

Они используются:

- selection DOM mapping;
- focus lookup;
- CSS styling;
- event block context;
- E2E selectors.

Stable `block.id` связывает detached model value с DOM element.

## 3. Page tree rendering

`BlockDOMRenderer` получает root blocks, а `BlockView` recursively рисует:

```tsx
block.children.map((child) => (
  <BlockView block={child} ... />
))
```

Вложенность visual DOM следует detached document tree.

`visibleBlockIds` отдельно flatten tree в document order для keyboard и range
block selection.

## 4. Side menu actions

В block mode рядом с block появляются controls:

- drag;
- add below;
- indent;
- outdent;
- delete;
- plugin UI actions slot `sideMenu`.

Каждая mutation вызывает command. UIRegistry items превращаются в buttons, а
button выполняет declared command с `{ blockId }`.

## 5. Drag-and-drop block mode

Drag button записывает source ID в DataTransfer:

```ts
application/x-rivto-block
```

Drop target dispatch normalized `drop`:

```ts
{
  type: "drop",
  blockId: targetId,
  payload: { sourceId },
}
```

Built-in fallback runtime проверяет mode и IDs, затем выполняет `block.move`.

React отвечает за browser DataTransfer, runtime — за policy/mutation.

## 6. Block selection через handle

Click выбирает один block. Shift расширяет range от старого anchor. Ctrl/Cmd
toggle membership.

Renderer вычисляет ordered IDs по `visibleBlockIds`, но final validation и
canonical document order дополнительно обеспечивает `selection.set` command.

Keyboard при block selection:

- Escape очищает;
- Delete/Backspace удаляет selected blocks commands;
- ArrowUp/ArrowDown двигает focus;
- Shift+Arrow расширяет range.

Полный алгоритм selection объяснён в отдельном курсе.

## 7. Blank-space rectangle selection

Pointer down прямо на page root начинает потенциальный block gesture. После
движения больше небольшого threshold renderer:

1. предотвращает native selection;
2. строит rectangle;
3. показывает `.rv-selection-rect`;
4. вызывает `blockIdsInRect()`;
5. сохраняет block selection command;
6. сохраняет reverse anchor/focus, если pointer идёт вверх.

Temporary rectangle — React state. Итоговый selection — runtime state.

## 8. Cross-contenteditable pointer selection

Каждый block имеет отдельный contentEditable. Browser behavior между ними
нестабилен, особенно при движении снизу вверх.

Renderer хранит gesture в ref, слушает window pointermove capture и переводит
координаты в portable block/offset positions. Во время gesture ставится marker:

```text
data-rivto-pointer-selecting="true"
```

Верхняя binding видит marker и временно игнорирует промежуточные browser
`selectionchange`, чтобы они не затёрли правильный directed selection.

После pointerup portable selection снова восстанавливается в native range.

## 9. Почему gesture хранится в `useRef`

Pointermove может приходить очень часто. Gesture object нужен event listeners,
но его изменение само по себе не должно вызывать render на каждом pixel.

`useRef`:

- сохраняется между renders;
- изменение `.current` не вызывает render;
- доступно window handlers без global variable.

Visual rectangle хранится в state, потому что его действительно нужно
перерисовывать.

## 10. Canvas element frame

В edgeless mode card style берётся из collaborative block element:

```ts
{
  left: element.frame.x,
  top: element.frame.y,
  width: element.frame.width,
  minHeight: element.frame.height,
  zIndex: element.zIndex,
}
```

Canvas plane имеет фиксированное рабочее пространство и scale transform для
zoom.

## 11. Drag canvas block

На pointerdown renderer запоминает:

- начальные pointer x/y;
- начальные layout left/top.

На window pointermove вычисляет delta и выполняет:

```ts
editor.elements.updateElement(element.id, {
  frame: {
    x: start.left + next.clientX - start.x,
    y: start.top + next.clientY - start.y,
  },
});
```

Window listeners нужны, чтобы drag продолжался, когда pointer вышел за пределы
маленького handle. Pointerup обязательно удаляет оба listener.

## 12. Resize canvas block

Resize использует ту же delta model, но меняет width/height. Минимумы:

```text
width  >= 180
height >= 70
```

`stopPropagation()` не даёт тому же pointerdown начать drag/select родителя.

## 13. Keyboard movement на canvas

Canvas block имеет `tabIndex=0`, поэтому chrome может получить focus.

Arrow keys двигают object на один pixel, Shift+Arrow — на десять. Если event
target является contentEditable, handler возвращается: arrows должны двигать
caret, а не карточку.

Это важный accessibility и interaction layer guard.

## 14. Object selection против text selection

Click на canvas card chrome создаёт обычный `BlockSelection` для root block.

Но click внутри:

```text
contenteditable, input, textarea, select, link, button
```

не выбирает объект. Иначе bubbling click заменил бы TextSelection на
BlockSelection, и пользователь не смог бы редактировать текст.

Эта маленькая проверка защищает основную возможность редактирования canvas
blocks.

## 15. Canvas links

Renderer читает `editor.getLinks()` и root block layouts, затем рисует SVG
lines между центрами cards.

Сейчас lookup использует root `blocks.find()`, поэтому visual link rendering
ориентирован на canvas root blocks. Link data остаётся first-class в model.

## 16. Slash menu rendering

`BlockView` получает slash state. Если `slash.blockId === block.id`, рядом с
block появляется popup.

Items вычисляются через slash plugin с mode availability filtering.

Menu использует `onMouseDown` и `preventDefault`, чтобы click по item не успел
снять focus/caret с editable до выполнения action.

После этого выполняется plugin command `slash.execute`.

## 17. Toolbar contributions

Верхняя binding определяет active block по текущему selection:

```text
text       anchor.blockId
block      focusBlockId
edgeless   первый blockId
```

Document tree flatten нужен, чтобы найти type nested active block. Затем:

```ts
editor.ui.get("toolbar", mode, activeBlock?.type)
```

Renderer превращает metadata в buttons.

## 18. Event normalization table

| Browser/React source | Runtime type | Основной context |
| --- | --- | --- |
| `onInput` | `input` | block ID и text |
| `onKeyDown` | `keydown` | key/modifiers/default type/empty |
| root `onCopy` | `copy` | active block и native clipboard event |
| root `onPaste` | `paste` | caret block, clipboard event, default type |
| `onDrop` | `drop` | target block и source ID |
| block `onPointerDown` | `pointerdown` | block ID и button |

## 19. Cleanup window listeners

Pointer gestures добавляют listeners вне React tree. Каждый path должен их
удалить:

- pointerup cleanup;
- component effect cleanup при unmount.

Иначе stale handler продолжит вызывать commands после смены renderer или
уничтожения editor.
