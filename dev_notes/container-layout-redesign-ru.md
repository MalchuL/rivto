# Новые layouts: Kanban, Bento, TODO storage, Columns

## Решение и границы

Запрос пользователя: спроектировать и реализовать эти четыре блока заново на layout,
не переносить прежнюю DOM/CSS-адаптацию. Сохранить сразу все пользовательские возможности.
Table в эту итерацию не входит. Старый инвентарь `container-reimplementation.md` —
справочник функций, а не образец нового JSX или визуальной структуры.

Документ, IDs, операции, история и существующие правила размещения остаются основой.
Заново проектируются композиция представления, владельцы локального состояния,
расположение controls и визуальная геометрия. Существующие операции и контроллер
resize сохраняются как отдельные поведенческие компоненты, а не копируются внутрь layout.

## Первый проход: единые инварианты

- Один `BlockNode` / `BlockView` на блок. Один `BlockChildren` обходит его детей.
- `layout` размещает собственный `BlockRow`, `BlockBody`, `BlockChildren` и controls.
  Row и children остаются прямыми детьми shell: это текущий проверенный контракт
  hover, keyboard navigation и outline drop resolver, а не произвольная вложенность.
- `BlockChildren.item` получает уже созданный блок. Item задаёт размещение,
  обрамление и resize; не создаёт второй BlockView и не обходит дерево.
- Controls после списка передаются как JSX children в `BlockChildren`. Никаких
  querySelector, append и createPortal для поиска и модификации child host.
- Цвета и границы контейнера задаются его собственным CSS и именованными областями.
  Родитель не переписывает padding/handle/row всех рекурсивных потомков.
- Page задаёт единый наследуемый фон выделения для shell и областей layout.
  Это прежний `--rivto-block-selection-background` (`#e5dfff` по умолчанию),
  без multiply и других способов смешивания, меняющих видимый цвет.
  Непрозрачные области layout используют этот фон вместо собственного только
  на время выделения. Текст и иконки не перекрашиваются; вложенные selected-markers
  не добавляют обводок. После снятия выделения возвращаются собственные цвета.
- Заголовки и management rows участвуют в потоке. Не накладываем пустую строку
  родителя на первую карточку отрицательными margin.

## Второй проход: четыре независимых композиции

### Kanban

`KanbanLayout`: строка названия/статистики и modal-control, body contributions,
горизонтальный `BlockChildren` с явными sibling gaps и `Add column` после колонок.
Горизонтальный scroll принадлежит child host.

`KanbanColumnLayout`: редактируемый заголовок/счётчик, body contributions,
вертикальный `BlockChildren` с item-обрамлением карточек и `Add card` после списка.
Карточка остаётся произвольным обычным блоком, включая вложенные контейнеры.

Сохраняются добавление/фокус/undo, drag между колонками, collapsed-статистика,
modal occurrence, запрет структурного indent/outdent колонок.

### Bento

`BentoLayout`: строка названия/счётчика/modal-control, body contributions,
оборачивающийся `BlockChildren` с `BentoTileItem`.

Tile item: `BlockDropWrapper` резервирует полосы before/after, измеряемая внешняя
область владеет шириной, визуальный центр совпадает с областью вложенного блока.
Resize controls находятся в JSX item. Геометрия вставки не является рамкой карточки.
Ширина включает drop strips; host gap равен нулю, чтобы не удваивать промежутки.

Сохраняются предпочтительная ширина 160–960 px, обе стороны resize, заморозка
соседей, preview/commit/cancel, keyboard 10/50 px, modal и обычные вложенные блоки.

### Columns

`ColumnsLayout`: management row с настройками и collapsed-summary, body,
горизонтальный `BlockChildren` с равными долями и явными gaps/dividers.
Сами колонки остаются без текстовых заголовков.

`ColumnsColumnLayout`: management row для выбора, drag и collapse самой колонки
(без текстового заголовка в развёрнутом состоянии), body contributions и обычные дети. Доступное пустое состояние
создаёт блок через default writing factory. Divider принадлежит промежутку,
а не содержимому соседней колонки.

Сохраняются 1–6 колонок, настройка divider, перенос содержимого удаляемых колонок,
IDs, undo и поведение пустых колонок.

### TODO storage

`TodoStorageLayout` владеет provider локальных query/filter state, строкой toolbar
или collapsed-summary, body и вертикальным `BlockChildren`.
`TodoStorageItem` применяет фильтр только к непосредственному ребёнку этого storage.
Это локальная композиция item, а не глобальный wrapper для каждого блока редактора.

Provider не создаёт внешнюю визуальную оболочку вокруг BlockView. Search/filter
остаются локальными для occurrence; порядок статусов и изменения child order —
в документе. Сохраняются все фильтры, reorder статусов, режим manual/status,
пустое поле и начало ввода, подсчёт элементов, nested storage и TODO properties.
Сортировка использует прежние чистые правила и транзакционные операции.

## Третий проход: владение, зависимости, lifecycle

- React extension регистрирует content/layout/behavior; runtime владеет cleanup.
- Layout и controls заимствуют ID-bound hooks; не создают editor/panel/registry.
- Page владеет shell, selection painting, collapse, traversal, hover и DnD.
  Ни одна ветка Page не проверяет имя Kanban/Bento/Columns/TODO.
- Kanban controls владеют только событиями добавления. Отложенный focus разрешает
  актуальный occurrence root при выполнении; документ меняется одним batch.
- Bento item владеет измеряемым DOM и resize controller; unmount отменяет gesture.
  Существующий контроллер заимствует только getBlockNode/updateBlock.
- TODO provider владеет local state/effects, item заимствует его контекст.
  Удаляются регистрации глобальных storage/visibility wrappers.
- Modal остаётся самостоятельным wrapper: это отдельная occurrence, не способ
  размещения кнопок и не второй renderer детей внутри исходного блока.

## Четвёртый проход: проверяемые критерии

1. Все четыре layout видны и работают в Page и Edgeless; сохранение/undo/clipboard
   работают через прежние model operations.
2. Выделение board покрывает фон, карточки и вложенные блоки одним слоем; пиксельная
   проверка непрозрачной карточки ловит дефект, который не ловил CSS фон shell.
3. Выделение отдельной карточки не окрашивает соседей; снятие возвращает оформление.
4. Клики/редактирование, controls, drag targets и resize не перехватываются подсветкой.
5. Kanban controls появляются в правильном порядке без DOM portals; collapse
   убирает список вместе с его footer controls.
6. Bento width, wrap, обе resize-стороны, отмена и modal проверяются в браузере.
7. Columns settings/empty editing/content relocation и TODO filters/order/menu/
   nested storage остаются доступны.
8. Проверка маленького и `?repeat=200` production demo реальным вводом; performance
   serial. Browser behavior Chromium/Firefox workers=12, failures повторить workers=1.
9. Проверить итоговый import/lifecycle path и новые declarations отдельно от тестов.

## Выполнение

План зафиксирован до runtime-правок. Реализация и результаты проверок будут записаны
после проверки новых layouts; существующие зелёные тесты старого отображения не
считаются доказательством нового дизайна.

## Проверка исправления цвета выделения

Проверка от 2026-10-23 относится только к цвету и структурному выделению,
а не подтверждает завершение всей переделки контейнеров.

- До исправления точный screenshot pixel TODO storage отличался от `#e5dfff`:
  четыре ошибки в Chromium/Firefox и Page/Edgeless, повторённые с одним worker.
- После исправления `container-layout.spec.ts` и `selection.spec.ts`: 86 passed
  с 12 workers в обоих браузерах. Проверены цветные дочерние блоки, приоритетная
  TODO-карточка, восстановление цвета и отсутствие вложенных обводок.
- Промежуточные ошибки Kanban воспроизвелись последовательно: screenshot попадал
  в CSS transition кнопки. Screenshot теперь завершает анимации перед сравнением
  точных пикселей; допуски цвета не расширялись.
- Page build и production demo build прошли. Focused ESLint: 0 errors,
  два прежних предупреждения длины функций в других тестах selection.spec.ts.
- Граница ответственности: Page задаёт fill и shell, CSS областей React layouts
  читает fill. Модель, команды, подписки и lifecycle не изменены.

Последовательный production benchmark на настоящем Ctrl-click, пять измерений
после двух прогревов. Sync — время от capture до завершения bubble обработчиков
click; render — proxy до двух animation frames, с проверкой выбранного блока.
Загрузка документа не входит в измерение. Значения — медиана [min–max], мс.

| Browser/document    | Sync before → after       | Render before → after                |
| ------------------- | ------------------------- | ------------------------------------ |
| Chromium/default    | 0.1 [0–0.1] → 0 [0–0.1]   | 27.2 [25.5–28.3] → 29.1 [28.3–29.8]  |
| Chromium/repeat=200 | 0.1 [0.1–0.2] → 0 [0–0.1] | 34.9 [10.9–104.7] → 14.2 [11.1–14.8] |
| Firefox/default     | 0 [0–0] → 0 [0–0]         | 14 [8–16] → 14 [12–15]               |
| Firefox/repeat=200  | 0 [0–1] → 0 [0–1]         | 275 [8–583] → 275 [6–346]            |

Большой документ Firefox остаётся нестабильным уже на baseline; эти измерения
не подтверждают устранение его задержек. Полный набор функциональных проверок
новых layouts из предыдущего этапа ещё требует завершения.

## Hover placement Item

`BlockItem` учитывает собственный border box и потоковое содержимое; абсолютные
слоты не увеличивают этот размер. `BlockRowHover` теперь использует идентичность
Item для hover его padding и insertion strips. Вложенные native rows сохраняют
приоритет, чужие editor occurrences не дают строку текущему editor. Размеры,
слоты, модель и drag destinations не менялись; observer по-прежнему создаётся
и уничтожается `BlockEditorScope`, без новых подписок и обработчиков на Item.

До исправления четыре браузерных случая padding hover падали параллельно и
последовательно в Chromium/Firefox, Page/Edgeless. После: 10 unit tests и
38 browser tests passed; Page/demo build, focused ESLint и skill validation прошли.

Serial production pointer benchmark: пять samples после двух warm-ups,
медиана [min–max], мс. Sync включает capture→bubble pointermove, render — два
animation frames с проверкой фактического hover marker. Startup исключён.

| Path/browser/document       | Sync before → after                         | Render before → after             |
| --------------------------- | ------------------------------------------- | --------------------------------- |
| Outline/Chromium/default    | 0.2 [0–0.2] → 0.2 [0.1–0.3]                 | 16.3 [16–16.4] → 16.1 [15.8–16.4] |
| Outline/Chromium/repeat=200 | 0.2 [0.1–0.3] → 0.2 [0.2–0.2]               | 43 [41.3–49.3] → 43.9 [39.5–46.8] |
| Outline/Firefox/default     | 0 [0–1] → 0 [0–1]                           | 17 [15–18] → 16 [15–17]           |
| Outline/Firefox/repeat=200  | 0 [0–0] → 0 [0–1]                           | 70 [64–84] → 64 [61–75]           |
| Item/Chromium/default       | Previously missing feedback → 0.2 [0–0.2]   | After: 16.2 [16–16.5]             |
| Item/Chromium/repeat=200    | Previously missing feedback → 0.2 [0.1–0.3] | After: 66.9 [59.6–124.6]          |
| Item/Firefox/default        | Previously missing feedback → 1 [0–1]       | After: 15 [15–17]                 |
| Item/Firefox/repeat=200     | Previously missing feedback → 0 [0–0]       | After: 53 [9–56]                  |

Для Item использована первая настоящая Bento-карточка основного демо. Её bounds
перечитываются после scroll перед каждым sample: первоначальный вариант с одним
сохранённым rectangle не выдержал проверки hover после изменения геометрии.
Отсутствующий до исправления hover не сравнивается по скорости с работающим.
Полные suites остальных возможностей контейнеров здесь не перезапускались.
