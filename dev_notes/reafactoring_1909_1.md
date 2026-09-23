# Аудит рефакторинга 19.09 — исходные находки

Область анализа: `packages/document-model`, `packages/rivto-editor-core`, `packages/react-rivto-editor`.

В отчёт включаются только находки, подтверждённые поиском определений, импортов и вызовов. Оценки сокращения строк приблизительны и нужны для приоритизации, а не как плановый показатель.

## Находки

### P0. Удалить два фиктивных параметра `BlockManager.patchProps`

Status: superseded by the single-manager API decision

- **Категория:** `delete`, имя/API, документация.
- **Место:** `packages/document-model/src/core/managers/block-manager/block-manager.ts:1041-1048`.
- **Подтверждение:** `id` и `type` объявлены и описаны в JSDoc, но тело `patchProps` их не читает; `tsc --noUnusedParameters` выдаёт `TS6133` для обоих параметров. Метод фактически валидирует и применяет только `props` и `patch`.
- **Проблема:** сигнатура обещает зависимость валидации свойств от идентификатора и типа блока, которой нет. Новый разработчик будет искать отсутствующую type-specific логику, а каждый вызов передаёт бессмысленные аргументы.
- **Решение:** оставить `patchProps(props, patch)`, удалить два аргумента во всех вызовах и исправить JSDoc. Если type-specific валидация действительно нужна, её следует явно добавить через существующий реестр определений на уровне editor-core, а не сохранять неиспользуемые параметры в document-model.
- **Дополнительное упрощение:** `const validated = { ...props.toObject(), ...patch }` не нужен: цикл затем читает только ключи `patch`, для которых `validated[key]` всегда равен `patch[key]`. После validation можно в одном проходе удалять/устанавливать непосредственно `value` из `Object.entries(patch)`, не materialize-ить весь CRDT map.
- **Эффект:** примерно −8 строк сигнатур/документации/лишнего merge и меньше ложной связанности.

### P0. Удалить устаревший unit-тест несуществующего `hasCrossedBlock` либо вернуть проверяемое правило как именованный helper

Status: solved

- **Категория:** `delete`/`merge`, тестовая структура.
- **Место:** `packages/react-rivto-editor/src/extensions/built-ins/selection/text-selection.test.ts`; актуальная логика находится в `text-selection.ts:278-319`.
- **Подтверждение:** `hasCrossedBlock` отсутствует в реализации и во всём workspace; единственные пять обращений — импорт и проверки в этом тесте. Из-за этого `tsc` завершает проверку пакета ошибкой `TS2305`, то есть файл уже не тестирует собираемый API.
- **Проблема:** тест закрепляет прежнюю декомпозицию, тогда как соответствующее правило теперь встроено в обработчик `pointermove` и учитывает `pointedBlockId`, DOM caret, contentless-блоки и модификаторы. Простое возвращение старой функции с четырьмя строковыми аргументами создаст второй, более слабый источник истины.
- **Решение:** предпочтительно удалить этот тест и покрыть актуальное поведение через существующий event-level набор тестов selection. Если чистая функция всё ещё нужна для сложной ветки, извлечь из `pointermove` helper с входом, отражающим реальные понятия (`pointedBlockId`, `headPosition`, `anchorPosition`, modifiers), использовать его в production и тестировать его; не восстанавливать старую неиспользуемую сигнатуру.
- **Эффект:** −22 строки мёртвого теста в минимальном варианте и восстановление type-check пакета.

### P1. Удалить неиспользуемые `RestrictedMap` и `RestrictedArray` вместе с пустым barrel-файлом

- **Категория:** `delete`.
- **Место:** `packages/rivto-editor-core/src/utils/types/restricted-types.ts`, `packages/rivto-editor-core/src/utils/types/index.ts`, строка реэкспорта в `src/utils/index.ts`.
- **Подтверждение:** поиск `RestrictedMap|RestrictedArray|utils/types` по `packages`, `demo`, `e2e` и `docs` находит только их собственные определения и реэкспорты. Корневой `src/index.ts` не экспортирует `./utils`, поэтому типы не являются даже достижимой частью публичного package entry point. `utils/types/index.ts` существует только ради одного реэкспорта.
- **Проблема:** два самодельных интерфейса коллекций создают впечатление действующего публичного контракта и требуют разбирать отличия от `Map`/`Array`, хотя ни один production- или test-код их не использует.
- **Решение:** удалить каталог `src/utils/types` и строку `export type { RestrictedArray, RestrictedMap } from './types'`. Не заменять ничем; при реальной потребности использовать узкий `Pick<...>` непосредственно у границы либо существующие CRDT-контракты.
- **Эффект:** −29 строк и −2 файла.

### P1. Удалить изолированный компонент `NumberControl`

- **Категория:** `delete`.
- **Место:** `packages/react-rivto-editor/src/extensions/edgeless/visuals/components/number-control.tsx`.
- **Подтверждение:** имя `NumberControl` и путь `number-control` не встречаются больше нигде в `packages`, `demo`, `e2e` или `docs`; файл не входит ни в один barrel-export. Похожие реальные поля реализованы специализированными `SizeControl` и обычными native `<input type="number">` непосредственно у владельцев.
- **Проблема:** комментарий утверждает, что поле используется панелями и defaults, но production-граф его не достигает; кроме того, жёсткие `min=1/max=160` делают якобы общий компонент непереиспользуемым.
- **Решение:** удалить файл. Не обобщать заранее; общий numeric control следует выделить только после появления как минимум двух одинаковых реально используемых реализаций и передавать ограничения параметрами.
- **Эффект:** −22 строки и −1 файл.

### P1. Удалить три экспортируемых, но нигде не используемых символа

- **Категория:** `delete`, сокращение публичной поверхности.
- **Места:** `SelectionBlock` в `react-rivto-editor/src/managers/selection/editor-dom-selection.ts:109`, `viewOf` в `react-rivto-editor/src/managers/events/dom-nodes.ts:47`, `sliceBlockRange` в `rivto-editor-core/src/managers/selection-manager/selection-ranges.ts:115`.
- **Подтверждение:** для каждого имени глобальный поиск по `packages`, `demo`, `e2e`, `docs` возвращает только строку определения. `SelectionBlock` и `viewOf` не входят в корневой curated export React-пакета; `sliceBlockRange` проходит через wildcard barrel core-пакета, но не имеет ни одного потребителя или теста.
- **Проблема:** exports обещают поддерживаемые контракты без поведения в самом продукте. Особенно `SelectionBlock` описан как промежуточная модель алгоритма, который больше её не принимает; `sliceBlockRange` — тривиальная оболочка над реально используемым `resolveBlockRange`.
- **Решение:** удалить `SelectionBlock` и `viewOf`; удалить `sliceBlockRange`, оставив `resolveBlockRange` единственным источником правил диапазона. Если внешняя совместимость всё же станет требованием, сначала отметить deprecated и проверить реальные package consumers — текущие правила репозитория допускают breaking changes.
- **Эффект:** примерно −31 строка публичного кода и документации.

### P0. Слить дублирующую модель element/snapshot в editor-core с каноническими типами document-model

Status: solved

- **Категория:** `merge`, границы пакетов, повторение типов.
- **Место:** `packages/rivto-editor-core/src/editor/model.ts:1-76` и `packages/document-model/src/core/types/document.ts:13-58,247-261`.
- **Подтверждение:** `EditorElementFrame`, `EditorElement`, `EditorElementInput`, `EditorElementPatch`, `EditorElementUpdate` структурно повторяют `ElementFrame`, `DocumentElement`, `ElementInput`, `ElementPatch`, `ElementUpdate`; `EditorSnapshot`/`EditorSnapshotUpdate` повторяют `Snapshot`/`SnapshotUpdate`. Для block-типов тот же файл уже использует правильный подход — aliases на `Block*` из document-model. В `ElementManager` появились показательные `satisfies DocumentElement` и преобразования типов без преобразования данных.
- **Проблема:** канонические persisted-инварианты принадлежат document-model, однако editor-core объявляет второй источник истины и повторяет документацию. Любое добавление поля потребует синхронно менять два набора интерфейсов; структурная совместимость TypeScript скрывает расхождение до позднего этапа.
- **Решение:** импортировать канонические element/snapshot-типы и сохранить удобные публичные имена как aliases: `type EditorElement = DocumentElement`, `EditorElementFrame = ElementFrame`, `EditorElementInput = ElementInput`, `EditorElementPatch = ElementPatch`, `EditorElementUpdate = ElementUpdate`, `EditorSnapshot = Snapshot`, `EditorSnapshotUpdate = SnapshotUpdate`. Затем убрать лишние `satisfies`/casts в `ElementManager`. Это сохраняет API имён `@chulane/rivto`, но оставляет единственного владельца shape.
- **Эффект:** ориентировочно −50 строк определений и исключение будущего schema drift.

### P1. Удалить неиспользуемый `assignArray` из document-model

- **Категория:** `delete`, YAGNI.
- **Место:** `packages/document-model/src/core/utils/crdt.ts:76`, реэкспорт в `core/utils/index.ts`; описание в `docs/10-packages/10-rivto/10-store/09-document-model/70-utilities.md`.
- **Подтверждение:** в коде workspace нет ни одного вызова; единственное code-упоминание кроме определения — реэкспорт. Документация прямо отмечает отсутствие call sites и объясняет, что block hierarchy использует точечные `insert/delete/push`.
- **Проблема:** публичный helper поддерживает режимы полного и append-присваивания, которые ни один владелец данных не выбрал; он расширяет API и создаёт альтернативный, менее предметный путь изменения CRDT arrays.
- **Решение:** удалить функцию, реэкспорт и посвящённые ей секции документации. Вернуть только при появлении конкретного владельца коллекции, которому действительно нужна именно bulk-assignment семантика.
- **Эффект:** сокращение production-кода и заметного объёма документации; одна CRDT mutation idiom меньше.

### P2. Переиспользовать `isPlainRecord` вместо второго определения в block registry

- **Категория:** `merge`, reuse.
- **Место:** локальный `isRecord` в `packages/rivto-editor-core/src/managers/block-registry-manager/block-registry-manager.ts:16-22`; канонический `isPlainRecord` в `packages/document-model/src/core/utils/portable.ts:55-60`.
- **Подтверждение:** обе реализации одинаково исключают arrays и принимают `null`-prototype/current/foreign-realm plain objects через ту же проверку prototype chain. editor-core уже зависит от document-model и реэкспортирует его API.
- **Проблема:** важное правило «что можно рекурсивно merge-ить» задокументировано и реализовано дважды; исправление edge case легко внести только в одну копию.
- **Решение:** после локального guard `value !== null && typeof value === "object"` вызывать импортированный `isPlainRecord(value)`; локальную функцию либо сократить до этого guard, либо расширить сигнатуру `isPlainRecord` до `unknown` в document-model и использовать напрямую. Второй вариант лучше, потому что все текущие callers уже начинают с `unknown`. Создать в packages/rivto-utils и импортировать его
- **Эффект:** примерно −8 строк и единое cross-realm правило plain-record.

### P0. Удалить второй, строковый API встроенных core-операций из `CommandRegistry`

Status: solved

- **Категория:** `delete`/`merge`, лишний слой, типобезопасность.
- **Место:** `BlockManager.registerRequiredCommands`, `ElementManager.registerCommands`, `EditorRuntime.registerRuntimeCommands`, `EditorRuntime.registerClipboardCommands` и тонкие методы, которые немедленно вызывают `commands.execute(...)`.
- **Подтверждение:** production-поиск показывает, что `block.*` и `element.*` команды вызываются только соответствующими typed manager methods; прямые внешние вызовы находятся в тестах и старой документации. `selection.*`, `history.*`, `document.load` и `clipboard.*` также дублируют уже публичные `selection`, `history`, `load` и `clipboard`; React clipboard пользуется typed manager API. Реально независимые production-потребители `CommandRegistry` — подключаемые `edgeless.*` команды, которым динамический registry действительно нужен.
- **Проблема:** каждая core-операция существует дважды: типизированная сигнатура превращает аргументы в `unknown`, registry снова разбирает их через casts и ручные `commandPayload`/`commandString`, затем вызывает настоящую реализацию. Это добавляет сотни строк, runtime-проверки к уже типизированным внутренним вызовам и небезопасные `as unknown as`, не создавая второй production use case.
- **Решение:** оставить `CommandRegistry` как extension/app bus для динамически устанавливаемых команд (`edgeless.*`, `app.*`), а встроенные block/element/document/selection/history/clipboard операции выполнять непосредственно в их typed manager methods. Перенести processing из handlers в эти методы, а `batchUpdates` оставить у составных editor-операций и там, где undo tests подтверждают необходимость отдельного capture breakpoint; не оборачивать им автоматически каждый одиночный document-model call. Удалить регистрации, массивы их disposers и command-only тесты; обновить документацию на manager API. Не удалять сам registry.
- **Эффект:** наиболее крупное сокращение аудита — ориентировочно несколько сотен строк payload adapters, registrations и дублирующих тестов; compile-time типы перестают теряться на внутренней границе.

### P1. Удалить ручные массивы disposer-ов для регистраций, уже принадлежащих `ExtensionManager`

- **Категория:** `delete`, дублирование lifecycle.
- **Место:** как минимум `kanbanExtension`, `bentoExtension`, `separatorBlockExtension`, `slashCommandExtension`, `todoItemExtension`; аналогичные `const disposers = [...]` в React extensions.
- **Подтверждение:** каждый manager registration возвращается через `reactEditor.extensions.own(...)`; во время `ExtensionManager.install` все такие disposer-ы автоматически попадают в `activeExtensionRegistrations` и освобождаются в обратном порядке. Перечисленные extensions параллельно складывают те же idempotent disposer-ы в локальный массив и вызывают их второй раз. Extensions без локального состояния (`columnsExtension`, `tableExtension`) уже полагаются только на автоматическое владение.
- **Проблема:** существуют два механизма ownership одного ресурса. Это увеличивает setup-код, скрывает реальную причину cleanup и заставляет проверять, выдерживает ли каждая регистрация двойной dispose. В `todoItemExtension` полезна лишь очистка локального `candidate`, но она смешана с повторным освобождением manager registrations.
- **Решение:** не сохранять disposer-ы, возвращённые React managers. Возвращать cleanup только для не принадлежащего manager-у локального состояния/таймеров/DOM (`clearCandidate`, pointer state и т. п.). В `standardPreset` продолжать собирать только такие custom cleanup-ы дочерних extension setup; manager registrations внешнего preset уже автоматически принадлежат активной установке.
- **Эффект:** десятки строк меньше и один однозначный lifecycle owner.

### P2. Объединить HTML escaping и убрать JSON round-trip в edgeless clipboard

- **Категория:** `merge`, `native`, reuse.
- **Место:** `escapeHtml` в `managers/clipboard/clipboard-manager.ts:51` и `EdgelessVisualController.escapeHtml` около строки 720; `JSON.parse(JSON.stringify(element.props))` в `controller.ts:676`.
- **Подтверждение:** обе escape-реализации используют один regex и одну таблицу HTML entities. В том же controller уже есть `copy = structuredClone`, применяемый к остальным clipboard-данным; props предварительно проходят portable validation.
- **Проблема:** два escape-правила могут разойтись, а JSON round-trip — третий способ клонирования рядом с `structuredClone`: он менее очевидно обращается с `undefined` и special values и заставляет читателя заново доказывать безопасность данных.
- **Решение:** экспортировать узкий `escapeHtml` из React clipboard utility и использовать его в обоих форматтерах; заменить JSON round-trip на существующий `copy(element.props)` (либо прямо `structuredClone`). Не вводить общий serialization framework.
- **Эффект:** несколько строк меньше и единая семантика clipboard HTML/clone.

### P1. Добавить отсутствующие module-level JSDoc прежде всего в сложные модули

- **Категория:** документация/понятность, контроль структуры.
- **Место:** 107 из 306 production `.ts/.tsx` файлов в трёх пакетах не начинаются с обязательного module-level JSDoc (тесты и test-utils исключены). Среди них `react-rivto-editor/src/extensions/edgeless/visuals/controller.ts` (около 900 строк), `visuals/types.ts`, большинство `visuals/utils/*`, core `editor/model.ts`, `ElementManager`, block registry, React capabilities/managers/hooks и множество barrel-файлов.
- **Подтверждение:** проверка первого непустого токена каждого production-модуля дала 107 файлов, начинающихся с import/export/объявления вместо `/** ... */`. `eslint` при этом проходит без сообщений, то есть правило репозитория сейчас автоматически не контролируется.
- **Проблема:** для крупных файлов отсутствует краткая карта ответственности и соседних слоёв; особенно `EdgelessVisualController` одновременно содержит state, commands, clipboard, group/connector normalization и mutation API. Новый разработчик вынужден восстанавливать назначение по всему файлу. Для barrel-файлов неясно, публичный это entry point или только внутренний маршрут.
- **Решение:** сначала документировать сложные владельцы (`controller.ts`, element/block managers, capabilities, selection/geometry), указывая ответственность, инварианты и соседний слой; затем коротко маркировать barrels как public/internal. Добавить lint/check первого токена production-файла, иначе долг быстро вернётся. Не писать JSDoc, просто повторяющий имя; для 900-строчного controller отдельно перечислить, что является session state, persisted mutation, command adapter и clipboard boundary.
- **Эффект:** сокращения строк нет; существенно уменьшается необходимость читать весь граф вызовов для понимания owner-а.

### P2. Переименовать несколько `utils.ts` по фактической ответственности

- **Категория:** `rename`, навигация.
- **Места:** `rivto-editor-core/src/managers/utils.ts` → `command-payload.ts`; `document-model/src/core/managers/block-manager/utils.ts` → `block-validation.ts` (при необходимости CRDT-мелочь `strings` оставить рядом с manager); `document-model/src/core/managers/element-manager/utils.ts` → `element-validation.ts`; `react-rivto-editor/src/utils.ts` → `editor-type-guards.ts`.
- **Подтверждение:** первый файл содержит только `commandPayload`/`commandString`; element-файл целиком нормализует и валидирует persisted element values; корневой React-файл содержит только `isReactEditor`/`isRivtoEditor`. Текущие имена не позволяют найти код без чтения содержимого. Block `utils.ts` смешивает forest/list validation с `strings` и `contentFrom`, поэтому имя также скрывает две ответственности.
- **Проблема:** generic `utils` размножается на разных уровнях и не сообщает, можно ли туда добавлять произвольный helper. Это ухудшает discoverability и поощряет дальнейшее смешение.
- **Решение:** дать файлам предметные имена выше; в block manager после удаления неиспользуемых exports оставить узкие helpers возле единственного caller-а либо разделить validation и CRDT conversion только если оба набора сохранят несколько callers. Не создавать общий `helpers.ts`.
- **Эффект:** тот же объём кода, но понятный поиск и более жёсткие границы ответственности.

### P1. Удалить четыре недостижимых barrel-файла React extensions

- **Категория:** `delete`, мёртвые entry points.
- **Место:** `extensions/block-drag/cross-document/index.ts`, `extensions/block-drag/preview/index.ts`, `extensions/block-drag/utils/index.ts`, `extensions/built-ins/page/index.ts`.
- **Подтверждение:** построенный от реальных package entries (`src/index.ts` и `src/extensions.ts`) граф static/dynamic import/export не достигает эти четыре файла; прямой поиск путей также не находит consumers. `package.json` публикует только `.` и `./extensions`, поэтому deep barrels не являются доступными package entry points. Остальные файлы в этих каталогах достигаются прямыми imports; удалить нужно только лишние `index.ts`.
- **Проблема:** комментарии называют их «Internal entry point» и даже «Public entry point», хотя ни один entry их не экспортирует. Это вводит разработчика в заблуждение о поддерживаемом маршруте импорта и добавляет альтернативные пути к тем же символам.
- **Решение:** удалить четыре barrel-файла. Если `built-ins/page` действительно должен стать публичным subpath, это отдельное продуктовое решение с записью в `package.json.exports`; не держать сейчас недоступный «public» файл про запас.
- **Эффект:** −18 строк и −4 файла.

### P1. Перестать публиковать storage-внутренности document-model через корневой API

- **Категория:** `move`/public API, границы пакета.
- **Место:** wildcard `export * from "./utils"` в `document-model/src/core/index.ts` и `core/utils/index.ts`; транзитивно эти же символы повторно публикует `@chulane/rivto`.
- **Подтверждение:** `clone`, `assignMap`, `assignText`, `isCRDTMap`, `isCRDTArray`, `isCRDTText`, `isDangerousKey` и `requireNonemptyId` используются внутри document-model (кроме собственных тестов/документации). Межпакетные production consumers используют только предметные validators (`validateBlockForest`, `validateElementCollection`, `validateBlockListProps`) и portable boundary helpers. CRDT mutation helpers описывают внутреннюю раскладку storage, а не document contract.
- **Проблема:** пакет заявляет, что скрывает collaborative storage за managers, но public entry одновременно выдаёт операции над `CRDTMap/Array/Text`. Через реэкспорт editor-core они выглядят частью editor API и позволяют внешнему коду обходить manager transactions/invariants.
- **Решение:** сделать `clone`, `assign*`, `isCRDT*`, `isDangerousKey`, `requireNonemptyId` внутренними imports; из public entry явно экспортировать только document types/classes и validators, реально нужные clipboard/React boundaries. Portable predicates оставлять публичными лишь если внешний validation use case подтверждён; иначе также сузить. Документацию storage utilities пометить internal вместо consumer API.
- **Эффект:** меньше публичная поверхность без удаления нужной внутренней реализации; package boundary начинает соответствовать заявленному owner-у.

### P2. Снять лишний `export` с внутренних view-классов и служебных типов

- **Категория:** `delete` (export surface), понятность.
- **Место:** `BentoView`; `ColumnsView`/`ColumnsColumnView`; `KanbanView`/`KanbanColumnView`; `TableView`/`TableRowView`/`TableCellView`; также внутренние `ConnectorPreviewRecord`, `ConnectorAnchorMarker`, `GroupParentRecord`, `RankedSlashCommand` и локальные slash-search helpers.
- **Подтверждение:** каждый container view class используется только для создания единственного экспортируемого shared instance в том же файле; внешние modules импортируют instances. Перечисленные служебные interfaces/functions встречаются только в своём модуле или в одном соседнем internal module и не проходят через опубликованные package entries.
- **Проблема:** `export` визуально обещает точку расширения и увеличивает внутренний module API, хотя поддерживаемый контракт — instance либо более высокоуровневый extension. Читателю приходится проверять, какой из двух symbols следует регистрировать.
- **Решение:** оставить классы именованными, но не экспортировать; экспортировать только `bentoView`, `columnsView`, `columnsColumnView`, `kanbanView`, `kanbanColumnView`, `tableView`, `tableRowView`, `tableCellView`. Снять `export` с типов/helpers, не пересекающих module boundary; у slash search экспортировать только две функции, реально импортируемые menu (`rankSlashCommands`, `keepNoResultMenuOpen`).
- **Эффект:** без изменения runtime; существенно уже и честнее internal API.

### P0. Удалить фиктивную симуляцию `props` из `DocumentBlockManager.updateBlocks`

Status: solved

- **Категория:** `delete`, мёртвая логика.
- **Место:** `packages/document-model/src/core/managers/block-manager/block-manager.ts:313-355`.
- **Подтверждение:** `simulatedProps` строит полный `{...current, ...patch.props}` и сохраняет его для повторяющихся ID, но никакой validator полного `props` в document-model не вызывается. На записи из `validatedProps` читаются только ключи текущего `patch.props`; их значения всегда совпадают с текущим patch. Поэтому materialization текущего CRDT map, merge и Map состояния не влияют на результат. В отличие от этого `simulatedListProps` нужен: он действительно передаёт полный accumulated record в `validateBlockListProps`.
- **Проблема:** комментарий обещает prevalidation accumulated property patches, которой здесь нет (type-specific processor находится уровнем выше в editor-core). Код заставляет думать, что duplicate-ID semantics требуют симуляции, и без необходимости читает весь props map.
- **Решение:** удалить `simulatedProps` и `validatedProps`; до transaction валидировать только supplied prop values, затем применять текущие entries напрямую. Оставить `simulatedListProps`. Обновить JSDoc так, чтобы он различал полную validation listProps и portable validation отдельных native props. Это объединяется с упрощением `patchProps` выше в один приватный helper применения validated prop entries.
- **Эффект:** примерно −12 строк, меньше CRDT materialization и честная документация.

### P2. Слить `useEditorRootContext` с публичным `useEditorRoot`

- **Категория:** `merge`, single-caller wrapper.
- **Место:** `react-rivto-editor/src/editor-root-context.ts` и `hooks/editor/use-editor-root.ts`.
- **Подтверждение:** `useEditorRootContext()` вызывается ровно один раз — `useEditorRoot()` немедленно возвращает его результат. `UseEditorRootResult` структурно дублирует `EditorRootContextValue`. Сам context нужен `EditorView`, но отдельный hook поверх него — нет.
- **Проблема:** один публичный вызов проходит через второй function/type с тем же контрактом; документация одной операции распределена между двумя файлами.
- **Решение:** оставить внутренний `EditorRootContext`, а `useEditorRoot` пусть напрямую делает `useContext` и проверку отсутствия provider; `UseEditorRootResult` сделать alias внутреннего shape либо определить shape единожды. Удалить `useEditorRootContext`.
- **Эффект:** −1 функция и −1 дублирующий interface body.

### P2. Унифицировать имена трёх coordinator-слоёв и исправить `blocksRegistry`

- **Категория:** `rename`, public API clarity.
- **Место:** `DocumentModel`/`DocumentModelImpl`, `RivtoEditorApi`/`EditorRuntime`, `ReactEditor`/`ReactEditorImpl`; свойство `blocksRegistry` в core.
- **Подтверждение:** три соседних слоя используют три разные схемы именования interface/implementation (`Impl`, `Api`, `Runtime`), хотя все создаются как coordinator-объекты. Конкретный `DocumentModelImpl` приходится конструировать напрямую во всех getting-started примерах, тогда как core/React имеют factories. `blocksRegistry` грамматически множественное и расходится с классом `BlockRegistryManager`; поэтому React-код уже вынужден вводить aliases `CoreBlockManager`/`CoreClipboardManager` для различения одноимённых слоёв.
- **Проблема:** новичок не может по имени понять, что является контрактом, concrete runtime и рекомендуемым construction path. `Impl` попадает в пользовательский API, а `blocksRegistry` выглядит как коллекция registries.
- **Решение:** минимальный путь — добавить `createDocumentModel(crdt): DocumentModel`, сделать `DocumentModelImpl` внутренним, сохранить factories как единственный construction API; переименовать `blocksRegistry` в `blockRegistry`. В следующем breaking rename выбрать одну схему для публичных контрактов (`DocumentModel`, `RivtoEditor`, `ReactEditor`) и держать concrete classes внутренними `*Impl`, либо везде использовать `*Api` + `*Runtime`, но не смешивать обе схемы.
- **Эффект:** runtime-код почти не меняется; public API и документация становятся предсказуемыми.

### P1. Переименовать ложный флаг `startsWithText` по его реальной семантике

- **Категория:** `rename`, persisted clipboard contract.
- **Место:** `ResolvedSelection.startsWithText`, `ClipboardBundle.startsWithText` и paste strategies в `rivto-editor-core`.
- **Подтверждение:** значение вычисляется как `!isStructuralSelection(selection)` и не проверяет, с чего selection «начинается». Оно означает происхождение bundle из text/caret selection и используется только как разрешение text-merge при paste. Имя повторяется в E2E fixtures и заставляет искать несуществующую проверку первого блока.
- **Проблема:** name говорит о порядке/первом элементе, а значение классифицирует весь источник. `ResolvedSelection` JSDoc уже вынужден длинно опровергать буквальное прочтение.
- **Решение:** назвать внутреннее поле `fromTextSelection` (либо `isTextSelection`), а clipboard field — `fromTextSelection`; paste option `mergeText` оставить отдельным, потому что это override назначения, а не характеристика источника. Breaking schema changes разрешены правилами репозитория; одновременно обновить v4 fixtures/version при необходимости.
- **Эффект:** объём почти тот же, но условие paste читается без обратного проектирования selection logic.

### P2. Сжать повторяющееся объяснение `createTextSelection` и уточнить имена endpoints

- **Категория:** `shrink`, документация/имена.
- **Место:** `rivto-editor-core/src/managers/selection-manager/selection-ranges.ts`, JSDoc и inline block внутри `createTextSelection`.
- **Подтверждение:** один и тот же пример из трёх строк приведён дважды; inline-комментарий повторяет уже подробный module/function JSDoc. Локальные `start`/`stop` означают не gesture anchor/head, а более раннюю/позднюю позицию в document order, из-за чего рядом нужны дополнительные пояснения.
- **Проблема:** чрезмерная документация скрывает четыре реальные ветки алгоритма; `start` легко спутать с `anchor`, хотя для обратного выделения это разные endpoints.
- **Решение:** оставить один короткий пример и четыре инварианта (same block, first, interior, last); переименовать `start`/`stop` в `earlierEndpoint`/`laterEndpoint`. Удалить повторяющийся многострочный inline-пример, сохранив комментарий о slice-local index.
- **Эффект:** ориентировочно −20 строк текста, алгоритм виден целиком на одном экране.

### P1. Сделать версии snapshot/clipboard единственными именованными константами

- **Категория:** `merge`, magic numbers.
- **Место:** document `version: 6` в types/runtime; clipboard `version: 4` в `clipboard-data.ts`, core copy, React clipboard и edgeless controller; существующий `CLIPBOARD_BUNDLE_VERSION` сейчас лежит только в validation utility.
- **Подтверждение:** clipboard уже имеет правильную константу для проверки, но четыре producer-а всё равно записывают literal `4`, а interface отдельно закрепляет `4`. Document schema аналогично повторяет `6` в двух types и двух runtime местах. Это именно один формат в каждом случае, не настраиваемая конфигурация.
- **Проблема:** повышение версии требует глобального поиска и допускает producer/validator drift; местоположение clipboard-константы в `utils/clipboard.ts` создаёт нежелательный import direction для data contract.
- **Решение:** перенести/определить `CLIPBOARD_BUNDLE_VERSION` рядом с `ClipboardBundle`, задать `version: typeof CLIPBOARD_BUNDLE_VERSION` и использовать константу во всех producers/validator. Аналогично в document-model ввести `DOCUMENT_SNAPSHOT_VERSION` рядом с `Snapshot` и использовать `typeof` и runtime check/output. Не делать registry версий, пока нет миграций.
- **Эффект:** тот же объём или несколько строк меньше, одна точка изменения на формат.

### P1. Удалить вручную поддерживаемый `RIVTO_VERSION` и demo badge

- **Категория:** `delete`, ложный источник истины.
- **Место:** `rivto-editor-core/src/version.ts`, реэкспорт из `src/index.ts`, импорт/надпись в `demo/src/App.tsx`.
- **Подтверждение:** runtime-константа равна `0.4.0`, тогда как `packages/rivto-editor-core/package.json` и два соседних публикуемых пакета имеют версию `0.3.0`. Единственный consumer — декоративный `<span>Rivto v…</span>` в demo; функциональная логика и protocol/schema negotiation константу не используют.
- **Проблема:** ручное дублирование уже разошлось и показывает пользователю неверную package version. Имя легко спутать с независимыми версиями document snapshot и clipboard.
- **Решение:** удалить константу, файл, реэкспорт и demo badge. Если отображение версии станет продуктовым требованием, подставлять package version на build/release этапе, а не редактировать второй literal вручную.
- **Эффект:** −1 public export, −1 файл и устранение version drift.

### P2. Оставить по одному типу frame/point и одному перечню resize handles

- **Категория:** `merge`, повторяющиеся primitives.
- **Место:** `edgeless/visuals/types.ts`, `utils/geometry-core.ts`, `utils/connector-path.ts`, `utils/geometry.ts`, `components/visual-element.tsx`, `edgeless/surface/edgeless-block.tsx`, `edgeless-transform.ts`.
- **Подтверждение:** `VisualFrame` дословно повторяет `EditorElementFrame` (который, в свою очередь, повторяет document `ElementFrame`); `Point` одинаково объявлен в `geometry-core.ts` и в импортирующем его `connector-path.ts`. Восемь resize-направлений трижды перечислены как две одинаковые tuple-константы и один `Set`, а `ResizeCorner` вручную повторяет тот же union.
- **Проблема:** изменение геометрического контракта или набора handles требует синхронных правок в нескольких местах; TypeScript структурно скрывает расхождение до момента использования. Новичку непонятно, отражают ли разные имена разные системы координат. `CanvasPoint` действительно обозначает перевод client→canvas и должен остаться отдельным семантическим типом; остальные дубликаты такого различия не имеют.
- **Решение:** после сведения editor/document contracts сделать `VisualFrame = EditorElementFrame` (или импортировать frame type напрямую); экспортировать `Point` только из одного geometry module и импортировать его в connector path. Объявить одну tuple `RESIZE_CORNERS`, вывести `ResizeCorner = typeof RESIZE_CORNERS[number]`, переиспользовать tuple в обоих renderers, а для membership создать локальный `Set(RESIZE_CORNERS)`. Не обобщать `CanvasPoint` с абсолютным geometry `Point`, пока типы не являются branded: это ухудшило бы читаемость координатных преобразований.
- **Эффект:** −3 дублирующих объявления и −2 массива literals; единый геометрический словарь без новой абстракции.

### P2. Удалить прямую devDependency `resolve` из document-model и editor-core

- **Категория:** `delete`, dependency cleanup.
- **Место:** `packages/document-model/package.json`, `packages/rivto-editor-core/package.json`.
- **Подтверждение:** ни source, ни Jest config/transformer этих пакетов не импортируют `resolve` и не задают custom resolver. Transformer делает только `require("ts-jest")`; сам Jest получает `resolve` транзитивно через `jest-resolve`. React-пакет использует ту же схему запуска/transform, но прямой зависимости `resolve` уже не имеет.
- **Проблема:** исторически продублированная dependency создаёт отдельную ссылку в каждом package importer и выглядит необходимой частью test harness, хотя конфигурация её не использует.
- **Решение:** удалить `resolve` из двух `devDependencies`, обновить lockfile и прогнать package tests. Не удалять одноимённую транзитивную зависимость Jest вручную.
- **Эффект:** −2 direct dependencies в рассматриваемых пакетах; runtime не меняется.

### P2. Удалить неиспользуемый public guard `isReactEditor`

- **Категория:** `delete`, мёртвый API.
- **Место:** `react-rivto-editor/src/utils.ts` и re-export в `src/index.ts`.
- **Подтверждение:** во всём workspace `isReactEditor` вызывается только тестом самого guard. Реальный cross-runtime path использует противоположный `isRivtoEditor` в cross-document clipboard transfer; production consumer для `isReactEditor` отсутствует.
- **Проблема:** пара симметричных функций выглядит обязательной, хотя одна не решает ни одной задачи. Публичный параметр уже ограничен union `ReactEditor | RivtoEditorApi`, поэтому неизвестный внешний объект guard всё равно не проверяет безопасно.
- **Решение:** удалить `isReactEditor`, его re-export и две тривиальные assertions. Оставить `isRivtoEditor` рядом с единственным потребителем (или в narrowly named runtime guard module, если он остаётся public). Если позже потребуется проверять `unknown`, сначала определить полный capability predicate, а не возвращать текущую проверку одного свойства.
- **Эффект:** −1 функция и −1 public export.

### P0. Разделить React-регистрацию block types и core block data вместо 27 forwarding-методов

Status: solved

- **Категория:** `move`/`delete`, неверная ответственность facade.
- **Место:** `react-rivto-editor/src/managers/blocks/block-manager.ts`, `capabilities.ts`, `types.ts`.
- **Подтверждение:** React `BlockManager` содержит полезную React-специфику (атомарная регистрация definition+renderer+view+slash, listProps defaults/validators), а затем вручную повторяет core API: `revision`, четыре read/subscribe, hierarchy reads, import, clear/type/remove/merge/move/indent/outdent и setters. Таких pure pass-through members 27; их сигнатуры и JSDoc ещё раз продублированы в `BlocksCapability`. Соседние core managers (`elements`, `mode`, `commands`, `history`) уже выставлены на `ReactEditor` непосредственно; только blocks заняли имя React-facade.
- **Проблема:** `reactEditor.blocks` одновременно означает registry React block types, policy listProps и data manager. Поэтому изменение core API требует править три места, а новичок не может предсказать, где заканчивается React policy. Обёртки вроде `removeBlocks([...ids])` даже создают копию readonly массива только ради несовпавшей сигнатуры.
- **Решение:** оставить в `reactEditor.blocks` guarded mutations и core delegation. ListProps registrations/defaults/validation/input preparation вынести в `blockListProps`, а atomic definition/renderer/view/slash registration и separator metadata — в `blockTypes`. Отдельный `blockMutations` не вводить.
- **Эффект:** registration state удалён из block manager; mutations остаются в одном `blocks` facade, а `blockTypes` и `blockListProps` имеют отдельных владельцев.

### P1. Так же разделить hybrid facades clipboard и selection

- **Категория:** `move`/`delete`, повторный слой делегирования.
- **Место:** React `managers/clipboard/clipboard-manager.ts`, `managers/selection/selection-manager.ts`, соответствующие capability interfaces и `ReactEditorImpl`.
- **Подтверждение:** React ClipboardManager добавляет только registry `formatter/parser`, но повторяет `pasteStrategies`, `copy`, `copyText`, `cut`, `paste` core manager. ReactSelectionManager добавляет только `readDOM/restoreDOM`, но повторяет девять core selection operations; его `destroy()` документирован как no-op и всё равно вызывается coordinator-ом. Сигнатуры ещё раз вручную перечислены в `ClipboardCapability`/`SelectionCapability`.
- **Проблема:** feature-specific React behavior смешан с полным core manager API, создавая второй контракт и lifecycle там, где состояния нет. Изменение selection/clipboard core API требует обновления класса и capability, а пустой destroy создаёт ложное владение ресурсами.
- **Решение:** выставить core `clipboard` и `selection` как focused managers непосредственно (тот же принцип, что `elements/history`). React-only registry назвать `clipboardFormats` (`registerFormatter`, `registerParser`, `format`, `parse`), DOM adapter — `domSelection` (`read`, `restore`); удалить forwarding methods, их повторные interfaces и no-op `destroy`. Если совместимость имён важнее breaking cleanup, допустим временный deprecated alias на уровне объекта, но не сохранять вручную переписанные методы.
- **Эффект:** ориентировочно −70–100 строк и одна фиктивная lifecycle operation; ясная граница core state ↔ browser integration.

### P0. Прекратить wildcard-реэкспорт нижних пакетов из editor-core и исправить зависимости React

Status: solved

- **Категория:** `move`/package boundary, dependency correctness.
- **Место:** `rivto-editor-core/src/index.ts`, manifests/tsconfig трёх пакетов, imports React `types.ts` и `react-editor.tsx`.
- **Подтверждение:** `@chulane/rivto` делает `export *` всего `@chulane/crdt-doc` и `@chulane/document-model`, хотя core production напрямую использует document-model, но не CRDT implementation. React source напрямую импортирует `DocumentModel` из `@chulane/document-model`, а его `package.json` такой dependency не объявляет; workspace `paths` скрывает ошибку, и generated public declarations сохраняют этот внешний type import.
- **Проблема:** editor-core превращается в неявный umbrella и повторно публикует storage/API, которыми не владеет; collision и accidental public API растут при каждом новом lower-layer export. Одновременно React нарушает правило direct dependency: локальная сборка разрешает импорт через workspace, опубликованный package полагается на транзитивное размещение dependency.
- **Решение:** убрать два wildcard exports из core entry и импортировать lower-layer API из владеющих пакетов. В React добавить прямую dependency `@chulane/document-model` (она входит в его публичную сигнатуру). После этого перенести `@chulane/crdt-doc` в core из runtime dependency в devDependency, если он остаётся нужен только test-utils/tests; peer `yjs` в core также удалить после проверки generated bundle. Если нужен convenience entry, создать отдельный явно названный umbrella package либо вручную реэкспортировать только 2–3 high-level factories, не `export *`.
- **Эффект:** честный dependency graph, меньше accidental API; из editor-core уходит одна runtime dependency и потенциально один лишний peer, React получает одну обязательную direct dependency.

### P0. Направить published types document-model на собранный declaration file

Status: solved

- **Категория:** `move`, package metadata.
- **Место:** два поля `types` в `packages/document-model/package.json`.
- **Подтверждение:** `files` публикует только `dist/esm`, build уже создаёт `dist/esm/index.d.ts`, однако top-level и `exports["."].types` указывают на `./src/index.ts`. Каталог `src` в tarball не включён. Соседние editor-core и React корректно указывают на `./dist/esm/index.d.ts`.
- **Проблема:** TypeScript consumer опубликованного package получает путь к отсутствующему файлу; workspace это маскирует, потому что source существует локально. Кроме поломки declarations, текущая запись случайно обещает consumers исходную layout-структуру.
- **Решение:** заменить оба пути на `./dist/esm/index.d.ts`; добавить дешёвую publish/smoke проверку `pnpm pack --dry-run` или чтение tarball, которая убеждается, что все `exports` targets входят в package. Аналогичный дефект есть в соседнем `crdt-doc`, но он вне заданных трёх каталогов; исправить его отдельным follow-up, иначе direct imports после разделения package boundaries останутся сломаны.
- **Эффект:** без runtime-кода; published type entry начинает соответствовать уже существующему build artifact.

### P1. Упростить generic named `Listeners` до одного listener set

- **Категория:** `shrink`/YAGNI, более общий код без реального reuse.
- **Место:** `rivto-editor-core/src/utils/listeners/listeners.ts` и пять owners (`RivtoEditor`, mode, command registry, block registry, selection).
- **Подтверждение:** каждый из пяти instances создаётся с event map ровно из одного ключа и payload `void`. Ни один owner не использует второй event или value payload. Ради несуществующего use case класс хранит `Map<keyof Events, Set<StoredListener>>`, conditional tuple types, два unsafe casts и принимает строковое имя на каждом subscribe/emit.
- **Проблема:** generic API сложнее реальной задачи; event-name literals дублируются в одном owner и могут расходиться, а casts скрывают type safety, ради которой abstraction создана. Разработчик должен разобрать conditional types, чтобы понять обычный `Set<() => void>`.
- **Решение:** заменить на локальный `ListenerSet`/`Signal` с `subscribe(listener)`, `emit()` и `clear()` либо вообще на `Set` там, где owner имеет несколько строк. Не объединять с React `RevisionStore`: у него дополнительно есть revision counter и другая package ownership. Вернуть named emitter только при появлении реального owner с двумя событиями или payload.
- **Эффект:** ориентировочно −35–50 строк, исчезают casts и пять фиктивных event names.

### P1. Слить `EdgelessVisualsExtension` с единственным controller и вынести pure clipboard/codec logic

- **Категория:** `merge`/`move`, single-owner wrapper и слишком широкий модуль.
- **Место:** `extensions/edgeless/visuals/index.ts` и 908-строчный `controller.ts`.
- **Подтверждение:** extension создаёт ровно один `EdgelessVisualController`, хранит optional-ссылку и 17 public methods дословно пересылает в `this.api`; controller больше нигде не создаётся. При этом сам controller одновременно materialize/валидирует persisted props, хранит toolbar defaults, регистрирует команды/shortcut/clipboard DOM events, меняет geometry/z-order, управляет groups/connectors и сериализует clipboard.
- **Проблема:** два stateful объекта представляют одну установленную возможность, но public API описан в одном, а реализация/lifecycle — в другом. После перехода через лишнюю оболочку разработчик попадает в файл, для понимания которого нужно держать в голове шесть независимых обязанностей; короткий class JSDoc этого не объясняет.
- **Решение:** сделать один installable `EdgelessVisualsExtension`, который является объектом API и после `setup` хранит runtime state; удалить однотипные forwarding methods/controller class boundary. Из большого файла вынести только чистые части, не новые managers: `visual-codec.ts` (element↔visual defaults/validation), `visual-clipboard.ts` (bundle remap/text/HTML и registration helper), при необходимости `visual-groups.ts` для pure traversal/normalization. Geometry уже остаётся в `utils/geometry*`. UI components получают тот же единственный extension/controller object. Не дробить каждый метод в отдельный service.
- **Эффект:** −50–80 строк wrapper/lifecycle, один state owner; clipboard/schema/group algorithms можно читать и тестировать независимо от toolbar state.

### P1. Удалить мёртвый `flattenBlocks` и однострочный `cloneBlock` из clipboard utils

- **Категория:** `delete`/`merge`, unused export и single-caller wrapper.
- **Место:** `rivto-editor-core/src/managers/clipboard-manager/utils/clipboard.ts`.
- **Подтверждение:** экспортируемый recursive `flattenBlocks` не вызывается нигде, кроме самого себя. SelectionManager содержит собственный приватный эквивалент и реально использует его в двух методах. `cloneBlock` — отдельная функция из одного `return structuredClone(block)`, вызываемая только nested `cloneSelection`; её JSDoc длиннее реализации.
- **Проблема:** export создаёт впечатление общего clipboard API, хотя production path его не использует; два одинаковых traversal algorithms могут расходиться. Однострочная оболочка скрывает стандартную операцию без добавления инварианта.
- **Решение:** удалить clipboard `flattenBlocks`; оставить private traversal в SelectionManager, пока второго реального consumer нет. В `cloneSelection` вызвать `structuredClone(block)` напрямую и сохранить короткий комментарий о независимости props/children вместо отдельной функции. Если traversal понадобится второй подсистеме, тогда переместить один вариант в предметный `block-tree.ts`, но не держать dead utility заранее.
- **Эффект:** −2 функции и ориентировочно −20 строк документации/кода.

### P1. Исправить stale nesting-тест, который требует React containment от core move

- **Категория:** `delete`/move test responsibility, ложный cross-layer contract.
- **Место:** `react-rivto-editor/src/views/nesting.test.ts:146`.
- **Подтверждение:** suite ожидает, что прямой `editor.blocks.moveBlocks([cell.id], table, "inside")` бросит исключение из-за `outlineFloor`. Но `outlineFloor` читается только React operations (`outline-ops`, drag placement, views); core намеренно считает definition metadata opaque и его `moveGroupedBlocks` проверяет document invariants (общий parent, отсутствие циклов), а не presentation containment. Header самого теста говорит: «React definition metadata owns containment». Текущий прогон даёт единственный assertion failure `Received function did not throw`.
- **Проблема:** тест закрепляет противоположную package ownership семантику и подталкивает перенести container-specific React policy в framework-neutral core. Это также сбивает диагностику: корректная generic core операция выглядит регрессией.
- **Решение:** удалить ожидание exception для прямого core call. Проверку floor сделать через публичную React outline/drop operation и утверждать no-op/отклонённое placement; отдельно оставить core-тесты на cycle/shared-parent invariants. Если product действительно требует hard persisted containment, тогда metadata должна переехать в document-model schema и валидироваться всеми mutation paths — это другое, существенно большее решение, не локальная правка теста.
- **Эффект:** тест соответствует заявленной границе слоёв; не добавляется React-зависимость в core.

## Покрытие анализа и проверки

- Просмотрены все три package entry points, manifests, manager/coordinator APIs, public barrels, clipboard/selection/element/block paths, React extensions и крупнейшие production-модули. Объём области — 306 production TypeScript-модулей (около 41 тыс. строк вместе с тестами).
- Построен AST import/export graph от реальных package entries. Он подтвердил пять недостижимых production-файлов: `NumberControl` и четыре лишних barrel `index.ts`; остальные low-reference candidates проверялись поиском definitions/imports/callers, а не удалялись только из-за малого числа текстовых совпадений.
- Дополнительно запущен TypeScript с `noUnusedLocals/noUnusedParameters`: он подтвердил фиктивные `id/type` у `patchProps` и stale import `hasCrossedBlock`. Обычный ESLint трёх source trees проходит и потому не контролирует обязательный module JSDoc.
- `pnpm check-types`: document-model и editor-core проходят; React падает только на отсутствующем export `hasCrossedBlock` (`TS2305`).
- Полные Jest suites: document-model — 5/5 suites, 36/36 tests; editor-core — 12/12 suites, 111/111 tests. React — 43 suites и 224 tests проходят, две проблемы остаются: suite `text-selection.test.ts` не загружается из-за `hasCrossedBlock`, а один assertion `views/nesting.test.ts:146` требует exception от core containment.
- Реализация не изменялась. В workspace добавлен только этот отчёт; найденные пользовательские/внешние каталоги не затрагивались.

## Сводка

Найдено 34 пункта: 8 уровня P0, 16 уровня P1 и 10 уровня P2. Наибольший выигрыш дают удаление двойного строкового command API, разделение трёх hybrid React facades и устранение повторной element/snapshot-модели. Без учёта новых JSDoc консервативный потенциал составляет примерно **−700…−1000 строк** production/test/documentation code, **−2 подтверждённые прямые devDependencies** (`resolve`) и, после разделения package boundaries, потенциально ещё **−1 runtime dependency и −1 peer dependency** у editor-core.

`net: −700…−1000 строк; −2 direct dependencies подтверждены, ещё −1 runtime/−1 peer требуют проверки package build.`
