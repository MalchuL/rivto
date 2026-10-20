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
и children. Не вводить BlockController на каждый блок: сейчас ему нечем владеть, что
не принадлежало бы уже renderer hook, shell или контроллеру всей области.

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
  region, blocks, selection, renderers. Node shape задаётся собственным BlockEditorNode:
  только id, type и childIds; model-specific data, editor/panel/document, конкретных
  блоков и обратных owner-ссылок в контракте нет.
- `editor/block-editor-controller.ts`: контроллер без внешних эффектов в конструкторе,
  attach с идемпотентным disposer, getRoot и окончательный destroy. Старый disposer не
  отключает новый root; второе одновременное attach и attach после destroy отвергаются.
- `presentation/components/block-editor/`: BlockEditor, внутренний context и адресное дерево.
  Controller создаётся после commit, на смене adapter/unmount освобождается;
  StrictMode effect replay создаёт новый экземпляр после cleanup старого.
- `presentation/hooks/`: useBlockEditorController и read-only useBlockNode. Это автономный
  контекст принимающего пакета; существующие host hooks и renderer implementations
  пока не мигрированы и не подключены к нему.

Компонент принимает один adapter и необязательный className. Первый client render и
SSR содержат только корневой div; дерево появляется после attachment. onContentHeightChange,
input/selection commands, mutation API, slots/wrappers, behaviors/collapse, navigation,
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

Проверки после последнего изменения runtime:

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
navigation и drag-and-drop. Пока здесь остаётся BlockEditorController и его тест.
По отдельному запросу пользователя каталоги будущих selection, navigation, drag-and-drop
и presentation/slots созданы с `.gitkeep`, чтобы сохранить структуру в Git. Реализаций
или методов-заглушек в этих каталогах нет.

```text
src/
├── adapter/
├── editor/
│   ├── block-editor-controller.ts
│   ├── block-editor-controller.test.ts
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
BlockEditorNode принадлежит Page-пакету и задаёт минимальный read-only structural contract:
стабильный id, renderer lookup type и упорядоченные childIds. Content, native props,
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
