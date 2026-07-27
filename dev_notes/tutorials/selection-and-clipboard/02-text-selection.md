# Глава 02. Как работает выделение текста

В этой главе соединяем browser API из главы 00 с runtime model из главы 01.

Главный файл: `src/editor/react/selection.ts`.

## 1. DOM-контракт renderer

Selection-код не знает устройство React-компонентов целиком. Он ищет несколько
стабильных признаков:

```html
<div data-rivto-editor>
  <div class="rv-page">
    <div data-rivto-block="A">
      <span class="rv-block-content" contenteditable="true">
        Alpha
      </span>
    </div>
  </div>
</div>
```

Назначение каждого элемента:

- `data-rivto-editor` — граница одного editor instance;
- `data-rivto-block` — стабильный ID блока из DocumentModel;
- `.rv-block-content` — начало системы текстовых offsets;
- `contenteditable` — native editing host браузера.

Если custom renderer удалит эти признаки или поместит редактируемый текст вне
них, selection adapter не сможет перевести DOM position в block position.

## 2. DOMSelectionPoint

Во время mouse drag Rivto временно использует:

```ts
interface DOMSelectionPoint {
  node: Node;
  offset: number;
  content: HTMLElement;
}
```

`node + offset` понимает браузер. `content` нужен, чтобы проверить, к какому
editable host относится node.

Это временный тип. Он не попадает в SelectionManager.

## 3. Как координаты мыши превращаются в DOM position

Функция `readDOMSelectionPoint(root, x, y)` получает viewport coordinates.

### Шаг 1: найти editable host

`contentNearPoint()` вызывает:

```ts
document.elementFromPoint(x, y)
```

и ищет ближайший `.rv-block-content`.

Если pointer находится в padding или промежутке между блоками, прямого hit нет.
Тогда функция:

1. получает rectangle каждого editable host;
2. считает расстояние от pointer до rectangle;
3. выбирает ближайший host.

Это позволяет непрерывно вести выделение через пустой промежуток.

### Шаг 2: спросить browser о caret

API различается между browser engines:

- Firefox: `document.caretPositionFromPoint(x, y)`;
- Chromium: `document.caretRangeFromPoint(x, y)`.

Rivto поддерживает оба.

### Шаг 3: проверить ответ

Browser endpoint принимается, только если полученный node находится внутри
ранее выбранного editable host.

Почему браузер может вернуть другой host: во время cross-contenteditable drag
он иногда ограничивает caret текущим активным редактором.

### Шаг 4: fallback nearestTextPoint

Если browser endpoint неправильный, `nearestTextPoint()`:

1. обходит text nodes только выбранного блока;
2. перебирает offsets от 0 до длины каждого text node;
3. создаёт collapsed Range для каждой позиции;
4. получает visual rectangle caret;
5. выбирает позицию с минимальным расстоянием до pointer.

Это более дорогой путь, но он запускается только как fallback и только для
одного блока.

Пустой editable возвращает `{ node: content, offset: 0 }`.

## 4. Как DOM position превращается в EditorPosition

`readPosition(root, node, offset)` делает обратный перевод.

Предположим, rendered DOM внутри блока сложный:

```html
<span class="rv-block-content">
  Hello <strong>world</strong>
</span>
```

Endpoint может находиться в text node внутри `<strong>`. Rivto не сохраняет
путь `span → strong → text`, потому что Markdown rerender может его изменить.

Вместо этого функция:

1. находит ближайший `.rv-block-content`;
2. находит ближайший `data-rivto-block`;
3. проверяет, что content находится внутри нужного editor root;
4. создаёт Range от начала всего content до endpoint;
5. вызывает `range.toString().length`;
6. возвращает `{ blockId, offset }`.

Так несколько DOM text nodes превращаются в один линейный offset блока.

## 5. Обычный caret или selection внутри одного блока

Для одного editable host browser работает достаточно хорошо.

Полный путь:

1. Пользователь кликает внутри текста.
2. Browser создаёт collapsed native Selection.
3. `document` отправляет `selectionchange`.
4. Listener в `RivtoEditor` вызывает `readEditorSelection(root)`.
5. Функция читает native anchor и focus.
6. Каждый endpoint проходит через `readPosition()`.
7. Получается `TextSelection` с `blockId + offset`.
8. React вызывает команду `selection.set`.
9. EditorRuntime проверяет позиции.
10. SelectionManager сохраняет detached value.
11. Subscribers вызывают React update.
12. Layout effect проецирует runtime value обратно в DOM.

Последний шаг нужен, потому что между browser event и React commit DOM мог быть
изменён model update.

## 6. Почему cross-block selection нельзя оставить браузеру

У каждого блока свой `contenteditable`. При drag из блока A в B browser может:

- оставить focus endpoint внутри A;
- создать selection, но подсветить только B;
- прислать промежуточный `selectionchange` только для B;
- задержать событие до pointerup;
- потерять направление при drag снизу вверх.

Поэтому `BlockDOMRenderer` сам ведёт cross-block жест.

## 7. Начало text drag: onPointerDownCapture

Handler работает в capture phase, до native contenteditable.

Порядок действий:

1. Проверяется `event.button === 0` — только основная кнопка.
2. Из event target ищется `.rv-block-content`.
3. `readDOMSelectionPoint()` вычисляет DOM anchor по координатам.
4. `readDOMPointPosition()` сразу переводит его в portable position.
5. В `pointerSelection.current` сохраняются:
   - `type: "text"`;
   - `anchorPosition`;
   - стартовые x/y.

Почему portable anchor вычисляется сразу: позже Chromium иногда возвращает для
старых coordinates уже новый active endpoint. Stable `{blockId, offset}` не
зависит от этого поведения.

`pointerSelection` — React ref, а не state. Pointermove происходит часто;
изменение ref не требует rerender на каждом техническом шаге.

## 8. Global pointermove

Renderer устанавливает capture listener на `window`.

Почему не на block:

- pointer может выйти за стартовый block;
- selection идёт через несколько siblings;
- Chromium может иначе маршрутизировать mouse events во время native drag.

Первые три пикселя считаются порогом. Маленькое движение не превращает обычный
click в сложный drag.

## 9. Пока head остаётся в anchor block

Rivto вычисляет current head. Если anchor и head имеют одинаковый blockId,
synthetic cross-block logic не запускается. Native browser selection внутри
одного host уже делает правильную работу.

Как только blockId head отличается, начинается bridge.

## 10. Cross-block bridge: каждый шаг

На каждом pointermove в другом блоке:

1. `event.preventDefault()` останавливает конфликтующий native drag для этого
   движения.
2. Восстанавливается сохранённый DOM anchor или вычисляется один раз.
3. По текущим x/y вычисляется DOM head.
4. Portable anchor берётся из pointerdown.
5. Portable head вычисляется сейчас.
6. На page ставится `data-rivto-pointer-selecting="true"`.
7. Создаётся directed selection:

```ts
{
  type: "text",
  anchor: anchorPosition,
  head: headPosition,
}
```

8. Выполняется `selection.set`.
9. `setNativeSelection()` пытается показать тот же диапазон browser.
10. `updateCrossBlockHighlight()` сразу дорисовывает все выбранные части.

Runtime value и visual paint создаются из одной пары positions, поэтому они не
расходятся во время gesture.

## 11. Зачем data-rivto-pointer-selecting

Внешний `RivtoEditor` постоянно слушает `selectionchange`. Но во время
synthetic drag browser может прислать неправильное временное значение.

Без guard произошёл бы цикл:

```text
renderer вычислил правильные A:2 → B:3
browser прислал временное selection только внутри B
RivtoEditor записал B:0 → B:3
правильный anchor A потерян
```

Поэтому listener делает:

```ts
if (root.querySelector('[data-rivto-pointer-selecting="true"]')) return;
```

Пока marker существует, pointer renderer владеет selection.

## 12. setNativeSelection и направление

Сначала вызывается:

```ts
selection.setBaseAndExtent(
  anchor.node,
  anchor.offset,
  head.node,
  head.offset,
);
```

Это browser API сохраняет base/extent direction.

Если API бросает ошибку — например, node уже detached или browser не принимает
cross-editable endpoints — Rivto:

1. сравнивает DOM order endpoints;
2. выбирает более ранний start;
3. выбирает более поздний end;
4. создаёт обычный Range;
5. заменяет native ranges.

Fallback теряет native direction, но portable selection уже сохранил anchor и
head правильно.

## 13. Drag снизу вверх

Пусть pointerdown был в B:4, а pointermove пришёл в A:1.

Rivto сохраняет:

```ts
anchor = { blockId: "B", offset: 4 };
head = { blockId: "A", offset: 1 };
```

Для paint позже будет определено, что visual first block — A, а last — B. Но
runtime direction не меняется.

Это разделение принципиально:

```text
gesture semantics: B → A
document range:     A → B
```

Gesture semantics нужны UI. Document range понадобится clipboard.

## 14. Pointerup

На завершении gesture:

1. `pointerSelection.current` очищается.
2. Временная rectangle paint очищается.
3. Если cross-block TextSelection был создан, вызывается
   `restoreEditorSelection()`.
4. Для Firefox через `setTimeout(..., 0)` restoration выполняется ещё раз.
5. После позднего restoration удаляется ownership marker.

Firefox может отправить selectionchange после pointerup. Marker живёт ещё одну
task, чтобы это позднее событие не перезаписало portable selection.

## 15. Как portable position снова становится DOM position

`pointAtOffset(content, requestedOffset)`:

1. создаёт TreeWalker по text nodes;
2. хранит `remaining = requestedOffset`;
3. для каждого node сравнивает remaining с node length;
4. если position внутри node — возвращает node + remaining;
5. иначе вычитает длину и идёт дальше;
6. слишком большой offset прижимается к концу последнего node;
7. пустой content возвращает element + offset 0.

Так runtime не обязан помнить старую структуру DOM.

## 16. restoreEditorSelection

Функция получает portable TextSelection.

Шаги:

1. Найти `.rv-block-content` для anchor block ID.
2. Найти host для head block ID.
3. Если один host не rendered — ничего не делать.
4. Определить, collapsed ли selection.
5. Посмотреть текущий `document.activeElement`.
6. Если caret collapsed, но focus уже ушёл из редактора — не восстанавливать.
7. Если caret collapsed и должен быть в другом editable Rivto — focus нужный
   host с `preventScroll`.
8. Перевести offsets через `pointAtOffset()`.
9. Вызвать `setNativeSelection()`.

### Почему нельзя всегда делать focus

Пользователь выделил текст и нажал toolbar button. Кнопка получила focus. Если
layout effect безусловно восстановит caret, focus немедленно вернётся в текст,
а keyboard user потеряет кнопку.

Поэтому collapsed caret восстанавливается только пока focus остаётся внутри
editable content.

## 17. Почему native paint недостаточно

Browser может хранить endpoints A и B, но цветом показать только active host.
Пользователь решит, что часть текста не выбрана, хотя Copy возьмёт её.

`updateCrossBlockHighlight()` добавляет supplemental paint.

## 18. CSS Highlight API

Функция:

1. очищает старый highlight;
2. работает только для cross-block TextSelection;
3. собирает `.rv-block-content` в rendered order;
4. находит indexes anchor/head blocks;
5. определяет visual first и last;
6. создаёт Range для каждого блока:
   - first: boundary → конец;
   - middle: весь block;
   - last: начало → boundary;
7. создаёт `Highlight(...ranges)`;
8. сохраняет его в `CSS.highlights` под именем
   `rivto-cross-selection`.

CSS:

```css
::highlight(rivto-cross-selection) {
  background: #cfc4ff;
}
```

Highlight API не вставляет `<span>` в editable DOM. Это важно: дополнительные
marker nodes изменили бы offset calculations и могли вызвать input bugs.

Если API недоступен, presentation fallback ставит
`data-text-selection-fallback=true` на затронутые hosts.
Fallback грубее и подсвечивает host целиком, но selection semantics остаются
правильными.

## 19. Почему highlight обновляется в двух местах

Обычно React layout effect обновляет highlight после subscription update.

Во время active native drag Chromium может отложить React external-store commit
до pointerup. Поэтому pointermove также вызывает highlight напрямую. Это даёт
видимую обратную selection ещё до отпускания мыши.

E2E test специально проверяет paint, пока mouse button всё ещё нажата.

## 20. Что происходит при обычном вводе

Browser сначала меняет DOM contenteditable, потом `onInput`:

1. читает `innerText`;
2. убирает технический trailing newline;
3. выполняет `text.set`;
4. отправляет normalized input event plugins.

`EditableText.useLayoutEffect` проверяет active element.

Если content focused и visible text уже равен model text, DOM не трогается.
Иначе caret сбрасывался бы после каждой буквы.

Если model изменился программно или remotely и DOM отличается, textContent
обновляется, после чего selection restoration возвращает caret.

## 21. Замена cross-block selection вводом

Browser не может надёжно заменить range через два contenteditable. Rivto
перехватывает:

- `beforeinput` для insert/delete input types;
- `keydown` как fallback для printable key, Backspace и Delete.

Если selection пересекает blocks:

1. native default отменяется;
2. typed character или пустая строка передаётся в `clipboard.paste`;
3. ClipboardManager заменяет ordered range;
4. первый block остаётся;
5. остальные touched blocks удаляются;
6. selection collapses после вставки.

IME composition не перехватывается в beforeinput path, пока
`native.isComposing === true`.

## 22. Пример целиком

Исходное состояние:

```text
A = "ABCDE"
B = "FGHIJ"
```

Пользователь начинает после `AB` и заканчивает после `FGH`:

```ts
anchor = A:2
head = B:3
```

Выделено:

```text
AB[CDE
FGH]IJ
```

Пользователь вводит `X`.

Clipboard replacement вычисляет:

```text
prefix = "AB"
insert = "X"
suffix = "IJ"
result = "ABXIJ"
```

Block B удаляется. Block A сохраняет ID, type, props, pluginData и layout.
Новый caret:

```text
ABX|IJ
offset = 3
```

## 23. Итог главы

Cross-block selection — это не один browser feature. Это pipeline:

```text
pointer coordinates
→ DOM endpoint
→ blockId/offset
→ validated TextSelection
→ native range restoration
→ supplemental CSS highlight
```

Следующая глава объясняет selection, где текста может вообще не быть:
[целые блоки и edgeless objects](./03-block-and-edgeless-selection.md).
