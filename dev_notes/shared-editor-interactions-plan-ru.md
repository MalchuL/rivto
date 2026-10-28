# Общие взаимодействия обычного редактора и embedding

Дата: 2026-10-23. План основан на текущих исходниках. Исходная последовательность
работ сохранена ниже; результат реализации и границы проверки приведены в конце.
Сообщённая без конкретного сценария ошибка cross-document DnD отдельно не воспроизведена.

## Уже общий путь

- `EditorPanel` и `EditorEmbed` используют `ReactPanelProvider`. Для embedding
  создаётся `EmbeddingPanel`, который включает исходный корень и защищает его.
- Каждый `ReactPanel` создаёт собственный `BlockEditorController` с `PageBlocks`
  и `PageSelection`. Панель владеет runtime и уничтожает его; view заимствует
  attachment. Документ и история принадлежат host и могут использоваться
  несколькими одновременно открытыми панелями.
- Embedding монтирует тот же `PageSurface`. Canvas подключает тот же Page runtime
  через `BlockEditorScope`; геометрия canvas остаётся у Edgeless.
- `registerPageDrag` устанавливает `PageDragBoundary` через общий editor wrapper.
  Он создаёт `PageBlockDrag`, `BlockOutlineDropTargets` и `BlockDragExtension`.
  Отдельный pointer engine для embedding или cross-document block DnD не нужен.
- `BlockDragRouter` и `DropSurfaceRegistry` определяют принимающий DOM root.
  `PageDragOccurrence` предоставляет геометрию принимающей панели.
- `PageBlockDrag` проверяет текущие источники, границы панели, соседей, policy,
  конфликты ID и актуальность attachment. Внутри документа он вызывает move;
  между документами — `CrossDocumentBlockTransfer`.

Следовательно, cross-document — отношение между источником и получателем,
а не третий вид редактора. Embedding — ограниченное представление документа,
которое использует те же взаимодействия.

## Владение и границы

| Ответственность                                              | Владелец                                               |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| Pointer gesture, preview, autoscroll, feedback, cancel       | Page                                                   |
| Структурное дерево, slots, collapse, геометрия строк         | Page                                                   |
| Границы колонок, grid items и размещение controls            | Конкретный layout через общие примитивы Page           |
| Видимые корни, доступные команды, защита embedding root      | Core panel и host adapter                              |
| Канонические данные, транзакции и история                    | Document/core                                          |
| Получение embedding document, ошибки загрузки, retention     | React host                                             |
| Междокументный перенос, проверка ID, выбор receiving history | React host                                             |
| Keyboard routing, concrete editing commands, slash registry  | React host; представление получает нужные capabilities |
| Frame, zoom, rotation и перемещение canvas elements          | Edgeless                                               |

Новая оболочка поверх `ReactPanel` не требуется. Один controller сохраняет одно
поле на manager. Компоненты и extensions заимствуют узкие интерфейсы; teardown
остаётся у создавшего объект владельца. Повторные views одного документа
различаются по attachment/DOM root, а не только по document ID.

## Порядок продолжения

1. Завершить согласованный hover/layout этап. Layout задаёт доступную область
   каждой строки: дерево наследует её, отдельная колонка или grid item ограничивает
   её своей областью. Nested outline внутри embedding использует тот же механизм.
   Заменить viewport-wide hit areas и исключение всех потомков custom child list.
   Убрать зависимость reveal от `showOnContainerHover` только после сохранения
   доступа к собственному handle headerless блока через его внешний gutter.
   Не обрезать controls, menus, selection и drop feedback вместе с содержимым.
2. Проверить одинаковую установку optional features на каждом occurrence.
   Получатель использует extensions своего source editor; embedding не должен
   незаметно получать иной набор возможностей из enclosing editor. Проверять
   фактическую регистрацию drag, selection, keyboard, clipboard и slash.
   Исправлять конкретные расхождения в существующей регистрации, без нового
   универсального набора опций или второго runtime.
3. Проверять общий DnD pipeline во всех комбинациях views. Сохранить отдельную
   host-операцию transfer: две document histories сейчас независимы; общий gesture
   не превращает перенос в атомарную транзакцию или единый undo двух документов.
   Ошибку из demo сначала воспроизвести на конкретном source/destination; уже
   пройденные сценарии не доказывают отсутствие этой ошибки.
4. Распространять этот принцип на остальные features по их текущему владельцу:
   один алгоритм selection/navigation и одна регистрация команд, привязанные к
   ближайшей панели. Не переносить selection автоматически между документами
   вне явно завершённой операции и не позволять keyboard/delete обходить защиту root.

## Критерии приёмки

- Обычная страница, embedding того же документа, embedding другого документа,
  две отдельные страницы и блоки на canvas используют один block gesture path.
- Hover вложенной строки раскрывает её handle; соседняя колонка, embedding или
  другой редактор не перехватывают hit. Headerless blocks сохраняют доступный handle.
- DnD работает в обе стороны, в пустой документ, перед/после строки и внутрь неё;
  проверяются результат в модели, перенос subtree, stable IDs, focus и selection.
- Protected root, цикл, конфликт ID, stale gap и detached receiver не меняют данные.
  Unmount получателя и Escape освобождают pointer ownership, feedback и autoscroll.
- Selection, keyboard navigation, clipboard, collapse и slash остаются привязаны
  к ближайшей панели; повторный view не создаёт повторную обработку события.
- Проверяются Page/Edgeless там, где затронут общий block path. Canvas element
  dragging проверяется отдельно, если изменяется его владелец.
- После реализации: focused tests, typecheck/lint; Chromium/Firefox с 12 workers,
  неудачи повторно с 1 worker. Production performance — normal и `repeat=200`,
  serial, одинаковые настройки до/после; отдельно command cost и завершение DOM.

## Проверка этого плана

Просмотрены creation, передача зависимостей, использование и cleanup в
`ReactPanel`, `EditorEmbed`, `PageSurface`, `EdgelessSurface`, drag registration,
`PageDragBoundary`, `PageBlockDrag`, `PageDragOccurrence`, `PageBlocks` и selection
boundary. Это проверка владельцев, а не утверждение о полной behavioral parity.
Изменён только Markdown; executable code и type declarations не менялись.

## Применённый patch: общие границы взаимодействий

В рабочей копии уже присутствовала реализация `BlockRowHover`, подключённая
через общий `BlockEditorScope`, `BlockChildren.hoverBoundary` и удаление старых
viewport-wide CSS hit areas / `showOnContainerHover`. Эта реализация сохранена;
добавленные исправления завершают её работу в разных occurrences:

- Native hit и поиск строки в whitespace не возвращают row/shell внешнего
  редактора, когда root embedding находится внутри чужого блока.
- Pointer-down сохраняет hover marker. Иначе Firefox доставлял contextmenu уже
  фону страницы: исчезнувший handle терял pointer-events до окончания клика.
  Движение с нажатой кнопкой, выход указателя, blur и detach по-прежнему очищают hover.
- Поиск по вертикали учитывает нулевые прямоугольники gap wrappers. Измеренный
  прямоугольник переиспользуется, без двойного layout read на каждый шаг поиска.
- Добавлены regression checks для nested-root whitespace, gap wrappers и
  pointer-down; браузерные проверки проверяют embedding в Page/Edgeless,
  независимые документы, меню и перенос блока в другой документ и обратно.

Проверка registration не обнаружила необходимости в отдельном feature runtime:
`ReactPanelProvider` использует переданный source editor для contributions,
`ReactPanel` создаёт локальные selection, keyboard, clipboard и slash managers,
а `PageDragBoundary` устанавливается общим editor wrapper. Поэтому новый
универсальный adapter, второй controller и дополнительные feature options
не добавлены. Host-owned transfer и независимые document histories сохранены.

Проверены creation → borrowing → use → cleanup у `BlockEditorScope` и
`BlockRowHover`: view создаёт DOM observer, передаёт существующий root и освобождает
listeners/frame/marker при смене root или unmount. Observer не получает model,
registration manager или право уничтожать controller. Public API этим patch
не расширен; изменения условий native ownership остаются внутри Page.

Workspace одновременно изменял другой агент. Его layout/test additions сохранены;
браузерная проверка выполнялась на отдельном production build после сборки
`rivto-page`, поскольку demo импортирует этот пакет из dist. Результаты относятся
к этим проверенным build snapshots, а не к любым последующим чужим изменениям.

### Проверки patch

- Page: 27 suites / 202 tests прошли. После последнего изменения соседним агентом
  дополнительно прошли все 9 hover regression tests. Host: 5 focused suites /
  19 tests (drag occurrence, move validation, selection registration, navigation,
  rendering) прошли.
- Page typecheck, package build, demo typecheck/build и focused ESLint прошли.
- Общий browser run: Chromium/Firefox, 12 workers — 151 passed, 4 skipped,
  1 Firefox timeout при загрузке default journal с `repeat=200`. Этот timeout
  наблюдался и до patch. Обязательный serial retry на финальном build — 1 passed.
- На последнем изолированном build: shared interactions, layout hover и
  cross-document editors — 42 passed, Chromium/Firefox, 12 workers.
- Behavioral coverage включает shared selection, source keyboard editing/undo,
  clipboard/slash, protected roots, cycles, empty destinations, ID collisions,
  nested boundaries и перенос между Page/Edgeless. Это не проверка всех features
  workspace и не воспроизведение первоначальной ошибки пользователя без шагов.

Отдельно измерен native pointermove в gutter первой строки default demo, с
проверкой фактического hover marker, двумя warm-up и пятью samples. Сборка
production, Chromium/Firefox последовательно; virtualization не включалась.
Синхронное время — обработка pointer event, model command отсутствует, потому
что hover не мутирует документ. Render — две animation frames после события.

| Browser / repeat | Sync после, median [min–max], ms | Render до, median [min–max], ms | Render после, median [min–max], ms |
| ---------------- | -------------------------------- | ------------------------------- | ---------------------------------- |
| Chromium / 0     | 0.2 [0.1–0.2]                    | 16.3 [16.1–16.4]                | 16.2 [16.2–16.5]                   |
| Chromium / 200   | 0.2 [0.1–0.3]                    | 48.3 [42.9–60.9]                | 38.7 [36.3–42.9]                   |
| Firefox / 0      | 0 [0–1]                          | 16 [15–17]                      | 17 [17–17]                         |
| Firefox / 200    | 1 [0–1]                          | 58 [55–67]                      | 59 [55–71]                         |

Числа показывают стоимость проверенных snapshots, не доказывают ускорение от
одной конкретной правки при параллельной работе другого агента. Полные workspace
lint/test/build, физические устройства ввода и Safari в этом patch не проверялись.

Дополнительный serial production run `block-handle-performance.spec.ts`:
4 passed (Chromium/Firefox, repeat=0/200). Проверены реальные right-click,
collapse/expand и результат в модели. На большом Chromium fixture render samples
остаются вариативными: 68–131 ms; этот patch не является оптимизацией collapse.
