# Глава 03. Выделение блоков и объектов edgeless canvas

TextSelection выбирает символы. BlockSelection выбирает структурные объекты в
page и edgeless mode.

Главный файл этой главы: `src/editor/react/renderers.tsx`.

## 1. Зачем нужен отдельный BlockSelection

Представим три paragraph blocks. Пользователь хочет удалить их как блоки.

Native text selection знает только текстовый диапазон. Оно не сохраняет:

- тип каждого блока;
- props;
- children;
- pluginData;
- layout;
- links.

BlockSelection хранит IDs и позволяет clipboard скопировать полноценные block
trees.

## 2. visibleBlockIds

`BlockDOMRenderer` получает document tree. Блоки могут быть вложенными:

```text
A
├── B
└── C
D
```

Renderer flatten-ит дерево depth-first:

```ts
["A", "B", "C", "D"]
```

Это `visibleBlockIds`. Массив используется для Shift-selection и Arrow keys.

Depth-first соответствует порядку, в котором blocks появляются в DOM.

## 3. Выбор блока через side handle

У блока есть кнопка `⋮` с accessible name `Drag block`. Она выполняет две
задачи:

- начинает drag-and-drop при реальном drag;
- выбирает block при click.

Click вызывает:

```ts
selectBlock(block.id, event.shiftKey, event.metaKey || event.ctrlKey)
```

Аргументы означают:

- `extend` — Shift удерживается;
- `toggle` — Control или Command удерживается.

## 4. Обычный click

Без modifiers:

1. clicked block становится anchor.
2. Он же становится focus.
3. `blockIds = [clickedId]`.
4. Выполняется `selection.set`.
5. Runtime проверяет ID и порядок.
6. `BlockView` на следующем render видит ID в selection.
7. На block отражается presentation state: `data-block-selected=true`.
8. CSS показывает фон и outline.

## 5. Shift-click: диапазон блоков

Если уже есть BlockSelection:

1. Сохраняется старый `anchorBlockId`.
2. Clicked block становится новым focus.
3. В `visibleBlockIds` ищутся indexes anchor и focus.
4. Берётся inclusive slice между минимальным и максимальным index.
5. Slice всегда расположен сверху вниз.
6. Anchor/focus сохраняют направление отдельно.

Пример: пользователь сначала выбрал C, затем Shift-click A.

```ts
{
  type: "block",
  blockIds: ["A", "B", "C"],
  anchorBlockId: "C",
  focusBlockId: "A",
}
```

## 6. Control/Command-click: toggle

Если текущий selection имеет type `block`:

1. IDs копируются в `Set`.
2. Clicked ID удаляется, если уже выбран.
3. Иначе clicked ID добавляется.
4. Set фильтруется через `visibleBlockIds`, чтобы восстановить document order.
5. Пустой результат вызывает `selection.clear`.
6. Если старый anchor удалён, clicked block становится новым anchor.
7. Clicked block становится focus.

Set нужен для быстрого membership check и удаления duplicates. Но Set хранит
порядок добавления, а не document order, поэтому после него обязательно нужна
фильтрация через `visibleBlockIds`.

## 7. Keyboard для BlockSelection

Page renderer получает bubbling `onKeyDown`.

Он работает только при `selection.type === "block"`.

### Escape

Отменяет native default и выполняет `selection.clear`.

### Backspace / Delete

1. Отменяет default.
2. Для каждого selected ID выполняет `block.remove`.
3. Очищает selection.

Если selected parent удаляет child subtree, последующий remove child становится
безопасным no-op.

### ArrowUp / ArrowDown

1. В `visibleBlockIds` находится текущий `focusBlockId`.
2. Выбирается сосед сверху или снизу.
3. С Shift вызывается extend от старого anchor.
4. Без Shift сосед становится новым single-block selection.

Так direction хранится через anchor/focus, а не через порядок массива.

## 8. Rectangle selection из пустого места

Пользователь может начать drag на пустой части `.rv-page`.

Это намеренно отличается от drag внутри текста:

```text
pointerdown внутри .rv-block-content → text gesture
pointerdown прямо на .rv-page        → block rectangle gesture
```

Если target — дочерний UI element, но не page и не editable text, gesture не
начинается.

## 9. Начало rectangle gesture

`onPointerDownCapture`:

1. Проверяет primary button.
2. Видит `event.target === page root`.
3. Сохраняет type `block`, x/y и `moved=false`.
4. Очищает предыдущий selection.

До движения пользователь видит обычный clear, а не рамку.

## 10. Pointermove rectangle gesture

После движения больше трёх pixels:

1. `preventDefault()` блокирует native text selection.
2. `moved` становится `true`.
3. Page получает marker ownership.
4. Native selection внутри editor очищается.
5. Rectangle строится через `min` и `abs`:

```ts
left = min(startX, currentX)
top = min(startY, currentY)
width = abs(currentX - startX)
height = abs(currentY - startY)
```

Поэтому рамка работает слева направо, справа налево, сверху вниз и снизу вверх.

6. Rectangle сохраняется в React state для paint.
7. `blockIdsInRect(root, rect)` ищет выбранные blocks.
8. Пустой результат очищает selection.
9. Непустой результат создаёт BlockSelection.

## 11. Как рамка рисуется

Coordinates pointer относятся к viewport. `.rv-selection-rect` расположен
внутри page.

Renderer вычитает `page.getBoundingClientRect().left/top`, превращая viewport
coordinates в local page coordinates.

CSS задаёт border, прозрачный background и `pointer-events:none`, чтобы рамка
сама не перехватывала дальнейшие pointer events.

## 12. blockIdsInRect: простое пересечение

Функция получает DOM rectangle каждого `[data-rivto-block]`.

Strict intersection означает:

```text
selection.right > block.left
selection.left < block.right
selection.bottom > block.top
selection.top < block.bottom
```

Если boundaries только касаются, block не выбирается. Иначе один pixel касания
мог бы неожиданно включить соседний block.

## 13. Сложность вложенных блоков

Представим:

```text
Parent A
├── Child B
└── Child C
```

DOM rectangle parent часто включает rectangles children. Простая intersection
выбрала бы A, B и C одновременно.

Это плохо:

- Copy мог бы дважды положить child content;
- UI показал бы несколько levels как независимые selections;
- delete semantics стали бы неочевидными.

## 14. Parent rule

`blockIdsInRect()` использует правило:

1. Найти deepest block, который вертикально содержит всю рамку.
2. Найти его direct children.
3. Если верхняя и нижняя границы рамки попали в children, выбрать contiguous
   child slice.
4. Иначе выбрать containing parent.
5. После этого удалить любой selected element, если его selected parent уже
   есть.

В результате selection содержит либо parent subtree, либо нужных детей, но не
оба одновременно.

## 15. Direction rectangle selection

`blockIds` всегда приходят в DOM order.

Если current pointer выше start y, gesture reverse:

```ts
anchorBlockId = last selected ID;
focusBlockId = first selected ID;
```

При drag вниз — наоборот.

## 16. Завершение rectangle gesture

На pointerup:

1. `pointerSelection.current` очищается.
2. React rectangle state становится `null`.
3. Native selection очищается.
4. Через zero-delay task native selection очищается ещё раз.
5. Ownership marker удаляется.

Повторное clear защищает от позднего browser selection event после pointerup.

## 17. BlockSelection на canvas

Edgeless renderer отображает root blocks как absolutely positioned cards, но
selection model остаётся тем же. Ctrl/Cmd-click по любому `BlockView`, включая
nested block, создаёт или дополняет `BlockSelection`. Click по card chrome и
rectangle gesture создают `BlockSelection` из root IDs.

Selected blocks получают `data-block-selected=true`.

## 18. Два слоя canvas card

Внутри одной карточки есть:

1. object layer — card chrome, drag strip, resize behavior;
2. content layer — editable text, inputs, links, buttons.

Click по object layer выбирает root через BlockSelection.

Click по content layer должен оставить native focus и создать TextSelection.

## 19. Guard против потери text editing

Card `onClick` проверяет event target:

```ts
target.closest(
  '[contenteditable="true"],input,textarea,select,a,button'
)
```

Если найден interactive content, object selection не выполняется.

Почему проверка стоит в `onClick`, а не только в child:

DOM click bubbles. Даже если contenteditable обработал click, event поднимается
до card.

Без guard последовательность была такой:

```text
click text
→ browser ставит caret
→ selectionchange создаёт TextSelection
→ click bubbles в card
→ card создаёт BlockSelection
→ typing больше не работает ожидаемо
```

Именно это было причиной старой регрессии «в edgeless mode нельзя редактировать».

## 20. Переход object → text → object

Нормальный сценарий:

1. Click `.rv-drag` или card chrome.
2. Runtime selection становится `block`.
3. Click editable content.
4. Browser создаёт caret.
5. `selectionchange` записывает `text` selection.
6. Typing меняет block text.
7. Click card chrome снова записывает `block` selection.

## 21. Form controls в canvas card

Image/file blocks содержат `<input>`. Input selection не является Rivto text
selection, потому что он не находится в `.rv-block-content`.

Card guard всё равно не позволяет click выбрать object. Input сохраняет focus и
может редактировать URL.

Runtime inspector при этом может показывать старое или отсутствующее selection,
но не должен неожиданно показывать новое `block` только из-за input click.

## 22. Смена mode

При команде:

```ts
editor.commands.execute("mode.set", { mode: "block" });
```

ModeManager переключает только presentation. TextSelection и BlockSelection
сохраняются: один и тот же block tree существует в обоих renderer.

## 23. Clipboard и structural selection

BlockSelection нормализуется как whole blocks:

```text
start = начало первого selected block
end   = конец последнего selected block
```

Copy сохраняет type, props, pluginData, children, layout и internal links.

Cut удаляет blocks целиком, а не оставляет пустой первый block. Подробный путь
будет в главе clipboard.

## 24. Итог главы

Теперь есть два selection намерения:

```text
выбрать символы              TextSelection
выбрать block structure      BlockSelection
```

Canvas object gesture тоже создаёт BlockSelection; layout-команды отдельно
проецируют nested IDs на owning root cards. Runtime проверяет и нормализует
данные одинаково для обоих mode.

Следующая глава: [как React синхронизирует selection](./04-react-synchronization.md).
