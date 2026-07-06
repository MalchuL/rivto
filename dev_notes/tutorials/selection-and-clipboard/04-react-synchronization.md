# Глава 04. Как React синхронизирует DOM и runtime selection

Selection особенно сложен в React-приложении, потому что browser и React оба
могут менять DOM.

Главный файл: `src/editor/react/rivto-editor.tsx`.

## 1. Два источника изменений

Native selection может измениться из-за пользователя:

- click;
- mouse drag;
- Shift+Arrow;
- Home/End;
- browser paste;
- focus change.

Portable selection может измениться из кода:

- `selection.set` command;
- block handle click;
- rectangle selection;
- clipboard collapse после Paste;
- mode cleanup;
- block deletion;
- external plugin.

Синхронизация нужна в обе стороны:

```text
DOM Selection  ──────────────► SelectionManager
DOM Selection  ◄────────────── SelectionManager
```

## 2. Почему нельзя хранить selection только в React state

SelectionManager framework-independent. Он нужен clipboard manager, plugins и
другим renderer adapters.

React лишь подписывается на manager и показывает его state.

Это сохраняет boundary:

```text
EditorRuntime не импортирует React
React adapter импортирует EditorRuntime
```

## 3. useSyncExternalStore

`SelectionManager` — внешний store для React. Компонент использует:

```ts
useSyncExternalStore(
  listener => editor.selection.subscribe(listener),
  () => JSON.stringify(editor.selection.get()),
  () => "null",
);
```

### subscribe

React передаёт callback. Manager вызывает его после `set()` или effective
`clear()`.

### getSnapshot

React ожидает стабильный snapshot для сравнения. `selection.get()` возвращает
новую detached object-копию каждый раз, поэтому сравнение object references
всегда говорило бы «изменилось».

JSON string превращает одинаковое логическое состояние в одинаковый primitive
snapshot.

Полученная переменная `selectionRevision` используется dependency layout
effect. Само selection читается свежим через `editor.selection.get()`.

### server snapshot

`"null"` используется для server-side render, где browser selection отсутствует.

## 4. Общий runtime revision

EditorRuntime также подписан на SelectionManager и увеличивает `revision`.

Этот revision нужен не только основному renderer:

- demo runtime inspector;
- plugin UI;
- toolbar contributions;
- любые consumers `editor.subscribe()`.

Поэтому одно selection change уведомляет и специализированную React subscription,
и общую runtime invalidation.

## 5. DOM → runtime: selectionchange effect

Обычный `useEffect` добавляет listener на `document`:

```ts
document.addEventListener("selectionchange", synchronizeSelection);
```

Listener:

1. Проверяет, что editor root mounted.
2. Проверяет ownership marker synthetic gesture.
3. Читает native selection через `readEditorSelection(root)`.
4. Если оба endpoints принадлежат этому editor, выполняет `selection.set`.
5. Selection вне editor игнорируется.

Почему listener на document: Selection API принадлежит window/document, а не
конкретному contenteditable element.

## 6. Почему selection вне editor не очищает runtime сразу

`readEditorSelection()` возвращает `undefined`, если endpoints не внутри root.
Listener тогда ничего не делает.

Это важно для toolbar:

1. Пользователь выделил текст.
2. Нажал Bold button.
3. Native focus перешёл на button.
4. Stored TextSelection всё ещё содержит диапазон.
5. Toolbar применяет format к stored selection.

Если click вне editable сразу очищал runtime selection, formatting button не
знал бы, какой текст форматировать.

## 7. runtime → DOM: useLayoutEffect

После React commit запускается `useLayoutEffect`, зависящий от:

- editor instance;
- mode;
- selectionRevision.

Layout effect выполняется после обновления DOM, но до browser paint. Это
подходящее время для caret restoration: пользователь не должен видеть frame со
старой позицией.

Алгоритм:

1. Получить current runtime selection.
2. Если type `text`, вызвать `restoreEditorSelection()`.
3. Иначе очистить native text selection внутри editor.
4. Обновить supplemental cross-block highlight.
5. Cleanup предыдущего effect удаляет old highlight.

## 8. Почему block selection очищает native selection

Представьте, что сначала был выделен текст, затем пользователь click-нул block
handle. Runtime state уже `block`, но browser всё ещё мог рисовать старый text
range.

Без `clearNativeSelection()` UI показывал бы два разных selection одновременно.

Функция очищает range только если anchor или focus находится внутри текущего
editor root. Она не трогает selection другого editor instance или другой части
страницы.

## 9. Feedback loop

Программное восстановление native selection может вызвать новый
`selectionchange`:

```text
runtime set
→ React layout effect
→ browser Selection changed
→ selectionchange listener
→ runtime set
```

Одинаковое повторное value сейчас допустимо. SelectionManager уведомляет при
каждом `set()`, даже если данные структурно равны.

Опасен не сам повтор, а промежуточное неправильное browser value во время
cross-block drag. Его блокирует ownership marker.

Если вы захотите оптимизировать equal updates, нельзя сравнивать только object
reference: manager всегда отдаёт detached copies.

## 10. React и editable content

`EditableText` не использует обычный controlled pattern:

```tsx
<span contentEditable>{block.content}</span>
```

с полным rerender каждой буквы. Browser уже изменил DOM и поставил caret в
правильное место.

Layout effect сравнивает:

```text
visible DOM innerText
model block.content
```

### Если element focused и тексты равны

DOM не трогается. Caret остаётся на native position.

### Если element focused и тексты различаются

Это может быть programmatic Paste или remote update. `textContent` обновляется,
затем selection layout effect восстанавливает caret по portable position.

### Если element не focused

Renderer может показать Markdown HTML вместо plain editing text.

При focus он заменяет rendered HTML на raw block content. Portable offsets
считаются по raw text, а не по декоративным Markdown elements.

## 11. Почему onPaste снова читает native selection

Browser sequence может быть:

```text
caret changed
paste event
selectionchange event
```

Если Paste использует только SelectionManager, он может вставить текст в старую
позицию.

Поэтому root paste handler:

1. синхронно вызывает `readEditorSelection(root)`;
2. если получил value — немедленно выполняет `selection.set`;
3. только затем запускает plugin routing и clipboard command.

Это локальная защита от event timing, а не второй clipboard model.

## 12. Copy event bridge

Root `onCopy`:

1. Читает current runtime selection.
2. Выбирает context block ID.
3. Отправляет normalized event в EventRouter.
4. Plugins могут полностью обработать Copy и вернуть `true`.
5. Если никто не обработал, выполняется `clipboard.copyEvent`.

Clipboard manager не импортирует React. React передаёт ему native
`ClipboardEvent` через command payload.

## 13. Selection и toolbar

Toolbar использует stored selection после focus change.

Formatting доступен только когда:

```text
type === text
anchor.blockId === head.blockId
```

Offsets сортируются для formatting:

```ts
from = Math.min(anchor.offset, head.offset);
length = Math.abs(head.offset - anchor.offset);
```

Stored direction не меняется.

Cross-block formatting сейчас ничего не делает. Это осознанное ограничение:
нужно определить semantics для разных block types и нескольких transactions.

## 14. Selection и mode renderer

Mode хранится отдельно в ModeManager и тоже читается через
`useSyncExternalStore`.

При mode change:

1. ModeManager уведомляет runtime и React.
2. Runtime reconcile очищает несовместимый EdgelessSelection.
3. React commit заменяет PageRenderer на CanvasRenderer или обратно.
4. Layout effect на новом DOM пытается восстановить TextSelection.
5. Если нужные blocks rendered, portable IDs снова превращаются в DOM nodes.

Это демонстрирует главное преимущество portable selection: оно не зависит от
конкретного renderer DOM tree.

## 15. Focus и editor.focus()

`editor.focus(blockId)` — отдельный механизм. Он используется после вставки
нового блока.

Фокус откладывается через `queueMicrotask`, потому что React сначала должен
отрендерить DOM нового block ID. Затем runtime ищет contenteditable и вызывает
`.focus()`.

Сам `focus()` не устанавливает portable offset. Browser создаёт native caret,
после чего обычный `selectionchange` синхронизирует его.

## 16. Cleanup React listeners

При unmount:

- document selectionchange listener удаляется;
- pointer listeners renderer удаляются;
- ownership marker удаляется;
- CSS highlight очищается;
- useSyncExternalStore вызывает unsubscribe.

Без cleanup старый editor продолжал бы реагировать на selection нового mounted
instance.

## 17. Несколько editor instances

DOM conversion всегда получает конкретный `root`.

Endpoint принимается только если `.rv-block-content` находится внутри этого
root. Native clear тоже проверяет принадлежность endpoints.

Поэтому selection editor A не должен записываться в runtime editor B.

Глобальные browser APIs общие, но scope создаётся явной root-проверкой.

## 18. Timeline обычного клика

```text
1. pointerdown внутри contenteditable
2. browser ставит caret
3. selectionchange
4. readEditorSelection
5. command selection.set
6. runtime validation
7. SelectionManager notification
8. React commit при необходимости
9. layout effect restores caret/highlight
```

## 19. Timeline programmatic Paste

```text
1. paste handler synchronously reads native caret
2. selection.set stores fresh position
3. ClipboardManager changes DocumentModel
4. ClipboardManager stores collapsed TextSelection after inserted data
5. document and selection subscriptions schedule React
6. EditableText updates model-derived DOM
7. layout effect restores caret in final block/offset
```

## 20. Итог главы

React не является владельцем selection semantics. Он выполняет роль bridge:

```text
browser events ↔ portable runtime state ↔ rendered DOM
```

Следующая глава использует всю эту инфраструктуру для Copy, Cut и Paste:
[clipboard](./05-clipboard.md).
