# Перенос Edgeless в отдельный пакет

## Цель и критерии завершения

`@chulane/rivto-edgeless` владеет независимой поверхностью, камерой, DOM input,
инструментами, transient transforms и React presentation. Host регистрирует её в
`react-rivto-editor`, предоставляет данные/selection/transaction callbacks и
рендеринг содержимого карточек. Перенос не завершён, пока production surface
использует старые реализации или не проверены существующие тесты.

## Исходное состояние перед переносом (2026-10-22)

Перед началом переноса в этом worktree пакета edgeless не было. `surfaces/edgeless/edgeless-surface.tsx`
смешивает камеру, DOM gestures, JSX и host block insertion. Инструменты находятся
в `managers/edgeless-tools`, transforms и визуальные contributions — в
`extensions/edgeless`. Surface использует полный `ReactPanelApi` и host DOM events.
Page уже имеет независимый controller, registrations и DOM transport; production
интеграция Page остаётся отдельной незавершённой работой.

В `rivto-vs-hotfix2/packages/canvas` есть независимые Canvas, CanvasEditor,
CanvasViewport, CanvasInputController, tool registrations и React components.
Исходники не импортируют Rivto/document-model. Используем эту реализацию внутри
нового пакета, сохраняя установившиеся имена Canvas. Второй canvas-пакет и
обёртки-псевдонимы не нужны. Тесты переносятся вместе с реализациями.

## Проход 1: владельцы и зависимости

- Model/core сохраняют persisted elements, blocks, transactions, history.
- Host сохраняет panel lifecycle, document acquisition, block renderers, clipboard,
  проекцию block ranges и семантику connector/group операций.
- Edgeless владеет camera, geometry projection, previews, tool session, DOM
  attachment, input listeners, selection rectangle и transform presentation.
- Host создаёт controller/source и завершает их session; React unmount лишь
  отключает attachment. Старый disposer не должен отключать новый mount.
- Block card получает host content renderer. Пакет не импортирует PageSurface
  или приватные React editor paths.
- Host registry может разделяться между panels; camera, gestures, active tool и
  previews принадлежат отдельному mounted canvas.

## Проход 2: API и путь интеграции

Сохранить независимые entry points: основной (без DOM/React), `/browser`, `/react`.
CanvasSource предоставляет geometry и subscription; callbacks возвращают изменения
в host transaction. Регистрация surface использует существующий SurfacesApi.
Не переносить полный ReactPanelApi в автономный пакет. Потребители получают только
используемые методы; attachment/dispose остаются у владельца. Проверить callbacks,
hooks, tool context, React provider и teardown отдельно от поведения тестов.

Затронутые потребители: surfaces/edgeless, extensions/edgeless, elements projection,
edgeless tool/toolbar managers, selection runtime, public exports, demo imports,
CSS entry, tsconfig/Jest aliases и workspace build order. Существующие public
exports временно могут направляться к новому владельцу без дублирования реализации.

## Проход 3: последовательность реализации и проверок

1. Перенести независимый Canvas из hotfix2 в rivto-edgeless с тестами; собрать
   dist, проверить типы, lint и автономность entry points.
2. Перенести snapping store с тестом и переключить существующих потребителей.
3. Подключить host source/controller и package React surface через surface registry.
   Перенести pan/zoom и DOM input из старой surface; сохранить card creation,
   scrolling exclusions и nested panel boundaries.
4. Переключить selection, transforms, tools, slots и toolbar. Удалить заменённые
   runtime реализации. Проверить registration removal, remount, multiple panels,
   undo/redo, clipboard и connector/group semantics.
5. Перенести принадлежащие пакету тесты. Прогнать все существующие suites;
   browser behavior в Chromium/Firefox с 12 workers, failures повторить с одним.
   Production preview: normal и repeat=200, реальные gestures, serial performance.
6. Проверить собранный пакет как внешний consumer и отсутствие reverse imports.
   Зафиксировать оставшиеся ограничения; не считать scaffold полной интеграцией.

## История выполнения

На момент составления плана после проверки текущего worktree и исходников hotfix2
production integration и полная верификация ещё не были выполнены. Ниже сохранены
результаты последовательных этапов; итоговые результаты проверки приведены в конце.

### Выполненный первый этап

- Перенесены 49 исходных файлов Canvas из hotfix2, без добавления второго пакета
  canvas и без зависимости нового пакета от host/model. Сохранены классы и docs.
- Перенесены snapping store и его тест из React; существующая surface импортирует
  store из нового пакета. React public export сохранён как реэкспорт.
- Добавлены workspace dependency, Jest mapping и порядок build/check-types/clean.
- Проверено: новый пакет 6 suites / 24 tests; React 79 suites / 537 tests;
  build нового пакета, typecheck обоих пакетов, lint нового пакета.
- Проверка import graph в headless-api.test.ts проходит для main/browser entry.
- Просмотрены CanvasEditor creation/connect/dispose, CanvasInputController
  connect/disconnect, CanvasToolRegistry registration/cleanup и React provider.
  API review ещё не завершён: useCanvasEditor возвращает concrete CanvasEditor,
  tool session раскрывает observeChanges потребителям. Это следующий проход
  перед production integration, а не доказанная минимальность API.
- Browser/performance ещё не запускались. Production camera/input не переключены;
  перенос snapping не меняет его алгоритм или число уведомлений. Новый standalone
  runtime требует отдельной browser проверки перед завершением всей миграции.

Следующий шаг: сузить React consumer contracts, перенести/адаптировать host source
и связать package viewport с существующими карточками и surface registration.

### Второй этап: production host (2026-10-22)

Предыдущий этап был прогрессом: создан пакет и перенесён snapping store. В этом
проходе проверено текущее состояние, затем подключён полный путь из hotfix2:

- Surface использует package CanvasView вместо собственных pan/zoom handlers.
- Host EdgelessEditor создаёт CanvasEditor, EdgelessCanvasAdapter и tool context;
  callbacks сохраняют host document selection. CanvasInputController владеет DOM.
- Toolbar registry, tool/group classes и tool context используют package реализации.
  Gesture hook и Moveable controls делегируют общую работу новому пакету.
- Source проецирует геометрию/selection и отключает subscriptions при unmount;
  карточки получают data-canvas-element, focus/selection монтируют нужные cards.
- Generic renderBounds из hotfix2 не добавлен: у текущих consumers его нет.
  Проекция использует существующий ElementGeometry.bounds.
- Hook useCanvasEditor больше не раскрывает connect/dispose/source; tools в context
  не раскрывают observeChanges. Toolbar получает Pick только используемых операций.
  Source получает отдельный узкий panel/editor contract. Полный API review остальных
  Canvas/host consumers ещё требуется; passing tests его не заменяют.

Проверено после переключения runtime:

- Package Jest: 6 suites / 24 tests; React Jest: 79 suites / 537 tests.
- Дополнительный host lifecycle test: 1/1, independent cameras, source disconnect,
  повторное подключение и устаревший disposer. Он добавлен после полного Jest прогона.
- Package и React typecheck; package build; React JS/declarations/CSS build; demo
  production build. ESLint affected surface/tool/transform paths: 0 errors,
  29 max-lines-per-function warnings. Package lint: без warnings.
- Production preview http://127.0.0.1:5196, Chromium + Firefox: 180/180 behavioral
  scenarios с workers=12. Падений для serial retry не было.
- Отдельный serial run, workers=1, trace off: 22/22 wheel, shape-resize и radius
  scenarios, normal и repeat=200. No concurrent builds во время measurements.
- Chromium Rectangle sync median: 1.5 ms normal (1.1–1.6), 1.4 ms large (1.2–1.7);
  frames: 15 ms (15–15.8), 13.9 ms (13.5–14.6).
- Firefox Rectangle sync median: 2 ms normal (1–2), 1 ms large (1–1);
  frames: 16 ms (15–17), 16 ms (14–16). Значения — три samples; это не baseline
  сравнение до/после. Поведение итоговой geometry/commit проверено assertions.

Осталось до завершения цели:

1. Полный API/ownership audit, включая concrete Canvas в borrowed interfaces,
   lifecycle host session и extensible DOM registration contract по аналогии с Page.
2. Проверить, какие оставшиеся host selection/presentation части должны быть
   package contributions, сохранив document-specific операции в host.
3. Автономный consumer/demo без Rivto host, customization registrations и browser
   regression tests на package boundary; import-graph unit checks уже есть.
4. Полный workspace test/build scope, остальные cross-layer browser сценарии и
   проверка сохранности документации в перенесённых declarations.
5. Проверить итоговый diff и критерии приемки; цель остаётся активной.

### Третий этап: DOM registrations и host surface registration

- Добавлен CanvasEvents в browser entry. CanvasViewport создаёт один events manager,
  attach/detach управляют native listeners. Регистрации переживают remount; их
  disposers принадлежат расширениям. Все встроенные input handlers используют
  тот же register API. Приоритет действует внутри native target/type/capture group;
  handled прекращает доставку группы, preventDefault остаётся явным.
- Root dispatch исключает nested attached canvas; document/window handlers сохраняют
  явную ответственность за свой gesture. Используется ownerDocument.defaultView.
- CanvasInputController получает Pick<CanvasEvents, register>, не владеет attach.
  useCanvasViewport возвращает узкий browser API без attach. CanvasView получает
  concrete viewport только через внутренний context как владелец DOM attachment.
- Пакетные DOM тесты используют jsdom: priority/claims, removal/addition во время
  dispatch, listener cleanup, rollback native setup, remount, nested roots и wheel
  override с восстановлением built-in panning. Package Jest: 7 suites / 30 tests.
- Обнаружено, что старый registerEdgelessSurface регистрировал только defaults.
  Теперь extension действительно регистрирует host EdgelessSurface в SurfacesApi.
  RegisteredSurface позволяет host явно выбрать registry-backed presentation в JSX;
  EditorPanel не получил скрытой default surface. Demo использует этот путь.
- Surface registration teardown идемпотентен и не очищает defaults новой установки.
  Registration dependencies сужены до register и двух setters projection defaults.
- React Jest после первого подключения RegisteredSurface: 81 suites / 540 tests.
  Затем отдельный suite расширен stale-cleanup проверкой: 3/3 passed.
- После финальных runtime изменений React JS/declarations/CSS и production demo
  собраны; 180/180 browser tests Chromium/Firefox, workers=12. Retry не понадобился.
- Package typecheck, focused lint, Prettier и git diff --check прошли.
- Общий React typecheck пока не зелёный: параллельно добавленный
  surfaces/page/page-blocks.test.ts импортирует @jest/globals без package dependency.
  Ранее transient mismatch ChildrenPanel constructor в этом файле уже исправлен
  внешним изменением. Эти Page файлы данный перенос не редактировал.

Оставшиеся пункты второго этапа сохраняются: автономный demo/browser consumer,
полный API/lifecycle и documentation audit, полный workspace validation. DOM
registrations и реальный host registration path теперь реализованы и проверены.

Serial verification после DOM/registration изменений: 22/22 Chromium/Firefox,
workers=1, trace off, production preview 5196, default demo и repeat=200.
Rectangle resize, median (min–max), synchronous / frames:

| Browser  | repeat | До DOM registry, ms              | После DOM registry, ms           |
| -------- | ------ | -------------------------------- | -------------------------------- |
| Chromium | 0      | 1.5 (1.1–1.6) / 15 (15–15.8)     | 1.2 (1.1–1.2) / 15.5 (15.5–15.9) |
| Chromium | 200    | 1.4 (1.2–1.7) / 13.9 (13.5–14.6) | 1.1 (1–1.3) / 14.7 (14.5–15)     |
| Firefox  | 0      | 2 (1–2) / 16 (15–17)             | 1 (1–2) / 15 (14–16)             |
| Firefox  | 200    | 1 (1–1) / 16 (14–16)             | 2 (1–2) / 16 (15–17)             |

Три samples на случай не доказывают ускорение. Это сравнение второго и третьего
этапов; baseline исходной поверхности до полного переноса не измерялся.

Финальный повтор React check-types прошёл после внешнего исправления Page-test
окружения; описанная выше transient ошибка больше не блокирует typecheck.

### Дополнительный запрос: ООП и производительность

План перед изменениями: сохранить JSX и минимальные React subscription bridges;
перенести viewport policy/style calculations в существующий EdgelessSurfaceController,
DOM-to-source lookup — в EdgelessCanvasAdapter. Исключить повторную сортировку
при camera-only изменениях, сохраняя порядок zIndex и insertion order при равенстве.
Избавиться от чтения всей block/element структуры для пустого block selection.
Проверить invalidation при добавлении/удалении/reinsert/zIndex updates, pinning и
transform lifecycle. Сначала измерить прежний runtime, затем сравнить microbench
и production browser gestures, не смешивая browser timings со сборками.

Результат ООП-рефакторинга:

- EdgelessSurfaceController теперь содержит camera admission, pan markers, grid
  styling и передачу snapping settings. React оставляет composition и subscriptions.
- EdgelessSurfaceRegistration владеет регистрацией и её идемпотентным disposer;
  DOM lookup/pinning находится в EdgelessCanvasAdapter. Обновлены extension setup,
  selection/event callers и lifecycle tests. Удалены прежние свободные helpers.
- Canvas кеширует порядок zIndex до изменения membership/stacking. Camera, geometry
  и pinning фильтруют его без сортировки; equal-zIndex insertion order сохраняется.
  Regression test проверяет отсутствие чтения zIndex при camera-only изменениях,
  обновление порядка и remove/reinsert. Индекс геометрии не добавлен: обход остаётся O(N).
- Пустое block selection не читает document roots/elements/ancestors. Есть отдельная
  проверка с запрещёнными read callbacks. EdgelessCards использует Set visible IDs.
- Проверены creation/passing/use/cleanup для изменённых controller, registration,
  adapter и JSX overlay. Controller получает узкие borrowed panel/Canvas contracts;
  overlay получает только spotlightOverlay. Separator helper также сужен до реально
  используемых операций. Adapter subscriptions освобождает source connection,
  controller observer/frame — React effect, registration — extension disposer.

Изолированный production Canvas benchmark: 100 warmups, семь batches по 200
camera updates, все элементы видимы, zIndex перемешан. Проверяются изменение camera,
стабильная identity visible snapshot и отсутствие лишних notifications.
Медиана ms/update (min–max):

| Elements | Before                       | After                        |
| -------- | ---------------------------- | ---------------------------- |
| 100      | 0.007576 (0.006968–0.011509) | 0.003529 (0.001525–0.005675) |
| 10000    | 1.058447 (1.053339–1.065709) | 0.280302 (0.273918–0.296490) |

Это примерно 3.8x для данного большого camera-only fixture, не всего редактора.
Cache требует O(N) памяти и сортируется при изменении membership/zIndex; sparse
scene с частыми structural updates отдельно не измерялась.

Native wheel в production demo, Chromium/Firefox, default и repeat=200: два warmups,
пять samples, последовательные before/after builds, camera position проверяется
после движения и восстановления. Ни сборки, ни другие тесты во время измерения не
запускались. Capture-to-bubble duration включает synchronous wheel subscribers;
frames — два requestAnimationFrame, не гарантия завершения произвольных async работ.
Median (min–max), sync / frames, ms:

| Browser  | repeat | Before                           | After                            |
| -------- | ------ | -------------------------------- | -------------------------------- |
| Chromium | 0      | 1.8 (1.7–2.0) / 16.4 (16.3–16.7) | 1.8 (1.7–2.0) / 16.5 (16.4–16.6) |
| Chromium | 200    | 1.6 (1.6–2.7) / 16.8 (16.6–17.9) | 1.7 (1.5–1.8) / 16.5 (16.4–16.9) |
| Firefox  | 0      | 2 (2–3) / 31 (30–32)             | 2 (2–3) / 33 (32–33)             |
| Firefox  | 200    | 2 (2–3) / 31 (31–33)             | 3 (2–4) / 31 (29–31)             |

Wheel не показывает подтверждённого ускорения. Малое количество samples и
миллисекундная дискретность Firefox не позволяют приписать небольшие отличия
рефакторингу. Сохранённое поведение подтверждается assertions, а не скоростью.

Final package Jest: 7 suites / 31 tests; React Jest: 85 suites / 552 tests.
React typecheck/build, package typecheck/build и production demo build прошли.
Focused lint: 0 errors, существующий warning 80-line EdgelessBlockElementView.
Поздние изменения contracts были только TypeScript interfaces/annotations;
повторный React typecheck и declaration build прошли.

Scope этого шага — текущая edgeless интеграция. Чистые geometry utilities и React
hooks пакета не превращались в статические классы без состояния. Standalone demo,
полный package-wide API/docs audit и общий workspace validation остаются отдельными
незавершёнными пунктами переноса.

После последнего JSX изменения: 180/180 browser scenarios, Chromium/Firefox,
workers=12; serial retry не требовался. Отдельный lint затронутого separator
contract также прошёл без errors; три warnings о длине существующих функций
maximumWeightMatching, matchConnectedSegments и reconcile. Их bodies не менялись.

### Автономный consumer и финальный API/documentation audit

Автономный demo находится в `packages/rivto-edgeless/demo`. Он импортирует только
React и публичные `@chulane/rivto-edgeless`, `/react` exports, не host packages.
Vite не содержит source aliases; TypeScript demo не включает `../src`. Сборка
проверяет declaration consumer, браузер — реальный bundled dist consumer.
Перенесены независимые сценарии `canvas.spec.ts` и `canvas-tools.spec.ts` из
hotfix2; host-specific cases не выдаются за standalone проверки. Demo source и
registrations оформлены классами, JSX остаётся компонентами. Jest testMatch
ограничен src/*.test, чтобы Playwright specs не запускались внутри Jest.

Проверенные публичные области:

| Область                                 | Creation и ownership                                                | Borrowers и cleanup                                                                                 | Контракт и доказательство                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core Canvas, snapshots, geometry        | CanvasEditor или независимый host создаёт Canvas                    | Source обновляет projection; snapshots только get/subscribe; owner вызывает dispose                 | Нет React/DOM/storage в транзитивном core graph; headless-api.test; dist import в Node                                                                  |
| CanvasEditor/CanvasSource               | App создаёт source и session; editor создаёт scene                  | Provider connect/disconnect; source возвращает disposer; окончательный dispose у app                | Initial getElements без subscriptions; повторный connect отвергается; failure/remount/stale cleanup в canvas-editor.test                                |
| CanvasViewport/CanvasEvents             | Provider/standalone view создаёт browser owner; он создаёт events   | View attach; extensions получают только register и read layers                                      | Один DOM lookup через CanvasViewport.forElement; input больше не имеет второй таблицы; attach rollback/nesting/stale cleanup/event priority в DOM tests |
| CanvasInputController/CanvasToolGesture | Hook или imperative host создаёт controller                         | Controller заимствует events.register; tool gesture получает только pointer/cancel методы           | Disconnect освобождает listeners/capture/pins; lookup остаётся до viewport detach; native wheel override regression                                     |
| CanvasToolRegistry/Context/Tool/Group   | App владеет definitions/settings; context создаёт surface instances | Registry owner — только assertActive/registerCleanup; toolbar — read/activate subset                | Deferred groups, fallback, order, cleanup/remount в tool tests; 3 standalone tool browser scenarios                                                     |
| CanvasView/Items/hooks                  | React владеет DOM attachment, но не lifetime переданного scene      | Camera/visible/element hooks получают только нужный snapshot accessor; Items — visible/elementStore | Stable element rendering, virtualization, offscreen focus, detach/remount в standalone scenarios                                                        |
| Controls/adapter                        | React создаёт Moveable и default adapter; host может передать свой  | Geometry/event/transform helper constructors сужены до используемых Canvas/adapter операций         | Preview синхронно красит DOM; source commit только при завершении; resize всех направлений, zoom, rotate, mixed capabilities, cancel                    |
| Toolbar/ReactCanvasTool                 | Registrations задают icons, Button, group/layout adapters           | Context owns instances; React observes local preview and active revision                            | Нет domain tool IDs в package; custom rectangle preview/commit и hand pan проверены без host                                                            |
| Host surface registration               | edgeless extension создаёт EdgelessSurfaceRegistration              | Surface registry наблюдает RegisteredSurface; extension owns idempotent disposer                    | Default/custom surface, removal и stale cleanup в registered-surface tests                                                                              |
| Host projection/selection/transform     | EdgelessEditor создаёт adapter и scene                              | Adapter borrows narrow document reads; document mutations остаются в host                           | Card focus/pins используют единый viewport lookup; host browser suites сохраняют document/undo assertions                                               |

Выявленные и устранённые замечания:

1. Удалена `utils/viewport.ts`: два WeakMap с DOM ownership заменены существующим
   CanvasViewport. Его static map принадлежит классу. Обновлены все host callers;
   старый `getCanvasForElement` больше не является public API.
2. Сужены зависимости hooks, CanvasItems, tool gesture и control helper classes;
   оформлены именованные props для item, default controls, tool layer и gesture hook.
   Владельцы attachment/scene сохраняют concrete controllers, duplicate fields и
   runtime wrappers для сужения интерфейсов не введены.
3. Registry dispose теперь освобождает observers в finally даже при exception
   подписчика. Регрессионный тест падает на прежнем cleanup (ожидался один clear,
   было ноль) и проходит после исправления. Notifications остаются синхронными;
   ошибки callback не означают rollback внешнего document state.
4. README больше не требует соседний checkout для запуска example/tests. Обновлены
   команды, current paths, lifecycle, single lookup и commit semantics: false
   означает rejection результата, но не отменяет source writes, уже сделанные callback.
5. Уточнены world units, rotation, paint-order ties и defaults capability/minSize.
   Исходные объяснения source ownership, synchronous preview, pinning, cleanup и
   migration provenance сохранены.
6. Borrowed `CanvasApi` исключает `dispose`: concrete Canvas остаётся у владельца,
   source/view/viewport/host context получают существующий объект через интерфейс.
   Input использует ещё более узкий `CanvasInputScene`. Runtime wrappers не добавлены.
7. Browser regression выявил потерю dashed distance markers у Moveable после
   переноса alignment guidelines. `CanvasControlGeometry.getAlignmentGuidelines`
   теперь использует mounted element guidelines, а numeric guidelines сохраняет
   для unmounted элементов. Соответствующий host тест проходит в обоих браузерах.
8. В CI добавлены Jest нового пакета и проверка типов его standalone demo.

Намеренные границы API: generic scene projection остаётся mutable через методы
Canvas; snapshots read-only по TypeScript, не deep-frozen runtime objects.
BeginTransform допускает eligible subset; default controls перед admission
проверяют canTransform для всей selection. Geometry query использует source bounds,
preview geometry доступна через elementStore. Canvas.dispose очищает observers и
transient state; terminal lifecycle гарантирует CanvasEditor, не bare Canvas.
React hooks и stateless geometry/cleanup utilities остаются функциями; классы
владеют состоянием и ресурсами. Browser helpers рассчитаны на обычный DOM tree;
сквозная поддержка Shadow DOM/iframe всеми React и Moveable interactions не заявляется.

### Итоговая проверка автономного пакета и workspace

Автономный demo, API/documentation audit и общий прогон workspace выполнены.
Это завершение проверки, а не утверждение, что весь изменяемый workspace зелёный:
в host integration остаются перечисленные ниже ошибки.

| Проверка                                              | Результат                                      |
| ----------------------------------------------------- | ---------------------------------------------- |
| Edgeless Jest после финального сужения API            | 32 tests / 7 suites, passed                    |
| Standalone edgeless production demo                   | 60/60, Chromium + Firefox, workers=12          |
| Standalone Page production demo                       | 88/88, Chromium + Firefox, workers=12          |
| Workspace core Jest                                   | 370 tests, passed                              |
| React Jest                                            | 560 tests / 86 suites, passed                  |
| Page Jest                                             | 130 tests / 17 suites, passed                  |
| Docs / ESLint rule tests                              | 17 / 18 tests, passed                          |
| Workspace build и check-types                         | passed на проверенном snapshot                 |
| Финальные package / host / standalone demo typechecks | passed после CanvasApi                         |
| Workspace lint                                        | 0 errors, 503 warnings на проверенном snapshot |
| Финальный package + demo lint                         | 0 errors, 2 max-lines-per-function warnings    |
| Package + CI formatting / git diff --check            | passed                                         |
| Общий format:check                                    | failed: три ранее изменённых Page dev_notes    |

Format findings: `block-editor-contracts-ru.md`,
`rivto-page-selection-drag-plan-ru.md`, `rivto-page-virtualization-plan-ru.md`.
Эти посторонние документы не переформатированы целиком.

Пакет упакован через pnpm pack и установлен CLI в отдельный `/tmp` project.
Strict declarations, core lifecycle, browser import и React SSR прошли с React 19
и React 18; финальный tarball после CanvasApi повторно проверен с React 18.
Core declarations отдельно компилируются с lib ES2022 без DOM и ambient React.
React 18 development SSR выводит стандартный useLayoutEffect warning; серверный
render при этом завершается. Последние изменения API только типовые: сравнены
нормализованные JS outputs tarball до/после, различий executable statements нет
(исключены comments и generated chunk filenames).

Финальный serial прогон edgeless wheel/resize/radius: 22/22, оба браузера,
workers=1, trace=off, production preview, normal и repeat=200. Для rectangle
resize медианы sync / two-frame completion: Chromium 1.0 / 15.1 ms (normal),
1.0 / 14.9 ms (repeat=200); Firefox 2 / 16 ms в обоих fixtures. Radius median
sync / two-frame completion: Chromium 0.4 / 16.5 и 0.3 / 16.6 ms; Firefox 0 / 16
ms (таймер с грубой дискретностью). Это observational measurements, не доказательство
общего ускорения. Изолированный camera microbenchmark выше остаётся отдельным
измерением; глобальная изоляция машины от работы другого процесса не гарантируется.

Общий production browser прогон: 1077 passed, 34 failed, 41 skipped из 1152,
workers=12. Повтор этих 34 с workers=1: 30 passed, 4 failed:

- Chromium `embeddings.spec.ts:20`, repeat=200: Page render median 105.8 ms
  превышает 100 ms ещё до переключения в edgeless.
- Chromium `performance.spec.ts:1101`, 2000-block gap drag: 10479 DOM reads
  превышают 10305; median feedback 85 ms укладывается в 160 ms.
- Firefox `http-demo.spec.ts:4`, repeat=200: initial Page content не появился за 5 s.
- Firefox `panels.spec.ts:389`, repeat=200: initial Page content не появился за 5 s.

На сохранённом production baseline до ООП-оптимизации отдельно воспроизведены
Page render threshold (104 ms) и HTTP initial-content timeout. Для двух остальных
ошибок baseline attribution не доказан. Gap drag проходит отдельный baseline и
повторный диагностический прогон; sampled read stacks относятся к host
collectDropLayout/resolveDropPlacement. Этот диагностический проход не отменяет
зафиксированное превышение и не считается performance measurement.

Во время проверки другой процесс менял Page integration, Bento/Table и E2E.
После пересборки с этими изменениями дополнительный container subset дал
70 passed / 70 failed (workers=12). В нём встречаются ожидания старых
`.page-block-row` / `.page-block-children`, отсутствующих у новой Page surface,
а Kanban modal overflow воспроизводится как лишние 441 px в Chromium.
Нельзя считать все эти падения только устаревшими selectors: overflow является
отдельной поведенческой ошибкой. Эту параллельную миграцию не откатывали.

Все 70 failed container cases повторены с workers=1: Chromium 2 passed /
33 failed, Firefox 3 passed / 32 failed, итого 5 passed / 65 failed.
Повторы разбиты на основной набор и Bento subset; эти два процесса частично
перекрывались по времени, поэтому их длительности не используются как performance
evidence. В ходе повторов другой процесс обновил часть Bento selectors: прошедшие
пять случаев не означают, что исходные падения были вызваны worker contention.
Логи: `/tmp/rivto-container-audit-{chromium,firefox}.log` и
`/tmp/rivto-container-extra-{chromium,firefox}.log`.

Логи проверки сохранены локально: `/tmp/rivto-workspace-final-e2e.log`,
`/tmp/rivto-workspace-final-serial.log`,
`/tmp/rivto-edgeless-completion-browser.log`,
`/tmp/rivto-edgeless-completion-performance.log`,
`/tmp/rivto-edgeless-final-api-jest.log`,
`/tmp/rivto-edgeless-final-api-lint.log`, `/tmp/rivto-current-containers.log`.
Они относятся к выполненным snapshots; продолжающиеся чужие изменения после
сборки не покрываются этими результатами автоматически.
