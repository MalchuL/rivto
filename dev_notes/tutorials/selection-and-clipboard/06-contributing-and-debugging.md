# Глава 06. Как безопасно менять selection и clipboard

Эта глава превращает понимание системы в рабочий процесс contributor.

## 1. В каком порядке читать production code

Не начинайте с большого renderer.

Рекомендуемый порядок:

1. `editor/types.ts` — формы данных.
2. `managers/selection-manager.ts` — storage contract.
3. `editor/rivto-editor.ts`, методы `setSelection`, `reconcileSelection`,
   `validatePosition` — validation.
4. `react/selection.ts`, сначала `readPosition` и `pointAtOffset` — conversion.
5. `react/rivto-editor.tsx` — subscriptions и effects.
6. `react/renderers.tsx`, `BlockDOMRenderer` — gestures.
7. `managers/clipboard-bundle.ts` — pure range functions.
8. `managers/clipboard-manager.ts` — mutations.
9. Unit tests.
10. E2E tests.

После каждой стадии отвечайте себе на вопрос: какой type приходит и какой type
возвращается.

## 2. Таблица типов на boundaries

| Boundary | Вход | Выход |
| --- | --- | --- |
| pointer hit test | viewport x/y | DOMSelectionPoint |
| DOM conversion | Node + DOM offset | EditorPosition |
| selection command | EditorSelection | validated EditorSelection |
| manager | validated value | detached stored value |
| DOM restoration | EditorPosition | Node + DOM offset |
| clipboard normalization | directed EditorSelection | ordered NormalizedSelection |
| clipboard payload | NormalizedSelection | JSON + HTML + text |
| paste mutation | bundle/range | document changes + collapsed caret |

Если bug пересекает boundary, логируйте value до и после него. Не начинайте с
CSS, если runtime offsets уже неправильные.

## 3. Главные invariants

Любое изменение должно сохранять следующие правила.

### Invariant 1: runtime не хранит DOM nodes

DOM node живёт только в React adapter. SelectionManager хранит IDs и numbers.

### Invariant 2: runtime не хранит CRDT objects

Selection работает с detached block values. Native Yjs types не должны попасть
в public selection API.

### Invariant 3: direction сохраняется

Text anchor/head и block anchor/focus не сортируются при storage.

### Invariant 4: structural IDs упорядочены

`blockIds` хранится в visible document order без duplicates.

### Invariant 5: normalization временная

Clipboard может создать start/end, но не должен переписать manager direction.

### Invariant 6: offsets совместимы с DOM

Везде используются UTF-16 code units.

### Invariant 7: cross-block replacement сохраняет первый block

Его ID, type, props, pluginData и layout не заменяются.

### Invariant 8: один user action — одна transaction

Collaborators и undo не должны видеть половину Paste/Cut.

### Invariant 9: selected ancestor не дублирует child

Особенно для rectangle selection и clipboard roots.

### Invariant 10: text controls на canvas не выбирают object

Проверяйте event target до `setSelected`.

### Invariant 11: toolbar не теряет stored range

Focus на button не должен очищать portable selection до команды formatting.

### Invariant 12: editor instances изолированы

DOM endpoints всегда проверяются относительно конкретного root.

## 4. Как отлаживать «курсор прыгает»

Проверьте по порядку:

1. Не переписывает ли `EditableText` DOM при равном text?
2. Существует ли stored TextSelection перед rerender?
3. Не ушёл ли focus из editable? Тогда collapsed restore намеренно skipped.
4. Находится ли target block в новом renderer DOM?
5. Правильно ли `pointAtOffset()` находит text node?
6. Не изменился ли raw Markdown DOM между focus/blur?
7. Не приходит ли поздний `selectionchange` после restoration?

Полезные browser values:

```js
const s = window.getSelection();
console.log({
  anchorNode: s?.anchorNode,
  anchorOffset: s?.anchorOffset,
  focusNode: s?.focusNode,
  focusOffset: s?.focusOffset,
  activeElement: document.activeElement,
});
```

И runtime:

```js
console.log(editor.selection.get());
```

Сравнивайте их после conversion, а не напрямую: DOM offsets локальны конкретным
text nodes.

## 5. Как отлаживать «выделение пропадает между блоками»

Проверьте:

1. Pointerdown попал в `.rv-block-content`?
2. Сохранился ли `anchorPosition` в capture phase?
3. Возвращает ли `readDOMSelectionPoint` head другого block ID?
4. Появился ли `data-rivto-pointer-selecting`?
5. Не записывает ли document selectionchange временный same-block value?
6. Есть ли CSS Highlight `rivto-cross-selection`?
7. Не удаляется ли marker до позднего Firefox event?

Отдельно тестируйте drag сверху вниз и снизу вверх. Forward success не доказывает
reverse correctness.

## 6. Как отлаживать неправильные offsets

Используйте короткий текст с известными boundaries:

```text
ABCDE
012345 offsets
```

Затем добавьте nested rendered element и emoji:

```text
A😀BC
JS length = 5
```

Проверьте оба направления conversion:

```text
DOM endpoint → readPosition → block offset
block offset → pointAtOffset → DOM endpoint
```

Если одно направление считает code points, а другое UTF-16 units, bug проявится
на emoji раньше, чем на ASCII.

## 7. Как отлаживать «Copy берёт лишние кнопки»

Проверьте:

- `.rv-side` имеет `user-select:none`;
- `.rv-prefix` имеет `user-select:none`;
- clipboard text строится из DocumentModel, а не `window.getSelection().toString()`;
- selected boundary offsets относятся к `.rv-block-content`, а не ко всему
  `.rv-block`.

Rivto Copy не должен зависеть от visual side controls.

## 8. Как отлаживать «Paste потерял type или props»

Проверьте, не заменяет ли код target block copied block object целиком.

Правильная операция:

```text
оставить target identity
изменить target content
вставить remaining copied roots отдельно
```

Проверяйте после Paste:

- target ID прежний;
- type прежний;
- props прежние;
- pluginData прежний;
- layout прежний;
- caret после вставленного content;
- suffix не потерян.

## 9. Как отлаживать «Paste вставляет в старое место»

Вероятная причина — race между paste event и selectionchange.

Проверьте, что root paste handler синхронно вызывает `readEditorSelection()` до
clipboard command.

Также проверьте, что input действительно находится в `.rv-block-content`.
Selection обычного `<input>` не переводится в Rivto TextSelection.

## 10. Как отлаживать edgeless text regression

Симптом: click по тексту или URL input выбирает карточку.

Проверьте card click guard. Event target внутри следующих элементов не должен
вызывать object selection:

```text
contenteditable
input
textarea
select
a
button
```

Не исправляйте bug запретом всех click на card: chrome всё ещё должен выбирать
object.

## 11. Unit tests: что они доказывают

`src/editor/__tests__/editor.test.ts` работает без реального browser layout.

Unit tests подходят для:

- runtime validation;
- order и duplicate removal;
- mode compatibility;
- deletion cleanup;
- normalization;
- exact copied text;
- Cut/Paste document mutation;
- preservation of direction in manager;
- metadata behavior.

Unit test не может надёжно проверить caret hit-testing или реальные
`getBoundingClientRect()` coordinates.

## 12. E2E tests: зачем Chromium и Firefox

`e2e/editor.spec.ts` использует реальные engines.

E2E обязателен для:

- cross-contenteditable native selection;
- pointer event order;
- bottom-to-top drag;
- paint до pointerup;
- selectionchange timing;
- focus behavior;
- form controls inside canvas;
- CSS Highlight API/fallback;
- real clipboard events через DataTransfer.

Chromium и Firefox имеют разные caret hit-test APIs и event timing. Pass только
в одном engine недостаточен.

## 13. Минимальная test matrix для selection change

После изменения общего selection code проверьте:

| Scenario | Forward | Reverse |
| --- | --- | --- |
| Same-block text | да | да |
| Cross-block partial text | да | да |
| Nested blocks | да | да |
| Shift block range | да | да |
| Rectangle blocks | вниз | вверх |
| Copy exact text | да | да |
| Replace by typing | да | да |

И отдельно:

- emoji offsets;
- empty block;
- block deletion during selection;
- mode switch;
- toolbar click after selection;
- edgeless contenteditable;
- edgeless input;
- Paste with prefix/suffix;
- structured Paste with internal link.

## 14. Какие команды запускать

Быстрый цикл для runtime/clipboard logic:

```sh
pnpm check-types
pnpm test -- --runInBand src/editor/__tests__/editor.test.ts
```

Полная проверка:

```sh
pnpm check-types
pnpm lint
pnpm test -- --runInBand
pnpm demo:build
pnpm test:e2e
```

E2E запускает Chromium и Firefox.

## 15. Как добавить новый selection type

Это большая change surface. Нужно пройти все consumers:

1. Добавить discriminated type в `EditorSelection`.
2. Научить SelectionManager detached-copy logic.
3. Добавить runtime validation.
4. Решить mode compatibility.
5. Добавить reconciliation после document updates.
6. Решить active toolbar block.
7. Решить native selection clear/restore behavior.
8. Решить clipboard normalization или явно запретить clipboard.
9. Добавить renderer gesture.
10. Добавить visual paint.
11. Добавить unit tests.
12. Добавить browser tests.

Если хотя бы один пункт не определён, новый variant скорее всего будет
частично работать и оставлять stale state.

## 16. Как добавить новый browser gesture

Сначала определите intent:

- gesture создаёт TextSelection, BlockSelection или EdgelessSelection?
- какой endpoint является anchor?
- какой endpoint меняется?
- нужно ли сохранять direction?
- кто владеет gesture: browser или renderer?
- нужно ли временно блокировать selectionchange?
- что происходит на Escape и pointerup?
- какой cleanup при unmount?

Только после этого пишите event handlers.

## 17. Как не создать infinite update loop

Помните путь:

```text
manager notify
→ React effect
→ browser selectionchange
→ command
→ manager notify
```

Перед оптимизацией определите:

- value действительно отличается?
- event synthetic или user-originated?
- ownership marker active?
- focus всё ещё внутри editor?

Не добавляйте случайные `setTimeout` без объяснения browser event, который они
пережидают. Существующий zero-delay timeout после pointerup нужен для позднего
Firefox selectionchange и должен оставаться документированным.

## 18. Как читать tricky comments

В selection code comment часто описывает не строку, а browser bug или ordering
constraint.

Пример: «store portable anchor before native handling». Сама assignment
выглядит лишней, пока не знать, что Chromium позже может вернуть head при
hit-test старой anchor coordinate.

Перед удалением такого кода найдите соответствующий E2E case. В этой подсистеме
многие маленькие guards существуют после конкретной cross-browser regression.

## 19. Checklist для pull request

- [ ] Selection state остаётся local.
- [ ] Public UI использует commands.
- [ ] IDs проверяются.
- [ ] Offsets остаются UTF-16.
- [ ] Reverse direction сохраняется.
- [ ] Nested blocks не дублируются.
- [ ] Focus toolbar не крадётся обратно.
- [ ] Edgeless text/input можно редактировать.
- [ ] Global listeners имеют cleanup.
- [ ] Multi-editor root scope сохранён.
- [ ] Clipboard formats описывают один range.
- [ ] Cross-block mutation атомарна.
- [ ] Chromium и Firefox tests проходят.

## 20. Финальная ментальная модель

Если нужно запомнить только один pipeline, запомните этот:

```text
Пользователь делает жест
        ↓
React adapter понимает DOM и browser events
        ↓
EditorRuntime проверяет portable selection
        ↓
SelectionManager хранит local value
        ↓
React рисует его обратно в DOM
        ↓
Clipboard при необходимости нормализует direction
        ↓
DocumentModel выполняет atomic mutation
        ↓
Selection collapses в новую caret position
        ↓
React восстанавливает native caret
```

Selection не является одной функцией. Это договор между browser, React,
runtime и DocumentModel. Вклад contributor безопасен, когда он сохраняет этот
договор на каждом boundary.
