# TODO переноса в rivto-page

Дата: 2026-10-20. Чеклист продолжения автономного BlockEditor; пункты ниже ещё
не означают реализованные API. Основание — текущие исходники и
[план разделения поверхностей](./separate-surfaces-design-ru.md).
При расхождении с ранними эскизами учитывать последние уточнения в
[контрактах BlockEditor](./block-editor-contracts-ru.md): host выбирает display IDs,
общий parent/region не требуется, surface mode не передаётся в Page.

Сейчас реализованы структурное дерево, стабильные BlockEditorNode, адресные подписки,
живой lookup renderers, slots, checkbox/collapse/list controls, CSS и theme parameters.
Production integration с ReactEditor/EditorPanel ещё не подключена. Наличие shell и
controls не закрывает перенос интерактивного поведения.

## Статус реализации 2026-10-22: events и selection

Этот этап меняет только самостоятельный `rivto-page`. Production `PageSurface`
по-прежнему использует старое дерево; полная замена поверхности не завершена.

- `BlockEditorEvents` сохраняет публичную точку регистрации и координирует
  `BlockInputDispatcher`, `BlockInputListeners` и `BlockFocusObserver`.
- `register` принимает результат `handled`/`continue`; `observe` доставляет
  наблюдение независимо от захвата события. Native default prevention остаётся явным.
- Приоритеты сортируются при регистрации внутри одной native-фазы и target.
  Per-registration `passive` удалён; владелец native listeners явно задаёт `passive: false`.
  Добавленные во время доставки регистрации откладываются до следующего события,
  в том числе при переходе capture → bubble; удалённые пропускаются.
- Attachment откатывает установленные listeners при ошибке; stale disposer не
  отключает новый mount. Cleanup пытается освободить все ресурсы и агрегирует ошибки.
  Focus reconciliation исключает вложенные occurrences и сохраняет initial autofocus.
- `BlockSelectionController` координирует `BlockNativeSelection`,
  `BlockPointerSelection` и `BlockSelectionFeedback`; selection остаётся в adapter.
- `BlockPointerOwnership` исключает одновременное владение жестом selection и DnD.
  `BlockAutoScroll` создаётся отдельно для каждого жеста, прокручивает вложенные
  scroll containers и затем документ, останавливается вместе с сессией.
- Проверены creation → borrowing → use → cleanup для новых классов. Подписчики
  native selection и feedback получают только используемые операции; lifecycle
  controller остаётся у host, view по-прежнему владеет только attachment.

Проверка этого этапа:

- Baseline: 116 unit-тестов и 48 production performance-сценариев прошли.
- После изменений: 126 unit-тестов; package typecheck, package build и demo build
  прошли. Focused lint: 0 errors, 4 предупреждения о длине функций.
- Финальный behavioral-run Chromium/Firefox, `workers=12`: 86 passed, 2 Firefox
  timeout (загрузка Kanban и поиск list control). Обязательный повтор только этих
  тестов с `workers=1`: 2 passed. Более ранний запуск после основного refactoring
  прошёл все 88 тестов параллельно; причины итоговых таймаутов не установлены.
- Финальные performance-сценарии: 48 passed, оба браузера, production preview,
  `workers=1`, tracing off, исходные настройки и `repeat=1/200`.

Примеры замеров pointer group commit → frame, миллисекунды, медиана [min–max]:

| Сценарий без виртуализации   | Baseline         | После            |
| ---------------------------- | ---------------- | ---------------- |
| Chromium outline, repeat=1   | 27.9 [27.6–28.2] | 28.0 [27.7–28.8] |
| Chromium outline, repeat=200 | 41.3 [39.5–43.2] | 42.6 [42.0–46.8] |
| Firefox outline, repeat=1    | 34.5 [29–41]     | 28.5 [27–47]     |
| Firefox outline, repeat=200  | 48.5 [47–50]     | 51.0 [48–85]     |
| Chromium Kanban, repeat=200  | 92.8 [88.9–93.3] | 91.0 [87.7–94.1] |
| Firefox Kanban, repeat=200   | 85.5 [61–126]    | 113.0 [77–118]   |

Outline сохраняет 57 node reads независимо от repeat; длительность синхронной
команды в этих samples — 0–0.2 мс. Эти проверки не доказывают отсутствие всех
регрессий: большой Kanban в Firefox остаётся медленным и вариативным, а медиана
в итоговом запуске выше baseline. Отдельные замеры холодного изменения корней,
начала жеста и каждого pointermove не добавлены. Полный workspace, production
PageSurface и Edgeless в этом этапе не проверялись.

Следующие обязательные части пользовательского плана **не выполнены**:
production host adapter и динамические host contributions; перенос настоящих
renderers/containers/embedding и DOM consumers; mixed-parent core move с полной
валидацией и историей; `canMove`, реальные root destinations и navigation mounting;
transport/slash/clipboard/editing интеграция; замена PageSurface и удаление старого
Page-кода и keyboard DnD. Тесты standalone demo не доказывают готовность этих частей.

## Продолжение 2026-10-22: групповой перенос и pointer-only DnD

Production PageSurface пока не заменена. Ниже выполненные части полного goal,
а не готовность миграции.

- Core `moveBlocks` принимает разные родители, проверяет все исходные IDs до
  фильтрации, упорядочивает корни через существующий `getOrderedIds`, исключает
  выбранных потомков и проверяет destination ancestry без обхода поддеревьев.
  Сохранена единая history batch. Полный core unit-run: 128 tests passed;
  core typecheck прошёл. Есть проверки atomic rejection, undo/redo и отсутствия
  чтений невыбранных потомков при нормализации.
- Page `BlockDragAdapter.canMove` управляет feedback; отпускание повторно
  проверяет цель, а host commit снова валидирует состояние. Ошибка проверки
  освобождает pointer ownership, preview и autoscroll и пробрасывается дальше.
- `parentId: null` обозначает настоящий корень. `blocks.getRootIds()` отделён
  от display IDs; undefined запрещает эту цель, пустой массив разрешает пустой
  документ. DropTargets получает только getRootIds/getBlockNode.
- В старом общем block-DnD удалены KeyboardSensor, keyboard state, translated
  rectangle, keyboard-only droppables и keyboard placement policy. Удалён
  отдельный skipped keyboard DnD spec; обычный Space на handle проверяет native
  activation. Общая клавиатура, pointer Escape и status-order DnD меню TODO
  остаются своими независимыми взаимодействиями.
- Production behavioral baseline: 130/130 passed, Chromium/Firefox, workers=12.
  После удаления: 129 passed, 1 failure; обязательный serial repeat: 1 passed.
  Failure сохранил пустой исходный DOM-list до React commit. Добавлено ожидание
  видимого корня перед чтением в двух проверках no-op reorder; 4/4 passed.
- Production drag unit: 35/35 до и после; React typecheck и demo build прошли.
  Focused lint: 0 errors, 17 max-lines warnings в затронутом legacy-коде/тестах.
- Production performance, 2 000 блоков, workers=1, tracing off: baseline 13 passed,
  13 skipped; после 12 passed, 1 failure, 13 skipped. Существующий suite исключает
  Firefox по своей calibration; это не проверка Firefox. Failure: Edgeless с одной
  веткой, 10 712 rectangle reads против лимита 10 305; focused repeat 8 524, passed.
  Причина разброса ещё не установлена; лимит сохранён.
- Page unit: 129 passed, package build/typecheck и demo build прошли.
  Pointer behavioral: 8/8 passed в обоих браузерах. Performance: 11/12 passed;
  большой Kanban Firefox превысил общий 30 s timeout, диагностика не завершена.

Старый production renderer, host adapter, live registrations, text classification,
root DOM/slot integration, bounded navigation и перенос host interactions остаются
обязательной дальнейшей работой. В workspace параллельно меняется Edgeless;
эти изменения не входят в данный этап и не откатывались.

## Продолжение 2026-10-22: host lifecycle и живые contributions

Production PageSurface всё ещё использует старое дерево. Следующие изменения
подготовлены и проверены отдельно; они не означают завершённую замену.

- `PageBlocks` проецирует shallow model-cache snapshots через WeakMap по их
  существующей идентичности; адресные подписки не читают поддеревья. Реальный
  document root отделён от скрытого корня панели. List-property удаления проходят
  предварительную проверку и один history batch.
- `PageSelection` делегирует состояние панели, уведомляет изменившиеся IDs и
  определяет текст через metadata `rivto.text`: 0 для пустого текста, undefined
  для contentless. Первый запрос selectable order после изменения документа
  обходит раскрытый outline; это остаётся O(N), не скрыто виртуализацией.
- ReactPanel создаёт один BlockEditorController вне render и уничтожает его вместе
  с PageSelection и PageSurfaceRegistrations. View не владеет controller lifetime.
- Live host renderer/layout lookup сохраняет расширения и их удаление. Реальные
  host slots/wrappers переводятся с сохранением индивидуальной идентичности,
  порядка, приоритетов и фильтров. Publication failure откатывает регистрацию;
  cleanup пытается освободить все ресурсы. Host collapse controls получают
  настоящий childrenId Page через узкий контекст, без общего протокола DOM refs.
- BlockEditor передаёт ref на единственный root и принимает завершающий children
  slot. Добавлены Page layouts для Columns и Kanban; потомки строятся один раз.
  Bento/Table и старые ref-dependent wrappers ещё требуют переноса.
- Отдельно просмотрены creation → passing → use → destruction: Page адаптеры
  получают Pick-интерфейсы необходимых операций; panel сохраняет concrete
  controller для lifecycle, content/layout hooks используют host public API.
  Полный архитектурный review взаимодействий после переключения ещё не выполнен.

Проверки до финального подключения поверхности:

- Page unit: 130 passed, включая единственный root и ending slot; package build прошёл.
- React targeted lifecycle/model/renderer/slot suites прошли; live contributions
  проверены на реальной host-модели, включая rollback и stale disposer.
- Production preview после подключения lifecycle: 22 behavioral passed в обоих
  браузерах, workers=12, включая repeat=200. Это тесты старой PageSurface.
- Production performance на 2 000 блоков, Chromium, workers=1, tracing off:
  drag start 49.7 ms, follow 7.0 ms; preview follow median 10.5 ms,
  p90 frame gap 16.7 ms. Два Firefox cases пропущены существующей calibration.
  Эти замеры не подтверждают производительность нового production Page renderer.
- Typecheck после transient ошибок параллельного Edgeless снова прошёл.
- Финальная проверка этого продолжения: 60 targeted host unit tests и 40 browser
  scenarios (Chromium/Firefox, workers=12) прошли; Page unit 130 passed.
  Production build/typecheck прошли, focused lint: 0 errors, 1 предупреждение
  о длине конструктора ReactPanel. git diff --check прошёл.
- На финальном production build B8dfG7mZ повтор затронутых performance cases:
  Chromium drag start 80.2 ms, follow 0.7 ms; preview follow median 7.0 ms,
  p90 frame gap 16.7 ms; 2 passed, 2 Firefox skipped. Различие start 49.7→80.2
  между сборками не исследовано и не объявляется улучшением или стабильностью.
  Новые layouts пока проверены через host-model rendering tests; browser tests
  продолжают проверять старую PageSurface, включая сохранённый Edgeless pointer.

Дополнение к предыдущей диагностике standalone Kanban: trace показал timeout
в глобальном поиске locator до измеряемых samples. Поиск ограничен известным
block ID/Statistics section без изменения timeout, fixture и assertions.
После этого 12/12 performance scenarios прошли, оба браузера, workers=1,
tracing off. Firefox Kanban repeat=200 commit→frame: 97 [61–128] ms против
baseline 85.5 [61–126]; Chromium 106.6 [99.5–119.7] против 92.8 [88.9–93.3].
Стоимость больших контейнеров и холодного изменения корней ещё не устранена.

## Продолжение 2026-10-22: ООП и устранение лишних подписок

По дополнительному запросу пользователя текущая host-интеграция переработана:

- `PageSurfaceRegistrations` владеет синхронизацией renderers, layouts, slots и
  wrappers. В Page регистрируются конкретные host-компоненты; удалён промежуточный
  `page-block-renderer.tsx` с content/layout lookup и отдельным hook. Это убирает
  две дополнительные host-node и две host-registry подписки на каждый блок.
- `RegisteredBlockRenderer` хранит immutable identity и extension-owned disposer.
  RendererManager больше не конструирует два анонимных entry-типа и временный
  пустой disposer. Живое удаление, повторная регистрация и rollback сохранены.
- Неиспользуемые после прямого подключения `fallbackLayout` и `getLayout` удалены.
  Потребитель регистраций получает узкие register/read/subscribe capabilities;
  конкретный Page controller и lifecycle остаются только у панели.
- `PageSelection` сам определяет текстовый диапазон по metadata; отдельная чистая
  функция с единственным потребителем удалена. Без membership subscribers сравнение
  больших наборов selection не выполняется. Убраны filter/map и промежуточный union
  при сравнении coverage; следующий subscribed переход всё ещё сравнивает актуальное
  состояние. Полный обход expanded order после model change пока остаётся O(N).
- Тест с настоящей host-моделью монтирует 5/2 000 Page-блоков и проверяет отсутствие
  per-block host registry subscriptions, редактирование текста, removal/re-registration
  и cleanup. Минимальное jsdom окружение использует native structuredClone/randomUUID;
  добавлена явная dev dependency уже используемого в workspace jest-environment-jsdom.
- Детерминированная проверка прямого renderer identity падала на предыдущем коде
  (получала PageBlockContent вместо TextContent), после рефакторинга проходит.

Проверки после рефакторинга:

- 130 Page unit tests; 38 финальных focused host tests, включая 5/2 000 mounted
  nodes, плюс 4 surface registry tests из предыдущего запуска — passed.
  ESM browser-test environment повторно проверен: 2/2 passed.
- Typecheck, Page package build, production demo build прошли. Focused lint после
  финальных изменений: 0 errors/warnings. Более широкий запуск ранее показал
  единственный max-lines warning конструктора ReactPanel. diff --check прошёл.
- Production behavior: 36/36, Chromium/Firefox, workers=12, defaults/repeat=200;
  до последнего изменения класса регистрации — 40/40 с nested containers.
- Production build BwZxTKH6, Chromium 2 000 блоков, workers=1/tracing off:
  первоначальный start 110 ms, follow 15.4 ms. Затем три эквивалентных samples:
  start median 68.6 [58.7–69.9] ms, follow median 1.4 [0.6–11.2] ms;
  preview-follow medians 7.0 [6.9–7.4] ms, p90 frame gap 16.7 ms.
  6/6 passed. Нельзя приписывать различия с одиночным baseline 80.2 ms этой
  оптимизации: production пока использует старую PageSurface, а checkout также
  получает параллельные изменения. Два Firefox timing cases suite пропускает.
- Creation/borrowing/cleanup проверены отдельно: RendererManager владеет immutable
  RegisteredBlockRenderer, extension owner — его disposer; PageSurfaceRegistrations
  получает narrow capabilities и очищается до controller. View только заимствует
  controller. Независимого selection store или дублирующего manager facade нет.

Это улучшение текущей интеграции, а не замена production PageSurface. Из него нельзя
делать вывод о завершении переноса или ускорении всех browser interactions.

## 1. Production adapter и подключение

- [ ] Подключить реальный host через один BlockEditorAdapter: данные, selection,
      renderers и slots. Добавлять новые возможности только под переносимое поведение;
      не передавать editor/panel/document или широкие managers.
- [ ] Сохранить живую регистрацию и удаление renderer/behavior/slots/slash actions,
      стабильность snapshots и раздельные подписки display list и отдельных узлов.
- [ ] Подключить BlockEditor в PageSurface и как содержимое canvas-карточки через
      внешнюю сборку. Canvas не должен импортировать Page, host — реализации поверхностей.
- [ ] Для каждой операции определить допустимые цели изменения и навигации.
      Display IDs могут принадлежать разным родителям и сами по себе не дают прав на
      изменение, вставку рядом или доступ ко всему документу.
- [ ] Сохранить lifecycle: mount/unmount, StrictMode, несколько occurrences одного
      документа, cleanup подписок и отмену активного взаимодействия при уничтожении.

## 2. Drag handle и dragging

- [ ] Перенести общий handle в slot: hover/selection, доступность, меню действий,
      focus, duplicate/delete, списки и цвета. Конкретные настройки блоков остаются в host.
- [ ] Перенести pointer block DnD, выбор переносимых корней,
      preview/overlay, drop indicator, commit/cancel и cleanup.
- [ ] Удалить keyboard DnD: sensor, состояние, искусственную геометрию, инструкции
      и специфичные тесты. В старом общем block-DnD сохранить pointer-поведение
      Edgeless, общую клавиатуру и Escape для отмены pointer-жеста.
- [ ] Сохранить before/after/inside placement, indentation, пустые destinations,
      ограничения fixed/container blocks и запрет переноса в собственное поддерево.
- [ ] Подключить autoscroll к реальному scroll/viewport, включая вложенные scroll
      containers и canvas zoom; не считать координаты документа координатами экрана.
- [ ] Подключить cross-document copy/move через host transport с разрешением
      collisions. Проверить отмену/ошибку назначения, сохранность источника и undo.

Источники: `extensions/built-ins/block-handle/`, `extensions/block-drag/`
в `packages/react-rivto-editor/src/`.

## 3. Container

Контейнер здесь — блок, владеющий layout своих детей. Конкретные columns/table/
kanban/bento, их schemas, renderers, behaviors и CSS остаются в react-rivto-editor.
Page должен предоставить общий механизм их подключения.

- [ ] Подключить host children layout и childrenVisible policy вместо единственного
      generic children wrapper. Согласовать rendering, collapse, navigation и DnD.
- [ ] Передавать bounded layout/behavior contracts: реальные childIds, порядок,
      видимость, доступные destinations и ограничения; не определять поведение по
      захардкоженным в Page именам конкретных типов.
- [ ] Проверить columns/table/kanban/bento: вложенность, пустые ячейки/колонки,
      resize/reorder, перенос между контейнерами, collapse, selection и undo.
- [ ] Проверить, что дети не отображаются дважды и custom layout не теряет slots,
      selection anchors, drag targets или стили конкретного блока.

## 4. Embedding: получение и отображение целевого блока

Resolution/acquisition источника, references и владение source editor остаются в host.
Page получает подготовленный adapter. Текущий `extensions/embedding/embedding.tsx`
напрямую рендерит PageSurface внутри EditorEmbed — это место нужно развернуть через
подключаемую презентацию, сохранив существующее получение и освобождение источника.

- [ ] Подключить BlockEditor внутри EditorEmbed/EmbeddingPanel и BlockModal.
- [ ] Проверить реальную интеграцию: ссылка разрешается в нужные documentId/blockId,
      отображается именно целевое поддерево с правильным content и потомками.
- [ ] Изменить содержимое через embedding и проверить обновление источника и второй
      occurrence; проверить обратное обновление и undo в истории source document.
- [ ] Проверить loading, missing/deleted target, error, refresh, смену ссылки,
      рекурсивные references и неоднозначное разрешение без явного documentId.
- [ ] Проверить удаление target и восстановление undo, release при unmount/смене
      ссылки, изоляцию focus/selection/keyboard и границы операций внутри embedding.
- [ ] Проверить embedding в странице и canvas-карточке, включая scroll и portals.

## 5. Keyboard и текстовое редактирование

Да, клавиатурное поведение BlockEditor входит в Page. Общий KeyboardManager,
runtime keymap и маршрутизация между occurrences остаются в host. Текущие
`managers/keyboard/` обслуживают surface/window events и panel registrations;
переносить этот manager целиком вместе с Page нельзя без разделения обязанностей.

- [ ] Подключить scoped keyboard registrations через bounded adapter capability,
      сохранив semantic binding IDs, overrides, порядок обработки и cleanup.
- [ ] Перенести Enter/split/create, Backspace/Delete boundary merge, outdent,
      Tab/Shift+Tab indent, empty-block reset и удаление структурной selection.
- [ ] Перенести caret/block navigation, расширение selection и keyboard block move
      с учётом collapsed children, container layout и границ карточки/embedding.
- [ ] Подключить общий механизм block behaviors; конкретное текстовое UI и
      type-specific операции остаются у host renderers/behaviors.
- [ ] Сохранить IME/composition, native inputs, contenteditable, UTF-16 offsets,
      preventDefault и восстановление focus/caret. Один event не выполняется дважды
      в родительской и вложенной occurrence.

Источники: `extensions/built-ins/page/`, `extensions/built-ins/selection/`,
`managers/keyboard/`, block-behavior contracts в `managers/blocks/`.

## 6. Slash

Да, slash session и menu нужны Page как поведение блочного редактора, в том числе
в карточке и embedding. Реестр команд, их регистрация и привязка к host occurrence
остаются в host. Текущий PanelSlashCommandManager добавляет ReactPanelApi к context;
этот контракт нельзя напрямую протащить в независимый Page.

- [ ] Перенести trigger/query/session, поиск, popup positioning, menu keyboard
      navigation, подтверждение, отмену и восстановление caret.
- [ ] Предоставить ограниченные lookup/subscribe/execute через adapter без утечки
      ReactPanelApi. Повторно проверять доступность при выполнении команды.
- [ ] Сохранить динамическую регистрацию, фильтрацию и cleanup команд host blocks.
- [ ] Разделить placement для duplicate/insert: соседний блок в Page/embedding,
      создание карточки — ответственность canvas integration.
- [ ] Проверить popup в scroll containers/portals, пустую выдачу, IME, смену
      активной occurrence и уничтожение блока при открытом меню.

Источники: `managers/slash/`, `extensions/built-ins/slash/` и slash registrations
в `extensions/built-ins/built-ins.ts` и расширениях конкретных блоков.

## 7. Остальное, что нужно включить в перенос

- [ ] DOM selection/caret: anchors, conversion к host selection, cross-block range,
      pointer/modifiers, restoration после mutations и переходов между occurrences.
- [ ] Clipboard: copy/cut/paste, plain text и structured content, межблочная вставка,
      Page ↔ card ↔ embedding, cross-document transfer. Форматы/serialization и model
      mutations остаются у host/core; DOM и placement strategy принадлежат Page.
- [ ] History: одна история у документа, transactional mutations, один undo step
      на действие/жест, восстановление selection без второго history owner в Page.
- [ ] Default writing block и trailing area: пустой документ/контейнер, click-to-write,
      host factory и семантическая пустота вместо жёсткой зависимости от Markdown.
- [ ] List shortcuts и полная нумерация: start/continue, nested lists, collapse,
      Enter на пустом пункте. Наличие CSS counters не закрывает editing semantics.
- [ ] Virtualization и viewport: scroll-to-block/caret, mount перед DOM measurement,
      selection через виртуальные gaps, большие деревья и свёрнутые ветки.
- [ ] Optional bullet-threading: подключение отдельным расширением, nested rows,
      collapse, hover/selection и theme.
- [ ] UI integration: native control markers, themed portals, context menus,
      unknown/error block presentation из host, CSS без зависимости от demo stylesheet.
- [ ] Обновить public exports, приложение/demo и presets после подключения;
      удалить заменённый legacy path после подтверждения поведения.

### Виртуализация и DnD

- [ ] Разделить полный канонический порядок детей и смонтированный диапазон в
      BlockChildren/BlockList. Нельзя просто передать видимые IDs вместо полного списка:
      previousId/nextId должны учитывать невидимых соседей того же реального родителя.
      Для произвольного display list не выводить общего родителя из видимого диапазона.
- [ ] Добавить зоны вставки перед первым и после последнего смонтированного блока,
      учитывая overscan и настоящих соседей за границами диапазона. Для grid/wrapping
      проверить частично смонтированные строки и item-local edge targets.
- [ ] Сохранить независимость dropTargets от устройства виртуализации: регистрировать
      только существующие DOM-зоны, освобождать их при unmount и обновлять destinations
      при изменении диапазона/порядка. Не вводить обход всех блоков или измерение всего
      документа на каждом движении указателя.
- [ ] Связать autoscroll с монтированием следующего диапазона и повторным resolve
      по последним координатам указателя после commit, даже если указатель неподвижен.
      Убирать устаревший indicator, если его зона исчезла; невидимые блоки не должны
      давать фиктивные DOM-цели.
- [ ] Для клавиатурной навигации к невидимой цели сначала определить destination
      по данным, затем прокрутить и смонтировать нужный диапазон перед DOM measurement
      и восстановлением caret. Не ограничивать доступные позиции видимыми DOM-зонами.
- [ ] Проверить pointer DnD через границы диапазона, начало/конец списка,
      пустой контейнер, reorder, collapse/expand, grid reflow и cleanup при unmount.
      Сравнить обычный и большой документы в production preview: отдельно число
      смонтированных узлов/подписок/целей, стоимость resolve и время до ожидаемого DOM.
      Уменьшение задержки после виртуализации подтвердить измерениями.

## Порядок и готовность

Рекомендуемый порядок: production adapter и selection/events → container contracts →
keyboard/text editing → clipboard/history → handle/DnD → slash → embedding integration
и полная проверка. Embedding smoke test полезен сразу после первого подключения adapter.

Для каждого пункта нужны поведение, integration и соответствующие regression checks;
перенос файлов сам по себе пункт не закрывает. Конечная проверка — страница, canvas-
карточка и embedding с реальными host blocks, включая несколько occurrences.

- [ ] Выполнить focused behavioral tests и workflow из
      [rivto-performance-testing](../.agents/skills/rivto-performance-testing/SKILL.md)
      после каждого feature/fix. Playwright: `--workers=12`, failed tests повторить
      с `--workers=1`; performance measurements выполнять с `--workers=1`.
- [ ] Измерить переносимое взаимодействие на малом и большом документе,
      адресность обновлений, cleanup и время до DOM/caret; не делать выводов по demo mocks
      о готовности production integration.

Этот файл фиксирует TODO и границы ответственности. Проверки перечислены как будущая
работа; при создании чеклиста код и type declarations не изменялись.

## Выполненный самостоятельный этап: events / keyboard / pointer selection

См. [план и результаты реализации](rivto-page-events-keyboard-selection-plan-ru.md).
Независимый keyboard runtime извлечён и используется обоими пакетами; typed Page
input и pointer-selection extensions работают в standalone demo. Production
host adapter, маршрутизация editing/keyboard navigation, clipboard/history и
подключение нового selection в EditorPanel остаются в checklist выше.

### Реализованный этап root virtualization

- [x] Опциональный `BlockEditor.virtualization` и измеряемые корневые поддеревья,
      основанные на том же TanStack virtualizer, что и исходный PageSurface.
- [x] Canonical selection не зависит от viewport. Проверяется выделение через
      невидимые корни, сохранение caret/text endpoints, remount и работа demo-host
      indent/outdent по ID, включая выбранных детей свёрнутого родителя.
- [x] `adapter.blocks.getParentId` для подъёма к display root без обхода документа;
      offscreen list metadata поддерживает корректную нумерацию.
- [ ] Виртуализация детей одного большого контейнера и произвольного scroll host.
- [ ] Production adapter, клавиатурная навигация и реальные DnD-команды через
      виртуальные границы остаются отдельными задачами; существующий раздел DnD
      выше не закрыт этим этапом.

Подробности и результаты проверок: `rivto-page-virtualization-plan-ru.md`.

## Обновление 2026-10-22: автономное выделение и pointer DnD

- [x] Классификация text/contentless через данные адаптера, включая размонтированные
      блоки; чтение длин только в интервале выделения.
- [x] Опциональный BlockDragExtension + BlockDragHandle; группа structural selection
      из разных родителей, исключение выбранных потомков, compact count preview,
      native hit testing, commit через host, Escape/cancel/blur/detach cleanup.
- [x] Демо host mutation с проверкой существования, соседей и циклов до записи.
- [ ] Production adapter с реальными canMove/container policies, транзакциями и undo.
- [ ] Keyboard DnD, nested-scroll autoscroll, root insertion и cross-editor transport.
- [ ] Уменьшить стоимость смены display roots: виртуализатор пересчитывает list metadata
      за O(R). Первый перенос корней внутрь контейнера это проявляет; повторный перенос
      детей не должен платить эту стоимость.
- [ ] Вложенная виртуализация: один большой смонтированный контейнер пока отображает
      всё раскрытое поддерево. Root windowing не ограничивает его DOM.

План и результаты: [selection + DnD](./rivto-page-selection-drag-plan-ru.md).
Это не закрывает общие пункты production migration выше.

- [ ] Отдельно профилировать Firefox Kanban repeat=200: virtualized DnD сохраняет
      ограниченное число чтений, но frame proxy в текущем замере 89 ms median,
      82–153 ms range. Не объявлять универсальное ускорение по Chromium.

## Продолжение 2026-10-22: production attachment и адресная навигация

PageSurface теперь отображает панельный BlockEditor; старый recursive renderer из
этой поверхности удалён, переключателя реализаций нет. Это промежуточное состояние:
полная совместимость взаимодействий ещё не достигнута и production migration не закрыта.

- Bento/Table получили собственные Page layouts и явные items. Mounted-тесты проверяют
  однократный вывод потомков, keyboard resize и undo. Table cell отмечен как текстовый
  блок, включая длину 0 для пустого текста.
- PageVirtualizationController стал панельным классом с узкими зависимостями чтения.
  ReactPanel создаёт его вне render и привязывает к текущему DOM root. Навигация
  вызывает ограниченный mountBlocks API Page; выборка selection использует PageSelection
  и адресные снимки вместо рекурсивного getBlocks. Индекс корней строится при смене
  списка, затем поиск предка использует map. Cold rebuild остаётся O(R).
- Bridge исключает вложенные panels; overlapping scroll anchoring и stale release
  после remount покрыты тестом. Старые свободные register/get функции удалены,
  все их потребители переведены на класс. DOM-чтение собственной строки распознаёт
  новую Page и оставшуюся старую Edgeless структуру.
- Обнаружено пересечение владения CSS: Page задавал всем contenteditable min-height
  2rem и padding .5rem. Прозрачный Markdown editor становился 48px при preview 24px,
  из-за чего клик попадал в строку. Оформление текста перенесено в standalone demo;
  production host сохраняет свою геометрию. Неиспользуемые text theme параметры удалены.

Проверки этого этапа:

- Production build и React types проходят. Focused lint: 0 errors, одно предупреждение
  длины конструктора ReactPanel. Page unit: 130/130; host mounted/navigation: 7/7.
- Новый e2e page-content-geometry: before — 2/2 воспроизводятся workers=1 (48 != 24);
  after — 2/2 проходят Chromium/Firefox workers=12, включая реальный ввод и Enter.
- Первичный production smoke Bento/Columns/empty-document: 2 passed, 32 failed.
  Последовательный повтор запущен с явным списком файлов и отдельным output:
  /tmp/page-switch-smoke-serial-scoped.log. Старые селекторы объясняют часть ошибок,
  но DnD owner/transport ещё не перенесён и одним обновлением тестов задача не решается.
- Два virtualization сценария в обоих браузерах: 4 failed parallel, 4 failed serial
  на build до CSS fix. Один сценарий блокировался Markdown overlay, второй не находил
  root-100 после фиксированного scroll=6500. После исправления нужен новый прогон
  с проверкой геометрии, без ослабления selection/viewport assertions.
- Сборки проверок теперь вынесены в /tmp/rivto-page-navigation-demo (5397, before CSS)
  и /tmp/rivto-page-geometry-demo (5398, after CSS), чтобы параллельные изменения
  другого рабочего процесса не заменяли тестируемые assets. Output тестов тоже отдельный.

Архитектурный review этого среза: ReactPanel creation/root replacement/destruction,
Page virtualizer borrowed mount API, host navigation/selection/indent consumers,
вложенные occurrence boundaries и CSS-владение renderer/структурой. Остались:
Page drag adapter/transport и единственный gesture owner; legacy ref wrappers в
Page; контейнерные DOM/CSS consumers; virtualization viewport preservation;
полный behavioral/performance прогон. Ускорение production не заявляется.

## Продолжение 2026-10-23: контейнеры, resize и восстановление behavioral coverage

- Удалены Page-регистрации старых ref-обёрток размеров Table/Bento. В Page ширины
  и resize принадлежат явным items. BentoModalWrapper оставляет только общий modal;
  Edgeless продолжает использовать прежнюю ref-обёртку. Это убирает неиспользуемые
  per-block состояния/эффекты/чтения родителей на Page, не вводя новый ref protocol.
- BentoResizeController владеет pointer capture, preview и window listeners.
  Он создаётся layout effect владельца handles, получает только getBlockNode/updateBlock
  и отменяется при detach. Все ширины измеряются до записей; движение не измеряет DOM.
  Сохраняются и восстанавливаются только resize-owned inline declarations, включая
  !important; остальные live стили не перезаписываются. Добавлены Escape, blur,
  lost capture, rollback ошибки capture и чтение текущей ширины для повторных arrow keys.
- Columns layout явно задаёт flex-direction:row. До этого новый общий child host
  оставлял вертикальное направление: высоты колонок и разделителей расходились.
- Browser fixtures обновлены для Page rows и explicit Bento items. Virtualization
  fixtures теперь прокручивают окно реальным wheel до цели вместо scroll=6500,
  не меняют overscan и сохраняют прежние assertions selection/viewport/indent/delete.

Проверки:

- До Columns fix: 4 failed workers=12 и те же 4 failed workers=1.
  После: 14/14 Bento editing/modal + Columns + Markdown geometry; дополнительно
  4/4 Bento freeze/resize/Escape. Chromium/Firefox, workers=12.
- Hidden selection/viewport: 4/4 в Chromium/Firefox. Полная группа 100 блоков
  остаётся выбранной через виртуальные разрывы и участвует в indent/outdent/delete.
- Editing/keymap/Markdown/history/TODO: после обновления row selectors 66/66.
  Исходный прогон дал 36 passed / 30 failed. Serial retry начат до изменения
  selectors, но его поздние workers уже загрузили новые файлы: 28 passed / 2 failed;
  этот смешанный прогон нельзя выдавать за чистое сравнение baseline.
- Initial surface smoke теперь завершён: 32 failed / 2 passed и parallel, и serial.
  Его DnD и старые selectors ещё не закрыты целиком новыми focused suites.
- Unit resize + mounted containers + navigation: 12/12. Проверены 2 и 200 tiles:
  все чтения предшествуют writes, 20 pointer moves не добавляют чтений, cancellation
  не пишет модель, final release пишет последнюю ширину, capture rollback и live keys.
- React types и focused Bento lint проходят без предупреждений. Изолированная
  production-сборка после изменений: /tmp/rivto-page-bento-oop-demo, preview 5400.

После завершения чужих browser jobs выполнены последовательные production замеры
реального pointer resize: 1 прогрев + 3 равнозначных образца, tracing отсутствует,
ширина проверяется после commit и восстанавливается через model undo вне измерения.
Script: /tmp/bento-resize-benchmark.mjs. Before 5399, after 5400. Этот срез также
содержит исправление направления Columns: цифры не изолируют единственную строку кода.

| Метрика, median [min,max], ms | Chromium default before → after     | Chromium repeat=200 before → after  | Firefox default before → after | Firefox repeat=200 before → after |
| ----------------------------- | ----------------------------------- | ----------------------------------- | ------------------------------ | --------------------------------- |
| width reads, count            | 4 → 3                               | 4 → 3                               | 4 → 3                          | 4 → 3                             |
| суммарное время width reads   | .4 [.3,.4] → 0 [0,.1]               | 4.2 [4.1,4.3] → 0 [0,0]             | 0 [0,2] → 0 [0,0]              | 6 [6,6] → 0 [0,0]                 |
| sync updateBlock              | .6 [.6,.9] → .9 [.6,.9]             | 1.3 [.9,1.4] → 1.1 [1,1.7]          | 1 [1,1] → 1 [1,2]              | 1 [1,2] → 2 [2,2]                 |
| start, two-frame proxy        | 32.5 [32.4,32.6] → 32.6 [32.4,32.7] | 16.8 [16.4,17.6] → 23.5 [16.2,32.1] | 32 [31,32] → 32 [30,32]        | 18 [14,20] → 17 [15,29]           |
| move, two-frame proxy         | 16.8 [16.6,16.9] → 16.8 [16.6,17]   | 16.9 [16.8,19.3] → 16.9 [16.8,30.3] | 17 [16,18] → 17 [16,19]        | 19 [16,21] → 19 [16,20]           |
| commit, two-frame proxy       | 31.7 [31.6,31.9] → 31.6 [30.7,31.6] | 22.5 [22.1,22.9] → 20.7 [19.3,22.5] | 31 [31,31] → 32 [31,33]        | 29 [28,30] → 27 [27,29]           |

Нулевые duration означают «ниже точности таймера», не отсутствие работы.
Старт Chromium repeat=200 не улучшился; универсальное ускорение не заявляется.
Это resize-профиль, а не проверка DnD/холодной смены корней/большого Kanban.
Логи: /tmp/bento-resize-before-performance.log, /tmp/bento-resize-after-performance.log.

Отдельный ownership review: component effect → BentoResizeController → узкие block
commands → cancel/unmount; capture/window listeners; model writes только release/keys;
Page layout items против retained Edgeless wrappers. Следующий обязательный большой
срез: единый владелец Page selection/DnD и host transport, без старых Page drag wrappers,
с динамическим удалением features. Полная миграция остаётся незавершённой.

### 23 октября: production selection через классы Page (работа продолжается)

- `PageSelectionExtension` владеет установкой независимых text/block feature groups,
  подпиской на живые host keybindings и обратным cleanup. Панель владеет единственным
  `BlockSelectionExtensions`; JSX boundary только устанавливает расширение.
- Старые text/block selection listeners ограничены Edgeless. Page получает pointer,
  native selection, toggle/range и feedback через собственные классы. Model selection
  по-прежнему принадлежит панели; pending host caret restoration подавляет только
  `selectionchange`, но не захват caret перед `beforeinput`.
- Baseline 5400: 76/78 selection browser cases; два падения оформления родителя.
  Первое подключение Page selection 5401: 72/78; все шесть падений воспроизведены
  отдельно с workers=1. Исправлены очистка selection на пустом поле страницы и
  оформление выбранного поддерева. Именованный метод `onPlainPointerDown` сохраняет
  coverage у controls и исключает nested editors.
- Итоговая production сборка 5402: **78/78** `selection.spec.ts` и
  `structured-selection.spec.ts`, Chromium/Firefox, workers=12, включая repeat=200.
  Page Jest **132/132**, host adapter/feature Jest **6/6**, React check-types проходят.
  Focused Page ESLint: 0 errors, 2 предупреждения длины существующих методов.
- Проверен путь panel → feature coordinator → boundary registration → extension
  cleanup, включая rollback конфликтной регистрации и live key remapping.
  Обнаруженная прежняя попытка очищать keymap override после destroy заменена
  disposer регистрации; повторное уничтожение не требует mutation destroyed API.
- Пока НЕ закрыты: browser dynamic wrapper removal/remount, standalone browser
  regression, сравнительные performance-измерения нового selection, полный
  ownership review и production pointer DnD. `repeat=200` выше — behavioral проверка,
  не свидетельство ускорения. Общий goal остаётся активным.

### 23 октября: подготовлен host commit для нового pointer DnD

- `PageBlockDrag` реализует существующий `BlockDragAdapter`: проверяет panel access,
  живые правила `blockBehaviors`, циклы и точную adjacency после исключения sources;
  повторяет проверку при commit и вызывает единственную групповую core-команду.
  `parentId: null` переводится через настоящий root anchor, а не через старую
  семантику `moveBlocks(..., null)` (prepend в прежнем parent).
- После commit структурная selection берётся в порядке destination siblings;
  выбранные потомки выбранного предка не становятся отдельными destination roots.
  Адаптер не хранит собственную selection и не владеет DOM/listeners.
- Регрессионный тест выявил запрет `inside` в скрытый root ChildrenPanel. Core теперь
  использует существующую проверку insertion destination для inside; перемещение
  самого root, before/after относительно него и выход за boundary запрещены.
- Проверено: 3/3 host adapter tests и 36/36 core panel/group-command tests;
  React/Core check-types проходят. Focused host lint без errors (предупреждение
  длины resolve). Проверены caller → panel constraints → grouped command → history.
- Это ещё не установленный production gesture: следующие шаги — подключение
  Page extension/handle, реальные drop regions и глубина вставки, затем transport,
  preview/focus и удаление старых Page wrappers. Нельзя считать адаптер завершённым
  pointer DnD. Browser/performance проверка этого подключения ещё не выполнена.
- Известная стоимость: проверка соседей сейчас O(siblings), semantic hooks получают
  существующие cached recursive source snapshots; холодный snapshot большого
  поддерева может быть дорогим. Ускорение не заявляется без реальных измерений.

### 23 октября: подключён первый production pointer путь Page

- `registerPageDrag` теперь ставит старый provider/wrapper только в Edgeless.
  Page получает `PageDragBoundary` → `BlockDragExtension` → `PageBlockDrag`;
  extension cleanup принадлежит boundary, Page controller остаётся у панели.
- `BlockOutlineDropTargets` в Page использует native hit test, адресную hierarchy и
  row rectangle. Явные container regions имеют приоритет. Исключены nested
  occurrences и переносимые поддеревья; соседние IDs берутся из реального parent.
  Параметры activationDistance, childDropIndent, allowChildPlacement переданы из host.
- Handle отмечен для Page pointer runtime; CSS поддерживает новые row/slot names,
  контекст optional extension сообщает draggable presentation. Активированный drag
  подавляет последующий click, release восстанавливает focus на существующем root.
- Свежая production сборка 5404: **82/82** browser cases (новые pointer commit/undo,
  Escape плюс selection/structured-selection), Chromium/Firefox, workers=12.
  Page Jest **133/133**, host drag/handle **4/4**, Page build и React types проходят.
  Focused lint: 0 errors, предупреждения длины методов/компонента.
- НЕ считать это полным DnD: автоматические grid/container regions ещё не перенесены;
  root whitespace сейчас поддерживает только начало/конец, горизонтальный outdent
  и точные промежуточные gaps ещё нужно реализовать. gapDropZone/outerEdgeDropZone
  пока не применяются новым resolver. Cross-panel/document transport, bounded
  содержательное preview (сейчас count), полный cancel/focus lifecycle review,
  динамическое удаление/remount и real performance default/repeat=200 остаются.
- Следующее действие: довести Page geometry/контейнерные цели и transport, обновить
  существующие DnD browser fixtures под новый DOM без ослабления assertions; затем
  проверить полный behavioral/performance набор. Baseline 5402 — до нового DnD,
  5403 — первый новый путь, 5404 — финальная проверенная сборка текущего среза.

### 23 октября: промежуточные outline gaps, глубина и профиль DOM

- `BlockOutlineDropTargets` разделён на именованные методы для row, sibling gap,
  mounted list, trailing descendant и constrained depth. Выход наружу разрешён
  только через последний неподвижный элемент каждого ancestor list; hidden panel
  root не превращается во внешний anchor. Нижний gap раскрытого parent начинает
  его child list. `gapDropZone` теперь передаётся и применяется к краям row.
- Root/child whitespace ищет ближайший mounted sibling бинарно по Y и следует
  только trailing visible chain. Никакого recursive model forest для геометрии.
  Для 4 и 200 sibling fixtures проверено не более ceil(log2(N))+2 rectangle reads.
- Регрессия промежуточного root gap: на baseline 5404 падали оба браузера с
  workers=12 и затем workers=1 (блок оставался в конце вместо нужного gap).
  На финальной 5406 — **12/12** pointer browser cases, включая undo/Escape и три
  глубины. Три depth cases проходили также на baseline; это не новые reproductions.
  Page Jest **136/136**, build и React types проходят; lint 0 errors/2 length warnings.
- Отдельный профиль на 5405 выявил 4–5 root querySelectorAll за жест:
  Chromium ~8.7–8.8 ms, Firefox 20–25 ms. Direct-child CSS selector всё равно был
  дорог на больших descendant trees. Заменён обходом `list.children`; unit fixture
  запрещает subtree query и сохраняет ограничение rectangle reads. Сборка 5406.

Production real-input замеры: один browser последовательно, без tracing и других
наблюдаемых test/build процессов, defaults и repeat=200; 1 warm + 3 одинаковых
move/undo samples. Fixture/demo/виртуализация не изменялись. В каждом sample проверены
реальный root reorder и ровно одна grouped command; undo вне измерения. Ниже baseline
5404 → final 5406, ms, median[min,max]. Event sync — window capture → window bubble;
frames — native event → два RAF, не полное async settling. Move включает все 6 событий
каждого жеста. Command включает synchronous subscribers.

| Browser/size     | Down sync           | Down frames                   | Move sync               | Move frames                      | Up sync                       | Command                   | Up frames                           |
| ---------------- | ------------------- | ----------------------------- | ----------------------- | -------------------------------- | ----------------------------- | ------------------------- | ----------------------------------- |
| Chromium default | .1[0,.1]→.2[.2,.2]  | 32.2[32,32.5]→32.2[31.6,32.4] | .4[.1,1.5]→.3[0,1.8]    | 16.8[16.5,17.8]→16.9[16.4,17.7]  | 2.4[2.1,2.5]→2.6[2.4,3.1]     | .9[.9,1]→1[1,1.1]         | 32.1[32,32.3]→32[31.7,32.1]         |
| Chromium 200     | .2[.1,.2]→.2[.2,.2] | 81.2[81.1,87.2]→6[5.4,84.8]   | 11.1[.3,58]→11.8[.3,57] | 24.2[12.8,105.6]→25.6[12.4,84.3] | 22.4[21.2,24.9]→23[22.2,25.4] | 2.9[2.9,3.5]→2.9[2.8,3.6] | 114.2[113,121.2]→113.6[112.4,118.8] |
| Firefox default  | 0[0,1]→0[0,0]       | 32[32,33]→31[31,32]           | 0[0,1]→0[0,1]           | 17[16,18]→17[16,18]              | 4[2,5]→4[3,5]                 | 1[0,2]→2[1,2]             | 30[30,32]→32[31,32]                 |
| Firefox 200      | 0[0,0]→0[0,0]       | 33[30,35]→20[19,21]           | 1[0,4]→2[0,4]           | 23[12,182]→19[16,167]            | 28[27,28]→28[27,30]           | 11[10,11]→10[10,11]       | 162[161,177]→162[160,177]           |

Промежуточная 5405 имела Firefox move sync 5[0,7] ms; устранение subtree queries
снизило это до 2[0,4], но **общего ускорения относительно 5404 не доказано**.
Большие post-commit frames ~114/162 ms остаются; Chromium down сильно вариативен.
Cold roots и большие поддеревья/Kanban этим warm pointer профилем не закрыты.
Логи /tmp/page-depth-perf-{before,after,fast}.log, профиль /tmp/page-depth-dom-profile.log.

Следующий срез: явные geometry targets для контейнерных layouts, outerEdgeDropZone,
настоящий line indicator и transport между occurrences/documents. Новый outline
resolver нельзя применять как вертикальную геометрию grid-body без этих targets.
Полная миграция и performance acceptance пока не завершены.

### 23 октября: пустые container targets и Bento boundaries (есть perf regression)

- `BlockChildren.emptyDropTarget` регистрирует существующий пустой expanded host
  как inside destination, без дополнительного DOM. Использован в Kanban, Bento,
  Table и Columns; пустая Columns lane использует существующий row. Target cleanup
  при появлении/удалении children проверен mounted-тестом.
- BentoTileItem теперь использует Page `BlockDropWrapper`, сохраняя один BlockItem,
  реальную block identity, ширину и resize controller. Четыре boundary regions
  задают before/after, не превращаясь в дополнительные grid cells родителя.
- `dropTargets.resolve` принимает optional excluded source roots: проверяет исходную
  adjacency, затем нормализует соседей без переносимой группы. Stale gap не становится
  допустимым из-за фильтрации. Outline resolver передаёт тот же captured set.
- Browser обнаружил перекрытие handle левым resize strip: 18/20 passed, Bento drag
  failed в обоих браузерах; workers=1 повторил оба падения. Native elementFromPoint
  подтвердил resize separator в центре handle. Поднят только slot handle над strip,
  без изменения hitbox/padding. Final 5408: **28/28** pointer/container/resize/editing
  cases (Chromium/Firefox, workers=12), включая затронутое Edgeless Bento editing.
- Page Jest **137/137**, host mounted container **3/3**, Page build, React types проходят.
  Focused lint 0 errors, 3 existing Table length warnings. Creation→registration→ref
  disposal review: layout владеет target region, Page registry — attachment identity,
  host adapter — policy/commit; дублирующего subtree renderer или model store нет.

Performance: production 5406 baseline → 5408 final, serial browsers, tracing off,
1 warm + 3 real pointer samples, default/repeat=200, demo layout/virtualization не
изменены. Проверены реальный reorder/one command/undo и resize commit. Для DnD
использован тот же row-edge target в обеих сборках (новых strip regions в baseline
нет); новые strips отдельно проверены behavior тестом. Command — sync subscribers;
frames — native input→2RAF proxy. ms median[min,max].

| Bento DnD        | Down frames                     | Move sync                  | Move frames                     | Command                 | Up sync                         | Up frames                           |
| ---------------- | ------------------------------- | -------------------------- | ------------------------------- | ----------------------- | ------------------------------- | ----------------------------------- |
| Chromium default | 32.5[32.2,32.6]→32.1[32.1,32.2] | .2[.1,1.4]→.3[0,1.9]       | 16.9[16.6,17.6]→16.8[16.6,17.7] | 1.1[1.1,1.1]→1.1[1,1.2] | 2.1[2,2.1]→2.1[1.9,2.1]         | 31.9[31.9,32.3]→31.9[31.5,31.9]     |
| Chromium 200     | 52.9[5.2,63.1]→95.9[76.8,97.7]  | 10.5[.1,45.3]→9.9[.1,53.7] | 26.6[12.4,53.2]→25.8[11.5,79.1] | 2.1[2,2.7]→2.1[2.1,2.6] | 15.4[15.3,15.7]→15.6[14.6,18.6] | 122.1[120.8,164.2]→125[122.9,127.1] |
| Firefox default  | 31[31,31]→32[31,33]             | 0[0,2]→0[0,2]              | 17[16,19]→17[16,19]             | 2[1,2]→2[1,3]           | 4[3,4]→4[3,5]                   | 31[31,32]→31[31,33]                 |
| Firefox 200      | 23[21,23]→20[20,26]             | 0[0,5]→1[0,3]              | 18[16,27]→18[16,24]             | 9[9,10]→9[9,9]          | 16[15,16]→15[14,16]             | 27[27,27]→27[26,29]                 |

Down sync не выше .3 ms Chromium / 1 ms Firefox. **Chromium 200 start regression
подтверждена второй парной проверкой:** 49.5[13.1,50.1]→100.4[.6,102.7] ms;
up frames 129.7[123.6,139.3]→125.6[123.8,129]. Нельзя считать slice perf-accepted.
Следующее обязательное действие — профиль затрат нового Bento DOM/границ и
устранение задержки начала жеста, без удаления целевых областей и ослабления тестов.

Resize сохраняет 3 geometry reads только на старте (read time ниже точности таймера).
Chromium 200: command1.1[.9,1.4]→1[.9,2], start29.1[27.4,32.5]→27.2[26.8,33.1],
move16.9[16.8,30.1]→16.9[16.8,23], commit23.3[20.6,24.6]→19[18.5,21.4].
Firefox200: command1[1,2]→2[2,3], start14[13,22]→16[15,26], move19[16,21]→19[16,21],
commit28[26,28]→28[27,30]. Default resize frames ~31–33 start/commit, ~17 move в обеих.
Логи /tmp/page-container-{pointer,resize}-perf-{before,after}.log и
/tmp/page-container-pointer-recheck-{before,after}.log; startup/cold roots не измерены.

Остальной scope активен: populated Kanban/Columns/Table targets, outerEdgeDropZone,
line feedback, cross-occurrence/document transport, preview/focus lifecycle,
дальнейшие compatibility/behavior/performance проверки. Нет заявления о готовности.

### 23 октября: устранение повторных native hit tests в pointer DnD

- `BlockDropTargets.resolveHit` принимает текущий native hit и сохраняет проверки
  occurrence, attachment, live hierarchy и приоритетов. `resolve` остаётся входом
  для координат. Outline resolver использует один hit для явных targets и fallback.
  Это не geometry cache: элемент не сохраняется между событиями.
- `BlockDragController` передаёт uncaptured native target движения. При pointer
  capture, release и после автоскролла выполняется свежий geometric hit test.
  Scroll preflight и разрешение destination предшествуют вставке preview/feedback;
  начальная вставка preview больше не инвалидирует hit-test данные до чтения.
- `BlockAutoScroll` остаётся отдельной сессией класса для каждого владельца.
  Текущий native target позволяет не назначать RAF, если ни ближайшие containers,
  ни page не могут прокрутиться. Активный RAF заново читает native geometry;
  nested scrolling, exhausted edges и stop сохраняются. Selection без supplied hit
  использует прежний путь. Нового глобального состояния или второго менеджера нет.
- Профиль 5408/5409 показал дорогой `elementFromPoint`: первый вызов до 51 ms,
  последующие ~9–10 ms; idle autoscroll добавлял ещё ~8–10 ms. Эти замеры диагностические,
  с инструментированием; итоговое сравнение ниже снято без profiler/tracing.
- Page Jest **139/139**, production browser **36/36** (workers=12, Chromium/Firefox),
  включая реальные pointer capture, nested autoscroll, Escape, undo, Bento resize
  и затронутое Edgeless editing. Page/React types и production builds проходят.
  Focused lint: 0 errors, 6 function-length warnings, включая тестовые callbacks.
- API review отдельно от тестов: outline заимствует только `resolveHit` у registry;
  drag controller владеет gesture/preview/autoscroll и освобождает их при ошибке,
  cancel, detach и finish. Host по-прежнему единственный владелец model policy/commit.
  Optional native hit передаётся непосредственно, без фасада, кэша или нового listener.

Production 5408 → 5413, serial browsers, defaults/repeat=200, один warm и три
эквивалентных move/undo samples. Во всех samples проверены reorder и ровно одна
команда; undo вне измерения. Event sync — capture→bubble; frames — event→2RAF,
не изолированное время pointerdown и не полное async settling. ms median[min,max].

| Bento DnD        | Down frames                      | Move sync                | Move frames                     | Command                   | Up sync                       | Up frames                           |
| ---------------- | -------------------------------- | ------------------------ | ------------------------------- | ------------------------- | ----------------------------- | ----------------------------------- |
| Chromium default | 32.1[32,32.9]→32.5[32.5,32.8]    | .3[.1,1.4]→.2[0,.6]      | 16.8[16.5,18.3]→17[16.5,17.7]   | 1.1[.9,1.5]→1.2[1.2,1.4]  | 2.2[2,2.8]→2.2[2.2,2.5]       | 32[32,32.1]→32[32,32.4]             |
| Chromium 200     | 95.7[93.4,108.4]→81.6[78.4,91.1] | 10.4[.1,53.9]→.2[.1,1.5] | 27.6[12.1,80.3]→26.5[7.5,102.8] | 2.2[2.1,2.6]→2.5[2.5,3.1] | 15.2[15,15.4]→15.3[14.6,15.3] | 125.6[124,126.4]→123.9[123.9,123.9] |
| Firefox default  | 31[31,31]→31[30,32]              | 0[0,1]→0[0,1]            | 17[15,18]→17[15,19]             | 1[1,1]→2[2,2]             | 3[3,3]→3[3,3]                 | 31[31,32]→31[30,31]                 |
| Firefox 200      | 19[18,29]→18[17,19]              | 1[0,3]→0[0,1]            | 18[15,27]→18[16,26]             | 8[8,9]→9[8,10]            | 15[15,16]→16[16,17]           | 28[27,29]→28[27,28]                 |

Первый полный замер остановился на Firefox correctness assertion: target оказался
ниже viewport (y=853 при высоте720), pointerup отсутствовал. Временный стенд исправлен:
оба endpoint прокручиваются в viewport до замера и координаты считываются заново.
И baseline, и final повторно измерены с этой проверкой, без ослабления reorder assertion.
Логи `/tmp/page-native-visible-{before,after}.log`; первоначальная ошибка и диагностика
в `/tmp/page-native-order-{full-perf,firefox-diagnostic}.log`.

**Остаточная регрессия старта Chromium200 не устранена:** ~82 ms всё ещё больше
ранее измеренных ~50 ms на 5406 до добавления Bento boundary DOM. Ускорение sync move
не означает устранения общего frame cost. Cold roots, большие поддеревья и Kanban
Firefox остаются отдельной незакрытой проверкой; весь goal остаётся активным.

Дополнительная проверка той же runtime версии: standalone production 5414,
**88/88** behavioral cases Chromium/Firefox, workers=12, включая dynamic wrappers,
remount, selection, virtualization и drop regions. Лог
`/tmp/page-native-standalone-behavior.log`. Это подтверждает standalone совместимость;
production cross-panel transport и остальные перечисленные выше области не закрывает.

### 23 октября: канонические горизонтальные gaps Kanban и Columns

- Board layouts используют общий JSX `HorizontalDropGap`, который задаёт только ось
  существующему Page `BlockDropGap`. `BlockList` по-прежнему единственный владелец
  child iteration, канонических соседей, key identity и collapse unmount. Новых
  менеджеров, listeners, DOM-derived parent IDs или повторного renderer не добавлено.
- Kanban board и lane получили разные layouts: горизонтальные gaps принадлежат board,
  обычные вертикальные cards — lane. Восстановлено явное `flex-direction: row`:
  Page child host задаёт column, поэтому прежнее implicit flex default не работало.
- CSS-only промежутки заменены реальными regions шириной 16px Kanban / 24px Columns,
  включая leading/trailing destinations. Толщина задана на gap wrapper, не на board,
  чтобы она не наследовалась во вложенные Bento/другие layouts. Divider Columns
  учитывает промежуточный DOM-free gap span; legacy Edgeless selectors сохранены.
- В Kanban flex больше не складывает прежние card/button margins с Page gap:
  расстоянием владеет один gap=10px. Исходная browser assertion 10px сохранена.
- Baseline 5413: оба новых lane reorder cases падали в обоих браузерах (4 failures
  workers=12 и те же 4 workers=1), порядок оставался прежним. После gap regions
  Columns проходил, Kanban выявил неверное vertical layout. После исправления
  Firefox дополнительно выявил clipping: hover крайней lane прокручивал board так,
  что target был вне видимой области. Стенд открывает gap до чтения координат.
- Обновлены старые DOM selectors в проверках add-card/collapse/synced add-column.
  Положение empty add-card проверяется внутри retained Page child host. Columns
  проверяет отсутствие ширины start controls и совпадение handles; row inset теперь
  учитывает Page-owned padding/gap, поскольку legacy padding жил на outer shell.
  Фактическая разница 24px вместо 10px у Kanban воспроизведена serial и исправлена.
- Final production 5417: **26/26** focused cases Chromium/Firefox, workers=12:
  lane reorder + undo, пустые targets, Bento inline boundary, divider geometry
  включая Edgeless, безопасное удаление lane, empty writing control, hover handles,
  collapse/add-card order и synced add-column. Промежуточные 8 failures и затем
  4 geometry failures повторены workers=1, не списаны на параллельность.
  Логи `/tmp/page-lane-{before,before-serial,final,failed-serial,markers-serial,
complete,geometry-serial,spacing}.log`.

Отдельный ownership review: host extensions регистрируют конкретные layouts;
Page монтирует/удаляет gap registrations с детьми; registry владеет attachment
identity и проверкой живой adjacency; PageBlockDrag/Core сохраняют semantic preflight
и один transactional commit. Контролы остаются в существующих occurrence-local
portal hosts. Новый helper — только JSX, без stateful функций и лишних фасадов.

Performance: production defaults и repeat=200, без виртуализации, browsers serial,
tracing off, 1 warm + 3 equivalent pointer/undo samples. В каждом sample проверены
порядок и ровно одна grouped command. Command включает synchronous subscribers;
frames — native input→2RAF proxy, не полное async settling; move — все 6 событий.

| Kanban lane reorder, final 5417 | Down frames     | Move sync  | Move frames   | Command      | Up sync       | Up frames       |
| ------------------------------- | --------------- | ---------- | ------------- | ------------ | ------------- | --------------- |
| Chromium default                | 31.7[31,32.2]   | .3[.1,.7]  | 17[16.6,17.4] | 1.1[1,1.1]   | 2.1[2,2.4]    | 31.1[30.3,31.3] |
| Chromium 200                    | 15.1[12.2,28.3] | .4[.1,1.3] | 8.3[7.4,79.2] | 2.2[2.1,2.7] | 15.2[15.1,16] | 96.6[94.2,99.2] |
| Firefox default                 | 31[31,32]       | 0[0,1]     | 17[16,18]     | 2[1,2]       | 4[4,4]        | 31[31,32]       |
| Firefox 200                     | 29[29,30]       | 0[0,1]     | 18[16,35]     | 9[8,9]       | 16[15,16]     | 44[44,44]       |

Новый lane-gap перенос не имел успешного baseline, поэтому эти значения не называются
ускорением. Для проверки влияния добавленного DOM отдельно повторён рабочий Bento
row-edge перенос в том же полном demo, 5413 → 5417, ms median[min,max]:

| Bento            | Down frames                     | Move sync             | Move frames                     | Command                   | Up frames                           |
| ---------------- | ------------------------------- | --------------------- | ------------------------------- | ------------------------- | ----------------------------------- |
| Chromium default | 31.9[31.8,31.9]→31.9[31.1,32.1] | .2[0,.6]→.2[0,.6]     | 16.8[16.5,17.6]→16.9[16.5,17.5] | 1.2[1.1,1.2]→1.2[1.2,1.4] | 32.4[32,32.4]→32.2[32,32.2]         |
| Chromium 200     | 76.2[.9,85.5]→77.1[76.4,82.4]   | .2[.1,1.7]→.2[.1,1.5] | 10.7[3.9,102.3]→26.4[3.3,104.6] | 2.2[2,2.8]→2.2[2.1,2.8]   | 124.6[124,133.5]→119.8[118.9,120.8] |
| Firefox default  | 31[31,31]→32[30,32]             | 0[0,1]→0[0,1]         | 17[16,18]→17[15,18]             | 2[1,2]→1[1,2]             | 31[31,31]→31[31,32]                 |
| Firefox 200      | 27[27,28]→27[25,28]             | 0[0,1]→0[0,2]         | 17[16,25]→18[16,29]             | 9[9,10]→10[9,11]          | 27[26,28]→29[27,30]                 |

Первый Bento Firefox sample не двигал блок: предварительная прокрутка убрала hover
с handle, и native hit попал в resize strip (диагностика содержит resize, не DnD).
Стенд снова наводит на source row после прокрутки и до pointerdown проверяет native
hit handle. Оба сравниваемых build повторены с одинаковым исправленным стендом.
Первый Kanban probe также исправлен: handle выбирается только в direct source row,
а не среди descendant cards. Неуспешные samples не использованы как timing evidence.
Логи `/tmp/page-lane-performance-final.log`, `/tmp/page-lane-bento-visible-{before,after}.log`,
диагностика `/tmp/page-lane-bento-diagnostic.log`.

Рост Chromium move frame median при широком диапазоне не доказывает улучшения общей
отрисовки. Старый Bento start regression относительно 5406, cold roots и большой
Kanban Firefox baseline 85.5→113 ms остаются открыты. Populated lane-body/card
regions, Table, transport, line feedback, bounded preview и полная приёмка goal
этим срезом не завершены.

Финальные статические/локальные проверки: React `check-types`, production demo build,
focused host Jest **6/6** (mounted containers + PageBlockDrag), focused lint 0 errors /
7 function-length warnings. Публичные package exports и model schema в этом срезе
не менялись. Полный workspace lint/build и остальные браузерные suites не запускались.

### 23 октября: горизонтальные destinations Table и доступность cell handle

- `TableRowLayout` переиспользует `HorizontalDropGap`: destinations задаются реальными
  parent/neighbors из Page iterator. Gap не является cell и не участвует в командах
  индексов/ширины колонок. Existing TableCellItem сохраняет width и resize preview.
  Border adjacency обновлена с учётом DOM-free gap span.
- Existing правило размещения table controls внутри ячейки распространено на Page
  DOM. До этого native hit в центре cell handle попадал в кнопку Add table column
  соседней ячейки. Это подтверждено `/tmp/page-table-probe.log`; baseline 5417 новый
  browser test падал на отсутствии drag preview в обоих браузерах workers=12 и затем
  workers=1. Этот baseline воспроизводит именно перекрытие handle, а не отдельно
  отсутствие canonical horizontal gaps.
- Final 5418: **14/14** container pointer browser cases workers=12 Chromium/Firefox.
  Новый Table case проверяет reorder, undo, настоящий pointer resize 180→200px,
  undo ширины и Add column/undo. Соседние Bento/Kanban/Columns cases сохранены.
  Логи `/tmp/page-table-{before,before-serial,final,controls}.log`.
- Read-only geometry probe 5417→5418: headerHeight28→28, rowHeight76→76,
  cellsHeight48→48. Перенос controls не добавил пустую служебную строку.
- Production build, React types, focused Jest **6/6**, lint 0 errors/4 length warnings.
  Ownership: Page владеет итерацией и registration cleanup; Table — cell width и
  конкретными controls; drag adapter/Core — permission и commit. Нет нового model
  cache, независимого drag path, DOM hierarchy или public API option.

Performance: defaults/repeat=200, unchanged demo settings, production, serial
Chromium/Firefox, tracing off, 1 warm+3 equivalent move/undo samples. Native pointer,
actual reorder и одна grouped command обязательны в каждом sample. Перед pointerdown
проверен native hit handle. ms median[min,max]; frames — input→2RAF proxy.

| Table cell reorder final5418 | Down frames     | Move sync | Move frames    | Command    | Up sync         | Up frames       |
| ---------------------------- | --------------- | --------- | -------------- | ---------- | --------------- | --------------- |
| Chromium default             | 31.9[31.8,32.3] | .2[0,.6]  | 17.2[16,17.7]  | 1[1,1]     | 2[1.8,2]        | 31.4[31.3,31.7] |
| Chromium200                  | 31.2[16,98]     | .2[0,1.7] | 22.8[3.1,83.3] | 2.2[2,2.5] | 16.4[16.2,17.2] | 94.7[94.4,95.5] |
| Firefox default              | 30[30,31]       | 0[0,1]    | 17[16,20]      | 1[0,2]     | 3[2,3]          | 32[30,32]       |
| Firefox200                   | 26[26,26]       | 0[0,1]    | 19[16,29]      | 10[9,10]   | 17[16,17]       | 27[26,29]       |

Новый путь не имел успешного baseline; таблица не является доказательством ускорения.
Для стоимости дополнительного DOM повторён существующий Bento gesture 5417→5418:

| Bento            | Down frames                      | Move sync             | Move frames                     | Command                   | Up frames                           |
| ---------------- | -------------------------------- | --------------------- | ------------------------------- | ------------------------- | ----------------------------------- |
| Chromium default | 32[31.6,32.1]→31.8[31.7,32.2]    | .2[.1,.6]→.2[0,.7]    | 16.8[16.5,17.7]→16.8[16.5,17.4] | 1.1[1,1.1]→1[1,1.2]       | 31.9[31.9,32.2]→32.2[31.8,32.4]     |
| Chromium200      | 80.7[80.4,80.9]→80.3[73.7,105.3] | .2[.1,1.7]→.2[.1,1.5] | 26.6[3.1,103.6]→26.9[7.4,108.2] | 2.1[2.1,2.7]→2.4[2.2,2.8] | 122.2[119.6,123.4]→122[121.3,131.7] |
| Firefox default  | 31[31,32]→31[30,31]              | 0[0,1]→0[0,1]         | 17[15,18]→17[16,18]             | 1[1,2]→1[1,2]             | 31[31,32]→32[32,32]                 |
| Firefox200       | 25[13,28]→23[20,25]              | 0[0,1]→0[0,1]         | 18[16,29]→18[16,25]             | 11[10,11]→8[8,9]          | 28[28,29]→27[26,27]                 |

Логи `/tmp/page-table-performance.log`, `/tmp/page-table-bento-{before,after}.log`.
Большой Chromium frame cost не устранён. Cold roots и полный старый Firefox Kanban
benchmark не закрыты. Existing TableCell resize callbacks ещё stateful React code:
нужны явный controller/session ownership и lifecycle проверки, как у Bento. Остальной
scope goal (transport, line feedback, preview, полный behavior/performance audit)
сохраняется; завершение миграции не заявляется.

### Table resize: явный OOP owner и один поиск DOM за жест

Stateful callbacks TableCell перенесены в `TableResizeController`. Компонент создаёт
его в layout effect, передаёт native events и отменяет при смене occurrence/unmount.
Контроллер владеет capture, preview и временными Escape/blur listeners; idle listeners,
RAF и timers отсутствуют. Существующий `setTableColumnWidth` и его публичные exports
сохранены; чистые преобразования ширины вынесены без нового command facade.

Отдельно проверена цепочка создания → передачи → использования → cleanup: owner
хранит одну ссылку panel с узкими `getBlockNode/getParentId/updateBlocks`, не уничтожает
заимствованную модель. Pointer требует подключённый root, keyboard command работает
и до attachment. Поиск placements изолирован от вложенных occurrences. Selection
сохраняется через editorControlProps; separator получает focus для history/keyboard.

До commit повторно проверяются table/index и состав столбца. Отмена восстанавливает
исходную inline declaration с priority, а при изменившейся модели — актуальную ширину.
Cleanup пытается освободить все ресурсы и агрегирует ошибки. Commit теперь предшествует
cleanup: устранена промежуточная запись старой ширины. Focus вызывается после установки
listeners: синхронная отмена из focus listener больше не оставляет Escape listener.
Оба дефекта воспроизведены regression tests до исправления.

Проверки final runtime 5422:

- Jest **16/16** (controller, commands, mounted containers): один поиск при 2/200 rows,
  отсутствие model/DOM reads на movement, release coordinate, один undo/redo,
  stale membership, nested occurrence, чужой pointer, detached root, Escape/blur,
  capture failure, model failure, cleanup errors и reentrant focus cancellation.
- Production Chromium/Firefox **22/22**, workers=12: контейнеры и Table resize в Page
  и Edgeless, Escape, selection, undo, keyboard, detach и следующий жест.
- Baseline 5418 Escape падал в обоих браузерах workers=12 и workers=1. Промежуточный
  вариант без focus давал 4/8 failures, повторённые workers=1; final исправлен.
- React types, package build/DTS/styles, production demo build и форматирование прошли.
  Focused lint: 0 errors, 4 function-length warnings. После последней правки только
  props type/JSDoc повторены types/lint/format. Полные workspace suites не запускались.

Performance: production 5418→5422, defaults/repeat=200, serial, tracing off,
1 warm+3 equivalent native pointer/undo samples. ms median[min,max]; frames —
событие→2RAF proxy. Поиск block placements: **24→1** вызов за измеряемый жест.

| Table resize     | DOM query time           | Command                   | Start frames                    | Move frames                   | Release frames                  |
| ---------------- | ------------------------ | ------------------------- | ------------------------------- | ----------------------------- | ------------------------------- |
| Chromium default | .6[.3,.7]→0[0,.1]        | 1.1[1,1.3]→.9[.8,1.1]     | 31.3[30.9,31.9]→31.5[31.4,31.5] | 16.9[16.7,17.2]→16.8[16.5,17] | 31[30.7,31.4]→31.4[30.9,31.6]   |
| Chromium200      | 29.4[28.4,29.5]→2[2,2.1] | 1.1[1.1,1.2]→1.2[1.2,1.2] | 25.7[20.9,31.9]→29.2[20.8,29.9] | 19.8[18.6,21]→17[16.6,30.5]   | 29.5[29.1,29.5]→21.5[21.3,21.7] |
| Firefox default  | 0[0,1]→0[0,0]            | 1[1,1]→2[1,2]             | 31[30,31]→30[30,31]             | 18[16,19]→18[15,19]           | 31[29,32]→31[30,31]             |
| Firefox200       | 11[8,12]→1[1,2]          | 2[2,2]→3[3,3]             | 12[11,19]→17[9,25]              | 23[16,26]→20[16,22]           | 22[21,24]→27[27,29]             |

Ускорение всего жеста Firefox НЕ доказано: ухудшение release proxy повторилось
в дополнительной паре замеров. Диагностический Firefox200 baseline→final:
up sync 5[4,5]→4[4,5]ms, полный измеряемый жест 190[187,191]→199[191,200]ms,
release frames 23[22,24]→26[26,26]ms. Полный интервал включает тестовую паузу
2RAF после down и реальные pointer steps. Причина различия пока не изолирована;
объяснять его исключительно фазой кадра оснований нет. Baseline не фокусировал
separator, final фокусирует для работающего undo; это также не изолировано.

На старте остаётся O(N) native enumeration смонтированного root и O(R) чтение
столбца; движение пишет O(R) captured placements, commit обновляет O(R) ячеек.
Cold roots, большие Bento/Firefox Kanban и прочий scope goal остаются открытыми.
Миграция целиком не завершена.

Evidence: `/tmp/table-resize-cleanup-{unit,browser,types,lint,package-build,build}.log`,
`/tmp/table-resize-review-{types,lint,format}.log`,
`/tmp/table-resize-{focus-reentry,stale-style}-before.log`,
`/tmp/table-resize-performance-{before,final}.log`,
`/tmp/table-resize-firefox-phases-{before,final}.log`.

### Pointer DnD: ошибки активации и независимый cleanup

Проверка пути feedback выявила две lifecycle-регрессии до добавления линии вставки:
ошибка чтения selection при активации оставляла pointer ownership занятым; ошибка
removeAttribute target прерывала удаление preview и скрывала исходную ошибку commit.
Обе воспроизведены unit tests до исправления (2 failed/2 passed).

BlockDragController теперь включает чтение sources в защищённый activation path,
пытается остановить autoscroll, освободить pointer, убрать target и preview независимо.
Gesture очищается до вызовов cleanup. Ошибка обработки сохраняется; одновременные
ошибки cleanup/focus возвращаются вместе через AggregateError. Focus restoration
после release также выполняется при ошибке очистки. Не добавлены новые managers,
facades, публичные параметры или зависимости. Review creation→use→destruction:
extension по-прежнему создаёт один runtime, который заимствует узкий host, владеет
сессией и отменяется при detach/dispose; модель и её команды не менялись.

Final: **141/141** Page Jest tests (20 suites), **32/32** production browser cases
Chromium/Firefox workers=12 (page-pointer-drag + page-container-pointer), Page types,
package build/DTS/styles, production demo build и форматирование прошли. Focused lint:
0 errors, 1 existing function-length warning в тесте. Проверки полной workspace,
transport и line feedback этим этапом не заменяются.

Performance: immutable production 5422→5423, обычный demo/repeat=200, serial,
tracing off, 1 warm+3 native Bento move/undo samples. Каждый sample проверяет реальный
порядок и ровно одну grouped command. ms median[min,max], frames — input→2RAF proxy.

| Bento            | Command                 | Down frames                    | Move sync                 | Move frames                     | Up sync                       | Up frames                             |
| ---------------- | ----------------------- | ------------------------------ | ------------------------- | ------------------------------- | ----------------------------- | ------------------------------------- |
| chromium default | 1.1[1,1.1]→1.1[1.1,1.2] | 31.7[31.5,31.9]→32[31.8,32]    | 0.2[0.1,0.6]→0.2[0,0.6]   | 16.9[16.5,17.9]→16.9[16.4,17.6] | 2.1[2,2.2]→2.1[2.1,2.2]       | 32.2[32,32.4]→32.4[32,32.5]           |
| chromium 200     | 2.3[2.2,2.8]→2.2[2,2.9] | 79.6[77.5,91.8]→83.2[75,108.6] | 0.2[0.2,1.6]→0.3[0.1,2.9] | 24.5[6.4,101.1]→18.9[3.6,108.3] | 14.4[13,14.5]→13.9[13.3,15.7] | 119.9[112.5,120.4]→121.6[117.5,128.3] |
| firefox default  | 2[1,2]→1[1,2]           | 31[30,32]→31[30,31]            | 0[0,1]→0[0,1]             | 17[16,19]→17[15,18]             | 3[3,4]→2[2,3]                 | 31[30,33]→31[30,31]                   |
| firefox 200      | 10[9,10]→10[8,11]       | 26[26,28]→26[26,28]            | 0[0,1]→0[0,1]             | 18[16,27]→18[16,28]             | 16[15,17]→16[16,17]           | 28[27,30]→28[27,29]                   |

Ускорение не заявляется. Большой Chromium start/release остаётся дорогим;
диапазоны этой небольшой выборки не доказывают устранение прежней регрессии.
Firefox200 command/release медианы здесь совпали. Cold roots и полный Kanban
benchmark не повторялись. Линия вставки, transport, bounded content preview и остальные
открытые требования goal сохраняются.

Evidence: `/tmp/page-drag-cleanup-{before,after,units,types,final-types,lint,format}.log`,
`/tmp/page-drag-cleanup-{build,demo-build,browser}.log`,
`/tmp/page-drag-cleanup-performance-{before,after}.log`.

### Линия вставки Page DnD: outline и реальные container gaps

ResolvedBlockDropTarget теперь содержит optional BlockDropIndicator — прямоугольник
линии в viewport CSS pixels, действительный только для текущего resolution.
BlockDropTargetRegistration/BlockDropTarget получили indicatorAxis с двумя реальными
потребителями: BlockDropGap и BlockDropWrapperBoundary. Axis описывает ориентацию
линии, не направление flow. Без axis custom regions сохраняют outline feedback;
inside targets также сохраняют outline. Каноническая destination не выводится из CSS.

Outline resolver повторно использует уже измеренный row rect. Верхняя/нижняя граница
отличаются; left endpoint следует разрешённой глубине, включая ограниченный outdent
и вставку в начало children. Дополнительных DOM measurements или subtree reads для
этой линии нет; outdent читает только актуальную цепочку parent IDs. Явные контейнерные
regions измеряют только winning target, один rect, и рисуют линию в его центре.

BlockDragController владеет одной line node на жест. Геометрия читается до DOM writes;
line pointer-transparent, aria-hidden и fixed, не изменяет размер layout. При forbidden
или inside target она скрыта; release/cancel/error/detach удаляют её через общий cleanup.
Подсветка всего between region заменена линией, inside outline остаётся. Контроллер
продолжает проверять canMove перед feedback и re-resolve перед commit.

Отдельный API/ownership review: JSX primitive owns registration/disposer; editor owns
registry; resolver returns data only; existing gesture owner creates/updates/removes
line. Нет нового manager, кэша DOM, duplicate field/facade или host model dependency.
Проверены registry, JSX callers, outline, controller, generated exports/DTS и CSS.
Публичный type BlockDropIndicator экспортирован для потребителей собственного resolver.

Проверки:

- Baseline 5423: 6/6 новых production depth/line cases падают на отсутствующей линии,
  workers=12 и затем workers=1, оба браузера.
- Final 5424: **32/32** production pointer/container scenarios workers=12. Проверяются
  координаты line на трёх уровнях outdent, ориентация/центр Bento/Columns/Kanban/Table
  gaps, отсутствие line для inside, удаление после release, реальные move/undo.
- **143/143** Page Jest tests: geometry constrained depth, upper/lower/inside boundaries,
  один rect только winning explicit target, no extra rect for inside, permission hiding
  и release cleanup. Existing 4/200 mounted-root read bound продолжает проходить.
- Standalone production 5425: **88/88** Chromium/Firefox cases workers=12.
- Page types, package build/DTS/styles, production demo и standalone builds прошли.
  Focused lint 0 errors/6 length warnings; форматирование и diff check прошли.

Performance: immutable production 5423→5424, serial Chromium/Firefox, defaults и
repeat=200, tracing off, 1 warm+3 equivalent native Bento move/undo samples.
Каждый sample проверяет порядок и одну grouped command. ms median[min,max]; frames
— событие→2RAF proxy, не доказательство полного завершения async layout.

| Bento            | Command                 | Down frames                    | Move sync                 | Move frames                     | Up sync                         | Up frames                           |
| ---------------- | ----------------------- | ------------------------------ | ------------------------- | ------------------------------- | ------------------------------- | ----------------------------------- |
| chromium default | 1.1[1.1,1.2]→1[1,1.1]   | 32[31.8,32]→31.8[31.6,31.9]    | 0.2[0,0.6]→0.2[0,0.9]     | 16.9[16.4,17.6]→16.9[16.6,17.7] | 2.1[2.1,2.2]→2[1.8,2.2]         | 32.4[32,32.5]→31.9[31.9,32.3]       |
| chromium 200     | 2.2[2,2.9]→2.9[2.5,3.1] | 83.2[75,108.6]→79.9[76.8,80.8] | 0.3[0.1,2.9]→0.3[0.1,1.6] | 18.9[3.6,108.3]→23.9[3.4,105.9] | 13.9[13.3,15.7]→16.3[15.4,21.7] | 121.6[117.5,128.3]→125[123.3,135.4] |
| firefox default  | 1[1,2]→2[1,2]           | 31[30,31]→30[29,31]            | 0[0,1]→0[0,1]             | 17[15,18]→17[15,18]             | 2[2,3]→4[3,4]                   | 31[30,31]→32[31,32]                 |
| firefox 200      | 10[8,11]→8[8,9]         | 26[26,28]→26[18,26]            | 0[0,1]→0[0,1]             | 18[16,28]→18[16,37]             | 16[16,17]→16[15,19]             | 28[27,29]→28[27,42]                 |

Ускорение не заявляется: большой Chromium release median вырос 121.6→125ms при
пересекающихся ranges, command 2.2→2.9ms. Эта небольшая выборка не изолирует причину
различия и не доказывает отсутствие регрессий. Firefox200 release median остаётся28ms.
Прежние большие frame costs, cold roots и полный Kanban Firefox benchmark остаются
открытыми. Transport, bounded content preview, outerEdgeDropZone, оставшаяся geometry
и общий audit миграции этим этапом не закрыты.

Evidence: `/tmp/page-drag-line-before{,-serial}.log`,
`/tmp/page-line-{unit-final,types,lint,browser,standalone-browser}.log`,
`/tmp/page-line-{package-build,demo-build,standalone-build}.log`,
`/tmp/page-drag-cleanup-performance-after.log`, `/tmp/page-line-performance.log`.

### Ограниченное содержательное readonly drag preview

PageBlockDrag реализует optional BlockDragAdapter.getPreview(ids, limit). Page
запрашивает snapshot один раз после активации, с budget=4. Host обходит видимый prefix
через getBlockNode, удерживая ссылки на childIds и cursor/index/depth, без recursive
getBlock, flatten или подсчёта всех omitted descendants. Missing IDs также расходуют
budget. childrenVisible использует живые host behaviors; collapsed descendants
пропускаются. Возвращается только detached text (до240 символов) и относительная depth.

Page отдельно ограничивает DOM четырьмя строками, text240, indentation36px и CSS height
3lh на строку. textContent сохраняет markup инертным; editable renderers, block IDs,
selection subscriptions и subtree components не создаются. Movement обновляет только
preview transform. Header считает captured roots, а не все транспортируемые descendants.
Адаптеры без getPreview сохраняют прежний count-only fallback. Старое Edgeless preview
не изменялось этим этапом.

Отдельный ownership/API review: тот же PageBlockDrag borrows panel blocks и behaviors
через narrow interfaces (добавлены getBlockNode и childrenVisible). Host сохраняет
семантику текста/видимости; Page controller owns единственный preview DOM и cleanup.
Новых managers, subscriptions, кэша модели, duplicate facade или editable renderer path
нет. Проверены creator PageDragBoundary, adapter consumers, generated DTS/export
BlockDragPreviewRow, pointer lifecycle и CSS. getBlockNode переиспользует существующий
model cache; стоимость холодного shallow snapshot/большого текста не объявляется O(1).
Лимит доказан для preview reads, не для всех операций validation/commit жеста.

Проверки:

- Baseline5424: новые content assertions падают в обоих браузерах workers=12, затем
  workers=1: preview содержал только count.
- Final5426: **34/34** production browser cases (32 pointer/container +2 large preview),
  workers=12. Большой subtree с200 детьми: ровно четыре строки, collapsed subtree
  пропущен, markup не становится HTML, Escape удаляет preview без перестановки roots.
- Page Jest **144/144**; host adapter **6/6**. Для4/200 children preview читает ровно4 nodes,
  не вызывает recursive getBlock. Проверены read budget на200 missing IDs, live visibility,
  text cap, неизменная модель/selection и однократный capture при нескольких pointermove.
- Standalone5427: **8/8** профильных drag behavior cases, count-only fallback/remount/group/
  autoscroll. Первый ошибочно широкий запуск включил performance сworkers12:18pass/2timeout
  на large nonvirtual Kanban; эти timing samples НЕ используются. Обязательный повтор
  двух failed cases workers1/traceoff: **2/2 passed**.
- Page/React types, Page/React package builds/DTS/styles, production/standalone demo builds,
  форматирование и diff check прошли. Focused lint0errors/4 function-length warnings.

Standalone large Kanban serial current samples: Chromium frames88/95.3/103.1/90.3ms,
command0–.1ms; Firefox frames112/111/111/58ms, command0ms (timer resolution), reads51
в каждом sample. Это не before/after доказательство ускорения. Исходный Firefox рост
85.5→113ms не закрыт: текущая медиана111ms остаётся рядом с прежним большим значением.

Production performance: immutable5424→5426, defaults/repeat200, serial, tracing off,
1warm+3 native Bento move/undo samples; проверены hierarchy и одна grouped command.
ms median[min,max], frames — input→2RAF proxy.

| Bento            | Command                 | Down frames                     | Move sync                 | Move frames                     | Up sync                       | Up frames                           |
| ---------------- | ----------------------- | ------------------------------- | ------------------------- | ------------------------------- | ----------------------------- | ----------------------------------- |
| chromium default | 1[1,1.1]→1.1[0.9,1.1]   | 31.8[31.6,31.9]→32[31.5,32]     | 0.2[0,0.9]→0.2[0,0.7]     | 16.9[16.6,17.7]→16.9[16.5,17.5] | 2[1.8,2.2]→2.1[2,2.2]         | 31.9[31.9,32.3]→32.2[31.9,32.5]     |
| chromium 200     | 2.9[2.5,3.1]→2[1.9,2.5] | 79.9[76.8,80.8]→75.5[67.5,78.8] | 0.3[0.1,1.6]→0.2[0.1,1.5] | 23.9[3.4,105.9]→27[17.1,107.7]  | 16.3[15.4,21.7]→14.9[14.3,15] | 125[123.3,135.4]→126.7[124.2,149.4] |
| firefox default  | 2[1,2]→1[1,2]           | 30[29,31]→31[30,31]             | 0[0,1]→0[0,1]             | 17[15,18]→17[16,18]             | 4[3,4]→3[2,4]                 | 32[31,32]→31[31,33]                 |
| firefox 200      | 8[8,9]→10[10,12]        | 26[18,26]→27[27,29]             | 0[0,1]→0[0,1]             | 18[16,37]→19[16,29]             | 16[15,19]→17[16,19]           | 28[27,42]→29[28,30]                 |

Общее ускорение жеста не заявляется; большие Chromium frame costs сохраняются,
release median125→126.7ms, Firefox20028→29ms. Cold roots, transport, outerEdgeDropZone,
оставшаяся container geometry и полный migration audit ещё открыты.

Evidence: `/tmp/page-preview-before{,-serial}.log`,
`/tmp/page-preview-{host-unit,unit,host-types,types,browser,subtree-browser}.log`,
`/tmp/page-preview-{standalone-behavior,standalone-large-serial,standalone-browser}.log`,
`/tmp/page-preview-{package-build,host-build,demo-build,standalone-build}.log`,
`/tmp/page-preview-final-{format,lint}.log`, `/tmp/page-preview-performance.log`.

### Transport foundation: общий перенос в классе с узкими зависимостями

Существующий crossDocumentBlockTransfer заменён CrossDocumentBlockTransfer:
constructor заимствует source/destination, move синхронно подготавливает payload,
проверяет панели/ID и выполняет destination batch перед source batch. Полные recursive
snapshots здесь нужны для lossless transfer и читаются при commit; это не preview.
Сохранены прежние ошибки, порядок, независимые истории и destination-first семантика.
Новая атомарная транзакция между двумя документами этим рефакторингом не вводится.

Свободные helpers перенесены в private методы с сохранением объяснений. Все callers
обновлены: legacy BlockDrag controller, transfer tests, storage/database tests и embedding.
Старая функция не оставлена forwarding facade. Конструктор не подписывается, не
создаёт DOM и не владеет lifecycle документов; cleanup самой операции не требуется.

Отдельный API/ownership review: вместо полного ReactPanel принимается structural
BlockTransferPanel (rootBlockId, hasBlock/canRemove, document). Document interface
ограничен используемыми block operations, history.batchUpdates и getDocument, чей
результат narrowed до model insertBlock и используется также как identity. Нет editor,
React callbacks, attachment/destroy или duplicate manager fields. Core ChildrenPanel
теперь можно передавать напрямую; тест проверяет protected roots, отказ sibling-anchor
на hidden destination root и разрешённый inside перенос. Старый ReactPanel остаётся
структурно совместимым. Объект transfer может повторно проверять live state после отказа.

Baseline: **37/37** targeted tests до рефакторинга. Final: **44/44** в5 suites (transfer,
editor storage, database model, embedding и Page drag/preview). Types/build/DTS/styles,
production demo build, форматирование и diff check прошли. Lint по всем затронутым
потребителям:0errors/7 length warnings. В прошлом этапе preview test импортировал
@jest/globals, который работал в Jest, но не разрешался package tsc; заменён на принятый
в репозитории import.meta.jest. После исправления повторены tests и полноценный React
check-types. Предыдущее сообщение о types не покрывало эту позднюю test-only правку.

Native browser baseline5426 и final5428: **2/2** Chromium/Firefox workers12. Новый
Edgeless cross-document test переносит counter со значением7 внутрь точного target,
проверяет отсутствие source и независимый undo сначала destination, затем source.
Page transport этой проверкой НЕ доказан и остаётся неподключённым.

Performance: immutable production5426→5428, serial, tracing off, 1warm+3 equivalent
native pointer transfers/undo. Маршрут ?editors=2 не использует repeat, поэтому large
fixture добавляет200 paragraph roots в КАЖДЫЙ документ через их реальные команды до
начала измерения. Настройки Edgeless сохранены. Temporary harness получает runtime из
React props только для fixture/instrumentation; сам перенос выполняется настоящим
pointer. Каждый sample проверяет parent, props, удаление source и восстановление undo.

Batches ниже — сумма двух синхронных history batches insertion/deletion с subscribers;
подготовка/валидация payload в этот показатель НЕ входит. Ближайшие поздние batches
проекции элементов не выдаются за transfer: измеряемые callbacks отличены по вызовам
insertBlock/removeBlock, и проверяется их количество2. Native propagation старого
controller не позволяет обычному window bubble listener измерить весь dispatch;
полная synchronous transfer duration отдельно не изолирована. Frames — capture→2RAF
proxy. Все значения ms median[min,max].

| Edgeless transfer | History batches           | Down frames                     | Move frames                   | Up frames                       |
| ----------------- | ------------------------- | ------------------------------- | ----------------------------- | ------------------------------- |
| chromium default  | 0.6[0.5,0.7]→0.5[0.5,0.7] | 31.6[31.2,31.6]→31.4[31.3,31.9] | 16.7[16.4,17]→16.7[16.6,16.9] | 32.4[32.3,32.6]→32.4[32.2,32.5] |
| chromium 200      | 2.6[2,2.9]→1.9[1.9,2.5]   | 30[29.8,30.3]→30.7[30.5,31]     | 16.8[16,30.2]→16.8[16.3,27.8] | 31.9[31.5,32.2]→32.3[31.6,32.4] |
| firefox default   | 1[1,2]→1[1,2]             | 31[30,33]→32[32,32]             | 17[15,19]→17[15,18]           | 31[31,33]→32[32,33]             |
| firefox 200       | 4[4,6]→5[4,5]             | 31[29,31]→29[28,30]             | 17[14,23]→17[14,27]           | 30[29,33]→31[30,36]             |

Ускорение не заявляется. Это проверка сохранения рабочего legacy transport после OOP
рефакторинга, не выполнение production Page transport и не финальная performance
приёмка. Прежние Bento/Firefox Kanban/cold roots ограничения сохраняются.

Следующее обязательное подключение: host маршрутизирует реальный native hit к текущей
зарегистрированной occurrence, Page продолжает владеть одним pointer gesture. Destination
identity должна передаваться отдельно от canonical parentId; одинаковые ID разных
документов нельзя исключать как moving subtree. Повторный commit проверяет source и
receiver boundaries, использует существующий grouped move для одного документа и новый
transfer class для разных; selection/focus переходят только после успеха. Registry cleanup
должен учитывать remount/stale disposer. Проверить совместимость с оставшимся legacy
Edgeless registry: отдельный Page-only registry без межповерхностного routing не докажет
сохранение прежних cross-panel возможностей. Outer-edge ownership nested occurrences
также остаётся обязательным, не решается одним closest(root).

Evidence: `/tmp/page-transfer-{baseline-unit,unit-final,types-final,lint-final,format-final}.log`,
`/tmp/page-transfer-{build,demo-build}.log`, `/tmp/page-transfer-browser-{before,after}.log`,
`/tmp/page-transfer-performance-{before,after}.log`.

### Продолжение: production transport между Page и Edgeless

PageBlockDrag теперь подключается к существующему cross-document registry через
PageDragOccurrence. Отдельного реестра Page и второго pointer owner нет. Receiving
scope передаётся отдельно от canonical destination: parentId:null остаётся настоящим
корнем документа. Одинаковые ID разных документов не проходят локальную проверку
ancestry, но host проверяет collisions всего переносимого поддерева. Commit повторно
проверяет attachment identity, доступ source/receiver, adjacency и behavior policy.
Один документ использует grouped move; разные документы — CrossDocumentBlockTransfer
с двумя независимыми history batches. Междокументная атомарность не добавлена.

BlockDropFeedback владеет line/outline; geometry передаётся уже измеренной. Page source
переиспользует оригинальный target нового receiver без повторного измерения. Legacy
Edgeless получает перевод placement и использует тот же receiving registry. Successful
Page transfer фокусирует receiving root, cancellation оставляет исходный фокус.
Receiver detach отменяет source gesture; старый disposer не удаляет новую регистрацию
на том же DOM root. Cleanup Page occurrence пробует все callbacks и агрегирует ошибки.

Architecture review отдельно от tests: проверены boundary effect → PageBlockDrag →
PageDragOccurrence → shared registry → source controller → command → teardown.
Boundary создаёт adapter/attachment после commit и освобождает registration и attachment;
панель продолжает владеть Page controller. Geometry и model/panel заимствуются.
CrossDocumentBlockPanel не раскрывает panel lifecycle; getDocument ограничен стабильной
identity, id и model insertBlock. Selection остаётся существующим panel/core state:
панели одного документа разделяют core selection, focus определяет active occurrence.
Дубликаты manager fields, новый cache и зависимости не добавлены.

Baseline5428: новая матрица четырёх направлений Page/Edgeless дала 6 failures и2 passes
workers12; все6 Page failures повторены workers1. Final production5430: матрица8/8,
включая отдельную проверку receiving focus для Page sources. Вместе с локальными pointer
сценариями —28/28 Chromium/Firefox workers12. Проверены canonical parent/order, custom
counter props, удаление source, независимый undo. Unit:146/146 Page +17/17 host/transfer;
новые случаи — mixed-parent same-document group с одним undo/redo, empty receiving doc,
collision descendant ID, detached scope, stale disposer и cleanup callback failure.
React/Page types, обе package builds, demo production build прошли. Focused lint:
0errors/8 function-length warnings; новые тесты lint clean. Полный workspace audit
этими проверками не заменён.

Performance final5430: serial, no tracing, 1warm+3 samples, реальные pointer input и undo.
Route ?editors=2 игнорирует repeat; large fixture добавляет200 roots в каждый документ,
как в baseline5428. Все samples проверяют перенос counter props/parent и оба undo.
Значения ниже ms median[min,max]. Batches — сумма двух синхронных insertion/deletion
history batches; payload preparation/полный event dispatch сюда не входят. Frames —
capture→2RAF proxy, а не гарантия завершения async layout. У нового Page transport нет
успешного baseline: сравнивать скорость с прежним no-op некорректно.

| Page → Page      | Batches      | Down frames     | Move frames     | Up frames       |
| ---------------- | ------------ | --------------- | --------------- | --------------- |
| Chromium default | 0.7[0.6,1.1] | 32.4[31.9,32.5] | 16.8[16.5,17.7] | 32.2[32.2,32.3] |
| Chromium 200     | 2.9[2.7,3]   | 32[31.4,32.7]   | 17.1[15.8,18.4] | 31.1[30.9,31.2] |
| Firefox default  | 1[1,2]       | 32[31,33]       | 17[16,18]       | 32[31,32]       |
| Firefox 200      | 4[4,5]       | 30[26,30]       | 17[15,19]       | 31[30,32]       |

Common Edgeless baseline5428→final5430, batches/up frames:
Chromium default0.5[0.5,0.7]→0.7[0.6,0.8] /32.4[32.2,32.5]→32.2[31.8,32.3];
Chromium2001.9[1.9,2.5]→2[1.9,2.6] /32.3[31.6,32.4]→31.4[31.1,32];
Firefox default1[1,2]→1[0,1] /32[32,33]→32[32,32];
Firefox2005[4,5]→4[4,5] /31[30,36]→31[30,32].
Ускорение всей системы не заявляется. Foreign feedback всё ещё проверяет все ID
переносимого поддерева; bounded preview не делает весь gesture bounded.

Остаются обязательными: nested outer-edge routing к enclosing source, полный набор
cross-panel cancellation/embedding сценариев и динамическое удаление расширений,
большие Bento/Firefox Kanban/cold roots regressions и финальная общая приёмка goal.
Текущий transport slice не означает завершение всей миграции.

Evidence: `/tmp/page-transport-{before,before-serial,browser-final,focus-final}.log`,
`/tmp/page-transport-{page,host}-unit-final.log`,
`/tmp/page-transport-{page,host}-types-final.log`, `/tmp/page-transport-lint.log`,
`/tmp/page-transport-{page,react}-build.log`, `/tmp/page-transport-demo-final.log`,
`/tmp/page-transport-performance-{page,edgeless}-final.log`.

Дополнительно на final5430:14/14 container pointer cases Chromium/Firefox workers12
(Bento tiles, empty containers, Columns/Kanban lanes, Table cells). Итого42 уникальных
browser cases на окончательной сборке;8 transfer cases дополнительно повторены после
добавления focus assertions. Evidence: `/tmp/page-transport-containers-final.log`.

### Продолжение: sibling insertion у края вложенной Page

Подтверждена следующая причина: host выбирал enclosing occurrence для края embedding,
но BlockOutlineDropTargets отвергал native hit, поскольку тот принадлежал nested Page.
Новая explicit nestedBoundary в CrossDocumentDropRoute передаётся только после того,
как общий registry resolver пересёк проверенный край зарегистрированной occurrence.
findCrossDocumentPageController переименован в findCrossDocumentDropRoute по фактическому
результату; обновлены оба потребителя, Page и legacy Edgeless. Source controller теперь
может быть результатом routing, и legacy path явно оставляет такой hit локальным.

Outline resolver по умолчанию сохраняет полную изоляцию. При явном разрешении host его
private nestedBoundary находит enclosing block shell в текущей Page, проверяет moving
ancestry и получает canonical sibling gap. Идентичность вложенного display root не
используется как hierarchy ID. Feedback измеряет nested root и enclosing shell один
раз каждый, не обходит descendants. Unit проверяет количество этих измерений, отказ
без разрешения и исключение moving shell. Host unit различает nested interior, routed
edge и обычный local hit без разрешения пересечь boundary.

API review: новые данные routing — ephemeral result текущего native hit, без состояния,
подписок, нового cache или lifetime. Page по-прежнему владеет структурной геометрией;
host — выбором occurrence. У receiving resolvePlacement появился optional флаг,
который передаётся в geometry только из текущего shared route. Политика outerEdgeDropZone
остаётся у host. Все callers inspect/find обновлены. После переименования build/types
прошли; существующие docs сохранены, contract дополнен. Nested-edge метод не добавляет
новый pointer owner. Дальнейшие операции изменения глубины вокруг embedding и несколько
уровней nested occurrences этой проверкой полностью не покрыты.

Воспроизведение: focused outline unit до fix —1 failure/4 pass (undefined вместо
canonical before gap). Первый browser fixture имел stale координаты после scroll;
его failures НЕ считаются надёжным воспроизведением. Fixture исправлен: viewport1400×1200,
геометрия после hover, без последующего scroll, обязательная проверка активного preview.
Исправленный baseline5430 workers1:4/4 failures на отсутствующей/скрытой insertion line,
при активном gesture. Новый production5432:4/4 serial и46/46 combined workers12
(Chromium/Firefox, nested edges, pointer/preview, containers, Page↔Edgeless transport).
Page unit147/147, host11/11, после добавления geometry-read assertions outline5/5.
Page/React types, Page/React builds и demo build прошли. Focused lint0errors/8 length
warnings. Финальный production5433 отличается от5432 только именем routing function
и документацией; финальный combined run хранится отдельно.

Performance: immutable5430→5433, serial/no tracing, defaults и ?repeat=200, реальные
pointer events,1warm+3samples и undo; baseline nested insertion — no-op, поэтому его
скорость не сравнивается с успешной командой. Samples проверяют точный root order после
commit. Model command включает синхронных subscribers; dispatch измерен capture→bubble,
frames — capture→2RAF proxy, не полная async-layout готовность. ms median[min,max]:

| Nested after embedding | Command    | Down frames     | Move sync    | Up sync         | Up frames        |
| ---------------------- | ---------- | --------------- | ------------ | --------------- | ---------------- |
| Chromium default       | 0.9[0.9,1] | 32.5[31.9,32.5] | 0.4[0.1,0.8] | 1.6[1.6,1.8]    | 31.6[31.3,32.2]  |
| Chromium200            | 3[2.8,3.1] | 68.8[67.7,69.5] | 1.5[0.2,2.1] | 21.9[18.5,22.5] | 117[112.2,133.1] |
| Firefox default        | 1[0,2]     | 31[31,33]       | 0[0,1]       | 2[1,2]          | 32[31,33]        |
| Firefox200             | 13[10,14]  | 18[18,20]       | 1[0,1]       | 23[20,23]       | 162[159,173]     |

Common Bento200 before→after: Chromium command2.1[2,2.5]→2.5[2,2.5],
down frames77.8[70,80.4]→81.2[80.8,84.3], move sync0.3[0.1,1.5]→0.2[0.1,1.6],
up frames125.8[122.8,129.3]→133.7[131.4,141.6]. Это ухудшение данного замера,
не доказательство отсутствия регрессии; причина пока не локализована.
Firefox command11[10,11]→9[8,10], down27[27,28]→28[27,28], move sync0[0,1]→0[0,1],
up frames28[27,31]→28[27,29]. Нового утверждения об общем ускорении нет.
Cold roots, полный subtree cost и прежний большой Kanban Firefox остаются открытыми.

Evidence: `/tmp/page-nested-browser-baseline-corrected.log`,
`/tmp/page-nested-browser-{route-serial,final,build-final}.log`,
`/tmp/page-nested-{before,unit,host-unit-final,outline-unit-final}.log`,
`/tmp/page-nested-types-{page,react}-final.log`, `/tmp/page-nested-lint-final.log`,
`/tmp/page-nested-build-{react,demo}-final.log`, `/tmp/page-nested-performance.log`,
`/tmp/page-nested-bento-{before,after}.log`.

Final5433 combined browser run завершён:46/46 workers12, без failures; outline suite
после последнего test-only assertion:5/5. Следующий performance шаг — профиль Chromium
Bento200 и общей реакции на pointerdown/commit, без изменения бюджета и виртуализации.

### Продолжение: native hit reuse на release и в standalone DnD

Диагностика Chromium Bento200 на immutable5433 показала, что большая часть задержки
не относится к grouped model command. Отдельный CDP metrics run с ожиданием кадров
между фазами: pointerdown JS≈0.25ms/recalc≈0.05ms; pointerup JS≈16–17ms,
style≈44–46ms, layout≈6ms. Диагностический timeline (не performance acceptance,
с tracing) выявил значительные HitTest, UpdateLayoutTree, PrePaint/Paint затраты.
Суммы вложенных trace events нельзя складывать в общую длительность gesture.

Проверены и НЕ внесены в production: ограничение z-index Bento handles по hover/focus,
снятие z-index всех slots, постоянный contained overlay внутри Page, will-change/contain
для feedback. Убедительного общего выигрыша они не показали. Временный перенос preview
и линии в document.body снизил start proxy Chromium200 до50[40.7,61.4]ms и release до
116.3[116,118.3]ms, но меняет наследование темы/контекст CSS; эта probe не стала runtime
изменением. Временные scripts/styles остались только в /tmp.

Подтверждён лишний lookup: move уже передавал native target, finish всегда вызывал
геометрический resolver без него. Кроме того, default BlockDropTargets.resolve
игнорировал четвёртый аргумент интерфейса BlockDragTargets — standalone повторял
hit-test даже при наличии актуального native hit.

BlockDragController теперь использует private uncapturedHit для move и release.
Captured, disconnected и не-Element targets сохраняют геометрический fallback.
Публичный resolve default registry принимает optional current nativeHit, проверяет
его ownerDocument/connected и делегирует существующему resolveHit. Никакого кеша между
событиями нет: scroll reconciliation по-прежнему использует свежую геометрию.
Release заново разрешает destination и проверяет live hierarchy/canMove/commit;
результат предыдущего pointermove не переиспользуется.

API/ownership review: проверены BlockDragTargets → controller → host PageBlockDrag /
default registry → resolveHit → adapter command. Добавлен только используемый current-hit
аргумент, без нового менеджера, facade, lifetime или registrations. Все ресурсы/cleanup
остались у прежних владельцев. Новый private helper читает DOM realm текущей attachment.
Документация release/scroll/capture обновлена, public contract и defaults описаны.

Baseline focused test:1failure/7pass — uncaptured pointerup не передавал current hit.
Final unit149/149, включая capture release fallback, live adjacency revalidation,
отсутствие дополнительного elementFromPoint при supplied hit и свежий lookup для
missing/disconnected hit. Types Page/React, builds Page/React/demo/standalone прошли.
Focused lint0errors/2 test-length warnings. Production5434:46/46 behavioral workers12;
standalone5435:8/8 behavioral workers12. Оба браузера, включая native capture, Escape,
remount, virtual hidden group, containers, nested boundaries и Page↔Edgeless transfer.

Performance acceptance: immutable5433→5434, serial/no tracing, defaults/repeat200,
1warm+3 native samples, точный порядок после move и один command на sample.
Команда включает synchronous subscribers; dispatch capture→bubble; frames capture→2RAF
proxy. Pointerdown proxy включает последующее начало movement при быстрых событиях,
поэтому это не изолированная длительность самого pointerdown handler. ms median[min,max]:

| Bento            | Command before→after      | Up sync before→after       | Up frames before→after              |
| ---------------- | ------------------------- | -------------------------- | ----------------------------------- |
| Chromium default | 1.1[1.1,1.3]→1.1[1.1,1.3] | 2.1[2,2.4]→2.1[2.1,2.4]    | 32.3[32.2,32.4]→31.9[31.7,31.9]     |
| Chromium200      | 2.2[2,2.5]→2.2[2.2,2.6]   | 15[14.6,15.5]→5.7[5.4,5.8] | 132.8[130,135.4]→120.6[116.2,122.2] |
| Firefox default  | 1[1,2]→1[0,2]             | 3[3,4]→3[3,4]              | 32[32,32]→30[30,33]                 |
| Firefox200       | 9[9,9]→10[8,10]           | 16[15,17]→17[15,17]        | 28[26,29]→29[29,30]                 |

Chromium200 down proxy87.7[82.8,111.4]→84.5[75.4,89.3], move sync0.2[0.1,1.4]→
0.3[0.1,1.3]. Firefox200 down26[26,27]→26[26,27], move sync0[0,1]→0[0,1].
Это измеренное уменьшение лишней работы release в Chromium, не завершённая общая
performance приёмка: большой startup/render/cold roots и Firefox Kanban остаются
отдельными вопросами.

Evidence: `/tmp/page-bento-{cdp,render-profile}.log`,
`/tmp/page-{bento-layer,slots-layer,feedback-body,feedback-overlay,feedback-composite}-probe.log`,
`/tmp/page-release-hit-{before,unit-final,lint,browser,standalone-browser}.log`,
`/tmp/page-release-hit-types-{page,react}.log`,
`/tmp/page-release-hit-build-{page,react,demo,standalone}.log`,
`/tmp/page-release-hit-perf-{before,after}.log`,
`/tmp/page-release-hit-standalone-perf.log`.

Standalone production5435 performance завершён:8/8 serial/no tracing (Outline/Kanban,
repeat1/200 без virtualization). Контрольная сохранённая baseline5427 повторена той же
командой для Kanban:4/4. Это ближайшая сохранённая standalone baseline, более ранняя,
чем host5433; host transport/nested routing изменения к её demo не относятся.
Kanban200 frame median[min,max]: Chromium89.85[87.7,95.8]→84.1[83.2,88.5],
Firefox109.5[59,111]→58.5[58,61]ms. Все samples сохраняют51 node reads и проверяют
parent/order второго selected блока. Model command0–0.1ms Chromium и0–1ms Firefox
(низкая точность timer не означает отсутствие работы). Для default Kanban Firefox
36[33,56]→34[31,57]ms. В этом прогретом child-to-child benchmark прежняя Firefox
регрессия85.5→113ms больше не воспроизводится на final; это НЕ доказательство
исправления cold roots/O(R), initial load или всех больших поддеревьев. Они остаются
обязательными пунктами полной приёмки. Evidence:
`/tmp/page-release-hit-standalone-{before,perf}.log`.

### Продолжение: live host registrations и Ctrl-selection custom controls

Добавлен `e2e/page-live-registrations.spec.ts`, использующий реальные public host
extensions.install/surfaces/renderers на уже смонтированной production Page.
Проверены priority HIGH→LOW в slot, outermost-first порядок wrappers, их удаления,
идемпотентный disposer, Page→Edgeless→Page remount и удаление contribution, пока Page
не смонтирована. Renderer неизвестного persisted type подключается динамически;
его замена childless layout убирает descendants, удаление layout возвращает default
composition и ровно один экземпляр child. Исходные model IDs сохраняются. Runtime
изменений для этих сценариев не потребовалось. Они закрывают ранее отсутствовавшее
production evidence для live renderers/layouts/slots/wrappers, но не заменяют весь
lifecycle/error audit каждого расширения.

Ownership review PageSurfaceRegistrations: panel создаёт и уничтожает contribution
mirror; borrowed interfaces ограничены регистрацией Page и чтением/subscribe host;
entry identity сохраняется, surviving entries не пересоздаются. Host extension scope
владеет disposers; Page view borrowing/remount не уничтожает host registrations.
Перечитаны constructor, reconciliation, wrapper/slot projection и aggregate destroy.
Этот review выполнен отдельно от browser results; новые abstractions не добавлены.

Полный старый cross-document suite впервые в этом этапе прогнан целиком на5434:
workers12 —12pass/6fail, те же6 failures повторены workers1. Два сценария использовали
устаревшие presentation markers: selecting теперь расположен на hovered anchor, а
empty receiving feedback — data-block-drop-active. Проверки обновлены с сохранением
наблюдаемого поведения, native hover для handle и конечных model assertions.

Третье падение — реальная regression: Ctrl-click Counter не включал его в selected
transfer group. Counter явно помечает сам button data-block-selection-anchor, но
BlockPointerSelection.onToggle отвергал вообще все controls. Нормальный pointer drag
уже поддерживал такой opt-in, modifier toggle — нет. Исправление в существующем owner:
после первичных проверок nearest control допускается только если сам имеет anchor
marker. Ancestor marker не разрешает его дочерние controls; data-prevent-text-editing
в любом ancestor всегда запрещает takeover. Обычный click и кнопочный action остаются
без изменений, новых listeners/state/API/manager нет. Selection по-прежнему публикуется
через host adapter, canonical order берётся из model IDs.

Baseline unit:1failure/4pass (прямо отмеченный button не выделялся). Final153/153 Page
unit, включая четыре control boundaries, default prevention и повторный toggle off.
Production5436: полный cross-document + live registrations22/22 workers12 в Chromium
и Firefox: group с collapsed subtree и Counter, independent undo, empty destination,
конфликты ID, nested target, local mode/selection/control/history, все4 направления
Page/Edgeless. Page types, Page/React/demo builds прошли; focused lint0errors/6 length
warnings. Test-only проверки registrations сами по себе не требуют performance run;
runtime исправление toggle проверено отдельно ниже.

Performance: immutable5434→5436, serial/no tracing, defaults/repeat200, real Ctrl-click,
1warm+3 equivalent samples. Между samples второй native Ctrl-click снимает selection.
Проверяются selected ID, один selection.set и неизменившийся Counter count. Selection
publication длительность включает synchronous subscribers; input capture→bubble;
frames capture→2RAF proxy. Broken Counter baseline был no-op и не используется как
speed baseline. ms median[min,max]:

| Counter final    | selection.set | Input sync   | Frames          |
| ---------------- | ------------- | ------------ | --------------- |
| Chromium default | 0.1[0,0.1]    | 0.5[0.4,0.5] | 28.7[28.2,29.2] |
| Chromium200      | 0.1[0,0.2]    | 1[0.9,1.4]   | 30.9[25.4,44.2] |
| Firefox default  | 0[0,0]        | 1[1,2]       | 31[31,33]       |
| Firefox200       | 0[0,1]        | 3[2,3]       | 30[24,32]       |

Общий paragraph Ctrl-click before→after: Chromium default sync0.5→0.5ms,
frames29[29,29.6]→28.7[27.9,29]; Chromium200 sync1→1ms,
frames20.6[20.2,37.8]→20.3[18.7,38]. Firefox default sync1→1ms,
frames32[31,32]→33[32,33]; Firefox200 sync2→2ms, frames28[24,31]→16[16,29].
Вариация frame scheduling не считается общим ускорением. При200 по-прежнему возможна
работа proportional selectable IDs; этот feature fix не закрывает O(R)/cold roots.

Evidence: `/tmp/page-live-registrations-{browser-final,lint-final}.log`,
`/tmp/page-cross-document-full{,-serial}.log`, `/tmp/page-control-toggle-{before,unit,browser,types,lint}.log`,
`/tmp/page-control-toggle-build-{page,react,demo}.log`,
`/tmp/page-control-toggle-perf-{before,after,counter}.log`.

Дополнительно final5436:4/4 `structured-selection` plain-pointerdown cases,
Chromium/Firefox defaults/repeat200, workers12. Проверка подтверждает очистку structural
selection до document bubbling и после whitespace click. Итого26 уникальных browser
cases текущего этапа; evidence `/tmp/page-control-toggle-structured.log`.

### Продолжение: lists, checkbox presentation и editing acceptance

Полный focused editing run на immutable5436: clipboard-converters/history-delete/keymap/
lists, Chromium+Firefox workers12 —38pass/18fail. Все18 list failures повторены workers1;
для диагностики отсутствующих DOM selectors timeout уменьшен с30 до10s, не увеличен.
Повтор подтвердил те же отсутствующие `.page-block-row` locators. Эти failures не
считаются model regressions: проверки не достигали операции. `e2e/lists.spec.ts` переведён
на существующий BLOCK_ROW_SELECTOR и локальные shared children/slot selectors для двух
поверхностей. Assertions нумерации (сравнение marker screenshots), geometry, hierarchy,
focus, slash commands, Enter/undo остались прежними. Финальные тесты используют обычный
исходный timeout.

После обновления selectors проявились4 настоящих failures (2 сценария ×2 browsers),
повторённые workers1: checkbox перекрывает начало текста (gap=-14px), а numbered marker
после изменения порядка не совпадает с изображением номера1. Отдельный новый
`e2e/page-checkbox-style.spec.ts` воспроизвёл третью regression: checked model state
не зачёркивает Page text, тогда как Edgeless работает (baseline2fail/2pass; Page2fail
подтверждены serial).

Исправлено в host CSS:

- Checked styling перенесён из legacy block-tree stylesheet в block-slot-controls;
  один selector понимает обе структуры row/slot/shell. Scope — owning row; обычный
  model child task вне этой row не зачёркивается. Проверены undo/redo checked state.
- Concrete marker/checkbox normalization перенесён из legacy owner-slot selectors в
  block-slot-controls и применяется к Page slots тоже. Controls теперь участвуют в
  in-flow layout, их размеры и существующий logical checkbox gap сохранены.
- В Page list marker только отображает счётчик: counter-increment/counter-set на нём
  отключены, поскольку native Page structural shell уже считает list positions.
  Edgeless сохраняет прежний marker-based counting. Схема/commands/history не менялись.

Architecture review отдельно от tests: Page остаётся владельцем structural counters,
row и slots, host — конкретного checkbox/marker appearance и checked semantics.
Новые runtime managers, DOM measurement, функции, state, listeners или зависимости не
добавлялись. Перечитаны Page BlockSlotHost/slot CSS, structural counter rules, host
BlockListSlot/owner-slot normalization и порядок stylesheet imports. Удалён перенесённый
legacy selector, чтобы не оставлять два владельца checked styling. Общие geometry правила
Page не компенсируются случайными margin в конкретных layouts.

Final immutable5438: **60/60** Chromium/Firefox workers12 — все четыре исходных editing
suite + новая checkbox regression. Покрывает clipboard HTML/text converters и смешанную
canvas группу, shared Page/Edgeless list rendering, numbered root/nested moves,
slash conversion, checkbox Enter/split/empty outdent, collapsed list continuation,
Backspace/Delete/undo, live keymap, Cyrillic history, beforeinput history и запрет IME
history requests. Это не полный тест всех input/IME composition/clipboard сценариев
из goal. React package и demo production builds прошли; focused lint0errors/3 warnings
длины существующих test functions; Prettier/diff-check чистые. Runtime TypeScript не
менялся, отдельный Jest прогон для чистых CSS изменений не требуется.

Performance: native checkbox click, production5436→5438, defaults/?repeat=200,
serial/no tracing,1warm+3samples, equivalent native second click снимает checked.
Каждый sample проверяет model checked=true, один core updateBlock, затем checked=false;
computed text-decoration проверяется отдельно (baseline none, final line-through).
Базовое model действие работало, но visual result до исправления был неполным: это
сравнение стоимости восстановленного отображения, а не утверждение об ускорении.
Command включает synchronous subscribers. Frames — pointerdown capture→2RAF proxy,
включающий последующий click action. Native control останавливает propagation,
поэтому sync=0 из temporary harness — отсутствующее bubble-измерение, НЕ нулевая
стоимость dispatch; этот показатель исключён из таблицы. ms median[min,max]:

| Checkbox         | Command before→after      | Frames before→after             |
| ---------------- | ------------------------- | ------------------------------- |
| Chromium default | 0.6[0.6,0.9]→0.7[0.6,0.8] | 29.7[29.4,29.9]→28.9[28.7,29.8] |
| Chromium200      | 1.1[0.7,1.4]→1.1[0.8,1.3] | 69.5[66.9,73.1]→71.7[70,75.3]   |
| Firefox default  | 1[0,2]→1[0,3]             | 15[14,16]→17[16,17]             |
| Firefox200       | 1[0,2]→2[1,2]             | 15[15,16]→16[16,17]             |

Большая Page по-прежнему имеет заметную render задержку Chromium; этот исправленный
визуальный контракт не закрывает O(R)/cold roots и финальную performance приёмку.

Evidence: `/tmp/page-editing-acceptance{,-serial}.log`,
`/tmp/page-lists-modern{,-serial}.log`, `/tmp/page-checkbox-style-{before,before-serial,after}.log`,
`/tmp/page-list-style-final.log`, `/tmp/page-list-style-build-{react,demo}.log`,
`/tmp/page-checkbox-lint.log`, `/tmp/page-list-style-format.log`,
`/tmp/page-checkbox-perf-{before,after}.log`.

### Продолжение: clipboard, Markdown и trailing insertion acceptance

На неизменной production-сборке5438 выполнены `markdown-custom`, `clipboard-drag`,
`clipboard-empty-block`, `empty-document` в Chromium/Firefox workers12:
первый прогон66passed/8failed. Все8 повторены workers1 с обычным timeout и упали
на прежних DOM selectors (`.page-block-row`, `.page-drag-overlay`). Это ошибки
проверок после замены поверхности, а не доказательство поломки clipboard.

Обновлены только два test files: `clipboard-drag.spec.ts` и `empty-document.spec.ts`.
Используется существующий общий BLOCK_ROW_SELECTOR; preview проверяется по реальной
`.rivto-block-drag-preview`, исходная row получает hover до измерения handle.
Содержимое clipboard, caret offsets, количество вставленных/удалённых блоков,
selection, Tab, focus, undo и appearance assertions сохранены.
Устранена ложноположительная проверка plain-text paste: старый `.page-block` давал
ноль до и после вставки на новой Page. Теперь считаются host block IDs после
ожидания первого блока и явно проверяется ненулевое исходное количество.

Промежуточный прогон22passed/2failed, оба падения повторены workers1:
подсчёт выполнялся до завершения mount; в Firefox после удаления всех roots
оставшийся pointer попадал на переместившийся trailing control и включал hover.
Добавлено ожидание первого блока; перед Delete pointer перемещается вне контролов.
Проверки прозрачности вне hover, focus ring и hover appearance не удалялись.

Итог: **74/74 passed (24.8s)** Chromium/Firefox workers12. Включены default и200
для empty-block paste/undo в Page и Edgeless, inline code и геометрии Markdown.
Остальные сценарии: native mouse/keyboard copy/paste нескольких блоков, частичные
text ranges, portable clipboard flavors Counter, invalid props→Error block,
slash filtering/navigation/conversion/undo, внешнее обновление caret, совместные
Markdown/code updates до React render, slider history и создание трёх блоков через
page-ending slot после полного удаления документа.

Focused ESLint:0errors/3 function-length warnings; Prettier и scoped diff-check чистые.
Runtime, публичные API, зависимости, creation/attachment/cleanup не менялись;
новые build/Jest/performance измерения для test-only изменения не требуются.
Тайминги paste, напечатанные suite при workers12, не являются performance evidence:
нет serial/no-tracing native benchmark и контрольного изменения runtime.
Полная IME composition, embedding и cold-root/O(R) приёмка остаются открытыми.

Evidence: `/tmp/page-editing-next{,-serial,-final}.log`,
`/tmp/page-clipboard-modern{,-serial}.log`, `/tmp/page-editing-next-final-lint.log`.

### Продолжение: embedding appearance, settings и shared selection

Production5438:22/22 editing/lifecycle tests Chromium/Firefox workers12 прошли без
изменений. Проверены редактирование через две occurrences, закрытие source pane,
удаление/undo, перенос source identity, protected-root Enter/Delete, cycle rejection,
независимая host/source history, indent/outdent и embedded slash/paste в Page/Edgeless.

Структурный набор дал16passed/24failed на старых `.page-block-row`/`.rivto-slot`.
Все24 повторены workers1; диагностический temporary config ограничивал actionTimeout
до10s (существующие явные page timeouts сохранены). Эти failures не доказывали поломку
selection: действия не находили старые DOM элементы. Обновлены только проверяемые
hover/settings/shared-selection части `e2e/embeddings.spec.ts`: общий row selector и
локальный slot selector для Page/legacy Edgeless. Остальные DnD selectors этого файла
в этом этапе намеренно не изменялись и требуют отдельной приёмки геометрии.

После обновления test selectors:38passed/2failed, оба повторены workers1 с исходной
конфигурацией. Реальная regression: reference body новой Page был прозрачным вместо
host background. `embedding.css` всё ещё адресовал только legacy shell/row/slot.
Host stylesheet теперь понимает обе структуры для body background/border/radius,
прозрачности выбранного поддерева, placement и hover/focus/open-state settings button.
Существующие значения стилей, комментарии и ownership сохранены; новые отступы,
DOM wrappers, runtime state, managers, functions или dependencies не добавлены.

Separate architecture review: перечитаны host EmbeddingControls/EmbeddingWrapper,
Page slot markup и PageSelection adapter. Page сохраняет structural shell/slots;
конкретное оформление reference принадлежит host. Model selection остаётся в панели,
локальные listeners/order cache не заменяют её; DOM identifiers в tests только
находят occurrences. Новый интерфейс или lifecycle ownership не вводился.

Final immutable production5439: **62/62 passed (22.9s)** Chromium/Firefox workers12.
Набор объединяет22 editing/lifecycle +40 structural scenarios, включая defaults/200,
Page/Edgeless, hover без изменения selection/native range, collapse/undo, trailing
slot exclusion, checkbox styling, reachable own handle, settings Save/Cancel/undo,
hover/focus appearance без layout shift, shared selection и независимость одинаковых
block IDs в разных документах. Все исходные поведенческие assertions сохранены.
React package + demo production builds успешны; focused ESLint0errors/18 existing
function-length warnings, Prettier и scoped diff-check чистые. Runtime TS не менялся.

Performance: существующий `editing cost and lifecycle` suite, production5438→5439,
workers1/trace off, warm edit +5samples, both browsers/defaults200,4/4 до и после.
Native `press("x")` проверяет текст original/embedded и caret; отдельный model update
измеряет synchronous command/subscribers и2RAF proxy. Keyboard включает Playwright
round trips/assertions, не изолированный browser dispatch. Дополнительно проверяется
ноль повторных reference searches при editing и close/reopen lifecycle. ms median[min,max]:

| Embedding        | Command before→after      | Render proxy before→after     | Native keyboard before→after |
| ---------------- | ------------------------- | ----------------------------- | ---------------------------- |
| Chromium default | 0.4[0.3,0.5]→0.3[0.2,0.5] | 29.6[21.7,30]→29.1[22.9,30.4] | 41[40,49]→38[26,42]          |
| Chromium200      | 0.5[0.4,0.7]→0.4[0.4,0.5] | 26[18.3,26.4]→26.5[18.7,26.6] | 53[51,57]→54[53,66]          |
| Firefox default  | 0[0,1]→1[0,1]             | 28[16,29]→27[19,29]           | 36[35,56]→36[34,49]          |
| Firefox200       | 1[0,3]→1[0,2]             | 15[13,24]→15[14,18]           | 87[87,107]→88[75,101]        |

Нулевые Firefox durations отражают разрешение timer. Ускорение этим CSS исправлением
не установлено; restore visual behavior не закрывает cold-root/O(R), large-subtree,
IME composition или оставшуюся embedding DnD приёмку.
Evidence: `/tmp/page-embedding-editing.log`, `/tmp/page-embedding-structure{,-serial,-modern,-modern-serial}.log`,
`/tmp/page-embedding-style-{final,build-react,build-demo,lint,perf-before,perf-after}.log`.

### Продолжение: browser composition / IME contract

Добавлены `e2e/composition.spec.ts` и stateful fixture `Composition` в
`e2e/fixtures/composition.ts`. Fixture владеет candidate/start state, заимствует
editable и узкий CDP.send; test владеет созданием session и detach в finally.
Нет runtime изменений, нового public API или дополнительного editor state.

8 сценариев: Page/Edgeless × defaults/repeat200 × Chromium/Firefox. Chromium
использует Input.imeSetComposition и Input.insertText: локальный probe подтвердил
браузерные compositionupdate/beforeinput/input (trusted=true); compositionend
протокольного завершения имеет trusted=false. Firefox проверяет интеграционный
контракт через explicit CompositionEvent/InputEvent и DOM candidate replacement.
Это не автоматизация системного candidate popup/OS IME; native Enter в таком popup
не эмулируется. Отдельные isComposing keydown проверяют routing Enter/Tab/Backspace/
Ctrl+z без native default action. Выбран второй root с предшественником, чтобы
ошибочно обработанный Tab мог изменить hierarchy; roots проверяются неизменными.

Проверяются два intermediate candidates без model persistence, сохранение DOM
candidate после external model content update и2RAF, итоговый model text, focus,
текстовая позиция caret, один undo/redo итогового текста, cancel и обычный keyboard
input/undo после cancel. External update моделирует reconciliation через публичную
команду, не transport remote update. Существующий контракт whole-text commit
сохраняется: завершение composition заменяет External на candidate; посимвольное
слияние concurrent IME не заявляется.

Первый запуск4passed/4Firefox failures, все4 повторены workers1: тест ошибочно
сравнивал raw focusOffset=1 (element child offset) с text offset=2. Исправлена проверка
через длину DOM Range; требование caret после второго символа сохранено. Финальный
набор composition + history-delete + keymap: **28/28 passed (13.6s)** production5439,
Chromium/Firefox workers12. Regression не потребовала изменения редактора.

ESLint0errors/1 function-length warning; Prettier clean. Targeted strict tsc прошёл
с temporary config, привязывающим @chulane/rivto к existing dist/esm/index.d.ts.
Первый standalone tsc без workspace alias не нашёл пакет; после корректного
resolution ошибок новых declarations нет. Runtime build/performance не повторялись:
этот этап изменяет только tests, не скорость editing. Проверка OS IME Firefox,
оставшиеся embedding DnD и cold-root/large-subtree performance не закрыты этим набором.
Evidence: `/tmp/page-composition{,-serial,-final,-final-lint,-types-configured}.log`.

### Продолжение: embedding DnD, source feedback и потеря pointerup

Baseline production5439:8/8 выбранных embedding DnD tests упали на legacy row/slot
selectors; все8 повторены workers1 (diagnostic actionTimeout10s). Перенесены selectors
только проверяемых same-document/cross-document/source-handle сценариев и общий
`dragRow` slot locator. Drop feedback проверяется по реальным Page markers/visible
lines. Model parent/source-removal/undo/redo/cycle assertions сохранены.

После selector migration2passed/6failed; все6 подтверждены workers1. Настоящий
пропуск: Page preview появлялся, но исходные shells не получали data-dragging и
не приглушались. Unit regression до исправления1failed/7passed подтверждает отсутствие
маркера. Добавлен внутренний BlockDragSourceFeedback, один экземпляр на gesture:

- Один активный source использует BlockInputEvent.blockElement без DOM поиска.
- Группа один раз рассматривает mounted structural-selection markers, фильтруя их
  по canonical IDs и exact occurrence root. Это только visual feedback: hidden IDs
  остаются в captured command group; DOM не определяет selection или разрешение move.
- Предыдущие attributes сохраняются и восстанавливаются, включая detached shells;
  cleanup пытается освободить каждый marker и агрегирует ошибки.
- Show вызывается после чтения target geometry и перед preview; move не повторяет
  lookup. Page CSS владеет opacity0.45; новые RAF/listeners/manager facades не созданы.

Separate ownership review: constructor borrows root/active shell; gesture creates,
shows and clears feedback alongside existing drop feedback; class owns only borrowed
attribute restoration. Host adapter, core transactions и selection не менялись.
Проверены start→resolve→finish/cancel→detach/error paths и cleanup после partial mark.
Групповой querySelectorAll по selected markers всё ещё имеет browser-dependent
стоимость поиска в mounted DOM; O(R)/cold-root acceptance этим не объявляется закрытой.

После исправления выяснились две ошибки geometry в старых tests. `dragRow` прокручивал
window после hover, скрывая handle: добавлен повторный hover и native hit assertion
до pointerdown. Group test целился в центр полного subtree за viewport: теперь target
— row, viewport1800 и проверка видимости endpoints. Все model assertions сохранены,
добавлены фактические parents двух sources после group move и восстановление обоих
root parents одним undo.

Заодно выявлен реальный lost-release дефект: Firefox после release вне viewport
может не доставить pointerup, но доставляет pointermove с buttons=0. Native diagnostic
сохранил preview и2 markers. Controller теперь cancels matched gesture при потере
primary button bit. Unit regression провалилась до guard; браузерный regression
реально выпускает мышь за viewport и возвращает её, проверяет marker/preview cleanup
и неизменный root order. Не выдумывается commit destination вне окна.

Final runtime immutable5441:161/161 Page unit tests; Page types, Page/React/demo
production builds прошли. В том числе single-source zero-query, normalized groups,
hidden IDs, nested occurrence isolation, previous marker restoration, cleanup error,
Escape/blur/pointercancel/detach/lost-button cleanup и повторное pointer acquisition.
Final broad browser run: **73passed/1failed** workers12; единственный Firefox failure
cross-document embedding получил between вместо inside, **1/1 passed workers1**.
Это остаётся нестабильностью geometry test, не объявляется доказанно pre-existing
или исправленной. До broad run выбранные16 embedding/pointer сценариев проходили
целиком; после усиления group model/undo assertions2/2 прошли workers12.
Final lint0errors (function-length warnings), Prettier/scoped diff-check clean.

Performance: serial/no tracing production5439→5441, defaults/repeat200,1warm+3measured
native gestures each. Bento single и2-source group проверяют exact resulting order,
один core move и undo между samples. Group selection подготавливается через model вне
таймера; drag идёт через native mouse. Model command включает sync subscribers;
frames —2RAF proxy, pointerdown frames также включают последующее начало движения,
не изолированный момент activation. Не заявляется ускорение от восстановления opacity.
ms median[min,max], command / release frames:

| Case                    | Command before→after      | Release frames before→after           |
| ----------------------- | ------------------------- | ------------------------------------- |
| Chromium default single | 1.2[1.1,1.2]→1.1[1,1.1]   | 32[31.7,32.1]→31.8[31.8,32.4]         |
| Chromium200 single      | 2.3[2,2.5]→2.1[2.1,2.4]   | 121.6[119.4,124.3]→119.1[116.2,119.5] |
| Firefox default single  | 2[1,4]→1[1,4]             | 30[30,30]→31[31,31]                   |
| Firefox200 single       | 9[8,10]→9[8,9]            | 28[27,31]→28[28,29]                   |
| Chromium default group  | 1.4[1.2,1.5]→1.3[1.3,1.4] | 31.6[31.2,31.6]→31.7[31.7,31.7]       |
| Chromium200 group       | 2.7[2.6,3.3]→2.6[2.4,3.1] | 126.4[121.5,127.6]→125.6[124.8,127]   |
| Firefox default group   | 2[2,3]→2[2,4]             | 31[31,33]→32[31,32]                   |
| Firefox200 group        | 10[10,15]→10[9,10]        | 30[29,42]→28[27,29]                   |

На200 start-frame proxy: Chromium single76[72.1,81.6]→78[77.5,78.2], group83.3[81.2,89]
→82.5[78.9,86.8]; Firefox single19[19,20]→21[19,25], group27[26,28]→24[16,27].
Movement sync median Chromium0.2→0.3 single,0.3→0.3 group (after maxima1.5/3.3ms);
Firefox median0ms (timer resolution, не нулевая работа), after maxima1/2ms.
Release sync Chromium200 single5.5→5.5/group6→6.2; Firefox17→16/17→17.
Все остальные raw sync/frame ranges сохранены в logs. Большая Page всё ещё имеет
заметную Chromium render latency; cold-root/large-subtree и оставшаяся embedding
boundary/depth acceptance продолжаются.

Evidence: `/tmp/page-embedding-drag-{baseline,baseline-serial,modern,modern-serial}.log`,
`/tmp/page-source-feedback-{unit-before,unit-final,types-final,behavior,behavior-serial,behavior-final,final,final-retry,group-final,lint-final}.log`,
`/tmp/page-released-pointer-unit-before.log`, `/tmp/page-group-cleanup-probe.log`,
`/tmp/page-source-feedback-{perf-before,perf-after,group-perf-before,group-perf-after}.log`,
`/tmp/page-source-feedback-build-{page,react,demo}-final.log`.

### Продолжение: воспроизведение и устранение нестабильности embedding geometry

Оставшийся Firefox failure из предыдущего этапа исследован на неизменной production5441.
Временная диагностика сравнила source/target boxes, pointer point, scrollY и scroll
ancestors до/после held movement.20 повторов при workers12 дали19passed/1failed;
последовательный повтор failing Firefox scenario прошёл. Попытка --last-failed без
исходного --repeat-each не нашла repeat-specific ID; затем выполнен явный serial
запуск того же scenario, а не объявлен успешным пустой прогон.

Причина доказана координатами: helper центрировал только destination на y240,
оставляя source handle center на y66. BlockAutoScroll использует edge band96px;
первые движения реального указателя корректно прокручивали страницу. В успешных
samples destination менялась240→246, pointer y254 оставался внутри. В failed sample
она менялась240→250: pointer попадал на4px от верхнего края, и правильный live resolver
возвращал between вместо требуемого тестом inside. Это не неверная маршрутизация
между occurrences и не runtime regression source feedback.

`dragRow` теперь центрирует объединённую вертикальную область source и destination,
после прокрутки вновь hover-ит source/handle и перечитывает координаты. Native hit,
source dragging, target inside/between, model transfer, cycle rejection и undo/redo
assertions не ослаблялись. Нет sleep, повторов жеста до успеха, отключения autoscroll
или изменения его threshold; временная console-диагностика удалена.

После изменения test setup **20/20 повторов** same transport scenario прошли в двух
браузерах workers12. Полный затронутый набор из предыдущего этапа — embedding selected
DnD + Page pointer + clipboard drag + nested boundaries + cross-document editors —
**74/74 passed (11.5s)** Chromium/Firefox workers12. Установленная причина прежней
нестабильности устранена; это не обещание отсутствия любых future timing failures.
ESLint0errors/19 function-length warnings, Prettier/scoped diff-check clean.

Изменён только test helper; runtime API/ownership/performance не менялись, поэтому
новая сборка, Jest и повтор performance измерений не требуются. Source-feedback
performance evidence из предыдущего этапа сохраняет силу (benchmarks этот helper
не используют). Cold-root/O(R), большие поддеревья и оставшиеся embedding depth/gap
сценарии по-прежнему требуют отдельной приёмки.
Evidence: `/tmp/page-embedding-geometry-{reproduction,reproduction-serial,fixed,acceptance,lint}.log`.

### Продолжение: глубина gap вокруг body-slot и embedding

- `BlockOutlineDropTargets` теперь разрешает верхнюю границу следующего блока и
  нижнюю границу body-slot через общий метод класса. Горизонтальная позиция
  определяет дочернюю вставку; host-routed nested boundary использует ту же
  геометрию. Линия между siblings находится посередине соседних границ, а начало
  существующего child list остаётся у нижней границы строки. Внутренняя область
  вложенного редактора по-прежнему недоступна без явного routing host.
- Уже рассчитанный canonical sibling gap передаётся в `afterGap`: повторное
  чтение/фильтрация списка siblings устранено. Unit-проверки для 4 и 200 roots
  требуют одного `getRootIds` и сохраняют прежний предел измерений
  `ceil(log2(count)) + 2`. Фильтрация siblings и сбор mounted items остаются O(R).
- `PageBlocks` проецирует отсутствие host palette color в `transparent`:
  standalone Page default больше не закрашивает белым всю ветку embedding.
  Явный palette color, selection override и undo сохраняются. Нового theme API,
  подписки или второй модели цвета не добавлено.
- Обновлены selectors только двух gap/depth сценариев embedding; сохранены
  проверки midpoint, actual model parent/order, undo, оформления body и subtree
  selection. Добавлены отрицательные проверки нового inside-feedback attribute.

Проверки и ограничения:

- Исходные embedding сценарии: 12 failures/4 passes из-за старых selectors;
  последовательный повтор подтвердил 12 failures. После обновления selectors:
  8 passes/8 реальных Page failures; последовательный повтор подтвердил все 8.
- Первый runtime fix: 12 passes/4 failures на белом фоне shell; все 4 подтверждены
  последовательно. Затем исправлен default host projection; его unit-regression
  сначала падал и затем прошёл. Первые четыре новые geometry unit cases до
  исправления fixture падали из-за отсутствующего `DOMRect` в jsdom, поэтому
  этот запуск НЕ считается воспроизведением runtime-дефекта. Runtime baseline
  подтверждён настоящими browser-тестами выше.
- Page: 165/165 unit tests; отдельный финальный bounded-cost suite 9/9.
  Page types, Page/React/demo builds прошли. Focused lint: 0 errors, 22
  function-length warnings (включая новый `boundaryTarget`); это остаётся
  предметом финального review длины методов. Prettier и `git diff --check` прошли.
- Production 5443: расширенный browser run workers=12 — 50 passes/12 failures.
  Новые embedding gap/depth случаи прошли в Chromium/Firefox, defaults/200,
  Page/Edgeless; проходят также host/source moves, cycle rejection, hover
  selection и Page pointer depth/cancel/autoscroll. 12 failures относятся к
  старому `page-drag-gap.spec.ts`, который ищет `.page-block-row`; этот набор
  требует отдельного переноса selectors и повторного запуска до закрытия goal.

Performance: production 5441 → 5443, real native input, serial, tracing off,
1 warmup + 3 measured samples, canonical root order + single command + undo.
Старый nested benchmark отпускал pointer в центре вложенного блока; после
исправления глубины это корректно создаёт child, поэтому его assertion root
move упал. Для сопоставимого sibling move обе сборки заново измерены на одном
X = outer shell left + 12; не смешивать эти серии.

| Browser / repeat | Core command median [range], ms before → after | Pointerup + two frames before → after    |
| ---------------- | ---------------------------------------------- | ---------------------------------------- |
| Chromium / 0     | 1 [1, 1.1] → .9 [.9, 1]                        | 31.8 [31.8, 32] → 31.9 [31.8, 32]        |
| Chromium / 200   | 2.8 [2.8, 3] → 2.9 [2.7, 3]                    | 95.4 [95.2, 96.7] → 109.3 [104.2, 120.2] |
| Firefox / 0      | 2 [1, 3] → 1 [1, 3]                            | 31 [30, 31] → 31 [31, 32]                |
| Firefox / 200    | 11 [10, 11] → 11 [11, 11]                      | 160 [159, 160] → 160 [159, 164]          |

Move sync medians for repeat=200: Chromium 1.3→1.3 ms, Firefox 1→1 ms.
Pointerdown two-frame medians: Chromium 23.1→23.5 ms; Firefox 82→83 ms.
Это proxy с последующим gesture activation, а не изолированная цена начала.
Рост Chromium release/frame требует дополнительного сравнения geometry-only
5442 и final 5443; ускорение по этой серии не заявляется. Cold roots и полная
цена больших subtrees остаются открытыми.

Отдельный ownership review: host `PageDragBoundary` создаёт resolver и передаёт
`Pick<..., "resolve">` в `PageBlockDrag`/`PageDragOccurrence`; resolver не владеет
subscriptions, RAF или DOM lifetime. Native routing и canonical constraints
остаются в прежних владельцах. `ReactPanel` создаёт `PageBlocks`; snapshot cache
заимствует model identity, а потребители цвета — BlockView и node accessor.
Изменения не добавляют listeners, lifecycle owners, фасады или зависимости.

Evidence: `/tmp/page-embedding-depth-{modern,modern-serial,after,after-serial,final,final-serial}.log`,
`/tmp/page-embedding-depth-perf-sibling-{before,after}.log`,
`/tmp/page-host-background-{before,after}.log`, `/tmp/page-outline-cost-final.log`.

Последовательный диагностический повтор всех 12 `page-drag-gap` failures на
5443 завершился теми же missing-row timeouts (actionTimeout=10s вместо ожидания
30s; assertions не менялись). Host projection/rendering/container/selection
unit-набор прошёл: 17/17. Полная миграция goal остаётся активной.

### Продолжение: outer gaps контейнеров и host wrappers

Предыдущий goal-turn классифицирован как progress: изменены runtime/tests,
получены реальные failures и измерения, определившие следующие действия.

- Перенесены первые шесть сценариев `page-drag-gap.spec.ts` на Page feedback и
  общий row selector. Остальная часть файла пока сохраняет старые indicator
  assertions и требует отдельной миграции; весь файл зелёным не объявляется.
- После механического переноса: 6 passes/6 failures (workers=12); все 6
  подтверждены последовательно. Ошибки: линия после stationary блока пересекала
  пространство moving neighbor, нижняя граница контейнера выбирала его колонку,
  leading root gap пропускал Kanban, обёрнутый host modal.
- Проверка свежих координат не исправила leading gap. DOM probe показал
  `.rivto-block-modal` между Page root и shell; `mountedItems` его пропускал.
  Временный probe удалён, актуальное измерение после activation сохранено.
- Resolver теперь распознаёт arbitrary host placement wrappers, проверяет
  принадлежность найденного shell текущему editor root и восстанавливает outer
  placement для соседства. Canonical IDs и destination продолжают читаться из
  adapter, не выводятся из wrapper IDs. Обычный trailing walk идёт только по
  `.rivto-block-outline`; grid/container children остаются за explicit layouts.
  Нижняя внешняя граница non-outline контейнера использует его полный shell.
- Геометрический midpoint используется только для непосредственно соседнего
  canonical stationary item. Если между anchors остаётся source DOM, линия
  остаётся на stationary edge; model adjacency всё равно исключает moving roots.
- Новые unit cases воспроизвели оба container failures; затем wrapper добавлен
  в fixture и отдельно воспроизведён пропущенный root. Финальный Page suite:
  **167/167**. Лимит rectangle reads и одно чтение canonical roots сохранены.

Production 5444 (`/tmp/rivto-page-outline-container-demo`): **52/52** Chromium и
Firefox workers=12. Покрыты шесть root-gap сценариев, все предыдущие embedding
boundary/depth defaults/200 в Page/Edgeless, host/source moves, same-document
cycle restrictions, pointer ownership/cancel/depth/autoscroll. Page type check,
Page/demo builds, formatting и diff-check прошли. Focused lint: 0 errors,
11 length warnings; `boundaryTarget` и `listGap` всё ещё превышают 50 строк и
требуют завершения review длины методов.

Performance: real native input, serial/no tracing, defaults/200, 1 warmup + 3
samples. Сопоставимый sibling move около embedding, 5443 → 5444:

| Browser / repeat | Command median [min,max], ms | Pointerup two-frame proxy, ms           |
| ---------------- | ---------------------------- | --------------------------------------- |
| Chromium / 0     | .9 [.9,1] → .9 [.9,1]        | 31.6 [30.6,31.6] → 31.8 [31.4,31.9]     |
| Chromium / 200   | 2.8 [2.8,3.1] → 2.9 [2.9,3]  | 106 [103.2,127.4] → 105.1 [105.1,120.4] |
| Firefox / 0      | 2 [1,4] → 1 [1,4]            | 32 [31,32] → 30 [30,33]                 |
| Firefox / 200    | 11 [10,14] → 11 [11,11]      | 164 [160,177] → 163 [159,165]           |

Move sync median repeat=200: Chromium 1.3→1.7 ms (max 2.6→3), Firefox 1→1
(max 2→3). Pointerdown two-frame proxy: Chromium 23.2→25 ms, Firefox 83→83 ms.
Небольшая цена дополнительной проверки layout/wrapper не скрывается; ускорение
не заявляется. Прежнее сравнение 5441→5443 (95→109 ms Chromium) этим не закрыто.

Исправленный container outer-gap отдельно измерен на 5444 при viewport
1400×1800, defaults/200, с проверкой actual root order, одного grouped command
и восстановления adjacency после undo. Command/two-frame medians:
Chromium default .9 [ .8,1 ] /31 [30.7,31.2], repeat=200 3.1 [2.9,3.2] /99.5
[98.1,118.2]; Firefox default 2 [1,2] /31 [30,31], repeat=200 9 [8,9] /159
[144,174]. Это acceptance исправленного пути, не сравнение скорости с buggy
baseline. Первоначальный временный benchmark не находил wrapper-contained
shell по direct-child selector; selector исправлен до измерения.

Ownership review: `PageDragBoundary` создаёт один resolver, host occurrence
заимствует только `resolve`. Новые helpers остаются private methods этого
класса; подписок/RAF/listeners/registry ownership не добавлено. Wrappers остаются
host-owned и не меняют canonical hierarchy. Сбор direct mounted siblings и
canonical filtering остаются O(R); wrapper без block может потребовать поиска
в его содержимом. Полная миграция, cold-root performance, большие subtrees и
остальные browser suites не завершены; goal остаётся active.

Evidence: `/tmp/page-outline-gap-{modern,modern-serial,final,lint,perf-before,perf-after}.log`,
`/tmp/page-outline-{container-unit-before,wrapper-unit-before,container-units-final,container-perf}.log`,
`/tmp/page-outline-first-{geometry,probe}.log`.

### Продолжение: inside drop в пустую Kanban lane

Предыдущий turn — progress: runtime исправления, подтверждённые unit/browser
checks и новые perf evidence. На этом этапе продолжена оставшаяся приёмка
`page-drag-gap.spec.ts` без изменения критерия готовности всей миграции.

- Четыре inside-сценария перенесены с `data-drop-inside` на Page feedback:
  обычная строка, строка внутри lane, пустая lane и перенос между lanes.
  Обычная строка теперь дополнительно проверяет canonical parent после commit
  и возврат к root после undo. Outline проверяется на реальном target (2px solid),
  а не на удалённом legacy indicator child. Проверка запрета обычного блока
  внутри пустого board теперь проверяет и shell, и descendants на новый marker.
- Baseline 5444: 8/8 failures на старых markers, все повторены workers=1.
  После selectors: 4 passes/4 failures; четыре failures пустой lane подтверждены
  serial. Geometry probe: lane 240×160, child host только 216×40, под ним 50px
  видимого body без registered target; native hit на 70% высоты попадал в shell,
  feedback отсутствовал. Временный probe удалён.
- Исправление в host `kanban.css`: Page lane стала flex-column, её существующий
  child host заполняет остаток высоты. Никаких дополнительных padding/min-height,
  handlers, type switches в Page или дублирующих drop registrations не добавлено.
  Page `BlockChildren` уже регистрирует empty expanded host; теперь его геометрия
  совпадает с body. Применена инструкция `rivto-containers` с сохранением новой
  Page архитектуры вместо устаревших ссылок skill на recursive BlockTree.
- Production 5445 (`/tmp/rivto-page-empty-column-demo`): **34/34** Chromium/Firefox
  workers=12 — перечисленные внутриколоночные сценарии, запрет board insertion,
  Kanban Edgeless pointer behavior, root-container edges, Page pointer
  ownership/cancel/depth/autoscroll. React и demo builds прошли. Focused lint:
  0 errors/7 существующих length warnings; Prettier и diff-check прошли.

Performance: native pointer, production, serial/no tracing, defaults и repeat=200,
viewport 1400×1800, 1 warmup +3 samples. Создана реальная empty leading lane в
обычном demo Kanban; остальные блоки/расширения остаются. Проверены actual parent,
ровно один grouped command и original root adjacency после undo. На 5444 этот
же сценарий падает на `real move into empty lane must commit`; время rejected
no-op не сравнивается со временем успешного переноса.

| Browser / repeat | Command median [min,max], ms | Pointerup two-frame proxy, ms |
| ---------------- | ---------------------------- | ----------------------------- |
| Chromium / 0     | 1.3 [1.2,1.3]                | 32.2 [32,32.5]                |
| Chromium / 200   | 4.9 [4.5,5.6]                | 157.5 [149,186.8]             |
| Firefox / 0      | 2 [1,4]                      | 31 [31,31]                    |
| Firefox / 200    | 14 [13,14]                   | 179 [176,180]                 |

Move sync repeat=200: Chromium median .6/max2.6ms; Firefox median0/max1ms
(ограниченная точность clock, не отсутствие работы). Pointerdown two-frame proxy:
Chromium27 [10.6,27.5], Firefox74 [65,79]ms; proxy включает subsequent activation
и не является изолированным cold gesture start. Большие commit/render задержки
сохраняются, ускорение этим этапом не заявляется.

Ownership review отдельно: layout остаётся у host Kanban, registration и feedback
у Page `BlockChildren`/`BlockDropTargets`/`BlockDropFeedback`, ограничения и commit
у существующих model/core команд. API/dependencies/lifecycle не изменены. Новых
unit tests CSS геометрии не добавлено: регрессия воспроизводится и проверяется
реальным browser hit testing. Полный `page-drag-gap.spec.ts`, общая финальная
приёмка и performance/cold-root ограничения остаются открытыми; goal active.

Evidence: `/tmp/page-container-inside-{baseline,baseline-serial,modern,modern-serial}.log`,
`/tmp/page-container-empty-probe.log`, `/tmp/page-empty-column-{final,lint,perf-baseline,perf-final}.log`,
`/tmp/page-empty-column-build-{react,demo}.log`.

### Продолжение: bounded suffix при child append и декомпозиция resolver

Предыдущий turn — progress: восстановлена геометрия empty Kanban target,
подтверждены модельные операции и измерения. Этот этап завершает отдельную
оптимизацию в существующем `BlockOutlineDropTargets`, не меняя общий goal.

- Вставка child в конец предыдущего outline больше не фильтрует весь childIds
  в новый массив. Приватный `beforeGap` читает список с конца до первого
  stationary child; excluded moving suffix сохраняет canonical adjacency.
  Collapsed nodes, non-outline layouts и sibling X сохраняют исходный gap.
- Из `listGap` выделен приватный `firstItemAfter` с тем же бинарным поиском и
  теми же DOM measurements. `boundaryTarget` сохраняет координацию геометрии.
  Все runtime methods этого файла теперь укладываются в лимит 50 строк.
  Новых публичных API, классов, менеджеров, фасадов, listeners или caches нет.
- Детерминированный regression проверяет destination/indicator и число
  адресных child reads для 4/200 children с двумя исключёнными последними IDs:
  baseline читает 4/200 и падает; final читает 3/3. Полный обход siblings и
  mounted root items не устранён и по-прежнему может быть O(R).
- Final Page unit suite **169/169**; Page types и Page/demo builds прошли.
  Focused lint: 0 errors, 3 function-length warnings только в тестовом файле
  (включая новый cost case); runtime warning нет. Formatting/diff-check прошли.
- Production 5446 (`/tmp/rivto-page-outline-suffix-demo`): **64/64** Chromium/
  Firefox workers=12. Набор объединяет предыдущие root/embedding/inside-column
  сценарии, same-document/cross-document moves, Page pointer ownership/depth/
  autoscroll и Kanban Edgeless pointer. Полный browser suite не объявляется зелёным.

Performance: production 5445 → 5446, native drag, serial/no tracing, default demo
и repeat=200. В обычную demo добавлен paragraph с 4/200 реальными детьми,
source root перед ним и following root после него. Gesture активируется handle,
затем following row прокручивается в центр и pointer входит в её верхний край
с X+36. Проверяются фактический parent, последняя позиция source среди children,
один grouped command, root parent и исходное число children после undo.
1 warmup +3 measured samples; исходные demo blocks/extensions не удаляются.

| Browser / repeat | Command median [min,max], ms before → after | Pointerup two-frame proxy before → after  |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| Chromium / 0     | 1.2 [.9,1.2] → 1.1 [.8,1.2]                 | 31.5 [31.4,31.7] → 31 [30.9,31.2]         |
| Chromium / 200   | 5.4 [4.9,5.7] → 5.2 [5.1,6]                 | 171.8 [168.6,172.4] → 173.9 [168.6,180.9] |
| Firefox / 0      | 1 [1,1] → 1 [1,2]                           | 30 [30,32] → 31 [30,32]                   |
| Firefox / 200    | 16 [15,16] → 14 [13,15]                     | 191 [188,199] → 189 [179,193]             |

Repeat=200 pointermove sync medians: Chromium .5→.5 ms (max2→1.9), Firefox
0→0 ms (max2→2, precision-limited clock). Pointerup sync: Chromium19.6→19.1,
Firefox38→35 ms. Pointerdown two-frame proxy: Chromium20.1→12.3, Firefox15→12ms;
это не изолированный cold start, gesture дополнительно включает прокрутку цели.
Полный interaction не демонстрирует устойчивого ускорения; подтверждённый gain —
3 reads вместо 200 и отсутствие временного filtered child array. Cold roots,
large-subtree commit/render cost и прежние Chromium/Firefox ограничения открыты.

Отдельный ownership review: новые методы остаются private у borrowed resolver,
используют существующий addressed adapter и measured rectangles, не хранят
selection или geometry между событиями. Host `PageDragOccurrence` продолжает
получать только `resolve`; создание и destruction/attachment не меняются.
Полная миграция и приёмка остаются незавершёнными, goal active.

Evidence: `/tmp/page-outline-suffix-{before,after,types,lint,browser,perf-before,perf-after}.log`,
`/tmp/page-outline-suffix-build-{page,demo}.log`.

### Продолжение: mixed root gaps и диагностика массового style invalidation

Предыдущий turn — progress: bounded child suffix, runtime refactor и проверенная
приёмка. В этом turn authoritative изменения — обновлённые mixed-root browser
assertions; дополнительно получено evidence для следующей performance-правки.

- `centers the <container> root gap` для Bento/Table/Columns/Kanban: baseline
  5446 workers=12 дал 8 passes (Edgeless), 8 failures (Page legacy indicator).
  Все 8 failures повторены workers=1. Тесты перенесены на union видимых линий;
  сохранены exact midpoint/X/width и canonical root order, вместо legacy axis
  attribute проверяется реальная высота (Page 2px, retained Edgeless 4px).
- Final **16/16** Chromium/Firefox workers=12. Только тесты, runtime не менялся;
  поэтому новый production build или повтор interaction timings ради этого
  selector update не требовался. Focused ESLint/Prettier/diff-check прошли
  (function-length warnings в существующих длинных тестах сохраняются).
- Весь `page-drag-gap.spec.ts` пока не перенесён: root/container boundary sweeps,
  report-only-child outdent, title и tail-subtree assertions требуют дальнейшей
  проверки; не считать 16 cases доказательством всего файла.

Отдельная диагностика большого native sibling move рядом с embedding, production
5446, Chromium repeat=200. Trace запускался отдельно от behavioral/performance
runs. Все trace timings ниже диагностические, а не performance benchmark.
Порядок root IDs и один grouped command проверяются тем же реальным pointer
сценарием. Запись начинается непосредственно перед pointerup и заканчивается
после двух RAF; default fixture/расширения сохранены.

1. Обычный timeline trace: `UpdateLayoutTree` суммарно49.1ms, основной recalc48.1ms
   для **10505 elements**. HitTest30.2ms, FunctionCall14.5ms, Layout7.6ms. Времена
   категорий перекрываются, складывать их как независимые части нельзя.
2. Дополнительный invalidationTracking trace (дороже, его timings не сравниваются
   с обычным trace) показал invalidation от `:has` на `.journal-stack` и
   `.journal-document` при removal drag feedback. Общий has invalidation set
   затрагивает тысячи `page-block-content`, `block-handle`, `block-handle-icon`,
   а также `.rivto-block` и list attributes. События содержат selector
   `.journal-stack:has([data-panel-root]:not([data-panel-root=""])) [data-journal-document="yesterday"]`.
3. CSSOM probe без правки repo: три journal `:has` ограничены direct-child paths.
   Основной recalc остаётся **10505 elements** (~44.1ms). Этот подход не внедрён.
4. CSSOM probe без правки repo: три journal selectors заменены на inert explicit
   attributes, которые в проверяемом root-Page состоянии отсутствуют (поэтому
   видимое поведение этого конкретного сценария сохраняется). Основной recalc
   стал **4306 elements**, ~15.6ms; combined UpdateLayoutTree16.5ms. Proxy до двух
   RAF ~73.4ms вместо105.6ms первого diagnostic run. Это гипотеза о выигрыше,
   а не production optimization и не доказательство корректности mode/navigation.

Следующее действие: убрать descendant `:has` из трёх правил `demo/src/styles.css`
(lines around81,127,136), снабдив journal реальным состоянием active panel/mode.
Не мутировать DOM в кнопках и не ставить MutationObserver на всё дерево.
`DemoEditorPanels` уже владеет retained entries/active и их `ModeManager`;
`JournalDemoApp` владеет `.journal-stack` и today/yesterday sections. Допустимое
направление — узкое уведомление от текущего active panel и подписка только на
его mode с cleanup при смене active/unmount; UI projection в JournalDemoApp.
Не дублировать менеджеры и не переносить yesterday под BlockHandleContext
today: иначе его handle может открыть блок через неверный editor. Пропсы нового
контракта должны иметь именованный интерфейс и JSDoc; передавать только root
identity/mode, нужные journal chrome. Новая реализация пока НЕ написана.

Перед внедрением проверить реальные DOM contracts: runtime5446 Edgeless root
`MAIN.edgeless-viewport` — direct child `SECTION.journal-document`; текущий
`HEADER.demo-panel-header[data-panel-root]` также direct child этой section.
Root heading `h1.journal-date` с `time` вложен в header. Существующий panel test
`shows the complete panel path as a standalone page` проверяет hidden yesterday
при open и visible после breadcrumb return для default/200; helper `open` в
`e2e/panels.spec.ts` пока использует старую `.page-block-row`, его нужно перенести
на общий row selector, сохранив реальные handle clicks. Нужна проверка цикла
Page→Edgeless→Page и breadcrumbs, затем честные before/after timings без tracing
в Chromium/Firefox default/200. Residual 4306 style elements/native HitTest и
cold-root/large subtree cost остаются отдельными открытыми ограничениями.

Evidence: `/tmp/page-mixed-root-gaps-{baseline,baseline-serial,modern,lint}.log`;
`/tmp/page-root-release-5446-profile.log`, `/tmp/page-root-release-5446.trace.json`;
`/tmp/page-root-invalidation-5446-profile.log`, `/tmp/page-root-invalidation-5446.trace.json`;
`/tmp/page-root-scoped-probe.log`, `/tmp/page-root-scoped-probe.trace.json`;
`/tmp/page-root-state-probe.log`, `/tmp/page-root-state-probe.trace.json`.
Temporary scripts: `/tmp/page-root-release-profile.mjs`,
`/tmp/page-root-invalidation-profile.mjs`, `/tmp/page-root-scoped-profile.mjs`,
`/tmp/page-root-state-probe.mjs`, `/tmp/journal-mode-dom.mjs`.
Goal остаётся active; полный objective не сужен до этого диагностического этапа.

### Продолжение: journal state вместо широких CSS :has

- В production demo три journal-селектора `:has` заменены явными data-атрибутами. Источник — существующий ModeManager активной записи DemoEditorPanels и её rootBlockId, а не DOM или режим общего editor.
- DemoEditorPanels публикует mode/scope через обязательный узкий callback единственному потребителю JournalDemoApp. useLayoutEffect подписывается на текущий ModeManager и возвращает его disposer; смена active/callback и unmount снимают прежнюю подписку. JournalDemoApp сохраняет identity равного состояния. Новых менеджеров, MutationObserver и обходов документа нет.
- Проверен путь создания/передачи/использования/cleanup: ModeManager создаётся и сохраняется в DemoEditorPanels; journal получает только значения, не lifecycle API; EditorPanel продолжает получать исходный mode. Props получили именованный интерфейс; callback не попадает в forwarded props. Остальные взаимодействия и модель не изменены.
- Baseline 5446: 8/8 Chromium/Firefox, workers=12, default/repeat=200. Final production 5447: 10/10, включая mode cycle, Edgeless подпанели, возврат в корневую Page, повторный mode cycle и удаление открытого блока. Само количество подписок после unmount отдельным автоматическим тестом не измерялось; cleanup проверен по effect/disposer и сменам панели.
- Final demo build (включая tsc) прошёл; focused ESLint: 0 errors, 11 max-lines-per-function warnings; Prettier и git diff --check прошли. Полные workspace checks этим этапом не заменены.
- Реальный native pointer перенос корневого соседа embedding: production 5446→5447, Chromium/Firefox, default/repeat=200, serial, tracing off, один warm-up и три измерения; проверены итоговый canonical root order и одна групповая команда. Скрипт /tmp/nested-outline-gap-benchmark.mjs; логи /tmp/page-journal-perf-before.log и /tmp/page-journal-perf-after.log. Формат ниже: median [min,max], мс.
  - Chromium default command 1.2 [1.1,1.4]→0.9 [0.9,1.2], pointerup+2RAF 31 [31,31.7]→31.9 [31.6,32.1].
  - Chromium 200 command 2.9 [2.7,3.2]→3 [2.9,3.4], pointerup sync 8.7 [8.6,9.2]→8.9 [8.6,9.6], pointerup+2RAF 108.7 [98.6,160.1]→68 [66,85.1]. pointermove sync median 1.8→1.7, max 3.4→4; pointerdown+2RAF 23.7→24.5.
  - Firefox default command 2 [1,4]→1 [1,4], pointerup+2RAF 31 [30,31]→32 [31,32].
  - Firefox 200 command 11 [10,11]→10 [10,11], pointerup sync 20 [19,21]→20 [19,21], pointerup+2RAF 161 [160,162]→161 [159,161]. pointermove sync median 1→1, max 2→2; pointerdown+2RAF 83→82.
- Подтверждено локальное улучшение Chromium rendering после drop, не ускорение всех команд или Firefox. Холодное изменение корней, O(R), большие поддеревья и оставшаяся полная приёмка goal не закрыты.

### Продолжение: grid boundaries и оставшиеся outline regressions

- Предыдущий turn — progress: journal runtime/CSS изменены, поведение и native performance проверены. В этом turn полный page-drag-gap на production5447 дал 42 pass / 14 fail; все 14 повторены serial. Оставшиеся старые line/inside markers переведены на occurrence-level Page feedback, Edgeless selector сохранён. Geometry/model assertions сохранены. После переноса: 46 pass / 10 fail, все 10 подтверждены workers=1.
- Диагностика actual native hit выявила grid child host, ошибочно передаваемый listGap вертикального outline. Заголовок того же контейнера предлагал inside, отклоняемый host hierarchy.
- BlockOutlineDropTargets теперь оставляет unregistered grid interior без fallback; нижняя gapSize-кромка даёт sibling boundary контейнера, если контейнер не входит в moving subtree. Explicit targets по-прежнему имеют приоритет. Заголовок non-outline layout выбирает внешнюю before/after границу. Типы Kanban/Columns в resolver не добавлялись.
- Расширенная unit-проверка (оба movingNeighbor варианта) до fix: 2 fail / 11 pass; после: 169/169 Page tests. Проверяет title/bottom-rim destination+line, отрицательный grid interior и исключение движущегося board. Браузерный title test дополнительно проверяет реальное перемещение Alpha в конец root IDs, чтобы отвергнуть no-op.
- Production demo использует rivto-page через dist (в отличие от aliased host/core), поэтому обязательный порядок здесь: Page build → demo build → copy immutable preview. Первый 5448 прогон до обновления dist не является проверкой fix. После корректной сборки: полный файл 50 pass / 6 fail; все шесть повторены workers=1. Focused final: 16/16 Chromium/Firefox workers12, включая outer-edge, title, empty board/lane, sibling lanes, final subtrees и Edgeless.
- Не закрыты: TODO-storage→Bento (hit попадает в source todo-item); only-child outdent (line center202 вместо ожидаемых130); report next-block top edge (после helper scroll hit оказывается parent shell). Каждый воспроизводится в обоих браузерах, не только parallel. Для report необходимо отделить stale coordinates/scroll от actual gap geometry; assertions не ослаблены.
- Page types/build и demo build прошли; lint 0 errors / 10 length warnings, Prettier и diff check прошли. Runtime API, зависимости и lifetime не менялись: существующий resolver заимствуется PageDragBoundary/PageBlockDrag/PageDragOccurrence; validation остаётся у drag adapter и command. Explicit layout registrations сохраняют приоритет; sibling destinations содержат реальные parentId. Новых обходов поддеревьев/подписок нет.
- Native performance: первый старый скрипт измерял target ДО activation и попадал внутрь grid; другой setup мог оставить endpoint вне viewport. Эти прогоны не сравниваются как успешные timings. Исправленный /tmp/container-settled-gap-benchmark.mjs центрирует оба endpoint вне timed section, активирует gesture, ждёт 2RAF и заново измеряет destination. Одинаковый скрипт на production5447→5448, default/200, Chromium/Firefox, serial, tracing off, 1 warm-up+3 samples, asserts canonical root move, exactly one grouped command, undo original adjacency. Это warmed gesture, не cold-root benchmark.
- Outer edge pointerup+2RAF median[min,max], ms: Chromium default31.3[30.8,31.4]→30.5[30.2,30.6]; Chromium20069.3[67.9,70]→67.2[66.8,68.7]; Firefoxdefault31[29,32]→31[30,31]; Firefox200160[160,163]→159[158,175]. Command median: 1→0.9 / 3.4→2.9 / 2→1 / 12→12 соответственно. Это correction, не доказанное ускорение.
- Исправленный inner bottom rim отдельно измерен /tmp/container-grid-rim-benchmark.mjs с теми же correctness/undo assertions, final5448: Chromium200command3[2.8,3.3], pointerup+2RAF68.8[66.1,69.6]; Firefox200command12[10,12], frames164[162,173]. Default и все start/move/up sync/frame ranges записаны в /tmp/page-grid-rim-perf.log. Сравнение outer edge: /tmp/page-grid-settled-perf-{before,after}.log. Firefox cost, cold roots/O(R), large subtrees и full goal acceptance остаются открыты.
- Evidence: /tmp/page-gaps-{full,full-serial,modern,modern-serial}.log; /tmp/page-gap-probe.log (temporary probe удалён из repo); /tmp/page-grid-boundary-{unit-before,units,build,package-build,browser-final,browser-final-serial,focused,lint}.log. Production5448 /tmp/rivto-page-grid-boundary-demo.

### Продолжение: moving-child boundary и завершение page-drag-gap

- Предыдущий turn — progress (grid resolver и подтверждённые browser/unit результаты). Текущие три незакрытых сценария проверены на immutable5448. Перемеривание report targets после activation само по себе не помогло: 4/4 failures, подтверждены serial. Only-child line оставалась на72px ниже текущей строки (266 вместо194).
- Причина row-line: boundaryTarget усреднял нижнюю грань строки с следующим sibling через пространство расширенного outline. Теперь при наличии видимого outline граница строки сохраняется. Regression unit до fix:1fail/13pass, после полный Page170/170. Добавлена проверка самой destination и top, не только visibility.
- Report next-row: probe показал scrollY385→364 и rowY166→187 между измерением и завершением test gesture. После программной прокрутки helper теперь сначала выводит указатель из edge-scroll зоны, ждёт2RAF, callback измеряет target, затем выполняется один native move к актуальной точке. Промежуточная версия без вывода из зоны один раз дала55/56, serial retry1/1pass; этот flaky результат не скрыт. Final полный файл56/56, отдельные5повторов обоих report scenarios в обоих браузерах20/20, workers12.
- TODO→Bento: нативный hit находился в последнем moving todo-item на нижней кромке storage, поэтому прежний resolver полностью отклонял hit. Новый private movingChildBoundary проходит DOM ancestors до occurrence root, выбирает предка над внешним moving root, измеряет только его rectangle и разрешает только нижнюю gapSize-кромку. Interior/foreign occurrence остаются недоступны. Проход использует parentElement/matches, без повторных closest-обходов всей ancestry.
- Первоначальное делегирование этой кромки boundaryTarget было недостаточно: при stationary siblings afterGap выбирал начало children, а TODO status ordering затем возвращал task. Probe core moveBlocks подтвердил перестановку внутри storage, не потерю ID. Расширенный unit со stationary child воспроизвёл ошибку. Final кромка получает siblingGap родителя напрямую, без child insertion. TODO browser assertion проверяет real root order и один undo обратно в storage.
- Final production5450: /tmp/rivto-page-moving-child-demo. Порядок Page build→demo build соблюдён. Page170/170units, пакет build/dts и demo tsc/build прошли. Focused lint0errors/11function-length warnings; Prettier и diff check прошли. Временные console/probe изменения удалены из repo.
- Отдельно проверены границы: изменение только внутри существующего BlockOutlineDropTargets; публичные API/регистрации/владельцы не добавлялись. PageDragBoundary создаёт resolver, PageBlockDrag/PageDragOccurrence его заимствуют; canMove/commit по-прежнему валидируют реальные parentId. Selection остаётся canonical captured IDs, DOM используется только для occurrence geometry. Ни источники модельных данных, ни teardown не менялись. Existing root rectangle-read bounds остаются зелёными.
- Performance final5450: native pointer, defaults и repeat200, Chromium/Firefox, serial/tracingoff,1warm+3samples, реальные canonical move +1groupedcommand+undoassert. /tmp/container-settled-gap-benchmark.mjs сохраняет endpoints/activation protocol предыдущего turn; baseline immutable5448 /tmp/page-grid-settled-perf-after.log, final /tmp/page-moving-child-perf-outer.log.
  - Outer edge command medians Chrome0 0.9→1; Chrome2002.9→3; Firefox0 1→1; Firefox20012→10ms.
  - Outer edge pointerup+2RAF median[min,max] Chrome0 30.5[30.2,30.6]→30.6[30.5,30.8]; Chrome20067.2[66.8,68.7]→66.5[65.7,69.1]; Firefox0 31[30,31]→29[28,32]; Firefox200159[158,175]→157[156,159]. Существенного ускорения не заявляется.
- /tmp/moving-child-rim-benchmark.mjs отдельно проверяет исправленный hit в moving last child родителя со stationary sibling, на исходном demo default/200; undo возвращает точный parent и child order. Final /tmp/page-moving-child-perf-rim.log: Chrome0 command1[1,1.1]/frames32.4[32.2,32.4]; Chrome2004.2[4.1,5.2]/95[94.8,98.3]; Firefox0 2[1,2]/31[31,32]; Firefox20015[14,15]/174[171,177]. Это рабочий новый путь; rejected/no-op baseline не сравнивается как ускорение. Все pointerdown/move/up sync/frame ranges сохранены в logs. Cold roots, O(R), большие поддеревья и Firefox cost остаются открыты.
- Evidence: /tmp/page-report-current-coordinates{,-serial}.log; /tmp/page-next-row-scroll-probe.log; /tmp/page-parent-row-unit-before.log; /tmp/page-moving-child-edge-before.log; /tmp/page-moving-parent-siblings-before.log; /tmp/page-parent-row-browser{,-serial}.log; /tmp/page-moving-child-browser{,-serial,-final}.log; /tmp/page-report-body-serial.log; /tmp/page-report-repeat-final.log; /tmp/page-todo-{commit,release}-probe.log; /tmp/page-moving-child-{units,package-build,demo-build,lint}.log.
- Полный page-drag-gap закрыт на текущей сборке; это не заменяет остальную приёмку goal (оставшиеся suites/exports/workspace checks/архитектурный аудит и cold-root performance).

### Продолжение: workspace gates, React fixtures, Kanban/panels acceptance

- Предыдущий turn — progress: runtime moving-child geometry исправлена, page-drag-gap56/56, report repeats20/20, Page170/170 и native performance. Этот turn расширил проверку до всего workspace и оставшихся Kanban/panels.
- Текущий workspace: pnpm check-types прошёл (включая React/Page/demo/docs), pnpm build прошёл (включая docs), pnpm lint прошёл с0errors/520warnings. pnpm test прошёл: CRDT128, document-model94, graph-runtime13, block-graph3, core129, keyboard4 =371tests. Логи /tmp/page-workspace-{types,build,lint,unit}.log.
- Полный React baseline:38failed/560passed (598total), три файла. Причины подтверждены чтением ошибок и fixture contracts: ElementTarget/FakeElement не реализовывали hasAttribute, target.test.ts распознавал только старый row selector, preset tests ожидали старое количество Page wrappers. Runtime guard не ослаблялся: настоящему HTMLElement требуется стандартный hasAttribute.
- Fixture классы получили документированный hasAttribute на существующей attributes Map; pointer fixture использует общий BLOCK_ROW_SELECTOR; preset assertions проверяют реальные PageTextSelectionBoundary/PageBlockSelectionBoundary, отсутствие старого Page block wrapper и сохранение Edgeless wrapper.
- Focused3files77/77; final полный React93suites/598tests pass. React types после fixture edits прошли; focused lint0errors/21warnings, Prettier и diff check прошли. /tmp/page-react-{unit,fixtures-modern,unit-final}.log, /tmp/page-fixtures-types-final.log, /tmp/page-fixture-lint.log.
- Browser baseline immutable5450 Kanban+panels:28pass/12fail, workers12. Все12подтверждены workers1; для отсутствующих DOM selectors использован diagnostic config сactionTimeout10s (исходные failures были30s); final запуск снова обычный config.
- Все оставшиеся panel row/preview selectors обновлены. Kanban helper использует общий row marker, Page/Edgeless visible insertion line, реальную thickness2/4 по occurrence, child-host union. Проверки геометрии, dashed source feedback, canonical order, card/lane counts, modal focus и collapse сохранены. Expanded Kanban использует Page даже при внешнем Edgeless, поэтому выбор marker по глобальному mode неверен.
- После обновления selectors:36/40pass. Все panel cases прошли, в том числе repeat200, clipboard, keyboard navigation, selection и nested Edgeless card dragging. Оставшиеся4Kanban failures подтверждены serial: reorders sibling cards from their outline edges, внешниеblock/edgeless ×Chromium/Firefox.
- Конкретная незакрытая регрессия: на шаге horizontal move целая kanban-column (source имеетdata-dragging) попадает в body другой kanban-column, нативныйhit=.rivto-block-children. Новые explicit horizontal gap strips не покрывают body; inside destination для lane→lane запрещена, insertion feedback отсутствует. Старое поведение выбирало before/after lane по горизонтальной половине. Не менять тест на попадание только в16px gap — это сузит исходное поведение. Нужно восстановить горизонтальный lane-body routing, сохранив card→lane inside и occurrence/model constraints. /tmp/page-kanban-column-hit.log подтверждает actual native hit; временный probe удалён из repo.
- Evidence /tmp/page-kanban-panels-{baseline,baseline-serial,modern}.log; /tmp/page-kanban-modern-serial.log. В этом turn production runtime не менялся, поэтому новые performance timings не требовались; прежний5450benchmark остаётся evidence для runtime этого build. Подтверждённые workspace gates не означают завершение behavioral acceptance или финального architecture audit.
