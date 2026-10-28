# Контракты самостоятельного блочного редактора

> Current display-list contract: section 27 supersedes the earlier proposed
> BlockEditorRegion/region snapshot API. Page reads host-selected IDs through
> adapter.blocks; no shared owner or region availability is required.
> Section 28 defines current editor ownership, registration, and view lifecycle.
> Section 29 defines replaceable JSX layouts and geometry-only drop targets.
> Section 30 adds item-anchored grid/wrapping gaps without changing layout cells.
> Section 31 corrects idle overlay input, initial focus, borrowed nodes, and sampling.

Дата: 2026-10-19. Статус: целевой дизайн; автономный rendering slice реализован,
подключение к host и остальные взаимодействия остаются последующими этапами.

Документ уточняет [план разделения поверхностей](./separate-surfaces-design-ru.md).
Основные разделы описывают целевые интерфейсы словами и таблицами. Реализованный
TypeScript API уже экспортируется из rivto-page; его меньший текущий scope и проверки
перечислены в разделе 13. Не все целевые методы и props реализованы на первом этапе. При расхождении с ранним
эскизом BlockContent в общем плане для следующего этапа используется этот документ.

## 1. Два подключения, определяющие контракт

**Страница.** PageSurface берёт блоки в пределах panel, задаёт layout и scroll,
при необходимости виртуализирует корни. Один BlockEditor обслуживает редактирование.

**Canvas-карточка.** EdgelessSurface задаёт frame, rotation, z-index и selection самой
карточки. Внутри неё BlockEditor редактирует только блоки этой карточки и их потомков.
Один canvas panel может содержать несколько таких BlockEditor. Они используют общие
model/history и panel selection; отдельную копию документа или историю не создают.

Поэтому panel и область блочного редактирования — разные границы. Текущий PanelBlocksAPI
ограничивает subtree panel, но сам по себе не ограничивает произвольный диапазон корней
одной canvas-карточки. Просто передать panel и массив IDs недостаточно для команд записи.

| Ответственность                                     | React host / panel                  | PageSurface          | Canvas-карточка             | BlockEditor                              |
| --------------------------------------------------- | ----------------------------------- | -------------------- | --------------------------- | ---------------------------------------- |
| Document acquisition, история, transactions         | Владеет или заимствует у core       | Использует           | Использует                  | Использует                               |
| Focus routing между panels, общая panel selection   | Владеет                             | Использует           | Использует                  | Работает в пределах своей области        |
| Источник актуальных корней                          | Ограничивает доступ panel           | Выбирает корни panel | Вычисляет диапазон карточки | Читает через region                      |
| Внешний frame и transform                           | Не определяет                       | Page layout          | Владеет                     | Получает систему координат               |
| Виртуализация и внешний scroll                      | Не определяет layout                | Владеет              | Владеет своим viewport      | Запрашивает mount/reveal через стратегию |
| Block DOM, slots, navigation и межблочная selection | Маршрутизирует события              | Подключает           | Подключает                  | Владеет                                  |
| Текстовый UI конкретного блока                      | Предоставляет renderer и hooks      | Использует           | Использует                  | Предоставляет ограниченный block context |
| Структурный DnD блоков                              | Маршрутизирует cross-panel transfer | Задаёт окружение     | Задаёт окружение            | Владеет жестом и placement               |
| Перемещение/resize/rotation всей карточки           | Не определяет                       | Не участвует         | Владеет                     | Не коммитит frame                        |

## 2. Единственный вход: BlockEditorAdapter

BlockEditor и BlockEditorController получают один объект `adapter`, соответствующий
BlockEditorAdapter. Отдельных props `panel`, `renderers`, `region`, `viewport`,
`navigation` и `registrations` больше нет. Тематический provider и декоративные props
не являются дополнительными каналами доступа к editor.

Адаптер объединяет возможности, но не становится владельцем документа и всех managers.
Его реализация связывает текущую область с инфраструктурой react-rivto-editor и окружением
страницы/карточки. Конкретные подсистемы controller используют нужную часть адаптера:
например, resolver — region и viewport, renderer — ограниченные blocks и selection.

| Раздел адаптера     | Контракт                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `blocks`            | Ограниченные чтение, мутации и per-block subscriptions по собственным контрактам Page; host адаптирует свой API  |
| `region`            | BlockEditorRegion: доступность, актуальные корни и принадлежность области; описывает границы того же `blocks`    |
| `selection`         | Selection текущего occurrence с проверкой границ области; общий panel store не копируется                        |
| `transactions`      | Batch и undo/history capabilities текущего документа; без доступа к самому document/editor                       |
| `events`            | Подключение локальных обработчиков, активность области, cleanup и маршрутизация через host                       |
| `clipboard`         | Copy/cut/paste для текущей области с существующей сериализацией и явным transfer между областями                 |
| `renderers`         | Живой доступ только к поиску renderer/fallback, revision и подписке на изменения реестра                         |
| `behaviors`         | Чтение и применение актуальных зарегистрированных block behaviors; определения конкретных типов остаются в host  |
| `slots`, `wrappers` | Живое чтение block contributions с устойчивой identity и подписками; их registry implementation принадлежит Page |
| `viewport`          | BlockEditorViewport: актуальные координаты, видимая область и scrolling                                          |
| `navigation`        | BlockEditorNavigation: mount/reveal для обычных и виртуальных блоков                                             |

Нет полей `editor`, `panel`, `document`, `elements`, обратной ссылки `owner` на весь editor
или функции, возвращающей их. Публичные event/callback payloads и renderer context также
не содержат таких ссылок. Это граница API, а не отдельная система sandbox/security.
Нельзя передать текущий manager целиком, если через него доступен весь editor: адаптер
выставляет только требуемый контракт и сохраняет его текущие validation/error semantics.

Один адаптер связан с одной panel occurrence и одной block region. Разные карточки
получают разные адаптеры с общими document transactions и renderer registry. Adapter
identity стабильна при изменении корней, геометрии и регистраций. Смена документа,
occurrence или владельца области создаёт новый адаптер и новый controller. Смена callback
компонента не является сменой адаптера. Несовместимые region, операции и registration
sources отвергаются при сборке интеграции до подключения DOM listeners.

Контракт принимающей стороны относится к Page-пакету; реализация document capabilities
остаётся в react-rivto-editor. Подключение собирается на уровне приложения/integration:
host предоставляет ограниченные операции и реестры, Page — свои contributions, а
окружение — viewport/navigation. Структурные контракты используют общие типы, без обратного
runtime import `react-rivto-editor → rivto-page`. Готовая интеграция собирает один адаптер,
пользователь обычной страницы не обязан вручную реализовывать все разделы.

## 3. Границы блоков: BlockEditorRegion

Интерфейс доступен как `adapter.region` и представляет одну редактируемую область
в пределах panel. Реализация страницы и реализация диапазона карточки предоставляют
одинаковую семантику. Мутации находятся в `adapter.blocks`; второго набора CRUD у region нет.

| Член          | Вход                    | Результат и поведение                                                                                      |
| ------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getSnapshot` | —                       | Стабильный до изменения границ snapshot: доступность области и упорядоченные `blockIds` её верхнего уровня |
| `subscribe`   | Listener без аргументов | Disposer; уведомляет после изменения доступности/корневого порядка, listener перечитывает snapshot         |
| `contains`    | `blockId`               | Проверяет текущую принадлежность области, включая потомков и свёрнутые блоки                               |

Snapshot различает доступную пустую область и отсутствующего владельца. Удалённая карточка
не превращается в «пустую карточку, куда можно вставить блок». Свёрнутые потомки входят
в область, но могут отсутствовать в видимом outline. Подписка на region не заменяет
существующие per-block subscriptions на content/props/selection.

`adapter.blocks` проверяет все source IDs, destination и anchors до записи. Политика
пустой области задаёт допустимое место вставки. Для существующего ID вне области
чтение возвращает missing по семантике PanelBlocksAPI, мутация отвергается. Операция
должна оставаться внутри region и panel; проверки только `contains` в UI недостаточно.
Перенос через границу идёт по отдельному существующему cross-region/cross-document пути,
не через обход ограничений `adapter.blocks`.

Это область доступа к той же модели, без копирования содержимого, отдельного undo или
своих persisted children. Для страницы используются существующие panel bounds; для
карточки адаптер вычисляет диапазон из её canonical block projection. Он принадлежит
edgeless integration и передаётся блочному редактору через общий контракт. BlockEditor
не знает `startBlockId`, `endBlockId`, separators или element ID.

После изменения source/destination во время жеста commit повторно проверяет актуальные
границы. Исчезнувшая область отменяет жест и освобождает DOM selection. Меняющийся список
корней не требует переподключения controller и не заставляет подписывать каждый блок
на полную проекцию документа.

## 4. Окружение: BlockEditorViewport

Доступен как `adapter.viewport`. Интерфейс описывает геометрию окружения без canvas API и CSS selectors.

| Метод           | Вход                     | Результат и поведение                                                                                                             |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `clientToLocal` | Точка в client CSS px    | Точка в локальных CSS px корневого block layout                                                                                   |
| `localToClient` | Точка в локальных CSS px | Обратное преобразование в client CSS px                                                                                           |
| `getClipRect`   | —                        | Прямоугольник реально доступной области в client CSS px; отсутствие видимой площади означает невозможность начать pointer gesture |
| `scrollBy`      | Вектор в client CSS px   | Выполняет доступный scroll окружения и возвращает фактическое смещение в тех же единицах                                          |

`x`/`y` здесь — обычная двумерная точка; перед реализацией переиспользовать существующий
подходящий геометрический тип. Scroll сначала расходуется внутренним scroll container,
затем разрешённым внешним окружением. Метод не трактует scroll как document mutation.
Это реальный потребитель для DnD auto-scroll, а не универсальная система layout.

Методы читают текущую геометрию при обращении. Адаптер учитывает scroll, transform origin,
масштаб и rotation. Масштаб не передаётся ещё одним числом, из которого потребитель
попытается самостоятельно восстановить матрицу. Если transform необратим или область
не смонтирована, преобразование возвращает missing; gesture отменяется, а не использует
координаты другого occurrence. Политика кеширования layout reads — внутри адаптера;
нельзя читать getBoundingClientRect всех блоков на каждом pointermove.

PageSurface предоставляет scroll/layout adapter страницы. Canvas-карточка предоставляет
адаптер своей рамки с учётом canvas transform и собственного content scroll. Панорамирование
canvas остаётся обязанностью edgeless; адаптер вызывает его только если текущая политика
окружения разрешает auto-scroll/панорамирование при block drag.

## 5. Навигация: BlockEditorNavigation

Доступна как `adapter.navigation`. Это стратегия доступности block DOM, нужная selection
и keyboard paths. Она определяется
на стороне host-протокола, чтобы общая DOM-selection не импортировала PageSurface.
Большая часть операций уже существует в PageVirtualizationController; сохраняем их смысл.

| Метод                      | Вход                                | Результат и поведение                                                                                                                |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `mountBlocks`              | IDs и `scroll`, по умолчанию true   | Синхронно монтирует допустимые endpoints; возвращает IDs, DOM которых удалось получить. Неизвестные/outside/deleted IDs пропускаются |
| `mountAdjacentBlocks`      | Текущий block ID, направление −1/+1 | Монтирует нужный соседний root для перехода; возвращает успех, false на границе области                                              |
| `mountFirstOrLastBlock`    | Направление −1/+1                   | −1 монтирует последний, +1 первый root; возвращает успех, false для пустой/недоступной области                                       |
| `getSelectionBlocks`       | —                                   | Expanded outline в порядке документа: block IDs и UTF-16 длины, включая немонтированные, исключая collapsed descendants              |
| `suspendScrollAdjustments` | —                                   | Идемпотентный disposer; временно отключает конкурирующее scroll anchoring на время структурной команды                               |

Результат mount даёт вызывающему коду возможность корректно завершить фокусировку,
если блок исчез. Он не гарантирует, что произвольный renderer содержит contenteditable.
`scroll: false` запрещает навигационный scroll; mount не должен специально перемещать
viewport. Направление означает соседний root layout, а не поиск соседней карточки canvas.

Обычная невиртуализированная реализация использует уже смонтированный BlockEditor DOM.
Page-реализация использует window virtualizer и pinned roots. Canvas content использует
свой viewport. Вложенный panel никогда не заимствует navigation родителя, даже если
собственный provider отсутствует. Lookup идёт через registration panel/region, не CSS.

## 6. Контроллер: BlockEditorController

Один экземпляр на смонтированный BlockEditor. Он координирует block DOM, локальный DnD,
keyboard selection и текущую область. Конкретный renderer владеет своим текстовым UI;
controller координирует DOM endpoints и межблочные взаимодействия. Не дублирует managers
документа, живёт в Page-пакете и получает только BlockEditorAdapter.

| Член                | Вход                    | Результат и поведение                                                                                                |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `adapter`           | —                       | Единственный BlockEditorAdapter, заимствованный на срок жизни controller; region/navigation читаются через него      |
| `attach`            | Корневой HTMLElement    | Подключает input и region registration; возвращает идемпотентный disposer конкретного подключения                    |
| `setActive`         | Boolean                 | Отключает/включает локальные interaction bindings; при отключении отменяет незавершённый жест                        |
| `focusBlock`        | Block ID, UTF-16 offset | Монтирует и фокусирует editable content внутри region; возвращает false, если endpoint недоступен или не редактируем |
| `cancelInteraction` | —                       | Отменяет собственный block drag/preview, освобождает pointer guards и временные ресурсы; повторный вызов безопасен   |
| `destroy`           | —                       | Окончательно освобождает собственные resources; не уничтожает panel, region provider, registrations или документ     |

`attach` допускает один root одновременно. Повторное подключение того же controller
после detach разрешено; одновременный второй root отвергается. Старый disposer не может
отключить более новое подключение. После окончательного destroy attach отвергается.
Подключение не делает controller активным вопреки текущей активности occurrence,
которую предоставляет `adapter.events`. Прямой доступ к panel не требуется.

Конструктор не устанавливает DOM listeners/subscriptions. Компонент владеет controller
и использует существующий проверенный lifecycle ownership для окончательного dispose.
StrictMode effect cleanup отключает attachment; он не должен уничтожать экземпляр,
который повторный effect setup будет подключать снова. В точке реализации отдельно
проверяется React lifetime, а не предполагается, что любой unmount effect окончателен.

`focusBlock` ограничивает offset текущей длиной текста. Не выходит в соседний region.
Selection принадлежит panel: controller не хранит второй независимый selection store.
Отсутствие mounted DOM не удаляет модельную selection, если она всё ещё допустима.

Block CRUD, clipboard formats, undo/redo, tool registry и canvas transforms не становятся
методами контроллера. BlockDragController и navigation strategy используются композиционно;
одноразовые helpers становятся private methods фактического владельца.

## 7. Регистрации через адаптер и динамические блоки

Markdown, error/unknown fallback и другие конкретные блоки остаются в react-rivto-editor:
их definitions, renderers, type-specific behaviors, настройки, текстовый UI и CSS.
Это относится и к конкретным контейнерам вроде bento/columns/table/kanban и todo:
Page предоставляет структурные механизмы, а host — реализации типов и их layout policy.
В Page переносятся BlockTree/View/Wrapper, generic slots/layout/navigation и DnD, а не
каталог всех блоков. Изменение плана переноса не означает удаления их возможностей.

| Источник регистраций       | Владелец                                                  | Что видит Page через adapter                                                    |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Типы и схемы блоков        | Model/core и host registration API                        | Ограниченные операции `blocks`, актуальные node snapshots и доступные behaviors |
| Renderers и их fallback    | react-rivto-editor                                        | `renderers.get`, `renderers.has`, `renderers.revision`, `renderers.subscribe`   |
| Behaviors конкретных типов | react-rivto-editor                                        | Актуальную policy, включая children visibility и layout контейнеров             |
| Block slots                | Page registry; contributions устанавливаются расширениями | Stable registration ID, anchor, priority, predicate, mode filter и изменения    |
| Block wrappers             | Page registry; contributions устанавливаются расширениями | Порядок nesting, identity конкретной регистрации и изменения                    |

Реестр renderers остаётся живым. Основа уже есть в RenderersApi: register/get/subscribe
и revision. Полный API регистрации остаётся у host, а `adapter.renderers` предоставляет
только чтение и подписку. Передавать snapshot Map или массив компонентов нельзя.

Динамическое подключение нового типа использует существующий BlockTypeManager в host:
регистрируются definition/schema, renderer, behaviors и связанные slash actions.
RendererManager сам по себе не заменяет регистрацию типа. Page перечитывает revision,
находит новый renderer и обновляет отображение уже существующих блоков без пересоздания
adapter/controller. Удаление регистрации приводит к fallback; persisted type/content
не переписываются. Если fallback не задан, Page сохраняет shell/children и отсутствие
content renderer, не подставляя конкретный Markdown по умолчанию.

Динамическая регистрация не должна remount-ить каждый content renderer: BlockTree
перечитывает registry, но неизменившиеся renderer identity и block ID сохраняют свои
memo boundaries. Отписка на unmount обязательна. Изменение behaviors тоже наблюдаемо:
rendering и navigation должны согласованно видеть актуальную children visibility.

Каждый runtime хранит один набор соответствующих реестров, а не копию на карточку.
Контроллер не уничтожает общие регистрации. Registration owner обеспечивает extension
cleanup и ошибки неактивного owner. Внутри adapter объединены ссылки на capabilities
разных владельцев; они не становятся собственностью самого адаптера.

Контекст slot сохраняет block snapshot, selected и фактический surface mode: внутри
canvas он остаётся edgeless. Геометрия block region сама по себе не переименовывает mode.
Существующие 12 perimeter positions и start/end/body сохраняются. Добавление соседнего
slot не remount-ит существующий; disposer снимает именно свою регистрацию.

## 8. Компонент: BlockEditorProps

Компонент получает окружение, создаёт один controller и предоставляет его через context.
Внешний `controller` prop пока не нужен: нет подтверждённого сценария передачи владения.

| Prop                    | Контракт                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `adapter`               | Единственный BlockEditorAdapter текущей страницы или карточки; все зависимости controller доступны через него |
| `onContentHeightChange` | Необязательный callback с intrinsic высотой содержимого в локальных CSS px, без viewport transform            |
| `className`             | Дополнительный класс корня; сохраняются служебные markers и public class                                      |

Форма подключения — `<BlockEditor adapter={adapter} />`. Отдельного `renderers` prop и
неявного получения всего editor/panel из host context нет. BlockEditor создаёт
controller с этим же адаптером и предоставляет своим потомкам ограниченный block context.
Hook доступа к controller возвращает текущий экземпляр и не создаёт новый; вызов вне
BlockEditor завершается понятной ошибкой. Изменение callback не пересоздаёт controller.
PageSurface получает один адаптер через свою интеграцию и использует тот же BlockEditor.

Layout ширины/высоты задаётся окружающим компонентом/CSS. Не передаём параллельно
`availableWidth`, fixed-height number, scale и frame: это создало бы несколько источников
истины. BlockEditor измеряет свой content box; resized width отражается в layout и
измерении высоты. Intrinsic height включает in-flow slots и children, исключает
perimeter overlays. Callback не вызывается для одного лишь изменения pan/zoom/selection.
Он не пишет frame в document и не вызывается во время React render.

В content-height режиме host допускает рост; в fixed-height — задаёт высоту и scroll.
Canvas сохраняет высоту frame по callback со своей текущей auto-height policy и без
лишнего undo. До проверки auto-height/resize измерительный контракт остаётся предложением.

Тема остаётся отдельным provider пакета. DOM-free decorators сохраняют одну shell:
wrapper рендерит children ровно один раз, не выбирает renderer и не обходит descendants.

## 9. Один блок: сохранить существующие интерфейсы

Для content renderer оставить `BlockRendererProps` с `blockId`. Структурный узел читается
через Page hook, а конкретные content/props — через адресные hooks источника renderer.
Изменения выполняются через ограниченные host capabilities текущей области; их контракт
не должен импортировать model-specific patch/schema типы в Page.
Markdown по-прежнему находится в react-rivto-editor. Его hooks получают ограниченный
block context, предоставленный BlockEditor, а не ReactPanelApi с обратной ссылкой на editor.
Ни canvas frame, ни zoom, ни целый controller не передаются в props каждого renderer.
Общий block context с ограниченными capabilities определяется на стороне React host,
без типов PageController. Page предоставляет его значение через общий provider при
отрисовке content; Markdown читает его своими host hooks. Поэтому конкретному renderer
не нужен импорт из Page, а Page не требуется импорт Markdown или другого конкретного блока.

Для shell сохранить существующий BlockShellProps: snapshot блока, selected, подготовленные
content/controls и уже отрисованные children. Для decorators — BlockWrapperProps с block
и children. Отдельный BlockController для каждого блока не вводится: DOM и жестами
владеет контроллер области, представлением — renderer hook и shell. Добавленный на
следующем шаге BlockEditorNode связывает ID с чтением, командами и подписками; это
не второй контроллер DOM и не отдельное хранилище документа.

Произвольный custom renderer может не иметь editable content: focusBlock тогда возвращает
false. Custom containers сохраняют свой layout и behaviors. Unknown block fallback
сохраняет возможность отрисовать документ, не меняя persisted type.

## 10. Последовательность подключения

Это целевой сценарий будущей интеграции. На ближайшем этапе он учитывается в контрактах,
но production adapter, переключение PageSurface и подключение к host пока не реализуются.

1. react-rivto-editor владеет документом, panel, конкретными блоками и их живыми реестрами.
2. Интеграция собирает один BlockEditorAdapter: ограниченные host capabilities, Page
   contributions и окружение страницы/карточки. Прямой editor/panel в него не включается.
3. Приложение отрисовывает PageSurface/BlockEditor с единственным `adapter` prop.
   Для обычного подключения готовая интеграция подготавливает адаптер автоматически.
4. BlockEditor создаёт собственный controller внутри Page-пакета, после commit подключает
   DOM root и регистрирует область через `adapter.events`.
5. Controller читает IDs через `adapter.region` и nodes через `adapter.blocks`.
   BlockTree создаёт shell, slots и children; content renderer находит через `adapter.renderers`.
6. Markdown или другой renderer из react-rivto-editor получает blockId и ограниченный
   block context. Его текстовый UI не получает целый controller/editor через callback.
7. Host маршрутизирует событие к occurrence и region; controller использует актуальные
   bounds и `adapter.transactions`. Frame отдельно коммитит владелец canvas.
8. При динамической регистрации host уведомляет через `adapter.renderers.subscribe`;
   Page обновляет content без создания нового адаптера или controller.
9. Detach отменяет жест и удаляет локальные bindings; окончательное освобождение владельца
   уничтожает controller. Document и общие registrations продолжают жить у своих владельцев.

Host определяет общие contracts для region events, DOM endpoints и block capabilities.
Page определяет принимаемый BlockEditorAdapter, controller, props и структурные registries.
Host не импортирует реализацию Page или её controller. Совместимость адаптера проверяется
в integration через структурные типы на основе общих contracts. Приложение связывает
пакеты, сохраняя направленность зависимостей из общего плана.

Ранний JSX-эскиз `blockContent={BlockEditor}` показывает направление композиции.
При canvas integration компонент также получает готовый adapter своей карточки. Общие
реестры продолжают жить в host/Page у своих владельцев; Page не знает edgeless типов.
Полную форму edgeless подключения определим на его этапе, без требования к пользователю
создавать controller или вручную собирать каждый layout adapter для обычной карточки.

## 11. Что проверить до превращения в TypeScript API

- Region-bound operations действительно ограничивают destination и anchors, в том числе
  при root insert/delete, merge и clipboard; одна UI-проверка принадлежности не считается.
- Пустой region имеет корректное место вставки, missing owner запрещает вставку.
- Текущие renderer hooks получают `adapter.blocks`, не whole-panel blocks по старому context.
- Ни разделы адаптера, ни события/callbacks не возвращают editor, panel или document.
- Добавление/удаление renderer обновляет существующие блоки без пересоздания controller;
  неизменившиеся renderer components сохраняют identity и используются fallback.
- Dynamic type registration сохраняет definition/renderer/behavior/slash lifecycle и cleanup.
- Markdown, прочие конкретные блоки и их CSS не переносятся в Page при выделении shell.
- Жест между двумя карточками использует явный transfer и сохраняет IDs/undo policy.
- Window virtualization сохраняет synchronous endpoint mounting и viewport position.
- Canvas rotation, zoom и fixed-height scroll дают корректный block drop indicator.
- Старые wrapper/slot filters продолжают работать в обоих режимах.
- На StrictMode attach/detach, hide/show и source deletion нет лишних handlers/commits.

Эти проверки определяют последующие реализации и возможные уточнения интерфейсов.
Для автономного rendering slice выполнены соответствующие проверки из раздела 13;
реальное browser input и стоимость production-интеграции этим ещё не проверены.

## 12. Ближайшая реализация без подключения к host

Первым реализуется автономный высокоуровневый каркас Page-пакета: единый adapter contract,
BlockEditorController и компонент BlockEditor с ограниченным block context. Scope текущего
шага не включает production adapter react-rivto-editor, переключение существующей страницы,
canvas-карточек, demo или перенос конкретных blocks/CSS. Последовательность из раздела 10
описывает будущее подключение и остаётся входом для проектирования каркаса.

Начальный рабочий срез — чтение roots/nodes, адресные subscriptions, selection presentation,
живой renderer lookup и lifecycle. Требования остальных разделов adapter сохраняются
в дизайне; неподключённые возможности не имитируются методами-заглушками. Тестовый adapter
проверяет принимаемый контракт без импорта текущей реализации ReactEditor/ReactPanel.
Конкретные Markdown и прочие production renderers остаются в react-rivto-editor.

Оптимизация проверяется наблюдаемой стоимостью, а не только выбором React memo:

- Снимки и ссылки неизменившихся roots/nodes сохраняют identity; полное дерево не копируется.
- Content update будит адресные consumers затронутого блока, без общей подписки всех rows
  на document revision. Selection update меняет только соответствующие selected flags.
- Root order и renderer registry наблюдаются отдельно от содержимого блоков.
- Добавление/удаление renderer не пересоздаёт adapter/controller и не remount-ит
  неизменившиеся content components; результат/fallback проверяется вместе со стоимостью.
- Lifecycle cleanup снимает подписки; attach/detach не накапливают listeners.

Для этого этапа достаточно автономных behavioral/cost tests, build/typecheck/lint пакета.
Они не подтверждают latency, DOM selection и DnD реального редактора. Перед последующим
production-подключением фиксируются baseline и результаты normal/large document scenarios
по обязательному verification workflow. После интеграции проверяются page и edgeless
и все затронутые взаимодействия; текущий каркас не объявляется завершённым переносом.

## 13. Выполнено: автономный rendering slice

В `packages/rivto-page/src` реализованы:

- `adapter/types.ts`: единый BlockEditorAdapter с четырьмя используемыми разделами —
  region, blocks, selection, renderers. Первоначальный структурный snapshot содержал
  только id, type и childIds. На OOP-шаге он называется BlockEditorNodeSnapshot и дополнен
  необязательными checked/collapsed/color; подробности команд и кеша — в разделе 16.
  Model-specific data, editor/panel/document, конкретных блоков и обратных owner-ссылок
  в контракте нет.
- `editor/block-editor-controller.ts`: контроллер без внешних эффектов в конструкторе,
  attach с идемпотентным disposer, getRoot и окончательный destroy. Старый disposer не
  отключает новый root; второе одновременное attach и attach после destroy отвергаются.
- `presentation/components/block-editor/`: BlockEditor, внутренний context и адресное дерево.
  Controller создаётся после commit, на смене adapter/unmount освобождается;
  StrictMode effect replay создаёт новый экземпляр после cleanup старого.
- `presentation/hooks/`: useBlockEditorController и useBlockNode. Изначально read-only
  hook возвращал snapshot; после OOP-шага возвращает стабильный объект узла (раздел 16). Это автономный
  контекст принимающего пакета; существующие host hooks и renderer implementations
  пока не мигрированы и не подключены к нему.

Компонент принимает один adapter и необязательный className. Первый client render и
SSR содержат только корневой div; дерево появляется после attachment. onContentHeightChange,
input/selection commands, полный CRUD, slots/wrappers, behaviors/collapse UI, navigation,
clipboard, viewport/DnD и тема на этом этапе не реализованы и не имитируются заглушками.
Это слой отображения с реакцией на внешние изменения, а не готовый интерактивный редактор.

Renderers наблюдаются по результату get(type) через useSyncExternalStore: snapshot —
стабильная identity компонента, а не глобальная revision. Поэтому текущему read-only API
достаточно get и subscribe; has/revision из целевого дизайна пока не нужны. Реестр может
уведомить всех подписчиков, но неизменившийся lookup не перерисовывает их content. Полная
динамическая регистрация definition/behavior/slash остаётся ответственностью будущего host.

Roots, own node snapshots и selected boolean наблюдаются отдельно. Child IDs не
материализуются в рекурсивные snapshots. Memo границы отделяют shell/selection от content
и сохраняют unchanged descendants при редактировании родителя. Стабильность snapshots
предоставляет adapter: Page не копирует документ для построения собственного store.

Для проверки используется локальный test adapter, без ReactEditor/ReactPanel и demo.
Добавлены Jest/ts-jest и DOM environment jsdom через CLI. Структура файлов повторяет
соседние пакеты: contracts, editor/controller, presentation/components и presentation/hooks,
тесты рядом с владельцем.
Временные scaffold dependencies на host/core, DnD, virtualizer и Markdown удалены через
CLI: у текущего среза для них нет потребителей. После отдельного уточнения удалена
также document-model dependency: остаются React peers и development tooling. Библиотеки
взаимодействий добавляются вместе с реализацией соответствующей возможности и не должны
возвращать зависимость структурного пакета от конкретной модели документа.

Проверки первого rendering slice (актуальные проверки OOP-шага — в разделе 16):

- `pnpm --filter @chulane/rivto-page test`: 2 suites, 10 tests, все прошли; React 19.2.7
  и jsdom, serial Jest. Проверены nested roots, child/root reorder без remount, missing
  owner, удаление/восстановление узла, dynamic renderer install/remove/fallback/type change,
  выбранные блоки, StrictMode, adapter replacement и cleanup.
- На 5 и 2000 mounted roots content update одного блока вызывает один render его content,
  не читает root snapshot и nodes соседей; число node reads не превышает 12 в обоих случаях.
  Это детерминированная граница на две адресные подписки (shell и renderer) с React
  snapshot checks, а не бюджет, пропорциональный размеру документа. Unchanged child/root
  arrays и node snapshots сохраняют identity.
- Selection update меняет shell attributes без повторного content render. Registry
  update сохраняет controller и component lifetimes незатронутых типов. После unmount
  и смены adapter у старого источника не остаётся подписок.
- Package typecheck, source/config lint, formatting, ESM/declaration build и frozen
  lockfile install прошли. ESM bundle — 5.97 KB до сжатия, без host или model runtime imports.

Production host wiring не изменялся. Page/edgeless browser scenarios и normal/repeat=200
latency пока не применимы к действующему demo, поскольку новый компонент туда намеренно
не подключён. Здесь проверяется стоимость notifications/renders, не миллисекунды ввода.
До последующей интеграции необходим production baseline и полный browser workflow;
числа выше не являются заявлением о производительности готового редактора.

## 14. Структура слоёв пакета

React-представление выделено в `presentation/`. `editor/` — слой поведения, а не только
один controller: при реализации соответствующих возможностей здесь появятся selection,
navigation и drag-and-drop. Сейчас здесь находятся BlockEditorController, кешируемые
BlockEditorNode в blocks/ и их тесты.
По отдельному запросу пользователя каталоги будущих selection, navigation, drag-and-drop
и presentation/slots созданы с `.gitkeep`, чтобы сохранить структуру в Git. Реализаций
или методов-заглушек в этих каталогах нет.

```text
src/
├── adapter/
├── editor/
│   ├── block-editor-controller.ts
│   ├── block-editor-controller.test.ts
│   ├── blocks/
│   │   ├── block-editor-node.ts
│   │   └── block-editor-node.test.ts
│   ├── selection/
│   ├── navigation/
│   └── drag-and-drop/
├── presentation/
│   ├── components/
│   │   └── block-editor/
│   ├── hooks/
│   └── slots/
├── test-utils/
└── index.ts
```

Controller не импортирует React components, hooks или presentation. Presentation
использует controller и adapter. Controller пока владеет DOM attachment: это разделение
React-представления и поведения, а не обещание browser-independent controller.

Будущие slots целиком относятся к `presentation/slots`, включая TypeScript registry,
порядок, identity и cleanup: registry хранит contributions именно представления.
Состояние жеста, разрешение drop placement и commit относятся к `editor/drag-and-drop`,
а React-подключение DnD-библиотеки, preview и drop indicator — к presentation. Разделение
определяется ответственностью, не расширением .ts/.tsx.

Компоненты, context, hooks и соседний component test перенесены с обновлением импортов
и package barrel. Исполняемые тела и публичный API при этом не менялись.

## 15. Независимость adapter от document-model

Прямой импорт model BlockNode в публичном adapter был лишней связностью и удалён.
Изначальный read-only structural contract принадлежит Page-пакету: стабильный id,
renderer lookup type и упорядоченные childIds. После OOP-шага этот контракт называется
BlockEditorNodeSnapshot и дополнен ограниченными presentation-полями (раздел 16);
имя BlockEditorNode теперь обозначает класс доступа к нему. Content, native props,
listProps, pluginData и persisted schema не являются полями, необходимыми Page.

Host adapter может вернуть уже существующий cached snapshot, если он структурно
совместим, без копирования или преобразования каждого блока. Нельзя делать новый объект
на каждый getBlockNode: прежние identity/subscription требования сохраняются. Конкретный
renderer читает свой payload через собственные адресные подписки, а не требует расширения
структурного Page contract всеми данными конкретного document-model.

TestBlockNode локален test-utils: он расширяет структурный контракт только собственным
content. Тестовый renderer подписывается на этот типизированный host source самостоятельно.
Это проверяет работу каркаса без импорта canonical model и не вводит generic casts в hooks.

Из пакета удалены и type imports, и manifest/lockfile dependency на document-model.
Page не зависит ни от host editor, ни от core/model/CRDT; типы block операций в следующих
этапах также определяются потребностью поверхности, а преобразование к конкретной модели
принадлежит реализации adapter. Существующие .cjs оставлены без изменений по последнему
указанию пользователя.

Проверка уточнения: 11 Jest tests, build, typecheck, lint и форматирование прошли после
удаления model symlink. Добавлен сценарий, где adapter возвращает только structural node,
а renderer обновляет content по собственной host subscription при неизменном structural
snapshot. В public declarations нет импортов @chulane/*; manifest не содержит production
зависимостей. Локальная сверка manifest/lockfile прошла.

Повторная frozen-lockfile проверка pnpm потребовала свежую registry supply-chain проверку;
при недоступной сети остановлена, её успешность не заявляется. Для package scripts
использован существующий установленный tooling без автоматического reinstall. .cjs не
переводились и не изменялись. Browser timings не повторялись: менялись границы типов и
тестовый host, алгоритм rendering автономного компонента не изменён.

## 16. Выполнено: стабильный BlockEditorNode и команды через host

Дата: 2026-10-20. Это продолжение автономного среза без production-интеграции.

Разделены два разных контракта:

- `BlockEditorNode` — долгоживущий объект, связанный с ID и ограниченным источником host.
  Предоставляет readonly id, getters type/childIds/checked/collapsed/color, getSnapshot,
  subscribe, setChecked, setCollapsed, setColor. Методы находятся в прототипе;
  экземпляр не копирует содержимое блока, не хранит второй snapshot и не создаёт
  подписки при конструировании.
- `BlockEditorNodeSnapshot` — неизменяемое состояние источника: id/type/childIds и
  необязательные checked/collapsed/color (фон блока). Host возвращает ту же ссылку, пока
  наблюдаемое состояние не изменилось, и публикует новый snapshot при изменении.
  Отсутствующие presentation-поля остаются undefined, Page не придумывает defaults.

`BlockEditorController.getNode(id)` кеширует один объект на запрошенный ID в Map своего
экземпляра. Повторный вызов не читает host и не подписывается. Редактирование, selection,
перестановка корней и detach/attach не заменяют объект. Удаление и undo/восстановление
также сохраняют объект; getSnapshot возвращает undefined, пока ID отсутствует или
недоступен в области. Можно получить объект для ещё отсутствующего ID и наблюдать его
появление. Одинаковые IDs разных контроллеров не делят объекты или источники.

Кеш ограничен временем жизни контроллера, а не числом смонтированных строк: все посещённые
IDs удерживаются до destroy. Это осознанное ограничение первого шага; при большом churn
долгоживущей области понадобится отдельная политика освобождения, согласованная с
заимствованными ссылками. WeakRef, pooling и повторное назначение объекта другому ID
не используются. При destroy контроллер инвалидирует узлы, освобождает их подписки и
очищает Map; host/документ не уничтожается. Старые ссылки больше не читают источник,
команды и новые подписки отвергаются. Ошибка одного disposer не мешает попытке очистить
остальные; ошибки возвращаются как AggregateError.

`useBlockNode(id)` теперь возвращает стабильный BlockEditorNode, а не snapshot.
Внутри hook useSyncExternalStore наблюдает getSnapshot и адресную subscribe узла;
стабильность объекта не блокирует обновление React. Hook замыкает вызовы на узел через
useCallback, поэтому смена ID переключает подписку. Для чтения нескольких полей за один
проход можно взять один node.getSnapshot(); каждый отдельный getter иначе читает
актуальный кеш host. Сам getSnapshot не аллоцирует объект и не обходит потомков.

Мутации направляются в новый обязательный `adapter.blocks.updateBlockNode(id, patch)`.
`BlockEditorNodePatch` допускает только checked/collapsed/color; пропущенные поля не
меняются, null для color снимает локальный фон блока. Узел проверяет доступность перед записью,
а host обязан повторно обеспечить границы области, допустимость полей и значений,
transactions и undo. Page не обновляет snapshot оптимистично и не содержит второй истории.
Ошибки host не скрываются. Реализация адаптера к canonical model остаётся будущим шагом.

На первоначальном OOP-шаге добавлены данные и команды, но не checkbox, collapse/color UI
и не правила numbered list. Последующее добавление listType описано в разделе 17.
Сворачивание пока не скрывает children автоматически; потребитель определяет поведение.
Content и специфичные payload конкретных блоков продолжают принадлежать host.
Ни model/core imports, ни новые зависимости, ни изменения .cjs для этого не потребовались.

### Проверка поведения и стоимости

Проверки кеша на 5 и 2000 узлах подтверждают переиспользование всех объектов за пять
проходов без чтений источника или подписок. Обновление одного узла сохраняет ссылки
объектов и snapshots соседей. Отдельно проверены делегирование patches, удаление и
восстановление, отсутствие оптимистичной записи при отказе host, независимость двух
источников с одинаковыми IDs, повторный disposer, уничтожение и ошибки cleanup.
React-тест проверяет изменение checked через стабильный объект и обновление DOM hook.
Существующие cost tests rendering сохраняют границу: один изменённый content renderer,
нет чтений roots/соседей, не более 12 node reads на 5 и 2000 mounted roots.

Для оценки именно накладных расходов доступа выполнен отдельный прогретый microbenchmark
ESM-сборки в Node v23.11.1: 200 000 чтений в sample, четыре прогрева, девять samples,
чередование порядка вариантов, checksum результата, без параллельных builds/tests.
Создание fixture и первоначальное наполнение кеша не входят во время чтений.

| Узлов | Доступ                           | Медиана, ms / 200 000 чтений | Диапазон, ms |
| ----- | -------------------------------- | ---------------------------- | ------------ |
| 5     | Прямой adapter.getBlockNode      | 1.672                        | 1.645–2.125  |
| 5     | Сохранённый node.getSnapshot     | 1.910                        | 1.746–2.235  |
| 5     | controller.getNode + getSnapshot | 2.499                        | 2.351–3.023  |
| 2000  | Прямой adapter.getBlockNode      | 2.703                        | 2.677–2.734  |
| 2000  | Сохранённый node.getSnapshot     | 3.094                        | 3.042–3.113  |
| 2000  | controller.getNode + getSnapshot | 4.761                        | 4.741–4.782  |

На этом прогоне сохранённый объект добавляет около 0.39 ms на 200 000 чтений при 2000
узлах; повторный поиск в Map увеличивает разницу до 2.06 ms. Это сравнение путей доступа
на одном синтетическом источнике, а не измерение browser input, кадров или производительности
целого редактора. JIT, реальный host и subscribers могут менять результат. Тайминги не
превращены в универсальный CI-бюджет; тесты контролируют число операций и результат.

Итоговые проверки OOP-шага: 3 Jest suites, 19 tests прошли; package typecheck, lint,
ESM/declaration build прошли. Исходники и public declarations не содержат импортов
@chulane/*; manifest/lockfile, существующий host и demo этим шагом не изменялись.
Browser input, page/edgeless интеграция и применение undo проверяются после подключения;
тестовый host сейчас подтверждает делегирование команд, а не canonical persistence.

## 17. Выполнено: тип списка в контракте узла

Дата: 2026-10-20. Анализ текущего host подтвердил, что numbered — режим декорации
произвольного блока, а не отдельный renderer type или boolean-флаг.

### Как работает существующая реализация

- Canonical model хранит `listProps` как `Record<string, unknown>` и проверяет
  переносимость значений; семантика конкретных list fields принадлежит расширениям.
- `extensions/built-ins/page/list/types.ts` определяет `BlockListType`. Регистрация
  list extension знает пять режимов; собственная регистрация defaults/validation,
  shortcuts, behaviors, block slot и clipboard formatter собирается в
  `list/shortcuts/register.ts`. Эти возможности ещё не перенесены в Page.
- Shortcut `1. ` выбирает start_numbered_list; numbered Enter создаёт продолжение
  numbered_list, а Enter на пустом блоке снимает type и checked. Slash/menu conversion
  устанавливает type и checked:false вместе; это составная пользовательская операция.
- `BlockListSlot` отображает checkbox либо marker по listProps.type. CSS counters
  принадлежат surface/children layout; start и первый numbered после разрыва сбрасывают
  счётчик. continue позволяет продолжить предыдущую последовательность после разрыва.
- Clipboard formatter использует `resolveBlockListNumbers(siblings)` отдельно от DOM:
  обычный numbered зависит от предыдущего пункта, continue — от последнего numbered
  в группе, start начинает с 1. Сами порядковые номера в документе не сохраняются.
- Виртуальная Page уже восстанавливает CSS counter через counterSeed для начала
  смонтированного окна: текущий обход обрабатывает numbered_list/start_numbered_list.
  Эквивалентность этого пути с continue_numbered_list после разрывов должна быть
  проверена при переносе layout; существование seed не доказывает все комбинации.

### Принятый API Page

Page экспортирует собственный `BlockListType`, структурно совместимый с текущим host,
без type/runtime import из react-rivto-editor или document-model:

| Значение               | Смысл                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| list                   | Обычный режим списка, без числового маркера или checkbox в текущем list slot |
| checkbox               | Пункт с флагом checked                                                       |
| numbered_list          | Последовательная нумерация, с началом после разрыва                          |
| start_numbered_list    | Явное начало нумерации с 1                                                   |
| continue_numbered_list | Продолжение последней числовой последовательности группы                     |

`BlockEditorNodeSnapshot.listType` и getter `node.listType` возвращают этот режим либо
undefined при отсутствии декорации/узла. Поле `type` продолжает выбирать renderer
контента. Для custom list modes потребуется расширить контракт на этапе переноса
регистраций; неизвестные persisted значения host не должен выдавать за один из
поддержанных режимов. Registry и типы сторонних расширений пока не переносились.

`node.setListType(mode)` отправляет единственный patch `{ listType: mode }`, а null
означает снять именно тип списка; отсутствие поля в patch сохраняет значение.
Host переводит это в изменение/удаление своего listProps.type. Команда не меняет checked,
collapsed, цвет, содержимое или renderer type и не вычисляет номера соседей. Так же
setChecked не переключает тип списка автоматически. Для воспроизведения menu/slash
conversion нужна отдельная составная команда с type + checked:false в одной транзакции;
последовательность двух независимых setter-вызовов не обещает одну undo-запись.
Enter removal type + checked также остаётся в behavior и не подменяется одним setter.

Test adapter публикует immutable snapshot и адресное уведомление, включая явное снятие
type через null. Он демонстрирует принимаемый контракт, а не реализацию canonical
validation/undo. Кеширование узлов и lifecycle не менялись, поля и patches плоские:
дополнительные вложенные objects/controllers на каждый list node не создаются.

### Проверка

До изменения прошли 19 package tests; после — 24 tests в трёх suites, typecheck, lint,
ESM/declaration build и форматирование. Покрыты все пять режимов, null, независимость
renderer type и checked, preservation других полей, snapshot identity, реактивный hook,
missing/destroyed nodes и отказ host без оптимистичной записи.

На 5 и 2000 узлах смена listType даёт одно адресное уведомление и два чтения целевого
узла (проверка доступности и проверка getter), без чтения roots/соседей. Соседние snapshots
и все кешированные объекты сохраняют identity. Существующие rendering cost checks также
прошли. Это детерминированная проверка стоимости команды, не browser latency.

Production host, CSS, shortcuts, clipboard и виртуализация этим шагом не изменялись.
До интеграции browser numbering, Enter, undo и clipboard в page/edgeless остаются
непроверенными для нового API; реальный demo пока не использует автономный компонент.

## 18. Выполнено: автономное browser demo внутри пакета

Дата: 2026-10-20. `packages/rivto-page/demo` использует публичный entry пакета напрямую
из исходников, свой in-memory DemoAdapter и concrete renderer с обычным textarea.
Production ReactEditor/EditorPanel и canonical model не подключаются. В `src` не
добавлялись demo-функции и глобальные debug-ссылки. Vite установлен через CLI только
как devDependency; manifest/lockfile и команды запуска обновлены через CLI.

[Инструкции запуска и scope](../packages/rivto-page/demo/README.md):
`pnpm --filter @chulane/rivto-page demo`, localhost:5184; `?repeat=200` создаёт
1000 roots и 200 children без виртуализации. Custom renderer для каждого пятого корня
можно включить/отключить, переставить корни, изменить поля/текст, выделить блок и
перемонтировать BlockEditor. Данные переживают remount, но не перезагрузку страницы.
Индикатор сравнивает объект узла с первым объектом текущего renderer lifetime.

Маркер списка и скрытие children пока не реализованы: controls демонстрируют состояние
и команды API, а не завершённое list/collapse поведение. Checkbox виден для любого режима,
что позволяет отдельно проверить независимость checked и listType. UI явно обозначает
этот scope; textarea не объявляется production rich-text editor.

DemoAdapter сохраняет immutable snapshots, child-array identity и адресные подписки.
Toolbar statistics обновляется по кнопке в отдельном компоненте, чтобы чтение/сброс
счётчиков не рендерили всё дерево. commandMs охватывает запись и синхронные уведомления,
без последующего React commit. История, CRDT и transactions здесь не эмулируются.

### Browser verification

Vite 7.3.6 production build, serial performance runs без параллельных builds/tests.
Новый demo не существовал до шага, поэтому before/after browser baseline отсутствует;
сравниваются размеры одного и того же fixture, а deterministic package tests сохранены.

- 24 package Jest tests прошли, включая ограничения rendering на 5/2000 nodes.
- Package/demo typecheck, lint без warnings, package build и demo production build прошли.
- Chromium/Firefox behavior: четыре сценария суммарно прошли с `--workers=12` (четыре
  доступных задания). Проверены все list modes, checked/collapsed/color, snapshot/DOM,
  text, root order, selection, dynamic renderer, node identity, remount и subscriptions=0
  после unmount. Serial rerun не требовался: behavioral failures отсутствуют.
- Chromium/Firefox performance: четыре сценария суммарно прошли с `--workers=1`.
  После прогрева настоящий select менялся клавишами ArrowDown/Home, пять samples на
  размер/браузер; проверялось ожидаемое состояние, а не только время.
- Во всех samples: 17 node reads, два адресных уведомления, root reads=0 и неизменные
  объекты узлов; лимит regression test — 24 чтения, независимо от размера документа.

| Browser  | Roots + children | Command median / range, ms | Change → 2 RAF median / range, ms |
| -------- | ---------------- | -------------------------- | --------------------------------- |
| Chromium | 5 + 1            | 0 / 0–0.10                 | 23.2 / 22.8–23.9                  |
| Chromium | 1000 + 200       | 0 / 0–0.10                 | 9.3 / 9.1–55.6                    |
| Firefox  | 5 + 1            | 0 / 0–1                    | 21 / 19–27                        |
| Firefox  | 1000 + 200       | 0 / 0–1                    | 3 / 3–34                          |

Нулевые samples означают предел разрешения browser clock, а не отсутствие работы.
Два RAF — proxy обновления, чувствительный к фазе кадров; меньшая медиана большого
fixture не доказывает ускорение большого документа. Это не время открытия native dropdown,
не startup measurement и не бюджет для production editor. Единственная проверенная
граница масштабирования здесь — постоянное число addressed reads/notifications.

Первый sandbox-запуск Playwright остановился до тестов: локальный listen запрещён EPERM.
Повторный запуск с разрешением localhost прошёл; ошибок приложения в этих результатах нет.
Production page/edgeless, numbered marker layout, rich-text selection, clipboard и undo
всё ещё требуют отдельного подключения и проверок.

## 19. Исправлено: color означает фон блока

Дата: 2026-10-20. По уточнению пользователя удалена ошибочная семантика цвета текста.
Текущие контракты, примеры и предыдущие разделы приведены к `color` / `setColor`.
Поле обозначает явный цвет фона блока, не форматирование его текста.

Анализ оригинала: `block-handle/colors.tsx` регистрирует listProps.backgroundColor и
палитру gray/red/orange/yellow/green/blue/purple с пустым default. Выбор Default удаляет
локальное поле; batch изменяет только явно выбранные block IDs, не переписывая потомков.
BlockView отражает токен в data-block-background, а CSS применяет theme palette.

В независимом Page snapshot/patch используется `color`, объект узла предоставляет
getter color и setColor(token | null). Null снимает override, пропущенное поле patch
сохраняет фон. Будущий production adapter преобразует это к listProps.backgroundColor
и его удалению; canonical shape и imports в Page не добавляются. Токен остаётся строкой,
его допустимые значения проверяет host, а визуальное значение определяет тема.

Block shell отражает color через существующий DOM-контракт data-block-background.
Package-local demo показывает тот же фон через собственные theme variables палитры
оригинала, включая все семь токенов и сброс. Цвет текста не меняется. Demo renderer
не подменяет значение фона CSS-именем насыщенного цвета: используется theme token
с исходным 18% смешиванием на светлом фоне. Production CSS по-прежнему не импортируется.

Регрессия воспроизведена в Chromium до исправления: новый тест цвета фона упал и
с workers=12, и при обязательном workers=1 rerun, поскольку фон оставался белым.
После исправления проверяется смена каждого токена, неизменность текста и дочернего
фона, Default, snapshot/patch, shell marker и стабильный объект узла. На 5/2000 cached
nodes команда не читает roots/соседей, отдаёт одно адресное уведомление тестовому consumer.

26 Jest tests прошли; package/demo typecheck, lint без warnings и обе сборки прошли.
Итоговая production-сборка прошла шесть behavior scenarios Chromium/Firefox с
workers=12; исправленных behavioral failures нет. Старые aliases и пути записи цвета
текста в исходниках/экспортах Page удалены. Производственный host и сохранённые данные
оригинального редактора этим шагом не менялись.

Последовательный performance-run итоговой Vite production-сборки: восемь scenarios
Chromium/Firefox (list type + background, repeat=1/200) прошли с workers=1.
Смена фона реальными ArrowDown после прогрева: пять samples на размер/браузер;
в каждом 17 node reads, два уведомления, root reads=0 и стабильная identity узлов.

| Browser  | Roots + children | Background command median / range, ms | Change → 2 RAF median / range, ms |
| -------- | ---------------- | ------------------------------------- | --------------------------------- |
| Chromium | 5 + 1            | 0.10 / 0–0.20                         | 24.4 / 21.5–25.7                  |
| Chromium | 1000 + 200       | 0 / 0–0.10                            | 62.0 / 10.0–62.7                  |
| Firefox  | 5 + 1            | 0 / 0–0                               | 21 / 19–31                        |
| Firefox  | 1000 + 200       | 0 / 0–1                               | 38 / 4–41                         |

Время включает browser rendering большого невиртуализированного demo; proxy двух RAF
не является гарантией полного завершения layout и не обещает постоянную latency при
постоянном числе reads. До исправления измеряемая функция не давала правильного фона,
поэтому сравнение before/after latency не используется как доказательство ускорения.
Ограничения реальной production-интеграции из предыдущих разделов остаются в силе.

## 20. Выполнено: структурный BlockView, slots и базовые controls

Дата: 2026-10-20. Этап остаётся автономным: production host, surfaces и concrete blocks
не мигрированы. До изменения прошли 26 существующих package tests; после первого
реализованного среза — 46 tests, включая исходные cost bounds на 5/2000 roots.

### API и ownership

- `BlockView` — пассивная DOM-оболочка с forwardRef, snapshot, selected, className и
  children. Она контролирует block ID/type/listType/background/selection attributes;
  произвольные div attributes не могут переопределить их. Row/content/body/children
  собираются структурным деревом, concrete renderer получает только blockId.
- `BlockSlotRegistry` — класс в presentation/slots. Владелец host/extensions создаёт
  один общий registry, регистрирует contributions и хранит disposers; controller
  заимствует его и не уничтожает регистрации при remount/удалении своей области.
- `BlockEditorAdapter` получил обязательные `mode` и `slots`. Mode — фактически
  отображающая поверхность, стабильная в течение lifetime адаптера, а не inferred
  editor mode; canvas occurrence может передать edgeless, отображаемый page embedding —
  page. Через slots видны только getSnapshot/subscribe, register принадлежит владельцу.
- `BlockSlotProps` содержит immutable block, стабильный node с ограниченными командами,
  selected, mode и childrenId текущего DOM occurrence. Editor/panel/document не передаётся.
- Registry сохраняет все 15 anchors: 12 perimeter из SLOT_POSITIONS и start/end/body.
  Приоритет сортируется по убыванию, равные приоритеты сохраняют порядок установки.
  CSS направляет controls так, чтобы высокий priority располагался ближе к владельцу.

register возвращает идемпотентный disposer именно своего entry. В snapshot entry получает
registry-local числовой ID; повторная установка того же component — независимая
регистрация. Массив, entry и копия массива mode restrictions immutable. Ссылки старых
entries сохраняются при соседних изменениях. Position и finite priority проверяются до
публикации; when/mode filters применяются к текущему owner context во время отображения.
Фильтры синхронные, без побочных эффектов; уведомления registry не являются подпиской
на произвольное замкнутое внешнее состояние contribution.

Один block owner подписан на registry один раз, все его 15 hosts используют общий snapshot.
Registry changes обновляют slots всех mounted owners, но memo boundaries сохраняют
content renderers. На 5/2000 roots добавление end-slot создаёт нужные hosts без чтения
node/root sources и без повторного content render. Это ожидаемое O(mounted owners)
обновление presentation registry, не постоянная по размеру операция установки extension.

### Controls и collapse

`BlockListSlot` и `BlockCollapseSlot` экспортируются как обычные contributions.
Demo host регистрирует их в start; ядро BlockEditor не включает их автоматически.
Checkbox вызывает node.setChecked, collapse — node.setCollapsed с чтением live флага.
Кнопка имеет aria-expanded/aria-controls и сохраняет text focus при pointer activation.
При закрытии сохраняется child container с occurrence-local ID, но descendant renderers
размонтируются вместе с их node/registry subscriptions. При раскрытии controller
возвращает прежние узлы; host content, child order и canonical selection не переписываются.
Body-slot расположен между row и document children и не скрывается вместе с потомками.

На этом шаге visibility определяется generic collapsed flag. Перед переносом concrete
containers и keyboard/navigation нужно подключить согласованную host behavior policy:
их собственные правила childrenVisible ещё не адаптированы и этим срезом не заменяются.
Selection скрытых children пока не маршрутизируется: production navigation не подключена.

### Нумерация и CSS

Номера не добавлены ни в persisted data, ни в node snapshots. Structural CSS counter
увеличивается на numbered/start/continue blocks, явный start и numbered после разрыва
начинаются с 1. Continue сохраняет последний счётчик группы через обычный блок.
Каждая children-группа и корневой BlockEditor отдельно сбрасывают counter; перестановка
DOM пересчитывает видимые маркеры без чтения/записи snapshots соседей. Маркер выводит
counter через ::before и aria-hidden, как исходный renderer.

Это реализация для полностью смонтированной группы siblings. Виртуализация пока не
перенесена: при её добавлении нужен seed из полного sibling outline; CSS counters по
видимым DOM alone не обещают корректный номер после виртуального разрыва. Clipboard
нумерация и Enter behaviors остаются host-owned будущими этапами.

`@chulane/rivto-page/styles.css` экспортирует отдельный stylesheet из dist. Build копирует
его вместе с JS/declarations, demo импортирует source CSS. `BLOCK_EDITOR_CLASSES`
экспортирует ровно шесть structural names: block/row/content/children/slot/marker.
CSS задаёт geometry и фон BlockView через theme variables; concrete renderer больше не
отвечает за фон блока. Палитру значений предоставляет host. Дополнительные theme variables
описывают row height, children indent, slot gap, control size, marker width и selection.
На первом проходе React theme provider не добавлялся и использовалось обычное наследование
CSS variables. После уточнения ownership CSS provider и полные defaults реализованы
в разделе 21.

### Проверка этапа

Покрыты immutable registry snapshots, все anchors, порядок/дубликаты, независимый disposer,
invalid registration без публикации, динамические when/mode filters, сохранение component
identity при добавлении соседа, body placement, collapse/restore, shared registry в двух
BlockEditor и StrictMode cleanup. Registration state переживает unmount редактора.
В demo добавлен переключатель end-slot с текущим selection; concrete renderer остаётся host-owned.

Первый browser запуск не собрал tests: импорт palette из DemoAdapter начал транзитивно
загружать TSX barrel в Node runner. Палитра вынесена в demo/constants.ts с type-only Page
import, тест не загружает UI runtime. Повторный run на production preview собрал сценарии.
Ошибки behavior assertions после этого не возникли. Browser counter tests проверяют
reset/increment rules после type changes/reorder и isolation child counters; фактические
маркеры 1/1/2 дополнительно просмотрены на Chromium screenshot. Это не OCR-проверка всех
возможных значений счётчика и не доказательство корректности будущей виртуализации.

## 21. Правило пакета: обязательный CSS и параметры принадлежат Page

Дата: 2026-10-20. Пользователь выделил это как главное правило разработки пакета.
Правило сохранено в `packages/rivto-page/AGENTS.md`: required geometry, controls,
selection, counters и palette не должны зависеть от demo CSS. Demo может оформлять
страницу и собственные примерные формы, но не structural Page selectors.

Аудит выявил остаточную зависимость: padding карточки, root/child margins и defaults
палитры задавались демо. Перед исправлением browser regression с отключённым demo
stylesheet воспроизвёл отсутствие package padding (0 вместо 16px), с workers=12 и
при обязательном workers=1 rerun. Это собственный дефект текущего автономного этапа,
не pre-existing ошибка другого редактора.

Теперь stylesheet пакета содержит defaults:

- Общий row padding для content и controls, root/children gaps, children indent.
- Контроль размеров checkbox/collapse, marker width, first-line height и slot gap.
- Резерв start gutter даже для пустого slot, с default минимумом control + marker + gap.
  Базовые controls не сдвигают текст при смене list type; более широкие custom contributions
  могут расширить gutter по CSS layout, поэтому его минимум доступен как параметр.
- Background/foreground/selection, все семь palette fallbacks, radius и optional border.
- Скрытие child container при collapsed, counters и perimeter geometry; demo не поставляет
  компенсационные offsets для этих механизмов.

`BlockEditorTheme` — публичный тип CSS parameters, `BlockEditorThemeProvider` применяет
их через обычное DOM inheritance. Значения lengths задаются строками с единицами или
валидными CSS expressions; невалидные значения обрабатывает браузер, JS validation нет.
Provider необязателен: standalone import styles.css уже содержит все defaults. Nested
providers наследуют неуказанные параметры; detached portals этим компонентом не bridged.
Theme update не заменяет adapter/controller или node objects и не пишет в документ.

Публичный consumer example и таблица defaults сохранены в package README. Demo подключает
«Компактный вид» через provider parameters, без structural overrides. Demo stylesheet
вынесен в отдельный URL/link и ограничен chrome/form selectors; обязательных цветов,
padding/margins редактора и selection outline в нём больше нет. Правило применимо и
к будущим DnD/slots/navigation components: их required CSS поставляется вместе с пакетом.

Проверка без demo CSS подтверждает row padding 16px, root gap 16px, children indent 28px,
control size 20px, выравнивание parent/child content и отсутствие сдвига при добавлении
number marker. Palette работает без demo variables и не становится transparent.
Public compact theme меняет padding/gap на 4px, indent на 12px и controls на 16px;
сброс возвращает defaults, объекты узлов остаются прежними.

### Итоговая проверка этапов 20–21

- 46 Jest tests, package/demo typechecks, lint без warnings, JS/declaration/CSS build
  и production demo build прошли. ESM bundle — 23.18 KB без минификации; CSS публикуется
  отдельным subpath, без production dependencies на другие Rivto packages.
- CSS-only изменение проверено в package dev/watch: пересобирается и копируется
  styles.css. JS/CSS exports дополнительно проверяются непосредственно из dist.
- 14 browser behavior scenarios прошли Chromium/Firefox с workers=12. Новые сценарии
  отключают demo stylesheet целиком и меняют typed theme parameters. Все итоговые
  assertions прошли; исходные воспроизведения CSS-зависимости зафиксированы выше отдельно.
- 12 production performance scenarios прошли с workers=1, без параллельных builds/tests.
  Наборы: list/color selects, native checkbox и collapse button; repeat=1 и 200,
  без виртуализации. Для selects пять warmed samples, для каждого pointer control четыре.
- На обоих размерах list/color/checkbox дают 16 own-node reads, collapse close/open —
  17/30 при одном дочернем блоке. Root reads=0, адресных уведомлений два; unchanged node
  identities сохраняются. Дополнительные чтения при раскрытии — mount child consumers.
- На 5/2000 roots установка end-slot создаёт нужные hosts, не перечитывая node/root
  sources и не перерисовывая content. Это не обещание постоянной стоимости registry
  update: slot presentation каждого mounted owner обрабатывается отдельно.

Все времена ниже — milliseconds от native change/click до двух RAF: median (min–max).
Синхронная запись + notifications в текущем прогоне: Chromium 0–0.10 ms, Firefox часто
0 на своём разрешении clock. Это не полное время event handler и не отсутствие работы.

| Browser  | Roots + children | List             | Background       |
| -------- | ---------------- | ---------------- | ---------------- |
| Chromium | 5 + 1            | 23.5 (22.5–25.9) | 24.2 (18.4–24.5) |
| Chromium | 1000 + 200       | 13.9 (5.4–16.2)  | 63.3 (6.4–64.7)  |
| Firefox  | 5 + 1            | 17 (16–22)       | 20 (17–30)       |
| Firefox  | 1000 + 200       | 16 (3–17)        | 3 (3–4)          |

| Browser  | Roots + children | Collapse         | Checkbox         |
| -------- | ---------------- | ---------------- | ---------------- |
| Chromium | 5 + 1            | 31.6 (31.2–31.7) | 31.4 (31.1–31.5) |
| Chromium | 1000 + 200       | 30.2 (29.7–32.1) | 64.2 (59.8–67.6) |
| Firefox  | 5 + 1            | 14.5 (14–15)     | 15 (15–16)       |
| Firefox  | 1000 + 200       | 16 (14–17)       | 45.5 (44–49)     |

Render latency зависит от размеров DOM и фазы кадров даже при постоянном числе reads.
Большой debug fixture содержит 1000 корней с множеством native form controls; эти
измерения не заявляют ускорение готового редактора или одинаковую latency всех размеров.
Новые controls/layout отсутствовали в корректном виде до этого этапа, поэтому их timings
не используются как before/after speedup. До production wiring остаются host behavior
policies, wrappers, navigation/selection, virtualization, DnD, clipboard и undo; portals
потребуют отдельного переноса theme scope.

## 22. Выполнено: Tailwind CSS v4 и shadcn/ui

### Владение стилями и подключение

Tailwind, его CLI/Vite integration и shadcn primitives установлены через CLI внутри
`packages/rivto-page`. `components.json` использует тот же new-york/Radix стиль, что
соседний React-пакет, но генерирует компоненты в `presentation/components/ui`.
Новая зависимость от `react-rivto-editor` не появилась. Button, Checkbox, NativeSelect,
Textarea и Badge принадлежат Page; они пока не экспортируются как общий public UI kit.

Структурные классы сохраняют шесть имён из BLOCK_EDITOR_CLASSES. Их геометрия,
selection и основное оформление используют Tailwind utilities через @apply. CSS
counters, фоновые palette expressions и border shorthand остаются в stylesheet:
они задают поведение нумерации и публичные theme parameters. Demo chrome также
использует @apply, но не задаёт структурные отступы или размеры Page.

Utilities имеют префикс page:, Tailwind theme variables — --page-*. Глобальный
Preflight отсутствует; необходимый shadcn reset ограничен data-rivto-page-ui.
Shadcn primary/ring, foreground, background и производные цвета читают существующие
Page parameters. Отдельный глобальный набор --primary/--background не устанавливается.
Так сохраняются bounded theme API и возможность вложенных providers.

Package build компилирует styles.css через Tailwind CLI. Потребитель импортирует
готовый CSS без Tailwind scanner/build у себя. Source demo использует Vite plugin;
его собственный CSS импортируется как inline style, который regression test может
отключить целиком. Dev library watcher пересобирает stylesheet при изменении src;
отдельный dev:styles доступен для CSS watch.

Исходные стили разделены по владельцам: components/block-editor (root/tree layout),
components/block-view (shell/background), components/ui (scoped reset), slots
(anchors, controls и list counters). Theme tokens находятся в presentation/theme.css;
presentation/styles.css содержит Tailwind configuration и упорядоченные imports.
При переносе финальный CSS совпал побайтно, а TS/TSX и configuration не изменились.
Повторные interaction timings для этого переноса не нужны: исполняемые JS/CSS
остались теми же; сборки и behavioral checks проверяют сборку локальных imports.

### Контролы и сохранённое поведение

Базовые list/collapse slots используют shadcn Checkbox и Button. Checkbox делегирует
onCheckedChange в node.setChecked; snapshot и node cache не меняют свой контракт.
Collapse сохраняет aria-controls/expanded, предотвращает потерю text focus при pointer
activation и снимает только descendant subscriptions. Demo selectors используют
NativeSelect, сохраняя native keyboard/selection API, а concrete renderer — Textarea.

Структурные control sizes переопределяют shadcn defaults общими utility classes с
публичным --rivto-block-control-size. Изолированная CSS-проверка обнаружила, что
shadcn transition-all анимировал изменение ширины после theme update. Для этих
контролов оставлен transition-colors; теперь изменение размеров применяется сразу.
Регрессия проверяет computed width синхронно после установки CSS parameter.

### Проверки и измерения этого перехода

Финальные проверки: 46 unit tests, package/demo typecheck и lint без ошибок;
JS/DTS/CSS и demo production builds прошли. В обоих браузерах 16 behavioral tests
с workers=12 и 12 performance scenarios с workers=1 прошли без failures. Behavioral
checks включают отсутствие глобального reset у host controls, keyboard checkbox,
сохранение text focus, отключение всего demo CSS и public geometry overrides.
Готовый CSS дополнительно проверен в изолированном документе без demo styles и
Tailwind pipeline; public ESM exports и stylesheet subpath разрешаются из пакета.

Одинаковые production fixtures до/после: repeat=1 (5 roots + child), repeat=200
(1000 roots + 200 children), без виртуализации. Замеры не пересекались с builds или
другими browser runs. Время ниже — event → два RAF, median (min–max) ms, не полная
задержка async layout; 5 warmed samples для selectors, 4 для каждого pointer control.

| Browser / repeat | List до → после                     | Background до → после               |
| ---------------- | ----------------------------------- | ----------------------------------- |
| Chromium / 1     | 22.7 (20.0–23.6) → 19.4 (18.0–20.8) | 22.4 (19.0–23.4) → 22.4 (19.5–23.3) |
| Chromium / 200   | 14.4 (6.7–76.6) → 19.6 (8.4–20.5)   | 6.8 (6.3–69.3) → 9.4 (8.8–80.7)     |
| Firefox / 1      | 19.0 (18.0–20.0) → 18.0 (17.0–32.0) | 19.0 (17.0–24.0) → 19.0 (17.0–23.0) |
| Firefox / 200    | 15.0 (3.0–17.0) → 15.0 (3.0–15.0)   | 4.0 (3.0–5.0) → 4.0 (4.0–4.0)       |

| Browser / repeat | Collapse до → после                 | Checkbox до → после                 |
| ---------------- | ----------------------------------- | ----------------------------------- |
| Chromium / 1     | 31.5 (31.3–31.6) → 30.6 (30.0–31.2) | 31.5 (31.1–31.6) → 30.9 (30.9–31.2) |
| Chromium / 200   | 31.2 (28.9–32.0) → 43.0 (41.8–45.9) | 63.3 (59.6–66.7) → 53.9 (7.0–78.5)  |
| Firefox / 1      | 15.0 (14.0–15.0) → 15.0 (15.0–16.0) | 14.5 (14.0–15.0) → 14.5 (12.0–17.0) |
| Firefox / 200    | 17.5 (13.0–19.0) → 15.5 (14.0–19.0) | 45.5 (43.0–48.0) → 54.5 (53.0–55.0) |

List/color/checkbox сохраняют 16 addressed node reads, 0 root reads и 2 notifications
при обоих размерах. Collapse сохраняет 17 reads при закрытии / 30 при открытии одного
ребёнка. Синхронная запись с notifications — до 0.1 ms в Chromium; Firefox до 1 ms,
с учётом coarse clock resolution. Эти счётчики не измеряют внутренние Radix renders.

Рост некоторых visual timings зафиксирован, ускорение редактора не заявляется.
В большом демо теперь около 42 238 DOM elements, включая example forms и UI wrappers.
Диагностический Chromium trace одного background event показал суммарные spans:
EventDispatch 15.30 ms, UpdateLayoutTree 0.41 ms, Layout 6.11 ms, Paint 4.51 ms.
Spans могут быть вложенными, складывать их в полное время нельзя. Профиль указывает
на browser/DOM work в этом fixture; bounded adapter не добавил обхода документа.
Production renderers, виртуализация, integration CSS import order и performance
реального ReactEditor в этом этапе не проверялись и остаются последующими этапами.

## 23. Выполнено: общий фон и расширяемая палитра

BlockView использует один публичный --rivto-block-background override. Общая палитра
принимает --rivto-color-<token>, включая дополнительные host tokens без изменения
Page: например, --rivto-color-brand вместе с node.color="brand". Старые публичные
--rivto-block-{gray,red,orange,yellow,green,blue,purple} удалены без compatibility aliases.
В BlockEditorTheme используется template-literal index signature вместо фиксированных
свойств для каждого цвета. Имена токенов ограничены lowercase ASCII letters/digits/
hyphens, начиная с буквы; неподдерживаемое имя или неизвестный цвет без определения
использует default background.

BlockEditorPalette формирует CSS references без фиксированного списка токенов и
без зависимости от DOM. Конкретные цвета задаёт только host; примерная палитра находится в DEMO_THEME.
В theme.css пакета нет цветовой палитры, а block-view.css не содержит per-color selectors. CSS разрешает palette references
по текущей теме, поэтому для theme changes не нужны React subscriptions. BlockView
задаёт собственный backgroundColor на каждом shell, предотвращая наследование
выбранного node.color детьми; отдельная наследуемая node-color variable не создаётся. Общий --rivto-block-background остаётся отдельным
наследуемым theme override и приоритетнее own-node color. При его удалении снова
применяется собственный цвет каждого узла.

Проверки: 51 unit tests и 18 browser scenarios в Chromium/Firefox прошли; browser
workers=12. Проверены default palette, изоляция цвета детей, вложенные overrides
общего palette token, общий background override и восстановление node colors без
замены объектов. Package/demo builds, typecheck и lint прошли. Дополнительные unit tests проверяют произвольный host token и нормализацию
неподдерживаемых имён к отсутствующему цвету. Built SSR BlockView вместе с готовым
CSS отдельно проверен в обоих браузерах: custom token, live palette update,
неподдерживаемое имя и изоляция дочернего фона.

Финальный focused performance run: 4 background scenarios, два браузера, repeat=1/200,
workers=1, production preview. На обоих размерах остаются 16 node reads, 0 root reads
и 2 notifications. Command + synchronous notifications: Chromium до 0.1 ms,
Firefox 0 ms на доступном разрешении часов. Event → два RAF, median (range), ms:

| Browser  | repeat=1         | repeat=200      |
| -------- | ---------------- | --------------- |
| Chromium | 22.1 (17.8–28.8) | 80.0 (9.2–87.1) |
| Firefox  | 21.0 (19.0–28.0) | 3.0 (3.0–4.0)   |

Для сравнения последний baseline до изменения фона: Chromium 22.4 (19.5–23.3) /
9.4 (8.8–80.7), Firefox 19.0 (17.0–23.0) / 4.0 (4.0–4.0). В большом Chromium fixture
медиана выросла, диапазоны частично перекрываются; отсутствие роста reads не является
гарантией одинакового времени browser paint/layout. Debug fixture с десятками тысяч
DOM elements остаётся дорогим; performance improvement не заявляется. Диагностическое
принудительное чтение computed style/geometry в Firefox не выявило измеряемой стоимости
flush, но меняет scheduling и не заменяет основной serial run.

## 24. Уточнено владение палитрой: только host/demo

Встроенная палитра из предыдущего этапа удалена: в src и собранных JS/CSS нет
--rivto-palette-* declarations или references. Resolver использует только общий
--rivto-block-background, host token --rivto-color-<token> и base background fallback.
Page не резервирует gray/red/etc и не выбирает для них значения. Примерные семь
цветов переехали в DEMO_THEME, передаваемый через публичный provider; COMPACT_THEME
сохраняет ту же host palette. Это optional theme configuration, а не обязательная
геометрия из demo CSS.

Обновлены README и package AGENTS.md. Новая browser regression удаляет host palette
и проверяет, что все семь токенов действительно используют base background; выбор
токена отражается в snapshot/DOM, поэтому быстрый no-op не проходит проверку.
Проверки: 51 unit test, 20 browser scenarios в Chromium/Firefox с workers=12,
package/demo builds, typecheck и lint прошли. Собранные ESM/CSS проверены на отсутствие
внутренних palette references.

Focused performance: 4 background scenarios, production preview, workers=1,
repeat=1/200 в обоих браузерах. Сохраняются 16 node reads, 0 root reads и 2 notifications
на обоих размерах. Event → два RAF, median (range), ms:

| Browser  | repeat | DOM proxy ms     |
| -------- | ------ | ---------------- |
| chromium | 1      | 22.1 (18.8–30.7) |
| chromium | 200    | 9.8 (8.4–88.5)   |
| firefox  | 1      | 21.0 (18.0–32.0) |
| firefox  | 200    | 4.0 (3.0–5.0)    |

Предыдущий baseline приведён в разделе 23. Диапазоны browser timings зашумлены;
этот перенос убирает ответственность за палитру из Page, а не доказывает ускорение
production editor. Отдельные production renderers и integration здесь не проверялись.

## 25. Color tokens removed from the Page contract

The color-token protocol introduced in sections 23–24 is removed. BlockEditorTheme
has no per-color index signature, and BlockEditorPalette and its token-validation
tests are deleted. Page accepts a resolved CSS color or expression in snapshot.color
and node.setColor. BlockView uses that value as the fallback for the single public
--rivto-block-background override; an absent color uses --rivto-background or white.
CSS syntax is the host's responsibility; Page does not parse or reserve color names.

The demo owns its named choices and maps them to resolved CSS expressions before
calling the node command. Its adapter validates example values, and its controls map
those values back to labels for display. Any --demo-color-* references in those
expressions belong exclusively to the demo. There is no palette registry or color
variable naming convention in the Page API. A production adapter must own persisted
token conversion and any reverse mapping when applying commands.

README, API comments, and package AGENTS.md now describe this boundary. Package/demo
builds, typecheck, lint, 46 unit tests, and 20 browser scenarios passed. Built ESM,
declarations, and CSS were checked for the removed palette class and variable names.

Focused performance verification passed all 4 background scenarios on production
preview, workers=1, repeat=1/200 in Chromium and Firefox. Both sizes retain 16 node
reads, zero root reads, and two notifications per change. Event to two animation
frames, median (range), milliseconds:

| Browser  | repeat | DOM proxy ms     |
| -------- | ------ | ---------------- |
| chromium | 1      | 20.4 (18.5–27.7) |
| chromium | 200    | 9.4 (9.0–9.8)    |
| firefox  | 1      | 19.0 (17.0–22.0) |
| firefox  | 200    | 4.0 (3.0–5.0)    |

These are demo rendering measurements, not a production integration guarantee.
The preceding English-demo baseline is recorded in /tmp/rivto-page-english-performance.log;
its small/large medians were 21.5/12.4 ms in Chromium and 19.0/54.0 ms in Firefox.
Rendering ranges remain noisy; no general performance improvement is claimed.

## 26. Surface mode removed from Page

BlockEditorMode is removed from public exports. BlockEditorAdapter, BlockSlotProps,
and BlockSlotRegistration no longer contain mode. BlockTree does not propagate a
surface name, BlockSlotHost filters only by position and the current-owner when
predicate, and the registry no longer captures or copies mode restrictions.
Demo and test adapters no longer declare a surface mode.

The host chooses which contributions to install and supplies application context
through its own component wrappers/providers. Page neither names nor branches on
the containing page/edgeless surface. Registry identity, priorities, owner-state
filters, selection updates, independent disposers, and controller ownership remain
unchanged. Tests now check owner/selection predicates and captured registration
fields without relying on surface names. README and AGENTS.md record this boundary.

Verification: package/demo builds, typecheck, lint, 46 unit tests, and 20 browser
scenarios passed. Four focused pointer-control performance scenarios passed on a
production preview in Chromium/Firefox, repeat=1/200, workers=1. Checkbox retains
16 node reads; collapse retains 17 closing / 30 opening one child. Both sizes retain
zero root reads and two notifications per command. Event to two animation frames,
median (range), milliseconds:

| Browser  | repeat | Collapse         | Checkbox         |
| -------- | ------ | ---------------- | ---------------- |
| chromium | 1      | 30.8 (30.3–31.3) | 31.2 (30.8–31.3) |
| chromium | 200    | 42.2 (40.6–43.1) | 47.9 (7.2–80.5)  |
| firefox  | 1      | 15.0 (13.0–15.0) | 15.0 (13.0–16.0) |
| firefox  | 200    | 16.0 (15.0–19.0) | 55.0 (54.0–56.0) |

These measurements cover the standalone fixture and bounded work; they do not
establish production integration performance or a general latency improvement.

## 27. Host-selected display list replaces BlockEditorRegion

BlockEditorRegion, BlockEditorRegionSnapshot, adapter.region, and the
available/missing status are removed from the implemented public API.
BlockEditorBlocks now supplies getBlockIds(): readonly string[] and
subscribeBlockIds(listener): () => void alongside addressed node operations.

The host selects the displayed IDs in their desired order. Blocks may have
unrelated parents; Page does not create a common parent or require an owner.
Each node's real childIds still control descendant rendering. An empty list
renders no nodes; loading or missing-owner presentation belongs to the host.
These reads do not define future insertion, navigation, or mutation permissions;
those capabilities must follow actual consumers and the host's access policy.

The array must retain reference identity until IDs or order change. Publish a new
immutable array before notifying list subscribers. Node snapshots retain their
own identity contract and subscriptions; content, selection, or node-field edits
do not invalidate the display list. Reordering preserves keyed node components.
Demo adapters, read counters, browser assertions, fixtures, exports, and README
use the same contract. Tests cover selection from different parents without
reading those parents, actual descendants, reordering, empty-list cleanup, and
bounded node work with small and large lists. Production wiring remains deferred.

Verification: package and demo builds, typecheck, lint, 47 unit tests, and all
20 Chromium/Firefox browser scenarios passed (behavior workers=12). All 12
performance scenarios passed against the production demo preview (workers=1),
repeat=1/200, rendering 6/1200 nodes without virtualization. List-type, background,
and checkbox commands each retain 16 node reads; collapse retains 17 closing / 30
opening one child. Every command retains zero display-list reads and two
notifications at both sizes. Synchronous command samples range from 0 to 1 ms.
Event to two animation frames, median (range), milliseconds:

| Browser  | repeat | Interaction | DOM proxy ms     |
| -------- | ------ | ----------- | ---------------- |
| chromium | 1      | List type   | 21.2 (18.2–24.9) |
| chromium | 200    | List type   | 18.9 (8.0–29.3)  |
| chromium | 1      | Background  | 21.7 (17.5–23.0) |
| chromium | 200    | Background  | 74.8 (8.9–85.6)  |
| firefox  | 1      | List type   | 20.0 (17.0–23.0) |
| firefox  | 200    | List type   | 16.0 (3.0–51.0)  |
| firefox  | 1      | Background  | 20.0 (18.0–21.0) |
| firefox  | 200    | Background  | 4.0 (4.0–53.0)   |

Rendering timings remain noisy; these results establish bounded source work in
the standalone fixture, not a general speedup or production integration behavior.

## 28. Host-owned editor instance and data-only adapter

BlockEditorAdapter now contains only blocks and selection. Presentation renderer
contracts live under presentation/renderers, not adapter/types. BlockEditorSlots
and BlockEditorRenderers are removed from adapter contracts and public exports.
The host creates new BlockEditorController({ adapter, fallbackRenderer? }), configures
it through slots/renderers/extensions/events, and renders <BlockEditor editor={editor}>.
Concrete block components and data transactions remain host-owned.

BlockEditorController owns its node cache and managers across DOM detach/attach.
The React component attaches/detaches only and releases its addressed subscriptions;
it does not create or destroy the editor. StrictMode replay retains the same
instance. One instance supports one concurrent view; distinct instances may share
a data adapter while retaining independent presentation configurations. The host
creates the object outside React render and owns final destruction. DemoRoot uses
an effect to create a DemoSession after commit and destroys it on cleanup; toggling
the view does not end that session. The data-only DemoAdapter owns no registries.

Slot registrations retain stable generated IDs, priority order, synchronous owner
predicates, and independent disposers. Renderer registrations reject duplicate or
empty types, retain component identity, and notify live lookup consumers. The
optional fallbackRenderer preserves fallback rendering for unregistered types.
The renderer registry does not create persisted block definitions. Publication
notifies all captured observers even if one fails; a failed direct registration
removes its new entry and reports publication/rollback failures.

Extensions expose register({ id, setup }) and registerCleanup. Setup is synchronous;
returned asynchronous/invalid cleanup is rejected. Slot/renderer registrations, their subscriptions, editor event observers, and
nested extensions installed during setup are captured automatically. Node/data
subscriptions require returned cleanup or explicit registerCleanup ownership. Nested setup restores
the parent scope. Failed setup releases captured resources, including nested
extensions, and allows retrying the same IDs. Removal runs returned cleanup first,
then captured resources in reverse order. Every release is attempted despite
failures; setup and cleanup errors are retained in AggregateError. Resource ownership
is removed before cleanup, so a throwing disposer is still idempotent. Later event
or asynchronous callbacks have editor ownership rather than implicit feature scope;
retain their disposers in returned extension cleanup when earlier removal is needed.
Destruction during setup is rejected before changing editor lifecycle state.

Public extension and event interfaces hide manager teardown and DOM attachment.
The controller remains the only final lifecycle owner. It removes DOM listeners,
releases editor resources and cached nodes, and never destroys the borrowed adapter.
React still owns removal of rendered DOM; unmount the view when ending its session.

Changes have separate subscriptions: node snapshots, host selection, display IDs,
slot entries, renderer lookups, and editor focus transitions. Focus/blur observations
receive original native focusin/focusout events only when focus crosses the entire
attached subtree. Internal focus moves emit neither event. Detachment removes
native listeners while keeping event subscriptions available for the next mount.
Keyboard dispatch remains deferred until the first concrete interaction is migrated.

Server rendering now renders the configured block list from synchronous host reads,
without DOM attachment or subscriptions. Matching data and registrations are the
host's hydration responsibility; only standalone SSR output is verified here.
Production ReactEditor/EditorPanel integration remains a separate migration stage.

Verification after implementation and review: 65 unit tests in seven suites,
package/demo typechecks, lint without warnings, package/demo production builds,
and 22 Chromium/Firefox browser scenarios passed. Browser behavior used workers=12;
all 12 production-preview performance scenarios used workers=1 without concurrent
builds or other browser tests. repeat=1/200 mounts 6/1200 nodes, without virtualization.

List/background/checkbox changes retain 16 own-node reads, collapse retains 17
closing / 30 opening one child, and every measured command retains zero display-list
reads and two notifications at both sizes. Command samples remain 0–1 ms. The prior
section's production fixture is the comparison baseline. Event to two animation
frames, median (range), milliseconds:

| Browser  | repeat | Interaction | Before           | After            |
| -------- | ------ | ----------- | ---------------- | ---------------- |
| chromium | 1      | list        | 21.2 (18.2–24.9) | 21.4 (17.0–25.1) |
| chromium | 1      | background  | 21.7 (17.5–23.0) | 21.3 (20.9–21.9) |
| chromium | 200    | list        | 18.9 (8.0–29.3)  | 21.2 (20.0–80.9) |
| chromium | 200    | background  | 74.8 (8.9–85.6)  | 80.0 (8.7–85.3)  |
| firefox  | 1      | list        | 20.0 (17.0–23.0) | 21.0 (19.0–33.0) |
| firefox  | 1      | background  | 20.0 (18.0–21.0) | 19.0 (19.0–23.0) |
| firefox  | 200    | list        | 16.0 (3.0–51.0)  | 15.0 (4.0–17.0)  |
| firefox  | 200    | background  | 4.0 (4.0–53.0)   | 4.0 (3.0–8.0)    |

The DOM timing ranges overlap and remain noisy; no general latency improvement is
claimed. Deterministic work stays bounded at both fixture sizes. Pointer scenarios
also retain the earlier read/notification bounds. Measurements cover the standalone
demo, not production editor integration.

The final review checked data/presentation ownership, narrow public manager APIs,
independent subscriptions, stable snapshot/component/node identity, one-view attachment,
StrictMode replay, nested setup scopes, failed setup/publication rollback, idempotent
cleanup, preservation of all cleanup errors, explicit data-subscription ownership,
SSR without subscriptions, and declaration documentation/formatting. Required styles
remain package-owned and were not changed by this refactor. No new dependencies or
CJS files were introduced. Production integration, hydration behavior, and keyboard
command dispatch remain outside the implemented slice; the full workspace suite was
not run for this isolated package change.

## 29. Replaceable JSX layouts and explicit drop targets

The implemented first stage separates the common BlockNode/BlockView boundary
from host JSX composition. Renderer registration now accepts { content?, layout? };
both components receive blockId and remain host-owned. DefaultBlockLayout preserves
the ordinary row/body/outline composition and the existing fallback content option.
A frozen registration retains component identities and extension ownership; its
lookup consumers compare content/layout results rather than a global revision.

Public primitives are BlockRow, BlockContent, BlockBody, BlockChildren, BlockItem,
BlockDropTarget, and BlockDropGap. Layout chooses their JSX order; the shell and
selection remain common even without a row. BlockChildren alone traverses actual
child IDs and supports stable item/gap components and appended non-block controls.
Item receives an already-rendered child; gap receives the actual parent and current
canonical previous/next IDs. Arbitrary root display IDs do not imply a parent.
Optional BlockItem wrappers own sibling-level counters while nested block shells do
not count twice; DOM-free gap boundaries preserve counter resets across explicit gaps.

Chrome and structural child contexts are separate. Stable childIds/collapse fields
avoid child-host/list work for text, color, selection, or slot publications. Layout
composition and content have independent memo boundaries, while content hooks retain
addressed data updates. Reordering within one parent retains keyed nodes. Layout
replacement or reparenting can remount content; ID-bound node objects still retain
the editor's lifetime. Empty custom child hosts can reserve geometry through public
style; collapse hides them even when their style explicitly specifies display:grid.
Only the standard layout adds outline indentation and opts out of empty leaf hosts
with renderEmpty=false; custom layouts retain empty hosts by default for drop areas. Common styles remain package-owned
and colocated, with two new public gap parameters (8px gap size, 32px horizontal
cross-axis minimum). No additional dependencies or CJS files are introduced.

Drop targets support inside(real parent) and between(real parent, nullable canonical
neighbors), a finite priority, and optional asChild ref composition. Native element
replacement unregisters the old target. Committed destination props remain live
without reinstalling retained DOM. Registry registrations participate in editor and
synchronous extension ownership. The public API exposes register and resolve only.

resolve(clientX,clientY) uses the browser's topmost hit and its registered ancestors,
scoped to the attached editor. Higher priorities win, then nearest DOM ancestor,
then earliest duplicate registration. It performs no target-list scan or document
rectangle measurements. Browser hit testing respects clipping and occlusion; detached
views and nested editor occurrences do not contribute targets. Live parent existence
and neighbor adjacency are validated before returning an element/destination candidate.
The result is not authorization to move: source permissions, cycle checks, commands,
undo, sensors, cross-document transfer, and edgeless integration remain later stages.

Autonomous Kanban/Bento examples use real in-memory hierarchy and ordinary text
renderers. Kanban places add controls inside shared child layout without DOM lookup
or portals; Bento places tiles before its own content and owns widths outside Page's
data contract. Their host operations append columns/cards and update tile data.
The default fixture remains available unchanged. An opt-in inspector throttles native
pointer movement to one frame, resolves a candidate, and changes only debug DOM.
Large fixtures mount 2000 Kanban or 1400 Bento nodes without virtualization.

This stage does not migrate production containers, Table, real DnD, keyboard behavior,
hydration, or viewport virtualization. Production ReactEditor integration remains separate.

### Verification of stage 29

The final package check passed: 79 Jest tests in eight suites, TypeScript checks,
lint with no warnings, the ESM/declaration/stylesheet build, and the production demo
build. Chromium and Firefox behavioral coverage passed all 30 tests with 12 workers.
All 20 production-preview performance tests passed serially with tracing disabled.
The full workspace suite was not run.

At repeat=1 and repeat=200, Kanban text changes read 15 nodes and publish two
notifications; Bento text changes read 22 nodes and publish four notifications.
Five pointer samples read five destination parents, read no display lists, and
publish no data notifications at both sizes. Registry unit tests additionally check
that unrelated targets and rectangle measurements are never visited. This bounds
controller work; it does not make browser rendering independent of document size.

Final pointer-to-two-animation-frame samples in milliseconds (median, range):

| Browser  | Example | repeat=1         | repeat=200     |
| -------- | ------- | ---------------- | -------------- |
| Chromium | Kanban  | 16.6 (16.5–16.8) | 0.5 (0.4–23.9) |
| Chromium | Bento   | 16.6 (15.8–16.7) | 0.5 (0.3–44.5) |
| Firefox  | Kanban  | 16 (16–18)       | 38 (36–38)     |
| Firefox  | Bento   | 17 (15–17)       | 36 (36–39)     |

These five-sample frame proxies are noisy and include animation-frame alignment;
they are not complete input latency or proof of a general speedup. Chromium's first
large-fixture resolve sample took 6.2–6.6 ms; subsequent resolves took 0–0.1 ms.
Firefox's coarse timer recorded resolve durations as zero. Large-fixture Firefox
frame cost remains visible. Existing large-outline cases also retain substantial
browser costs: the final Firefox list-change samples ranged from 100 to 423 ms,
and checkbox samples from 115 to 125 ms despite unchanged addressed read bounds.

A traced initial run passed, but DOM tracing inflated large Bento pointer medians
(about 104 ms Chromium and 64 ms Firefox). Isolated browser profiling showed no
layout work in the sampled inspector path; the same behavioral assertion without
Playwright tracing reduced that overhead. demo:performance now explicitly passes
--trace off; behavioral tracing remains unchanged. Traced and untraced timings are
not compared as an application improvement. No speculative containment CSS or
virtualization was added to hide these measurement or browser costs.

## 30. Grid and wrapping gap overlays

Historical stage: superseded by the in-flow BlockWrapper boundaries in stage 32.

BlockDropGap now has two named prop contracts. Flow gaps retain explicit canonical
neighbors and vertical/horizontal sizing. Grid gaps use axis="grid" and a required
before/after placement directly inside BlockItem; they read the actual parent and
neighbor IDs from the shared child iterator's placement context. An arbitrary
display list cannot supply a parent, and unsupported placement throws explicitly.

Each grid placement registers two absolute regions: top/inline-start before the
tile, bottom/inline-end after it. This preserves CSS Grid cells and flex wrapping;
regions follow width and row changes without observers or rectangle reads. Their
inward depth uses the public drop-gap-size, capped at half the tile. Their outward
reach uses half the shared children-gap, so hosts should use that parameter for
continuous gutter coverage. Native styles and layout composition remain host-owned;
all required overlay styles ship in the package. Inline sides support RTL. Normal
clipping applies. Multiple visual regions may name one canonical gap, including
across a row break. Dense or visually reordered CSS does not redefine document order.

Bento now uses these item-local overlays rather than flow gaps between tiles.
Ordinary outline and Kanban flow targets are unchanged. Empty grids use the existing
inside registration on BlockChildren; no fake children or synthetic block IDs are
introduced. Gesture execution, source permissions, move transactions, and production
integration remain separate stages.

### Verification of stage 30

83 Jest tests in eight suites, package type checks, lint without warnings, the
ESM/declaration/stylesheet build, and the production demo build passed. All 36
Chromium/Firefox behavior tests passed with 12 workers. Four focused production
performance tests passed with one worker and tracing disabled, before and after
this change, on repeat=1 (7 nodes) and repeat=200 (1400 nodes).

At both sizes, text changes retain 22 node reads and four notifications. Five
actual pointer samples retain five node reads, zero display-list reads, and zero
data notifications. Structural node identities and data subscriptions remain stable.
The browser tests cover real two-column CSS Grid with no added cells or shifted
item rectangles, one-column reflow, tile widths, actual horizontal/row gutters,
RTL, theme overrides, clipping, collapse/remount, and disabled demo CSS. Unit tests
cover canonical neighbor updates with retained item/target DOM, missing placement
errors, and every registration's cleanup through StrictMode replay and destruction.

Pointer-to-two-animation-frame timings in milliseconds, median (range):

| Browser  | repeat | Before (flow gaps) | After (grid overlays) |
| -------- | ------ | ------------------ | --------------------- |
| Chromium | 1      | 16.6 (16.2–16.7)   | 16.6 (16.4–16.7)      |
| Chromium | 200    | 1.0 (0.3–23.8)     | 24.7 (16.9–36.8)      |
| Firefox  | 1      | 16 (13–16)         | 16 (14–17)            |
| Firefox  | 200    | 38 (1–41)          | 40 (36–43)            |

These are five-sample frame proxies, affected by frame alignment, and the corrected
Bento no longer allocates space to old flow gaps. They do not establish a rendering
speedup or constant browser frame cost. To investigate the larger Chromium proxy,
a separate serial CDP profile measured five warmed actual hovers: zero layout and
style recalculation at both sizes, with total ScriptDuration 0.689 ms small and
0.830 ms large. The resolver continues to inspect hit ancestors rather than all
registered targets; grid overlays add no pointer-time geometry measurements.
Full-workspace tests, production ReactEditor integration, and real move execution
remain outside this package change.

## 31. Review corrections: pointer input, initial focus, node ownership, and sampling

All four review findings were reproduced before their fixes. The grid-overlay
regression failed in Chromium and Firefox both with 12 workers and serially: the
bottom three pixels of a tile-width select hit an overlay. The React autoFocus
regression showed an active input and zero editor focus notifications. Type-level
assertions confirmed destroy was exposed by controller/editor node lookups, the
hook, and slot props. All four Kanban content/pointer performance scenarios failed
serially because toolbar scrolling left the sampled gap center outside the viewport.

Grid edge overlays are now pointer-transparent by default. BlockEditor accepts
an explicit dropTargetsActive view prop for inspection/dragging; root-scoped CSS
activation preserves registration identities and resets at nested editor roots.
The demo coordinates inspector state with that prop. No node facade, global editor
state, drag sensor, or document mutation was introduced.

Attachment publishes its root before reconciling already-acquired focus. Current
focus is reported once per attachment with a synthetic focusin delivered directly
to editor observers; its target is null because the original native event is no
longer available. Subsequent transitions retain native events. Initial observer
failure rolls back the attachment and native listeners; retry remains possible.

BlockEditorNodeApi explicitly lists live data access, addressed subscriptions, and
commands without destroy. Controller lookups, BlockEditorApi, useBlockNode, slots,
presentation contexts, and demo controls use that borrowed type. The controller's
private cache retains concrete nodes and exclusive teardown ownership. Existing
node objects, snapshots, and subscription semantics are unchanged; interface
narrowing is a TypeScript boundary, not runtime access control.

The performance helper resets counters before restoring gap visibility, intersects
the region with the viewport, and verifies native hit testing at the selected point
before starting timing. Equivalent real pointer samples stay in that visible area;
no-op samples and obstructed/offscreen targets fail explicitly. No correctness or
work budgets were relaxed. The new pointer regression also restores scroll position
after toggling the toolbar checkbox; its intermediate offscreen-test failure was
reproduced serially and corrected before the final browser run.

### Verification of stage 31

Package TypeScript checks, lint without warnings, ESM/declaration/stylesheet build,
and production demo build passed. All 86 unit tests in eight suites passed. The
final Chromium/Firefox behavior run passed 38 tests with 12 workers; the full
serial performance run passed all 20 tests with tracing disabled, including all
four previously failing Kanban cases. Pre-fix overlay failures were reproduced
both in parallel (two failures) and serially (two failures); initial-focus and node
API checks also failed for the reported reasons before their corrections.

Small/large fixtures retain bounded data work: Kanban text changes read 15 nodes
and publish twice; Bento text changes read 22 nodes and publish four times. Five
pointer samples read five parents, read no display lists, and publish no data at
both sizes. Frame timing remains separate from those counts; large Firefox DOM
costs remain visible. Corrected sampling uses visible points rather than offscreen
element centers, so the prior failing Kanban run is not a latency comparison.
No general speedup is claimed. Full-workspace tests and production ReactEditor
integration were not run for this isolated package correction.

## 32. In-flow BlockWrapper insertion boundaries

The agreed replacement is documented in rivto-page-block-wrapper-ru.md. Public
BlockWrapper composes BlockItem and retains its single sibling counter and existing
BlockNode. Four targets occupy real CSS Grid tracks around center content instead
of overlaying the tile. Top/inline-start mean before and bottom/inline-end mean after,
using the same canonical neighbor context. Native widths include the strips.

BlockDropGap now represents only vertical/horizontal flow gaps. Its grid variant,
absolute-region implementation, root activation CSS, and BlockEditorProps activation
flag have been removed. The inspector controls feedback only. Bento sets its child
host gap to zero because neighboring wrapper strips already provide the spacing.
All required geometry is package-owned and uses --rivto-drop-gap-size (default 8px).
No extra decorator registry, alternate node implementation, geometry index, or move
mutation API is introduced. Earlier overlay measurements remain historical evidence.

Stage 32 verification: the old inspected-control-edge failure was reproduced in
Chromium/Firefox both in parallel and serially. The replacement passes 87 unit tests,
44 parallel browser cases, and 20 serial production performance cases, plus types,
lint, package/demo builds, and published-export/CSS checks. Bento retains 22 reads /
4 notifications per text edit and 5 reads / 0 notifications for five pointer samples
at both fixture sizes. Ownership and geometry details, limitations, and before/after
frame-proxy ranges are recorded in rivto-page-block-wrapper-ru.md.

## 33. Generic registered block decorators

The concrete insertion frame from stage 32 is renamed BlockDropWrapper and moved
to drag-and-drop with its own CSS and private boundary component. BlockWrapper now
composes editor.wrappers around the one existing BlockView. Its ordered registry
has stable immutable snapshots, subscriptions independent from data/selection,
and extension-owned registration/disposal/rollback. BlockElementRefProvider gives
decorators the existing shell without adding layout DOM; child blocks reset the
ref scope and explicit BlockView refs remain composed. No DnD logic is retained
inside the generic wrapper folder. Details and verification belong to
rivto-page-wrapper-registrations-ru.md.

## 34. Wrapper-owned DOM and explicit priorities

Stage 33's shared-ref provider/helper has been removed. Decorators own their ordinary
DOM, React/native events, local refs, and cleanup. BlockView retains only its explicit
consumer ref. The generic chain returns nested decorators without a ref boundary.
Registration now requires { component, priority }; higher finite priorities are
outermost, with installation order for ties. Missing/nonfinite values fail before
publication. BlockItem accepts a borrowed own-node snapshot for counter-aware decorators;
nested items for the same block do not increment twice, and BlockView resolves its
item identity inside the composed chain. The demo exercises owned pointer events,
list counters, view remounts, and the existing tile placement without shared refs.
Historical shared-ref measurements above remain evidence for the previous design.

## 35. Page events, keyboard и pointer selection

Реализован этап из [плана events/keyboard/selection](rivto-page-events-keyboard-selection-plan-ru.md).
Page events теперь предоставляют typed DOM registrations и detach cleanup наряду
с focus/blur observations. Controller владеет keyboard runtime из отдельного
`@chulane/rivto-keyboard`; React-редактор подключён к нему через host transport.
Pointer selection подключается независимыми feature registrations; данные и
конкретный contenteditable остаются у host. Public API и пример подключения —
в `packages/rivto-page/README.md`. Результаты проверок, измерения и границы этапа
зафиксированы в плане; production selection-интеграция не считается выполненной.
