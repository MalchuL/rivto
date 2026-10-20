# Контракты самостоятельного блочного редактора

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
