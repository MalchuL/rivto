# Виртуализация Page

## Границы и этапы

1. Повторить принцип `react-rivto-editor/src/surfaces/page/page-surface.tsx`:
   window virtualization корневых поддеревьев, измеряемые высоты, overscan,
   стабильные ID. Сложные layout внутри одного корня не разбивать на линейные строки.
2. Выделить поведение в класс presentation virtualization. React отвечает за
   подключение virtualizer и вывод диапазона. Данные и selection остаются у adapter;
   исчезновение DOM не удаляет блоки из `getSelectableBlockIds()`.
3. Сохранять DOM фокуса и текстовых endpoints небольшим набором pinned roots.
   Structural selection не pin-ит все выделенные блоки. Монтировать запрошенные
   endpoints перед переводом model position в DOM. Cleanup снимает listeners и
   регистрацию bridge, не очищает model selection.
4. Indent/outdent остаются командами host. Проверить в demo работу по snapshot
   selection, включая невидимые блоки, и сохранение ID после изменения parent.
5. Проверить обычные/большие документы, обратный scroll, remount, text/structural
   selection, layout контейнеров, номера списков и отсутствие скрытых drop targets.
   Production Playwright: behavior workers=12, повторы failures workers=1;
   performance workers=1. Отдельно проверить интерфейсы, имена и JSDoc.

## Ограничения области

Виртуализируются display roots, как в исходном редакторе. Один огромный контейнер
требует собственного windowing layout; линейный virtualizer не назначается grid.
Production adapter, undo/clipboard и настоящий DnD не входят в этот этап.

## Реализация и повторный анализ границ

- `BlockVirtualizationController` принадлежит смонтированному представлению.
  Его borrowing API содержит только `mountBlocks`; ни attach, ни cleanup не
  передаются selection. Список roots и счётчики — локальная проекция, не документ.
- `adapter.blocks.getParentId` — новый независимый read-контракт. Page не получает
  document model / panel / ReactEditor. Поиск root занимает глубину иерархии,
  а не число блоков. Реальный host может использовать существующий parent index.
- Полные IDs не заменяются видимым диапазоном. Child layout/gaps продолжают
  получать реальных соседей; виртуализируются только целые display subtrees.
- Подписки содержимого снимаются вместе с subtree. По одной metadata-подписке
  на display root остаётся для offscreen list-mode изменений. Text/selection
  не инвалидируют виртуальное дерево; изменение типа списка пересчитывает
  номера без монтирования скрытых renderer-ов.
- Нативные focus/endpoints pin-ятся отдельно от structural selection. Утеря DOM
  виртуального endpoint не очищает model selection; новое валидное native
  выделение принимается. Явный clear остаётся ответственностью host.
- Demo-команды Tab/Shift+Tab используют сохранённые ranges и реальную иерархию,
  включая скрытых collapse-ом детей. Это пример host mutation boundary, а не
  перенос production outline/undo в Page.
- CSS root spacing использует `--rivto-block-gap` из пакета; demo не компенсирует
  геометрию. Последний root не добавляет лишнего нижнего gap.
- В отличие от исходного отключения коррекции высоты, измерения сохраняют обычную
  коррекцию TanStack. При прокрутке в конец класс удерживает конец после замены
  оценочных высот высоких Kanban/Bento измеренными. Scroll away прекращает это.

Проверка имён: `setBlockIds`, `getRangeIndices`, `getListNumber`,
`reconcileListSubscriptions`, `findRootIndex` описывают реальные операции.
Проверка JSDoc: единицы/defaults, canonical order, ownership, cleanup,
синхронный mount, collapsed/missing targets и ошибки задокументированы.

## Проверки после реализации

- Page: 112 unit tests / 12 suites passed; typecheck пакета и demo passed.
- Сборка пакета и production demo passed; импорт готового ESM entry проверен.
- Chromium + Firefox: 80 behavioral tests passed с workers=12.
- Performance: 12 tests passed с workers=1, trace off, production preview :5191.
  Последовательность pointer/keyboard действий совпадает для обычного и virtual
  toggle; прогрев + пять измерений, создание fixture вне измерения.
- Lint: 0 errors; остаются предупреждения max-lines-per-function, в том числе
  JSX-компонент виртуального дерева. Правила не подавлялись. Prettier/diff check passed.
- Во время разработки failures высоких контейнеров воспроизведены workers=1 и
  исправлены удержанием конца страницы. Проверки нумерации/remount исправлены
  после serial reproduction: тест должен прокрутить невидимый root в диапазон
  и использовать существующий checkbox `Editor mounted`. Exact-range тест
  явно регистрирует Shift+Alt как range binding: shortcuts сопоставляются точно.

Две RAF после pointerdown — прокси отображения, не полная оценка paint latency.
Медиана (min–max), ms, финальная production-сборка:

| Browser | repeat | Toggle без windowing | Toggle с windowing | Indent с windowing |
| --- | --- | --- | --- | --- |
| Chromium | 1 | 30.5 (29.3–31.2) | 31.1 (29.8–31.2) | 17.6 (15.6–18.6) |
| Chromium | 200 | 20.2 (19.1–29.8) | 31.3 (30.9–31.4) | 16.6 (15.8–18.4) |
| Firefox | 1 | 30 (30–31) | 31 (29–32) | 36 (34–43) |
| Firefox | 200 | 61 (32–64) | 31 (30–31) | 46 (43–49) |

Toggle: 2 адресных node reads при обоих размерах, синхронная медиана 0 ms на
разрешении таймера (не нулевая стоимость). Indent repeat=200: синхронная медиана
0.1 ms Chromium (0.1–0.7), 0 ms Firefox (0–1). После каждого indent проверяется
реальная новая вложенность, затем Shift+Tab возвращает roots и сохраняет selection.
В стандартном большом outline проверяется <35 смонтированных DOM-блоков вместо
1200 полного дерева; focused/text endpoints могут добавлять отдельные roots.

Универсального выигрыша latency нет: Chromium toggle в этом измерении медленнее,
Firefox большой fixture быстрее. Подтверждены сокращение DOM и сохранение поведения;
не добавлялся универсальный временной бюджет и не скрывались отличия браузеров.

Не проверялись production adapter/undo/clipboard, React 18 runtime, вложенный
scroll host или windowing внутри одного огромного контейнера. Существующие
Kanban/Bento layouts проверены как целые виртуализируемые поддеревья.
