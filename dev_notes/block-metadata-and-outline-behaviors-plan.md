# Metadata расширений и родительские обработчики outline

## Согласованный результат

Сохранить текущие пользовательские жесты, selection, undo/redo и ограничения
контейнеров. Core API не меняется: существующая React-регистрация
`blockTypes.register()` владеет полным определением и передаёт его metadata в core
без отдельного объединения. Metadata остаётся непрозрачной runtime-аннотацией
определения и не сохраняется в документ. Уже определённый native type считается
конфликтом; дополнять его через другую React-регистрацию нельзя.

Текущий контракт описан в последнем разделе «Полное определение в одной регистрации».
Ранние разделы о merge, вкладах и общих владельцах сохраняют историю предыдущих этапов.

Существующие staged/unstaged изменения сохраняются; автоматического commit нет.
`canMove` сохраняет read-only проверки источников и принимающего родителя.
`onPlaceChild`, read-only `childOutline`, общие hook-области и новая система раскладки
не добавляются.

## Metadata

```ts
import { BLOCK_HANDLE_METADATA_KEY, PAGE_DRAG_METADATA_KEY } from "@chulane/rivto-react";

const metadata = {
  [PAGE_DRAG_METADATA_KEY]: {
    dropAxis: "horizontal",
    acceptsDropContainer: false,
    fixed: true,
  },
  [BLOCK_HANDLE_METADATA_KEY]: {
    showOnContainerHover: true,
  },
};
```

- React-регистрация передаёт полное определение вместе с metadata напрямую в
  существующий core registry. Metadata не копируется, не объединяется и не изменяется.
- Идентичность переданного определения сохраняется. Регистрация владеет им до
  cleanup; disposer удаляет определение вместе с presentation. Повторный native
  type отклоняется, в том числе когда его заранее зарегистрировали отдельно в core.
- `blockTypes.subscribe(listener)` сообщает создание и удаление полных определений,
  включая metadata. Отдельного источника уведомлений metadata нет. Подписки снимаются
  после cleanup регистраций при уничтожении React runtime; ручной disposer идемпотентен.
- Удаляются `ReactBlockRegistration.drag`, `getDragOptions()` и отдельная drag-map.
  Типы параметров и чтение принадлежат расширениям. Metadata не включает расширение.
- `fixed` в `drag.page` сохраняет прежнюю геометрию resolver и анимацию перестановки;
  он не задаёт разрешение outline-операций.
- `childDropIndent` и `gapDropZone` остаются только глобальными параметрами (24 и 8).
  Глобальный `allowChildPlacement` сохраняется; блок может переопределить только
  этот флаг в `drag.page.dropPlacement`, без локальных размеров зон.

## Parent/child-обработчики

Полноценные `onChildIndent` и `onChildOutdent` возвращают `BlockBehaviorOutcome`.
Сначала вызывается цепочка текущего родителя ведущего блока, затем при `unhandled`
цепочка `onIndent`/`onOutdent` ведущего блока и стандартный `DefaultBlockBehavior`.
`handled` и `rejected` останавливают всю операцию. Приоритеты и порядок равных
приоритетов сохраняются; родитель получает свой контекст и весь набор ID операции.

- `BlockOutlineContext` содержит panel, shallow-данные блока, parentId и selection;
  обязательного DOM-root, kind и operation нет.
- Общие outline-функции направляют запрос через dispatch. Стандартные алгоритмы
  находятся в onIndent/onOutdent класса DefaultBlockBehavior без повторного dispatch.
- Через тот же путь проходят Enter, Backspace и подъём до границы. Сохраняются
  транзакции, preflight canMove и проверка adoption последующих siblings.
- Прежние запреты переносятся в конкретные контейнерные классы; базовый
  ContainerBlockBehavior не вводит новых запретов пользовательским контейнерам.
- После переноса потребителей удаляются BlockContainment, getBlockContainment
  и metadata.containment. Dragging не вызывает outline-обработчики при preview.

## Универсальный handle

Hover по телу контейнера, CSS-маркеры и боковые hover-зоны принадлежат расширению
handle. Сохраняются default наведения на строку, фокус, collapsed-state, открытое
меню и ограничения edgeless. Handle работает без dragging.

## Проверка

Baseline до изменений; обновление документации, fixtures, примеров и exports.
Jest проверяет parent-before-child, все outcomes, приоритеты, отсутствие методов,
однократные вызовы, группы, headless-операции и прежние контейнерные границы.
Metadata проверяется на существующем типе, deep merge, замене массивов,
неизменности входов, уведомлениях, rollback и cleanup в разном порядке.

Существующие поведенческие assertions не ослабляются. Playwright в Chromium и
Firefox проверяет outline-клавиши, selection, undo/redo, контейнеры, handle без
dragging, page/edgeless и cross-document drop: workers=12, затем workers=1 для
упавших сценариев. Типы, lint, сборка и workflow rivto-performance-testing:
production preview, реальные keyboard/pointer-жесты, обычный документ и repeat=200,
последовательные замеры до/после. JSDoc проверяется по актуальному AGENTS.md.

## Реализовано

- Core и document-model не изменены; новых core API нет. React-регистрация
  объединяет metadata и сохраняет идентичность определения. Вклады снимаются
  независимо в любом порядке, включая rollback и destruction. Определение,
  созданное React, остаётся до отключения последнего использующего его React
  runtime; заимствованное определение хоста не удаляется.
- Геометрия перенесена в `metadata[PAGE_DRAG_METADATA_KEY]`, hover — в `metadata[BLOCK_HANDLE_METADATA_KEY]`.
  Удалены отдельное поле регистрации `drag`, getter/map и containment API.
  Универсальный handle использует существующий shell без дополнительного wrapper.
- Родительские `onChildIndent`/`onChildOutdent` выполняются перед дочерней цепочкой.
  Все прежние контейнерные запреты перенесены в конкретные классы. Стандартные
  мутации отделены от семантического dispatch, поэтому повторного вызова нет.
- Обновлены native регистрации, exports, browser fixtures и активная документация.
  Поведенческие проверки hierarchy/content/selection/undo сохранены; обращения
  к удалённым metadata API переведены на текущие контракты. Проверка конфликта
  старого containment заменена проверкой согласованного объединения metadata.

## Проверка реализации

Проверялось на production preview demo в Chromium и Firefox, с default extensions
и virtualization, без искусственного сокращения больших документов.

- Baseline HEAD: 456 React-тестов. После реализации: 469 тестов / 75 suites passed.
- Финальные `pnpm check-types`, `pnpm lint`, `pnpm build`, `pnpm demo:build`
  прошли. Lint: 0 errors, 472 warnings (в том числе разрешённый лимит длины
  функций). Сборка сохраняет предупреждения Vite о directives/sourcemaps и размере
  bundle. `git diff --check` прошёл; изменений core/document-model нет.
- Изначальные staged-файлы сохранены в index; реализация не staged и не committed.
- Новый browser fixture без drag extension: hover, меню, обновление metadata и
  очистка маркера работают в двух представлениях. Фокус после Escape явно
  переводится наружу перед проверкой idle-видимости: фокусированный handle
  по прежнему контракту остаётся видимым.
- Новый parent-outline browser test: 16 passed; Tab, Shift+Tab, Enter и Backspace
  вызывают родительский handler ровно один раз в page и edgeless, сохраняя дерево,
  содержимое и selection при rejected.
- Итоговый focused Playwright запуск `--workers=12`: 291 passed, 8 skipped,
  1 failed. Падение Chromium clipboard plain-text: тест считал блоки до mount
  (`rootsBefore = 0`, после mount 57). Повтор именно этого сценария с
  `--workers=1`: 2 passed (Chromium и Firefox); assertions не изменены.
  Это не полностью зелёный параллельный прогон; baseline-воспроизведение этой
  гонки отдельно не проводилось.
- 8 skipped — уже отключённые тесты keyboard dragging в page-drag-keyboard.spec.ts;
  их включение и исправление не входят в этот рефакторинг.
- Serial block-number-performance: 4 passed, normal и repeat=200 в обоих браузерах;
  реальные Tab/Shift+Tab и undo/redo сохраняют ограниченное количество forest reads.

## Замеры до/после

Baseline — неизменённые исходники HEAD в отдельном production build; после —
текущий production build. Серверы preview обслуживают один и тот же demo route.
Во время измерений не запускались параллельные сборки или тесты. Для каждого
сценария: один прогрев и три эквивалентных измерения с undo между ними.

В таблице: медиана [min–max], миллисекунды. Command включает синхронные подписчики;
render — два requestAnimationFrame, а не гарантия полного завершения всех layout
эффектов. Pointer проверяет порядок, parent, content, selection и undo; keyboard
проверяет ожидаемую мутацию, model/DOM selection и undo, outline дополнительно
проверяет adoption хвостовых siblings. Измерения не доказывают ускорение.

| Жест                | Браузер  | repeat | Command до → после                  | Render до → после                         |
| ------------------- | -------- | -----: | ----------------------------------- | ----------------------------------------- |
| pointer drop        | chromium |      0 | 0.7 [0.7–1.0] → 0.6 [0.6–1.1]       | 30.0 [28.9–30.6] → 30.8 [30.6–30.8]       |
| pointer drop        | chromium |    200 | 2.3 [2.1–2.4] → 2.4 [2.2–2.5]       | 146.3 [143.2–153.4] → 124.6 [124.4–127.9] |
| pointer drop        | firefox  |      0 | 1.0 [1.0–1.0] → 1.0 [1.0–1.0]       | 28.0 [27.0–30.0] → 28.0 [26.0–29.0]       |
| pointer drop        | firefox  |    200 | 5.0 [4.0–9.0] → 4.0 [4.0–8.0]       | 151.0 [141.0–158.0] → 152.0 [142.0–168.0] |
| Enter               | chromium |      0 | 1.3 [1.2–1.3] → 1.2 [1.1–1.7]       | 27.4 [26.9–27.5] → 28.1 [27.6–28.4]       |
| Control+Shift+Enter | chromium |      0 | 0.9 [0.9–1.1] → 1.1 [1.0–1.2]       | 28.1 [27.1–28.4] → 27.1 [25.9–28.3]       |
| Enter               | chromium |    200 | 5.3 [5.2–5.8] → 6.3 [5.6–7.2]       | 211.6 [201.3–228.5] → 214.4 [205.4–227.8] |
| Control+Shift+Enter | chromium |    200 | 6.4 [6.0–7.0] → 7.3 [6.6–7.5]       | 214.7 [206.2–221.7] → 216.2 [209.5–247.7] |
| Enter               | firefox  |      0 | 2.0 [1.0–2.0] → 2.0 [1.0–2.0]       | 26.0 [25.0–27.0] → 26.0 [25.0–27.0]       |
| Control+Shift+Enter | firefox  |      0 | 2.0 [2.0–2.0] → 1.0 [1.0–2.0]       | 26.0 [25.0–26.0] → 25.0 [24.0–25.0]       |
| Enter               | firefox  |    200 | 9.0 [8.0–9.0] → 8.0 [8.0–9.0]       | 176.0 [164.0–183.0] → 169.0 [169.0–172.0] |
| Control+Shift+Enter | firefox  |    200 | 9.0 [9.0–9.0] → 9.0 [7.0–10.0]      | 181.0 [176.0–181.0] → 178.0 [171.0–186.0] |
| Tab                 | chromium |      0 | 1.2 [1.1–1.3] → 0.8 [0.7–0.9]       | 29.2 [28.8–30.0] → 30.1 [29.7–30.2]       |
| Shift+Tab           | chromium |      0 | 1.1 [0.9–1.2] → 1.0 [0.8–1.0]       | 29.8 [29.7–29.9] → 30.1 [29.9–30.2]       |
| Tab                 | chromium |    200 | 10.1 [9.8–18.3] → 9.8 [9.7–9.9]     | 185.6 [181.5–196.7] → 178.4 [177.0–179.7] |
| Shift+Tab           | chromium |    200 | 10.0 [9.6–10.4] → 9.6 [9.5–10.5]    | 188.2 [182.5–190.6] → 182.1 [181.6–184.7] |
| Tab                 | firefox  |      0 | 2.0 [2.0–2.0] → 2.0 [0.0–2.0]       | 27.0 [26.0–28.0] → 27.0 [26.0–28.0]       |
| Shift+Tab           | firefox  |      0 | 2.0 [2.0–3.0] → 2.0 [2.0–3.0]       | 27.0 [27.0–28.0] → 29.0 [27.0–30.0]       |
| Tab                 | firefox  |    200 | 12.0 [12.0–13.0] → 13.0 [13.0–14.0] | 186.0 [178.0–191.0] → 183.0 [180.0–194.0] |
| Shift+Tab           | firefox  |    200 | 11.0 [11.0–18.0] → 13.0 [12.0–13.0] | 186.0 [183.0–188.0] → 180.0 [175.0–186.0] |

Медианы render сопоставимы с baseline. На большом документе Command у Chromium
Enter изменился с 5.3 до 6.3 мс, separator с 6.4 до 7.3 мс; render соответственно
211.6 → 214.4 и 214.7 → 216.2 мс. Небольшая серия замеров не отделяет шум от
постоянного накладного расхода; заявления об ускорении здесь нет.

Полный E2E suite, Safari/macOS и desktop-приложение не запускались.

## Упрощение dispatch после ревью

`BlockBehaviorRegistry.dispatch` вызывает родительские `onChildIndent` /
`onChildOutdent` через `this.dispatch`, затем продолжает исходное действие только
при deferral. Повторного обхода к дедушке нет: родительская проверка включается
только для `onIndent` / `onOutdent`. Контекст родителя читается из текущего дерева
при каждом вызове; сохранённый `parentId` исходного контекста не используется
для выбора родителя.

Удалён отдельный `dispatchOutlineOperation`. Построение shallow-контекста
находится рядом с существующим keyboard-контекстом в `utils/context.ts`:
`createBlockOutlineContext` только читает данные, не вызывает обработчики и не
открывает транзакцию. Его используют Tab/Shift+Tab, outline-функции и родительский
вызов registry. Отдельного public API не добавлено. `indentBlocks` / `outdentBlocks`
сохраняют прежний batch; DOM focus, viewport settlement и стандартные мутации
остаются у прежних владельцев.

Существующие assertions не изменены. Добавлены две проверки прямого dispatch:
после reparent с уже созданным контекстом используется актуальный родитель,
selection и вся группа сохраняются, цепочка дедушки не вызывается.

Проверки этого упрощения: 478 Jest-тестов / 75 suites passed; workspace
`pnpm check-types`, production `pnpm demo:build` и targeted ESLint прошли.
ESLint: 0 errors, 4 разрешённых предупреждения max-lines-per-function.
Focused Playwright в Chromium и Firefox с workers=12: 116 passed, 2 skipped
(ранее отключённый keyboard status order TODO storage); падений нет.

Свежие baseline и after — production builds до/после именно упрощения dispatch,
один preview URL, default demo и repeat=200, по одному прогреву и три образца.
Реальные Tab/Shift+Tab проверяют hierarchy, content, model/DOM selection, adoption
хвостовых siblings и undo. Во время замеров других сборок/тестов не было.
Два кадра используются как render proxy; медианы [min–max] ниже — миллисекунды.

| Жест      | Браузер  | repeat | Command до → после                  | Render до → после                         |
| --------- | -------- | -----: | ----------------------------------- | ----------------------------------------- |
| Tab       | chromium |      0 | 0.8 [0.7–0.8] → 0.9 [0.9–0.9]       | 30.0 [29.5–30.0] → 30.4 [30.4–30.5]       |
| Shift+Tab | chromium |      0 | 1.0 [0.9–1.3] → 0.8 [0.8–1.0]       | 29.3 [29.3–30.3] → 30.2 [30.0–30.4]       |
| Tab       | chromium |    200 | 10.2 [9.9–10.7] → 9.9 [9.6–11.5]    | 176.8 [176.5–177.6] → 180.6 [178.1–184.7] |
| Shift+Tab | chromium |    200 | 10.0 [9.8–10.5] → 9.5 [9.2–9.6]     | 177.7 [177.6–178.6] → 177.8 [176.7–203.5] |
| Tab       | firefox  |      0 | 2.0 [1.0–2.0] → 2.0 [1.0–3.0]       | 29.0 [28.0–29.0] → 28.0 [28.0–28.0]       |
| Shift+Tab | firefox  |      0 | 1.0 [1.0–2.0] → 2.0 [2.0–2.0]       | 28.0 [28.0–29.0] → 30.0 [28.0–31.0]       |
| Tab       | firefox  |    200 | 12.0 [11.0–12.0] → 12.0 [11.0–13.0] | 184.0 [177.0–210.0] → 179.0 [177.0–191.0] |
| Shift+Tab | firefox  |    200 | 12.0 [11.0–17.0] → 12.0 [11.0–12.0] | 182.0 [176.0–201.0] → 185.0 [172.0–193.0] |

Заметного ухудшения по этой короткой серии нет; ускорение не заявляется.

Serial `block-number-performance.spec.ts` после упрощения: 4 passed в Chromium
и Firefox, normal/repeat=200. Проверены ограниченные forest reads, каретка,
порядок и undo/redo. `git diff --check` прошёл; staged diff побайтово совпадает
с состоянием перед этим follow-up. Полный E2E и desktop не запускались.

## Выполнение цепочки внутри BlockBehaviorRegistry

Свободная `dispatchBlockAction` перенесена в private-метод registry; старый
utils/dispatch.ts и его barrel export удалены. Обычные действия и родительские
обработчики используют один исполнитель цепочки с прежними priority, stable ties,
this-binding, availability checks и правилами unhandled/handled/rejected.

`dispatch("onStructuralDelete", context, ids)` теперь владеет обходом всей группы.
Порядок ID сохраняется, отсутствующие блоки пропускаются, поведения, уже
рассмотренные на предыдущем блоке, повторно не вызываются. Seen-set локален одному
запросу. Каждый обработчик получает полную группу и исходную selection. Как и
раньше, shallow availability проверяется отдельно от полного handler context;
полные snapshots читаются только для блоков с ещё не рассмотренными обработчиками.
Первый заранее созданный context переиспользуется.

Selection extension выбирает первый существующий блок для начального контекста,
вызывает registry.dispatch, а при universal deferral выполняет обычное
selection.delete. Batch и восстановление DOM focus остаются там же. Обход,
подготовка цепочки и выполнение policy больше не находятся в selection extension.
Core API и persisted model не меняются; произвольные новые dispatch options не
добавлены.

Существующие assertions сохранены. Пять новых Jest-проверок покрывают все outcomes,
несколько типов, порядок блоков относительно priority, полную группу с missing ID,
recursive handler snapshot, captured selection/root, повторный независимый запрос
и пустую/отсутствующую группу.

Проверки:

- 483 React Jest-теста / 75 suites passed.
- `pnpm check-types`, React package build и production `pnpm demo:build` прошли.
- Targeted ESLint: 0 errors, 3 max-lines-per-function warnings в тестах.
- Focused Chromium/Firefox Playwright, workers=12: 168 passed. Проверены page и
  edgeless, selection, shared structural deletion, перенос детей Columns,
  Cut/Delete из handle menu, undo, parent outline и границы snapshot reads.
- Те же snapshot-cost сценарии для 1 и 200 блоков повторены отдельно с workers=1:
  4 passed; существующий предел не ослаблен.
- Финальные JSDoc-правки проверены AST без комментариев: executable code и type
  declarations не изменены. `git diff --check` и форматирование прошли.
- Staged diff сохранён побайтово; реализация не staged и не committed.

### Замеры удаления

Свежие production builds до/после переноса цепочки, один preview URL, default demo
и repeat=200. Реальный Delete удаляет 1 или 200 добавленных корневых блоков,
включая subtree первого блока. В каждом случае проверены итоговый порядок roots,
удаление descendants, model/DOM focus и полное восстановление содержимого/порядка
через undo. Пустая selection после удаления допускается по baseline-поведению,
при этом DOM focus должен остаться на panel root. Undo восстанавливает документ;
точное восстановление прежней structural selection не заявляется, поскольку
baseline также мог вернуть предыдущую каретку.

Fixture creation/load вне timing. По одному прогреву и три образца с undo между
ними; во время измерений других сборок/тестов не было. Command — вся синхронная
keyboard dispatch, включая подписчиков. Render — два animation frames, а не
доказательство завершения всех layout effects. Ниже медиана [min–max], мс.

| Браузер  | repeat | Удалено | Command до → после                  | Render до → после                         |
| -------- | -----: | ------: | ----------------------------------- | ----------------------------------------- |
| chromium |      0 |       1 | 0.8 [0.6–0.8] → 0.7 [0.7–0.8]       | 31.8 [29.4–32.1] → 31.6 [29.7–31.6]       |
| chromium |      0 |     200 | 8.7 [7.8–8.8] → 8.8 [8.1–9.2]       | 18.9 [18.2–20.2] → 19.8 [18.0–20.0]       |
| chromium |    200 |       1 | 4.2 [3.9–4.2] → 4.3 [4.2–4.5]       | 118.5 [118.2–138.2] → 131.9 [121.6–141.3] |
| chromium |    200 |     200 | 12.4 [11.9–13.5] → 11.9 [11.7–12.2] | 132.9 [129.2–133.2] → 126.7 [125.9–129.4] |
| firefox  |      0 |       1 | 1.0 [1.0–3.0] → 1.0 [1.0–2.0]       | 30.0 [28.0–30.0] → 31.0 [30.0–31.0]       |
| firefox  |      0 |     200 | 22.0 [20.0–22.0] → 28.0 [27.0–29.0] | 48.0 [43.0–52.0] → 48.0 [48.0–49.0]       |
| firefox  |    200 |       1 | 9.0 [8.0–9.0] → 8.0 [8.0–9.0]       | 157.0 [156.0–157.0] → 169.0 [163.0–184.0] |
| firefox  |    200 |     200 | 31.0 [29.0–32.0] → 30.0 [27.0–33.0] | 224.0 [195.0–263.0] → 201.0 [199.0–209.0] |

Первая короткая серия Firefox, normal demo, 200 удаляемых блоков: Command
22 → 28 мс при Render 48 → 48 мс. Поэтому дополнительно разобрано время до
selection.delete внутри panel.batchUpdates (подготовка/behavior policy) и самой
selection.delete. Это одна и та же граница измерения в обоих builds. Проверка
внутри registry.dispatch для baseline была бы некорректна: старое удаление
напрямую вызывало свободную утилиту и не проходило через registry.dispatch.

Диагностическая серия Firefox normal/200: три прогрева, пять образцов; правильность
удаления/undo проверяется также. Ниже медиана [min–max], мс.

| Часть                          | До               | После            |
| ------------------------------ | ---------------- | ---------------- |
| Вся команда                    | 29.0 [23.0–30.0] | 31.0 [28.0–34.0] |
| Подготовка до selection.delete | 19.0 [16.0–21.0] | 23.0 [16.0–25.0] |
| selection.delete               | 6.0 [5.0–7.0]    | 7.0 [4.0–11.0]   |
| Два кадра                      | 49.0 [43.0–52.0] | 50.0 [47.0–60.0] |

В прогретой серии вся команда изменилась с 29 до 31 мс; диапазоны перекрываются.
Подготовка policy в этой серии 19 → 23 мс. Эта небольшая выборка не позволяет
приписать всю разницу переносу метода или доказать отсутствие накладного расхода.
Ускорение не заявляется; обе серии сохранены, а bounds количества snapshots
подтверждены отдельными проверками. Полный E2E suite, Safari и desktop не запускались.

## Стандартные outline-алгоритмы принадлежат DefaultBlockBehavior

Алгоритмы бывших `applyIndentBlocks` / `applyOutdentBlocks` перенесены непосредственно
в `DefaultBlockBehavior.onIndent` / `onOutdent`. Отдельные экспортированные apply
функции удалены. Вычисление выбранных move roots и readonly preflight разрешений
стали private-методами этого класса (`getMoveRoots`, `canMoveRoots`), расположенными
после всех public методов. Нового public API нет.

На этапе переноса `utils/outline-ops.ts` сохранял запросы indent/outdent через
dispatch, подъём до границы, вставку writing child и конвертацию leaf в контейнер.
Последующее удаление этого файла описано в разделе ниже. Реализация
стандартного indent/outdent больше не смешана в нём с вызовом поведения. Enter,
Backspace и повторный подъём продолжают использовать семантические запросы, а
стандартное поведение выполняет алгоритм без повторного dispatch.

Условия, порядок проверок canRemove/canOutdent/canMove, tail adoption и последующие
core mutations сохранены. На всех прежних no-op ветках метод возвращает handled,
как возвращал вызывавший apply функцию старый onIndent/onOutdent. Тела алгоритмов
и private helpers сопоставлены по AST после нормализации переноса вызовов и этих
return-значений; guard/preflight/mutation statements совпадают. Документация
перенесена и расширена, ownership описан в managers guide и container skill.

Тесты и их assertions не изменялись; новых тестов, дублирующих механический
перенос, не добавлялось. Существующие проверки покрывают canMove vetoes на подъём
и adoption, nested container floors, группы, parent outcomes, selection и undo.

Проверки после переноса:

- Focused Jest: 28 passed; полный React Jest: 483 passed / 75 suites.
- Workspace `pnpm check-types`, targeted ESLint (без ошибок и предупреждений),
  React package build и production demo build прошли.
- Chromium/Firefox, workers=12: 128 passed, 2 skipped. Два skip — ранее отключённый
  keyboard status order TODO storage; tests/assertions не менялись.
- Staged diff сохранён побайтово; изменений core API или persisted model нет.

### Замеры после переноса стандартных алгоритмов

Свежие production builds до/после, один preview URL, обычный demo и repeat=200,
default extensions и virtualization. Реальные Tab/Shift+Tab, один прогрев и три
образца; проверяются parent, content, model/DOM caret, adoption хвостовых siblings
и undo. Fixture creation вне timing; параллельных сборок/тестов во время замеров
не было. Command включает синхронные подписчики; Render — два animation frames,
а не гарантия завершения всех layout effects. Ниже медиана [min–max], мс.

| Жест      | Браузер  | repeat | Command до → после                  | Render до → после                         |
| --------- | -------- | -----: | ----------------------------------- | ----------------------------------------- |
| Tab       | chromium |      0 | 0.7 [0.6–0.8] → 0.9 [0.8–1.0]       | 30.3 [30.0–30.9] → 29.4 [29.1–30.0]       |
| Shift+Tab | chromium |      0 | 1.3 [1.1–1.5] → 1.0 [0.9–1.3]       | 29.9 [28.3–30.4] → 30.0 [29.9–30.4]       |
| Tab       | chromium |    200 | 10.9 [9.8–11.3] → 11.9 [11.3–12.4]  | 192.2 [178.9–232.7] → 208.2 [193.3–219.4] |
| Shift+Tab | chromium |    200 | 9.2 [9.1–11.5] → 9.9 [9.6–11.0]     | 185.5 [180.4–185.5] → 182.7 [182.6–184.7] |
| Tab       | firefox  |      0 | 2.0 [1.0–2.0] → 2.0 [2.0–2.0]       | 28.0 [28.0–29.0] → 28.0 [27.0–30.0]       |
| Shift+Tab | firefox  |      0 | 1.0 [1.0–2.0] → 2.0 [1.0–2.0]       | 28.0 [28.0–29.0] → 28.0 [27.0–29.0]       |
| Tab       | firefox  |    200 | 13.0 [11.0–15.0] → 12.0 [12.0–12.0] | 185.0 [185.0–189.0] → 183.0 [181.0–183.0] |
| Shift+Tab | firefox  |    200 | 12.0 [11.0–14.0] → 12.0 [11.0–13.0] | 176.0 [164.0–176.0] → 171.0 [168.0–176.0] |

В этой серии Chromium repeat=200 Tab: Command 10.9 → 11.9 мс, Render 192.2 →
208.2 мс при перекрывающихся диапазонах Render. Остальные сценарии отличаются
в обе стороны. Короткая серия не доказывает ускорения или полного отсутствия
накладного расхода; raw timings остаются во временных файлах.

Полный E2E suite, Safari и desktop не запускались.

Serial `block-number-performance.spec.ts` после переноса: 4 passed в Chromium и
Firefox для normal/repeat=200. Проверены bounded forest reads, каретка, порядок
и undo/redo. `git diff --check` и форматирование прошли.

## Удаление смешанных outline-утилит

`block-behaviors/utils/outline-ops.ts` удалён целиком. Неиспользуемый
`outdentUntilBoundary` удалён вместе с экспортом. Production-обёртки
`indentBlocks` / `outdentBlocks` и их barrel exports больше не существуют:
Tab/Shift+Tab уже вызывали registry напрямую, а Enter и Backspace теперь
сами создают свежий shallow outline context и вызывают `dispatch("onOutdent")`
в прежнем panel batch. Проверка отсутствующего контекста, захват текущего
selection и родительское перехватывание сохранены. Стандартные алгоритмы
остаются внутри DefaultBlockBehavior без повторного dispatch.

Вставка writing child, раскрытие контейнера и model caret перенесены
непосредственно в существующий `ContainerBlockBehavior.appendWritingBlock`.
DOM focus по-прежнему планируется после batch. Дочерний блок сразу вставляется
в правильного родителя, без временного размещения в корне документа.

`convertLeafToContainer` без изменения алгоритма перенесён в
`extensions/containers/convert-leaf-to-container.ts`: общий владелец трёх
slash-команд Columns, Kanban и Table. Проверка leaf, сохранение ID и dormant
text, временное валидное поддерево, порядок переносов и единая история сохранены.
Core API, persisted shapes и новые публичные методы не добавлялись.

Для существующих headless тестов прежние indent/outdent helpers перенесены
без изменения исполняемых тел в существующий `src/test-utils.ts`. Тесты
обновляют только импорты. `utils/outline-ops.test.ts` перенесён в
`block-behaviors/outline-permissions.test.ts`: проверяемое поведение, условия
и assertions сохранены. Документация вставки перенесена в метод контейнера,
документация конвертации — в отдельную утилиту; guides обновлены по ownership.

### Проверки после удаления outline-ops

- Focused Jest: 57 passed / 11 suites; полный React Jest: 483 passed / 75 suites.
- AST-сравнение всех восьми затронутых/перенесённых тестовых файлов без imports:
  исполняемые тела, условия и assertions идентичны. Тела headless helpers,
  конвертации и остальных методов DefaultBlockBehavior также идентичны.
- Workspace `pnpm check-types`, React package build и production demo build прошли.
- Targeted ESLint: 0 errors, 7 max-lines-per-function warnings. Раскрытие прежней
  outdent-обёртки увеличило splitBlock до 56 строк; остальные шесть предупреждений
  относятся к неизменённым телам функций контейнеров. Отдельная новая обёртка
  ради ограничения длины не вводилась.
- Chromium/Firefox, workers=12: 100 passed, 2 skipped. Проверены родительский
  перехват Enter/Backspace в page и edgeless, container floors, nested containers,
  slash-конвертация и начало ввода в пустом контейнере. Два skip — существующие
  отключённые проверки keyboard status order TODO storage. Падений для serial
  rerun нет.
- Старые production imports/exports и outdentUntilBoundary отсутствуют.
  `git diff --check` проходит; staged diff сохранён побайтово.

### Замеры Enter, Backspace и вставки в пустой контейнер

Свежие production builds до/после, один preview URL, default demo и repeat=200
без изменения extensions или virtualization. Реальный keyboard input: Enter
поднимает пустой paragraph на уровень выше; Backspace в начале поднимает
непустой paragraph; Enter в пустой Columns lane создаёт writing child. Fixture
вставляется перед обычными блоками demo, вне timing. Один прогрев и три образца
на операцию; между образцами undo возвращает исходную иерархию.

Для Enter/Backspace Command измеряет keyboard dispatcher, включая синхронные
подписчики. Для пустой lane её React handler напрямую вызывает поведение:
Command измеряет appendWritingBlock, включая batch и планирование фокуса. Render
в обоих случаях — два animation frames, а не гарантия полного завершения layout.
Проверяются parent, sibling order, tail adoption, content, model/DOM caret,
collapsed=false у контейнера и undo. Все проверки прошли. Замеры выполнялись
последовательно, без параллельных builds, Jest или Playwright suites.

Медиана [min–max], мс:

| Browser  | repeat | Операция       | Command до → после                  | Render до → после                         |
| -------- | -----: | -------------- | ----------------------------------- | ----------------------------------------- |
| chromium |      0 | Enter          | 1.0 [0.9–1.0] → 0.9 [0.8–1.4]       | 30.1 [30.0–30.4] → 30.0 [30.0–30.3]       |
| chromium |      0 | Backspace      | 0.9 [0.9–1.0] → 0.9 [0.9–1.0]       | 30.2 [30.1–30.3] → 29.8 [29.7–30.1]       |
| chromium |      0 | containerEnter | 0.7 [0.6–0.8] → 0.5 [0.5–0.6]       | 24.9 [23.5–25.3] → 25.8 [23.4–26.0]       |
| chromium |    200 | Enter          | 6.1 [5.6–6.2] → 6.6 [6.2–6.7]       | 186.5 [182.4–187.2] → 183.4 [181.2–185.6] |
| chromium |    200 | Backspace      | 7.2 [7.2–9.5] → 7.4 [7.0–7.7]       | 184.8 [181.7–202.8] → 187.6 [178.6–209.6] |
| chromium |    200 | containerEnter | 4.7 [4.5–4.8] → 4.9 [4.8–4.9]       | 168.7 [152.5–169.1] → 158.1 [157.6–169.0] |
| firefox  |      0 | Enter          | 2.0 [1.0–2.0] → 1.0 [0.0–2.0]       | 29.0 [28.0–29.0] → 26.0 [26.0–28.0]       |
| firefox  |      0 | Backspace      | 2.0 [1.0–2.0] → 1.0 [1.0–2.0]       | 28.0 [28.0–29.0] → 28.0 [27.0–29.0]       |
| firefox  |      0 | containerEnter | 1.0 [1.0–1.0] → 1.0 [1.0–1.0]       | 23.0 [20.0–24.0] → 23.0 [20.0–24.0]       |
| firefox  |    200 | Enter          | 9.0 [9.0–11.0] → 9.0 [9.0–9.0]      | 177.0 [168.0–178.0] → 169.0 [164.0–172.0] |
| firefox  |    200 | Backspace      | 13.0 [13.0–14.0] → 9.0 [9.0–12.0]   | 169.0 [165.0–170.0] → 167.0 [167.0–170.0] |
| firefox  |    200 | containerEnter | 12.0 [11.0–12.0] → 12.0 [10.0–14.0] | 50.0 [48.0–52.0] → 57.0 [50.0–73.0]       |

Ускорение не заявляется. Например, Firefox repeat=200, containerEnter: Command
12 → 12 мс, Render 50 → 57 мс при перекрывающихся диапазонах 48–52 и 50–73 мс.
Небольшая выборка подтверждает выполнение операций и сохраняет наблюдаемую
вариативность, но не доказывает отсутствие небольших изменений времени.
Полный E2E suite, Safari и desktop не запускались.

## Константы ключей metadata

`PAGE_DRAG_METADATA_KEY` (`drag.page`) принадлежит модулю
`extensions/block-drag/block-drag-options.ts`; `BLOCK_HANDLE_METADATA_KEY`
(`block.handle`) — `extensions/built-ins/block-handle/metadata.ts`. Обе константы
экспортируются из `@chulane/rivto-react` и `@chulane/rivto-react/extensions` для
пользовательских регистраций. Нового общего registry или API в core нет.

Все production записи и чтения metadata, Jest fixtures и expectations используют
эти константы. `id` соответствующего расширения также берётся из той же константы:
протокол «имя расширения → параметры» имеет один источник строкового значения.
В browser evaluate константа передаётся аргументом из Playwright, поскольку closure
выполняется в другом JavaScript контексте. Строковые значения, параметры и assertions
сохраняются; меняется только способ задания ключа.

### Проверки после выделения ключей metadata

- Focused Jest: 58 passed / 10 suites. Покрыты merge/cleanup metadata, behavior
  registry, все четыре контейнера, TODO storage, handle без drag и pointer layout.
  Последний suite сохраняет bounds чтений геометрии для fixtures из 2 и 2000
  элементов; новые тесты, повторяющие присваивание констант, не добавлялись.
- Chromium/Firefox, workers=12: 14 passed в container-summaries, включая hover
  при metadata override и handle без drag в двух views. Дополнительно выбранный
  page-drag-keyboard suite содержит существующий suite-wide test.skip: его три
  сценария на браузер дали 6 skipped. Падений для serial rerun нет.
- Workspace `pnpm check-types`, React package build и production demo build прошли.
  Оба package entry points экспортируют обе константы в JavaScript и declarations.
- Targeted ESLint: 0 errors, 27 max-lines-per-function warnings; Prettier для всех
  изменённых TS/TSX файлов и `git diff --check` проходят.
- В 18 TS/TSX файлах исполняемый AST и type declarations совпадают с исходными
  после подстановки двух прежних строковых значений и привязки аргументов
  browser evaluate. Публичные exports сохранены; в каждом entry point добавлены
  только два value exports. Тела тестов и assertions после этой подстановки
  совпадают. Проверено точное значение каждой константы и чтение drag metadata.
- Литералы ключей в production и тестах остались только в двух объявлениях.
  Правила работы metadata, extension IDs, hierarchy, selection и history не менялись.

Новые browser latency замеры не выполнялись: это механическое выделение
эквивалентных строковых значений, без изменений алгоритмов, ветвлений, циклов
или структуры данных. Вместо сравнения шумных таймингов проверены эквивалентность
AST, существующие small/large bounds и браузерная интеграция ключей. Полный E2E
suite, Safari и desktop не запускались. Staging/commit командами этой задачи
не выполнялись; параллельно изменённый индекс оставлен в текущем состоянии.

## Явное имя результата unhandled

`BlockBehaviorOutcome` использует значения `handled | unhandled | rejected`.
Прежний outcome `default` переименован в `unhandled`: поведение не обработало
операцию, поэтому dispatch пробует следующую применимую регистрацию по приоритету.
`handled` и `rejected` по-прежнему останавливают цепочку; оба дают `true` из dispatch.
Когда все обработчики отсутствуют или возвращают `unhandled`, dispatch возвращает
`false`, и дальнейшие действия определяет вызывающий код.

Родительский `onChildIndent` / `onChildOutdent` также использует `unhandled` для
продолжения родительской цепочки. Если никто из родителей не обработал действие,
запускается цепочка ребёнка. Зарегистрированный DefaultBlockBehavior с приоритетом
-1000 по-прежнему содержит стандартные реализации; outcome не запускает его
отдельно и не гарантирует, что выполнение дойдёт именно до него.

Все return values, сравнения, тестовые матрицы и ожидаемые outcome значения
обновлены согласованно. Условия переходов, priority, parent interception, групповое
удаление, mutations, selection и undo сохранены. Обратный alias для старого outcome
не добавляется: пользователь согласовал переименование контракта.

### Проверки после переименования outcome

- Focused Jest: 49 passed / 5 suites; полный React Jest: 483 passed / 75 suites.
  Старое ожидаемое значение onResetEmpty также обновлено в block-factories.test.
- Chromium/Firefox, workers=12: 70 passed без skipped и без падений. Покрыты
  parent interception в page/edgeless, unhandled/handled при групповом удалении,
  custom move veto, сохранение содержимого колонок, история и keymap.
- Serial block-number-performance, workers=1: 4 passed, обычный demo и repeat=200
  в обоих браузерах. Прежние bounds чтения дерева (не более 1) и запросов
  (менее 30) сохранены, вместе с model/DOM caret, нумерацией и undo/redo.
- Workspace `pnpm check-types`, React package build и production demo build прошли;
  опубликованные declarations содержат только новый outcome unhandled.
- Targeted ESLint: 0 errors, 9 max-lines-per-function warnings. Prettier для
  изменённых TS/TSX и `git diff --check` проходят.
- AST 11 TS/TSX файлов после обратной замены одного строкового значения совпадает
  с исходным: формы типов, ветвления, вызовы, тела тестов и assertions сохранены.
  Пояснение preparatory mutations добавлено в JSDoc: Columns может перенести
  содержимое и вернуть unhandled, чтобы generic deletion удалил структурные shells.

Отдельные latency замеры до/после не повторялись: это переименование outcome
с неизменными алгоритмами и порядком вызовов, подтверждённое AST и существующими
small/large performance bounds. Ускорение не заявляется. Полный E2E suite, Safari
и desktop не запускались; staging и commit этой задачей не выполнялись.

## Владение metadata и подписками

Внутренний `BlockDefinitionMetadataManager` объединяет учёт вкладов и
`RevisionStore` в одном экземпляре на core block registry. Статический WeakMap
служит только поиском этого экземпляра; он не удерживает core-реестр.
Вклады хранятся в WeakMap экземпляра по точной идентичности определения.
`BlockTypeManager` получает общий экземпляр через `forRegistry`.
Новые API в core и экспорты из entrypoints пакета не добавляются.

Правила объединения metadata сохранены: рекурсивное объединение обычных объектов,
замена массивов и opaque values, поздние значения побеждают, исходные входы не
мутируются. Снятие вклада пересчитывает metadata из base и оставшихся регистраций;
rollback, out-of-order cleanup и защита replacement definitions сохранены.
Глобальный учёт React-owned definitions относится к отдельному механизму владения
определениями и в этом изменении не переносится.

Каждый `BlockTypeManager` теперь удерживает только свои disposers подписок и
снимает их при уничтожении React runtime. Cleanup регистрируется при создании
менеджера, раньше регистраций блоков: обратный teardown сначала освобождает блоки,
сохраняя прежние уведомления и ошибки наблюдателей, затем отключает подписчиков.
Существующий механизм cleanup продолжает освобождение после ошибок.
Подписчики других ReactEditor с тем же core остаются активными.

Каждая подписка использует отдельный callback для shared stores: освобождение
одной презентации не отключает другую, даже если вызывающий код передал им одну
и ту же функцию listener. Ручное снятие остаётся идемпотентным и удаляет disposer
из набора менеджера. Новая подписка после начала уничтожения отклоняется.
Контракт описан в BlockTypesApi.subscribe и реализации.

### Проверки после рефакторинга metadata

- На исходной реализации 13 существующих metadata tests прошли, а три новые
  проверки упали по ожидаемой причине: закрытые презентации оставались
  подписанными (1 и 200 лишних вызовов), уничтоженный runtime разрешал подписку.
- Добавлены пять regression cases: малое/большое число закрытых презентаций,
  запрет подписки после destroy, одна функция listener у двух презентаций,
  освобождение подписок при ошибке наблюдателя во время destroy.
  Повторная публикация metadata и lifecycle core больше не вызывают закрытых
  подписчиков; живой редактор получает по одному уведомлению на изменение.
- Полный React Jest: 488 passed / 75 suites. Существующий metadata test file
  сохранён побайтно как префикс; проверки добавлены в конец, старые assertions
  и условия не менялись.
- Chromium/Firefox, workers=12: 18 passed, без skipped и падений. Проверены
  container metadata, handle hover/menu, page/edgeless и lifecycle React-хука.
  Serial rerun падений не требовался.
- React check-types и production demo build прошли. Targeted ESLint: 0 errors,
  2 прежних max-lines-per-function warnings. Prettier и git diff --check проходят.

До и после выполнен `block-handle-performance.spec.ts`: production demo,
выделенный preview 5196, workers=1, Chromium/Firefox, repeat=0 и repeat=200.
В обоих запусках 4 passed. Это реальный pointer/menu путь потребителя metadata;
проверки сверяют состояние collapsed после каждого действия.
По четыре отсчёта после двух прогревочных действий; значения ниже — медиана
[минимум–максимум] в миллисекундах. Sync включает синхронные subscribers команды,
rendered — время от menu click до двух animation frames, а не гарантию завершения
всех асинхронных layout задач.

| Browser  | repeat | Sync до        | Sync после     | Rendered до        | Rendered после    |
| -------- | ------ | -------------- | -------------- | ------------------ | ----------------- |
| chromium | 0      | 0.75 [0.7–0.9] | 0.7 [0.6–0.7]  | 28.55 [28.1–29.6]  | 28.75 [27.2–29.9] |
| chromium | 200    | 1.05 [0.8–1.2] | 1.15 [0.9–1.2] | 127.75 [104–178.8] | 144.1 [110–163]   |
| firefox  | 0      | 1 [1–2]        | 1 [0–1]        | 19 [10–28]         | 27 [11–28]        |
| firefox  | 200    | 1 [0–2]        | 2 [1–2]        | 37.5 [29–46]       | 37.5 [29–45]      |

Диапазоны рендеринга перекрываются; ускорение или гарантированное отсутствие
latency-регрессий на основании этих коротких замеров не заявляется. Основной
детерминированный результат — отсутствие лишних callbacks после 1/200 закрытий
при сохранении уведомлений живого редактора. Heap snapshots, полный E2E suite,
Safari и desktop не проверялись. Staging и commit не выполнялись.

## Полное определение в одной регистрации

Этот раздел заменяет прежний контракт объединения metadata и общего владения
определениями. Пользователь согласовал единственный источник metadata:
React-регистрация владеет полным definition, а уже зарегистрированный native type
считается конфликтом. Прикладные редакторы создают один React runtime на core;
несколько EditorPanel используют этот runtime. Отдельный запрет создания второго
пустого runtime не добавляется: проверяется конфликт конкретного native type.

`BlockTypeManager.register()` напрямую передаёт точный definition вместе с metadata
в существующий `core.blockRegistry.defineBlock()`. Metadata не вырезается,
не копируется, не объединяется и не модифицируется при cleanup. Удаление
регистрации освобождает её core definition вместе с renderer, behavior,
clipboard, separator и slash integrations. Внешняя ссылка на удалённое определение
сохраняет его исходную metadata, но сам registry больше его не удерживает.

Удалены `block-definition-metadata.ts`, `BlockDefinitionMetadataManager`,
`reactOwnedDefinitions` и `acquireBlockDefinition`: общего store, списков вкладов,
счётчиков владельцев и модульного mutable state в регистрации блоков больше нет.
Core API не расширяется. Namespace keys и значения metadata расширений сохранены.

`blockTypes.subscribe()` использует только core lifecycle. Добавление и удаление
полного definition одновременно обновляет читателей metadata во всех панелях.
Отдельной публикации annotations нет; прямая мутация metadata не уведомляет
подписчиков. Существующий автоматический cleanup подписок сохранён, включая
идемпотентное ручное снятие, cleanup после errors и независимую идентичность
одной и той же caller-функции в разных подписках.

### Rollback первой публикации

При прямой передаче metadata наблюдатель может бросить уже на первой публикации
`defineBlock()`. Проверка выявила существующий дефект core: definition оставался
в registry, а disposer не возвращался вызывающему коду. Два focused core tests
на неизменённой реализации упали по причине оставшегося зарегистрированным типа.
React regression также обнаружил этот дефект после перехода к прямой регистрации.

Исправление находится в существующем core method: при ошибке initial notify
вызывается тот же exact-definition disposer; entry и retained disposer удаляются
до rollback notification. Если она тоже падает, оба исключения сохраняются в
AggregateError. Новых registration API или React-знаний в core не добавляется.
Успешный путь, identity и обычное удаление определений сохраняются.

### Тесты и фикстуры

Старые metadata cases на merge, дополнение core definition и общий ownership
заменены явными проверками согласованного нового контракта: точное определение и
opaque metadata, конфликт существующего native type, отсутствие partial resources,
повторная регистрация после release, защита от stale disposer, rollback и errors.
В `block-manager.test.ts` изменена только проверка прежнего дополнения definition.
Регрессионные проверки автоматического снятия subscriptions сохранены; их setup
больше не создаёт конфликтующий definition заранее.

Core-only фикстура по умолчанию продолжает регистрировать paragraph. Новый
внутренний test option `registerWritingBlock: false` используется только там,
где этот тип устанавливает writing extension. В cache fixture fallback paragraph
добавляется после React setup, если расширения его не зарегистрировали.
В одном slash test React setup перенесён перед созданием paragraph.
Ни один production caller менять не потребовалось.

Для 17 behavior test files сравнение TypeScript AST после удаления fixture option
и восстановления одного порядка setup даёт полное совпадение: assertions,
условия, editing/selection/undo действия не менялись. Несвязанные staged/unstaged
изменения сохранены; staging и commit этой задачей не выполнялись.

### Проверки после прямой регистрации

- Полный React Jest: 487 passed / 75 suites.
- Полный core Jest: 120 passed / 15 suites, включая два новых rollback tests.
- Workspace `pnpm check-types`, core package build, React package build и production
  demo build прошли. Публичных metadata API в core не добавлено.
- Chromium/Firefox, workers=12: 60 passed, без skipped и падений. Проверены
  containers/slash, metadata hover в двух views, lifecycle, behavior chain и
  parent outline interception в page/edgeless. Serial rerun падений не требовался.
- Targeted ESLint: 0 errors; предупреждения max-lines-per-function оставлены.
  Prettier для изменённых TypeScript файлов и `git diff --check` проходят.

До и после выполнен `block-handle-performance.spec.ts` на production demo,
выделенный preview 5197, workers=1. Chromium/Firefox, repeat=0 и repeat=200:
по 4 passed в каждом запуске. Сверяется состояние collapsed после реального
pointer/menu действия; после двух прогревочных действий снято четыре отсчёта.
Ниже медиана [минимум–максимум], миллисекунды. Sync включает синхронные subscribers;
rendered измеряется до двух animation frames и не гарантирует завершение всех
асинхронных layout задач.

| Browser  | repeat | Sync до        | Sync после     | Rendered до         | Rendered после     |
| -------- | ------ | -------------- | -------------- | ------------------- | ------------------ |
| chromium | 0      | 0.75 [0.7–0.9] | 0.75 [0.5–0.9] | 28.55 [27.7–28.9]   | 29.35 [28.2–29.8]  |
| chromium | 200    | 1 [0.8–1.1]    | 1.05 [0.9–1.2] | 125.45 [94.3–150.7] | 129.4 [94.2–143.5] |
| firefox  | 0      | 1 [1–1]        | 1 [0–4]        | 28 [11–28]          | 28 [9–28]          |
| firefox  | 200    | 2 [1–4]        | 2 [1–2]        | 41 [29–62]          | 36 [29–48]         |

Замеры охватывают UI-потребителя metadata; уменьшение регистрационного кода само
по себе не доказывает ускорение этого взаимодействия. Ускорение не заявляется.
Детерминированные lifecycle checks покрывают cleanup 1/200 определений и отсутствие
уведомлений после 1/200 закрытых презентаций при сохранении живого подписчика.
Heap snapshots, полный E2E suite, Safari и desktop не запускались.
