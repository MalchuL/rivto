# Перенос events, keyboard runtime и pointer selection

Статус: реализован для Page и standalone demo; исходный React-редактор использует извлечённый keyboard runtime. Production selection-интеграция остаётся отдельным этапом.

## Результат

Создать независимый пакет `@chulane/rivto-keyboard`, расширить события Page и перенести pointer selection из оригинального редактора как набор подключаемых расширений.

Первое подключение selection — только в Page-демо. Исходный редактор переходит на извлечённый keyboard runtime, но сохраняет свои события и selection до отдельной интеграции.

Весь код переносится с сохранением существующих контрактов и комментариев. Новые пакеты и зависимости инициализируются через CLI.

## 1. Независимый keyboard runtime

Вынести из исходного `KeyboardManager`:

- разбор и нормализацию сочетаний, разрешение `Primary`;
- регистрации действий, приоритеты и порядок при равенстве;
- динамические overrides, отключение действий, inventory и конфликты;
- правила IME;
- добавить учёт удерживаемых клавиш для pointer-жестов.

Пакет не зависит от React, Page, panel, document model или режима поверхности. Нативные события получает через транспортный интерфейс; доступ к DOM и владение регистрациями передаются ограниченными зависимостями.

Сохранить операции `register`, `list`, `subscribe`, `replaceKeymap`, `setKeymapOverride` и удаление регистрации. Контекст обработчика параметризуется типом host; проверки panel/mode остаются в интеграции исходного редактора.

Состояние удерживаемых клавиш:

- поддерживает обычные клавиши и модификаторы;
- учитывает modifier-флаги pointer-событий, даже если соответствующий `keydown` не был получен;
- сбрасывается при потере фокуса окна, скрытии документа и detach;
- не перехватывает текстовый ввод само по себе.

В исходном редакторе заменить реализацию на новый runtime через адаптер транспорта. Не оставлять вторую копию парсера, keymap и алгоритмов dispatch. Существующие вызовы расширений и панельные ограничения сохраняются на host-границе.

## 2. События Page

Сохранить один `editor.events` с двумя отдельными контрактами:

- `on(type, listener)` — наблюдение whole-editor `focus` и `blur`;
- `register(id, definition, handler)` — обработка типизированных DOM-событий.

Регистрация обработки содержит тип события, target (`root`, `document`, `window`), capture/passive, обязательный конечный priority, необязательные scope и `when`.

Контекст события содержит исходное событие, корень, принадлежность его цели редактору и ближайшие block/content/selection-anchor элементы. Цель вложенного редактора не считается целью родительского. В контекст не передаются panel, mode или document model.

Обработчики выполняются по убыванию priority, при равенстве — по регистрации. Возврат `true` прекращает цепочку редакторных обработчиков. `preventDefault()` вызывается явно обработчиком; DOM propagation автоматически не останавливается.

Менеджер группирует нативные слушатели по target/type/options. Подключение принадлежит контроллеру, регистрации переживают remount. Регистрации из `extension.setup` участвуют в существующих rollback и cleanup.

Сохранить reconciliation начального autofocus. Ошибка обработчика прерывает цепочку обработки; наблюдатели focus/blur по-прежнему уведомляются все с последующим `AggregateError`.

## 3. Selection как расширения

Перенести существующие алгоритмы в классы с экземпляром на установку расширения. Разделить подключаемые возможности:

- синхронизация native text selection и `beforeinput`;
- обычный клик по structural anchor и сброс старого покрытия;
- toggle блока по настраиваемому сочетанию;
- расширение диапазона по настраиваемому сочетанию;
- pointer drag между блоками, точные текстовые endpoints и автоскролл;
- отображение состояния активного сочетания.

Демо регистрирует нужные расширения и назначает сочетания. В Page отсутствуют встроенные назначения Ctrl/Meta/Shift/Alt конкретным действиям. Расширения обращаются к семантическим binding ID нового keyboard runtime.

Динамическое изменение keymap применяется со следующего начала жеста. Активный жест сохраняет конфигурацию bindings, захваченную при старте; физическое нажатие и отпускание клавиш продолжает учитываться.

Сохранить поведение оригинала:

- native selection внутри одного editable;
- whole-block диапазон при переходе между editable;
- отдельное настраиваемое сочетание для точных межблочных endpoints;
- направление диапазона, structural/contentless anchors;
- исключение интерактивных контролов;
- порог движения 3 CSS px;
- подавление клика после structural drag;
- автоскролл и корректное завершение вне корня.

Для этой миграции использовать существующий подход с window pointer-событиями. Не навязывать pointer capture native text selection. Активный pointer ID и состояние жеста принадлежат selection-контроллеру; detach, удаление расширения, `pointercancel` и потеря окна прекращают жест и освобождают timers/RAF. Общий механизм владения жестами для будущего DnD пока не добавлять.

## 4. Данные и демо

Расширить независимый `adapter.selection` только возможностями, нужными перенесённым алгоритмам:

- чтение текущего block/text selection;
- установка и очистка;
- получение упорядоченных selectable block IDs с учётом collapse;
- получение длины текста блока в UTF-16;
- сохранить адресные membership-подписки.

Page определяет собственные структурные интерфейсы позиции и block coverage, совместимые с исходными полями: `id/start/end`, anchor/focus IDs и направление. Семантика `end: -1` сохраняется. Canvas elements и plugin selection не входят в этот контракт; будущий host-адаптер отвечает за их согласование.

DOM-to-text mapping и восстановление диапазонов перенести из исходных утилит в ограниченные классы Page. Не импортировать внутренности исходного React-пакета и не переносить зависимости на edgeless runtime или virtualization controller.

В демо добавить contenteditable text renderer со стабильными атрибутами content и selection anchor. Это необходимо для проверки настоящих текстовых диапазонов; textarea не заменяет этот сценарий. Состояние текста остаётся host-owned.

Демо предоставляет редактирование сочетаний, отключение отдельных selection-возможностей и отображение текущего selection. Стили выделения, anchors и modifier feedback принадлежат пакету; настройки клавиш и UI конфигурации — демо.

## 5. Порядок и проверка

1. Зафиксировать исходные сценарии и показатели normal/`repeat=200`.
2. Извлечь keyboard runtime, подключить исходный редактор, проверить его существующие keyboard-тесты.
3. Реализовать Page events и транспорт клавиш, сохранив focus/blur.
4. Расширить selection adapter и перенести подключаемые selection-возможности.
5. Подключить демо, обновить README и дизайн-документ.
6. Проверить API и владение отдельно от функциональных тестов: owner создаёт и уничтожает; расширения получают узкие интерфейсы.

Проверки:

- порядок, claim, фильтрация nested editors, динамическая регистрация, rollback, remount и cleanup;
- keymap replacement, held keys, `Primary`, IME, потерянный keyup, два редактора;
- native caret, обратные и межблочные диапазоны, structural toggle и range, collapse;
- controls, selection anchors, threshold, подавление клика, автоскролл, отмена жеста;
- смена сочетания между жестами и во время активного жеста;
- отключение одного расширения без поломки остальных;
- отсутствие лишних forest reads, адресные уведомления и сохранение memo-границ.

Выполнить unit, typecheck, lint и сборки затронутых пакетов. Browser behavior — Chromium/Firefox, 12 workers; сбои повторить с одним worker. Performance — production preview, один worker, tracing off, normal и `repeat=200`, с корректностью результата и сравнением до/после.

Клавиатурная навигация selection, DnD, virtualization и подключение нового selection к основному редактору остаются следующими этапами.

## Журнал реализации

- Извлечён `packages/rivto-keyboard`: semantic registrations/keymap/inventory,
  dispatch/IME, parser, held state и захват сочетаний. Исходный React-редактор
  подключён через `ReactKeyboardTransport`, сохраняя panel/mode на host-границе.
- Page получил типизированные input registrations и keyboard manager;
  подписка `onDetach` нужна для отмены таймеров/жестов при remount.
- Selection перенесён в отдельные классы и независимые feature registrations
  через `BlockSelectionExtensions`. Состояние жеста совместно для возможностей
  одного редактора; разные редакторы не разделяют его.
- Демо использует host-owned contenteditable, настройки keymap, переключатели
  возможностей и опциональный JSON-инспектор с фиксированной высотой.
- Уточнение порядка input: priority применяется внутри группы одинаковых
  native options. Разные capture/bubble phases и targets упорядочивает DOM;
  claim прекращает дальнейшую доставку этого события в рамках редактора.
- Итоговые проверки и измерения приведены ниже.

## Итоговая проверка

- Unit: Page — 107 тестов / 11 suites; keyboard — 4 / 2; исходный React-редактор — 538 / 80. Все прошли.
- Typecheck и сборки keyboard, Page и React-пакета, сборка demo — прошли.
- Lint изменённого пути — без ошибок; остались предупреждения о длине методов, включая перенесённые алгоритмы. Они не подавлены.
- Chromium/Firefox behavior: 64 passed с 12 workers.
- Focused production performance: 8 passed с одним worker, tracing off; normal и repeat=200, пять измеряемых samples на сценарий.
- Возникавшие при разработке browser failures повторялись с одним worker. Исправлены настройка фокуса/координат сценариев, поведение click после отключения toggle и изменение геометрии страницы из-за JSON-инспектора. Финальных failing tests нет.

### Стоимость взаимодействий

Две animation frames — proxy визуального обновления, а не гарантия завершения всех async layout/paint. Медиана и min–max в миллисекундах:

| Сценарий                         | Chromium normal  | Chromium repeat=200 | Firefox normal | Firefox repeat=200 |
| -------------------------------- | ---------------- | ------------------- | -------------- | ------------------ |
| Text input baseline              | 23.9 (23.4–27.6) | 86.7 (47.2–101.6)   | 14 (8–31)      | 112 (108–221)      |
| Text input после переноса        | 24.1 (22.4–27)   | 82.7 (58.3–88.5)    | 18 (14–19)     | 109 (103–113)      |
| Structural toggle после переноса | 31.1 (29.4–31.5) | 19.3 (19–29.9)      | 30 (30–31)     | 64 (30–71)         |

Text input: 15 адресных node reads, 2 notifications, без чтения display list.
Toggle: 2 node reads, без чтения display list. Медиана синхронной записи через
адаптер — 0 ms при доступной точности таймера; это не утверждение о нулевой стоимости.
Синхронные уведомления включены в этот замер. Не объявляем небольшую разницу
text-input timing доказанным ускорением: baseline использовал textarea, итог —
contenteditable, а результаты зависят от браузера и fixture.

Отдельное профилирование показало стоимость root-level binding feedback: Firefox
repeat=200 сначала давал медиану 126 ms; отключение feedback — 66 ms. Вместо
отключения поведения feedback локализован на hovered anchor, итог — 64 ms.
Отдельный browser regression проверяет ровно один marked anchor и очистку на keyup.
JSON-инспектор по умолчанию выключен и при включении имеет фиксированную высоту.

Измерения сохранены вне исходников: `/tmp/selection-baseline.log`,
`/tmp/selection-feedback-profile.log`, `/tmp/selection-performance-complete.log`.

### Проверка границ и владения

- Controller создаёт keyboard/events; view владеет только attachment. Detach
  отменяет активные жесты, RAF/timers и held state, сохраняя регистрации/keymap.
- Borrowed keyboard API исключает destroy и native transport. Selection-классы
  получают только input/detach registrations, queries/subscriptions клавиш и
  операции с selection; DOM conversion получает только order/text-length reads.
- Хост владеет конкретными renderers, текстом и selection storage. Сначала
  обновляются snapshot и membership index, затем уведомляются подписчики.
  Кэш selectable order инвалидируется по hierarchy/collapse, а не text edits.
- В keyboard нет React, Page, document-model, panel или mode dependencies.
  Mode/scope/panel фильтрация исходного редактора находится в host transport.
- Снятие input registration во время dispatch не вызывает удалённый handler;
  новые registrations начинают работать со следующего события. Cleanup observers
  и teardown пытаются освободить все ресурсы даже при ошибке соседнего disposer.

Ограничения этапа сохранены: новая selection не подключена к production EditorPanel;
keyboard navigation, DnD, clipboard/history integration и virtualization не переносились.
Fallback caret lookup и wrapping-parent hit resolution могут обходить DOM; этот этап
не вводит spatial index и не обещает постоянную стоимость любой геометрии.
