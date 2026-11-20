# Глава 03. События Host, Page и Canvas

Эта глава описывает текущую архитектуру. Прежний текст про `EventRouter`, portable
payload и фазы global → block → fallback сохранён в
[исторической версии](./historical/03-event-router.md). Он не является инструкцией
для текущих event managers.

## 1. Где живёт обработка событий

В редакторе есть три разных владельца browser input:

| Контекст         | Публичная точка регистрации | Владелец DOM lifetime                            |
| ---------------- | --------------------------- | ------------------------------------------------ |
| Host React panel | `reactPanel.events`         | Общий `EventManager` через `DOMEventListeners`   |
| Standalone Page  | `editor.events`             | `BlockEditorEvents` через `NativeEventListeners` |
| Canvas viewport  | `viewport.events`           | `CanvasEvents`                                   |

Выбирайте manager того редактора, которому принадлежит взаимодействие. Host panel
может показывать Page или Edgeless; это не превращает host event в standalone
Page event. Общие document mutations по-прежнему выполняются через owning managers
и команды, а не через прямое изменение CRDT из DOM handler.

## 2. Host: native event и контекст panel

`EditorEvent` содержит исходный `raw` DOM event, `reactPanel`, `root`, `mode`,
снимок `selection`, `eventTarget`, `insideRoot`, `blockElement`, `blockId` и
`contentElement`. Это browser-контракт, а не portable event без DOM references.

Путь доставки:

```text
DOMEventListeners
  → EventManager: фиксирует список registrations для native event
  → PanelEventFactory → PanelRegistry: выбирает receiving panel
  → EditorEvent: сохраняет контекст этой listener group
  → фильтры регистрации и when
  → handler
```

`PanelRegistry` сохраняет ответственность за activation, nested panels и pointer
routing. `PanelEventFactory` читает panel API, selection и DOM markers, но не
владеет listeners. `mode` берётся из receiving surface: Page embedding может
иметь mode `block`, хотя основной document показан в Edgeless.

Контекст создаётся для каждой native listener group. Более поздняя группа может
увидеть selection, изменённый предыдущей. Внутри группы predicates и handlers
получают один объект контекста.

## 3. Host: регистрация и claim

В контексте существующего `ReactPanelApi`:

```ts
const remove = reactPanel.events.register(
  { id: "example.content-click", type: "click", scope: "content" },
  (event) => {
    console.log(event.blockId);
    // Наблюдение без claim: следующие handlers продолжают работу.
  },
);

remove();
```

Scope может быть `surface`, `block` или `content`. Без scope доступны также
события вне root, например от window. Дополнительные фильтры — `mode` и `when`.
`EditorEvent.matches()` проверяет scope/mode; dynamic `when` выполняет dispatcher.

Handler возвращает `true`, когда событие обработано. Host тогда прекращает
последующую editor delivery и вызывает `preventDefault()` для cancelable event,
если регистрация не passive и `preventDefault` не установлен в `false`.
`stopPropagation()` автоматически не вызывается. Предварительно отменённый native
event не доставляется host handlers.

`preventDefault: false` отключает отмену browser default, но не снимает editor
claim. Passive handler также может claim event, не отменяя default.

## 4. Host: порядок и изменения во время доставки

Внутри одинаковых native options handlers идут в порядке регистрации. Между
capture, bubble, document/window и passive groups действует порядок native
listeners. Старой схемы global plugin → block plugin → fallback здесь нет.

Добавленные во время доставки registrations ждут следующего native event,
включая добавление в более позднюю phase. Удалённые registrations пропускаются
сразу. Старый disposer не удаляет новую регистрацию с повторно использованным ID.

Panel-local ID имеет внутренний panel prefix. Consumer использует свой локальный
ID; `reactPanel.events.delete(id)` не удаляет одноимённую регистрацию другой panel.
Panel удерживает локальные disposers, не уничтожая общий `EventManager`.

## 5. Семантическая клавиатура

Для keyboard actions используйте `reactPanel.keyboard`. Host `KeyboardManager`
использует общий `KeyboardRuntime` из `rivto-root`; `ReactKeyboardTransport`
связывает его с native keydown/keyup на surface и window.

Keyboard transport сохраняет host panel context и использует тот же
`event.matches(definition)`. Семантические shortcuts, keymap overrides и keyboard
priority не являются отдельными фазами DOM `EventManager`.

## 6. Standalone Page

Page input использует `BlockInputEvent`: нормализованные данные input и block ID
одной occurrence, без native event, DOM elements, `ReactPanelApi`, document mode
или host selection snapshot. Browser implementation сохраняет native context
внутри Page для selection и drag. В существующем Page editor можно
зарегистрировать наблюдателя:

```ts
const remove = editor.events.observe(
  "example.observe-content-click",
  { type: "click", priority: 0, scope: "content" },
  (event) => {
    console.log(event.blockId);
  },
);

remove();
```

Обычный `register(id, definition, handler)` ожидает `"handled"` или `"continue"`.
`"handled"` прекращает последующую handler delivery для occurrence, включая
поздние native groups. Browser default отменяется только явным вызовом
`event.preventDefault()`. `event.input` содержит данные для конкретного имени
события и синхронные browser capabilities; их нельзя считать долгоживущим
заменителем model identity или повторного чтения состояния документа.

`observe()` не claim event. Observers запускаются перед handlers своей группы и
продолжают получать события после claim другой группы. Числовой finite `priority`
обязателен: большие значения идут раньше внутри одной native group, равные
сохраняют порядок установки. Priority не переупорядочивает browser phases.

Scopes: `root`, `block`, `content`, `selection-anchor`. Context исключает nested
Page editors. Registrations сохраняются при detach/remount; controller владеет
attachment, а extension — своим disposer. Focus/blur observers и `onDetach()`
имеют отдельные контракты и не заменяют input handlers.

## 7. Canvas

Canvas viewport предоставляет нормализованный input без native event, DOM element
или host panel context:

```ts
const remove = viewport.events.register({
  id: "example.canvas-click",
  type: "click",
  priority: 0,
  handle: (event) => {
    console.log(event.clientX, event.clientY);
  },
});

remove();
```

Target — `root`, `document` или `window`; по умолчанию `root`. Priority по
умолчанию равен нулю. Большие значения идут раньше в одной группе.
Возврат `"handled"` прекращает только текущую listener group, а не все phases.
Default prevention и propagation остаются явными capabilities handler.

Root handlers исключают вложенные attached Canvas roots. Global handlers должны
сами проверять, относится ли событие к их активному gesture. Registrations
сохраняются между attachment одного viewport; владелец view выполняет detach.

## 8. Cleanup и ошибки

Host registration rollback освобождает ID после ошибки установки. Keyboard
transport удаляет уже установленные routes, если более поздняя регистрация
падает. Host destruction пытается выполнить все cleanup callbacks и сохраняет
ошибки в `AggregateError`.

Page input attachment также выполняет rollback, сохраняет setup/cleanup errors и
пытается удалить все native listeners. Stale detach не удаляет новый attachment.

Canvas использует тот же `NativeEventListeners`: detach отключает delivery и
пытается удалить все listeners. `CanvasViewport` снимает mounted ownership и
публикует null layers даже при ошибке cleanup. Обзор предыдущих failure paths и
решение об extraction описаны в [обзоре lifetime](../../native-listener-lifetime-review.md).

## 9. Как проверять расширение

Проверяйте наблюдаемый результат и соответствующий контракт:

- нужная panel/occurrence получает event, nested editor не захватывается чужим handler;
- handled прекращает именно тот scope доставки, который гарантирует manager;
- default prevention проверяется отдельно от claim;
- удаление прекращает delivery, а remount сохраняет нужные registrations;
- callback может удалить себя или другую регистрацию без пропуска оставшихся;
- failure tests проверяют retry, повторное использование ID и оставшиеся listeners.

Не переносите между managers assumptions о priority, claims, observers или
cleanup только из-за похожих имён методов. Не храните snapshot selection как
живое состояние: после dispatch при необходимости читайте текущую selection
через owning API.

Подробнее: [host ownership](../../host-event-ownership.md) и
[сравнение Host/Page/Canvas](../../native-listener-lifetime-review.md).
