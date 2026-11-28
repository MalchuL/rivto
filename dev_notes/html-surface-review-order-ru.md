# HTML-виджеты Rivto — порядок ревью относительно main

Ветка `cursor/html-widgets-f762` на `d0a76058` сравнивается с общим предком локальной `main` на `dce1fde8`. Маршрут охватывает 93 изменённых файла реализации, демо, поставки и документации. Включены локальные правки, уточняющие сигнатуры парсеров и валидаторов. Тестовые файлы и места вызова из тестов исключены из таблиц. Для сравнения отслеживаемых файлов используйте `git diff --name-status dce1fde8`.

**Как читать.** Пройдите десять разделов по порядку. Ссылки указывают на рабочее дерево с локальными правками. Ссылка на имя открывает декларацию, а правый столбец ведёт к местам обращения, передачи обработчика или публичного реэкспорта. При пяти и более местах показаны несколько ориентиров. Внутри больших существующих классов перечислены изменённые методы. Для безымянных функций раскрывающийся список под таблицей ведёт прямо к месту их передачи или создания.

## Маршрут

1. [Публичный API и установка](#step-1)
2. [Данные виджета и запись свойств](#step-2)
3. [От исходника до первого снимка](#step-3)
4. [Блок Page и элемент Edgeless](#step-4)
5. [Редактирование и сохранение](#step-5)
6. [Доступ Unsafe HTML](#step-6)
7. [Зоны захвата, выделение и перемещение](#step-7)
8. [Стили и поставка](#step-8)
9. [Демонстрационные виджеты](#step-9)
10. [Правила разработки и история ревью](#step-10)

**Для сквозной проверки** удобно взять два действия. При сохранении формы пройдите от [Done](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L267) к [вычислению изменений](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L51) и далее к [записи блока](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L301) или [записи элемента](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L279). Для выделения между блоками начните с [выхода указателя из iframe](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L70), пройдите через [перевод координат](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L103) и закончите в [Page-контроллере диапазона](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L343).

<a id="step-1"></a>

## 1. Публичный API и установка

Сначала посмотрите, как хост включает расширение и какие типы появляются в документе. У Page-блока исходник лежит в `content`, у элемента холста — в `props.html`. Фабрика проверяет лимиты один раз. Её `setup` создаёт состояние редактирования для этой установки, регистрирует типы и возвращает общую очистку. Изменений схемы в document-model эта ветка не вносит.

### [packages/react-rivto-editor/docs/html-surface.md](../packages/react-rivto-editor/docs/html-surface.md#L1)

- [Строка 1](../packages/react-rivto-editor/docs/html-surface.md#L1) — Контракт со стороны автора виджета и приложения. Здесь удобно начать с формата данных, времени жизни подписок и опций.

### [packages/react-rivto-editor/src/extensions/html-surface/index.ts](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L2)

- [Строка 2](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L2) — Перечень публичных экспортов расширения, включая фабрику, идентификаторы, лимиты и типы снимков.

### [packages/react-rivto-editor/src/extensions/html-surface/constants.ts](../packages/react-rivto-editor/src/extensions/html-surface/constants.ts#L2)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`HTML_BLOCK_TYPE` · 2](../packages/react-rivto-editor/src/extensions/html-surface/constants.ts#L2) | Тип обычного HTML-блока, исходник хранится в content. | [extension.tsx:99](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L99), [extension.tsx:109](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L109) и др. |
| [`UNSAFE_HTML_BLOCK_TYPE` · 5](../packages/react-rivto-editor/src/extensions/html-surface/constants.ts#L5) | Тип блока с возможностью выдать доступ к редактору. | [extension.tsx:100](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L100), [extension.tsx:108](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L108) и др. |
| [`HTML_ELEMENT_TYPE` · 8](../packages/react-rivto-editor/src/extensions/html-surface/constants.ts#L8) | Тип HTML-элемента холста, исходник хранится в props.html. | [extension.tsx:245](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L245), [extension.tsx:258](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L258) и др. |
| [`HTML_IFRAME_MESSAGE_NAMESPACE` · 18](../packages/react-rivto-editor/src/extensions/html-surface/constants.ts#L18) | Метка протокола, которую обе стороны проверяют при разборе сообщения. Передаётся в поле `namespace` вместе с токеном документа iframe. | [compose-src-doc.ts:114](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L114), [frame-messages.ts:87](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L87), [frame-messages.ts:120](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L120) |

### [packages/react-rivto-editor/src/extensions/html-surface/options.ts](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L10)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlSurfaceOptions` · 10](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L10) | Настройки хоста включают предел высоты Page-блока, число областей указателя, задержку предпросмотра и необязательную фабрику разрешений Unsafe HTML. Фабрика создаётся для активного документа при установке. | [options.ts:42](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L42), [options.ts:65](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L65), [extension.tsx:71](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L71), [index.ts:7](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L7) |
| тип [`HtmlSurfaceLimits` · 42](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L42) | Проверенные числовые параметры фрейма и предпросмотра. Фабрика разрешений отделена от лимитов и передаётся только там, где используется. | [options.ts:47](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L47), [options.ts:51](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L51) и др. |
| интерфейс [`HtmlSurfaceLimitsProps` · 45](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L45) | Передаёт лимиты представлению через регистрацию расширения. | [html-block.tsx:53](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L53), [html-element.tsx:96](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L96), [unsafe-html-block.tsx:46](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L46) |
| [`DEFAULT_HTML_SURFACE_LIMITS` · 51](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L51) | Хранит значения по умолчанию: 400 мс ожидания перед предпросмотром, 720 CSS-пикселей высоты Page-блока и 64 области указателя. | [options.ts:66](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L66), [options.ts:68](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L68), [index.ts:5](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L5) |
| [`resolveHtmlSurfaceLimits` · 65](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L65) | Подставляет значения по умолчанию и проверяет допустимые диапазоны. Задержка предпросмотра — целое число от нуля до предела браузерного таймера 2 147 483 647 мс. | [extension.tsx:72](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L72) |

### [packages/react-rivto-editor/src/extensions/html-surface/extension.tsx](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L27)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| тип [`HtmlSurfaceRegistries` · 27](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L27) | Реестры, которые расширение заимствует при установке. | [extension.tsx:131](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L131), [extension.tsx:164](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L164), [extension.tsx:199](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L199), [extension.tsx:241](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L241) |
| интерфейс [`HtmlSurfaceInstallation` · 33](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L33) | Общие лимиты и хранилище одной установки. | [extension.tsx:82](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L82), [extension.tsx:131](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L131), [extension.tsx:165](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L165), [extension.tsx:241](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L241) |
| [`DEFAULT_ELEMENT_FRAME` · 41](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L41) | Начальный размер HTML-элемента в координатах холста. | [extension.tsx:258](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L258) |
| [`formatHtmlClipboard` · 50](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L50) | Копирует исходник блока во все поддержанные текстовые форматы буфера. | [extension.tsx:140](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L140), [extension.tsx:181](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L181) |
| [`htmlSurfaceExtension` · 71](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L71) | Проверяет опции и возвращает расширение с обработчиком установки. | [index.ts:2](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L2), [custom-blocks.tsx:256](../demo/src/blocks/custom-blocks.tsx#L256) |
| метод [`setup` · 81](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L81) | Создаёт хранилище редактирования и провайдер разрешений для одной установки. Регистрирует оба блока, преобразования и элемент. При сбое установки и при демонтаже снимает полученные регистрации в обратном порядке. | [extension-manager.ts:186](../packages/react-rivto-editor/src/managers/extensions/extension-manager.ts#L186) |
| [`registerHtmlBlock` · 131](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L131) | Устанавливает обычный блок, slash-команду и правый слот. | [extension.tsx:94](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L94) |
| [`render` · 134](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L134) | Передаёт блоку параметры установки. | [block-type-manager.ts:58](../packages/react-rivto-editor/src/managers/blocks/block-type-manager.ts#L58) |
| [`component` · 144](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L144) | Передаёт слоту хранилище редактирования. | [page-surface-registrations.tsx:223](../packages/react-rivto-editor/src/surfaces/page/page-surface-registrations.tsx#L223) |
| [`when` · 147](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L147) | Ограничивает слот обычными HTML-блоками. | [page-surface-registrations.tsx:237](../packages/react-rivto-editor/src/surfaces/page/page-surface-registrations.tsx#L237) |
| [`registerUnsafeHtmlBlock` · 163](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L163) | Регистрирует Unsafe HTML и передаёт его рендереру операции чтения, записи и подписки провайдера. Освобождение провайдера остаётся у установки. | [extension.tsx:95](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L95) |
| [`render` · 173](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L173) | Передаёт Unsafe HTML разрешённые лимиты. | [block-type-manager.ts:58](../packages/react-rivto-editor/src/managers/blocks/block-type-manager.ts#L58) |
| [`registerConversion` · 198](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L198) | Добавляет в контекстное меню преобразование типа блока. | [extension.tsx:97](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L97), [extension.tsx:106](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L106) |
| [`isAvailable` · 216](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L216) | Проверяет тип каждого выбранного блока. | [targets.ts:84](../packages/react-rivto-editor/src/managers/block-context-menu/targets.ts#L84), [panel-block-context-menu-manager.ts:76](../packages/react-rivto-editor/src/panels/managers/block-context-menu/panel-block-context-menu-manager.ts#L76), [menu.tsx:64](../packages/react-rivto-editor/src/components/block-handle/menu.tsx#L64) |
| [`execute` · 225](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L225) | Меняет тип всех выбранных блоков одним пакетным действием. | [targets.ts:84](../packages/react-rivto-editor/src/managers/block-context-menu/targets.ts#L84), [targets.ts:87](../packages/react-rivto-editor/src/managers/block-context-menu/targets.ts#L87), [registry.ts:53](../packages/react-rivto-editor/src/managers/block-context-menu/registry.ts#L53) |
| [`registerHtmlElement` · 241](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L241) | Регистрирует элемент, инструмент размещения и правый слот. | [extension.tsx:114](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L114) |
| [`render` · 249](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L249) | Передаёт HTML-элементу параметры установки. | [element-creation-preview.tsx:51](../packages/react-rivto-editor/src/elements/visuals/element-creation-preview.tsx#L51), [visual-element.tsx:38](../packages/react-rivto-editor/src/elements/visuals/visual-element.tsx#L38) |
| [`create` · 258](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L258) | Создаёт описание элемента с новой копией исходной рамки. | [element-type-manager.ts:70](../packages/react-rivto-editor/src/managers/elements/element-type-manager.ts#L70) |
| [`component` · 263](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L263) | Показывает кнопку редактирования элемента. | [owner-slots.tsx:46](../packages/react-rivto-editor/src/blocks/owner-slots/owner-slots.tsx#L46) |
| [`when` · 266](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L266) | Ограничивает слот элементами HTML. | [surface-manager.ts:394](../packages/react-rivto-editor/src/managers/surfaces/surface-manager.ts#L394) |

<details>
<summary>Встроенные функции и обработчики (5)</summary>

- [Строка 88](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L88) — Снимает регистрации и освобождает провайдер при очистке, в том числе после сбоя установки.
- [Строка 149](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L149) — Снимает правый слот и тип блока.
- [Строка 217](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L217) — Проверяет тип одной цели меню.
- [Строка 226](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L226) — Меняет типы выбранных блоков.
- [Строка 268](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L268) — Снимает слот и тип элемента.

</details>

### [demo/src/blocks/custom-blocks.tsx](../demo/src/blocks/custom-blocks.tsx#L212)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`customBlockExtensions` · 212](../demo/src/blocks/custom-blocks.tsx#L212) | Набор расширений деморедактора. Здесь HTML становится доступен в настоящей панели. | [App.tsx:448](../demo/src/App.tsx#L448), [App.tsx:989](../demo/src/App.tsx#L989), [App.tsx:1714](../demo/src/App.tsx#L1714) |

### [packages/react-rivto-editor/src/extensions.ts](../packages/react-rivto-editor/src/extensions.ts#L88)

- [Строка 88](../packages/react-rivto-editor/src/extensions.ts#L88) — Реэкспорт через точку входа расширений React-пакета.

### [packages/react-rivto-editor/src/index.ts](../packages/react-rivto-editor/src/index.ts#L327)

- [Строка 327](../packages/react-rivto-editor/src/index.ts#L327) — Тот же публичный API через корневую точку входа пакета.

<a id="step-2"></a>

## 2. Данные виджета и запись свойств

Прочитайте рядом снимок, команду и черновик. Снимок описывает то, что видит скрипт. Команда запрашивает запись из работающего iframe. Черновик описывает правки человека между открытием формы и Done. Сравнение идёт по ключам верхнего уровня, поэтому изменение одного ключа не перезаписывает соседний.

### [packages/react-rivto-editor/src/extensions/html-surface/types.ts](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L19)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlWidgetContext` · 19](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L19) | Описывает поверхность, полное выделение узла и режим предпросмотра. | [types.ts:79](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L79), [types.ts:99](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L99) и др. |
| интерфейс [`HtmlEditorPointerRegion` · 36](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L36) | Прямоугольник в долях ширины и высоты iframe. В этой области указатель получает редактор. На холсте область служит для выбора и перемещения элемента, в Page — как точка старта выделения блоков. | [html-editor-pointer-targets.tsx:13](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-editor-pointer-targets.tsx#L13), [frame-messages.ts:41](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L41) и др. |
| тип [`HtmlFrameFit` · 58](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L58) | Выбирает источник размеров iframe. В Page режим `auto` использует высоту содержимого до `maxBlockHeight`, после чего содержимое может прокручиваться внутри. На холсте `fill` заполняет рамку элемента по обеим осям. | [compose-src-doc.ts:26](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L26), [use-html-frame.ts:35](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L35) |
| интерфейс [`HtmlBlockView` · 61](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L61) | Снимок блока, доступный скрипту, включая свойства списка. | [types.ts:103](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L103), [types.ts:106](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L106), [html-block.tsx:237](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L237), [index.ts:9](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L9) |
| интерфейс [`HtmlElementView` · 83](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L83) | Снимок элемента с геометрией и порядком наложения. | [types.ts:103](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L103), [types.ts:106](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L106), [html-element.tsx:219](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L219), [index.ts:9](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L9) |
| тип [`HtmlNodeView` · 103](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L103) | Объединяет снимки блока и элемента, различимые по kind. | [frame-messages.ts:73](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L73), [index.ts:9](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L9) |
| тип [`HtmlNodeData` · 106](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L106) | Данные снимка до добавления контекста текущего отображения. | [use-html-frame.ts:28](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L28) |
| тип [`HtmlWidgetCommand` · 117](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L117) | Подмножество входящих сообщений iframe, которое направляется обработчику самого блока или элемента. Команды изменяют свойства или исходник связанного узла. Уведомление `pointerdown` используется для выделения элемента на холсте. | [frame-messages.ts:36](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L36), [frame-messages.ts:150](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L150) и др. |
| интерфейс [`HtmlDraft` · 134](../packages/react-rivto-editor/src/extensions/html-surface/types.ts#L134) | Правки сеанса после Done. Сравнение `openingSource` и `source` показывает, менялся ли HTML, а `propsPatch` содержит только изменения верхнего уровня. Удаление передаётся как `undefined`. Правка одного свойства оставляет актуальные значения HTML и других свойств в документе. | [html-source-editor.tsx:42](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L42), [html-source-editor.tsx:257](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L257) и др. |

### [packages/react-rivto-editor/src/extensions/html-surface/element/html-element-props.ts](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element-props.ts#L26)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`validateHtmlElementProps`](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element-props.ts#L24) | Проверяет строковый html и переносимость остальных свойств элемента. | [extension.tsx](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L247) |
| [`HtmlElementProps` · 10](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element-props.ts#L10) | Форма свойств HTML-элемента со строкой `html`. Остальные ключи содержат переносимые значения или `undefined` для удаления. | [`validateHtmlElementProps` · 24](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element-props.ts#L24) |

Общие правила переносимых значений (`isPortableValue`, `isPortableRecord`, `isDangerousKey`) теперь в [`packages/rivto-utils/src/portable/portable.ts`](../packages/rivto-utils/src/portable/portable.ts#L103); их используют `frame-messages.ts`, `widget-props.ts` и `document-model`.

### [packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L15)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`formatWidgetProps` · 15](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L15) | Форматирует свойства для формы, исключая поля, принадлежащие хосту. | [html-source-editor.tsx:261](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L261) |
| [`parseWidgetProps` · 30](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L30) | Разбирает текст JSON и требует объект. Пустое поле трактует как пустой объект. | [html-source-editor.tsx:269](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L269), [html-source-editor.tsx:270](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L270) |
| [`changedPropPatch` · 51](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L51) | Вычисляет изменения верхнего уровня относительно открытия формы, помечая удалённые ключи. | [html-source-editor.tsx:270](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L270) |
| [`sameJsonValue` · 77](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L77) | Структурно сравнивает вложенные значения, чтобы избежать лишних записей. | [widget-props.ts:59](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L59), [widget-props.ts:96](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L96) |

<details>
<summary>Встроенные функции и обработчики (2)</summary>

- [Строка 19](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L19) — Удаляет из представления поля хоста.
- [Строка 96](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L96) — Сравнивает ключ и вложенное значение.

</details>

### Общие проверки значений для iframe и модели

Старый `html-surface/model/json-value.ts` удалён в `97baf334`. Проверки хранятся в `@chulane/rivto-utils`, а решения о том, что делать с неверным значением, остаются у потребителя. Парсер iframe отбрасывает неверное сообщение, форма показывает ошибку, модель отклоняет неверные данные при записи или загрузке.

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [PortableValue](../packages/rivto-utils/src/portable/portable.ts#L22) | Описывает значения, которые могут пройти через хранилище, буфер обмена и снимки. Вложенные массивы и простые объекты проверяются по тем же правилам, что и значения верхнего уровня. | [portable.ts:60](../packages/rivto-utils/src/portable/portable.ts#L60), [portable.ts:83](../packages/rivto-utils/src/portable/portable.ts#L83), [portable.ts:106](../packages/rivto-utils/src/portable/portable.ts#L106), [portable.ts:162](../packages/rivto-utils/src/portable/portable.ts#L162) |
| [isPlainRecord](../packages/rivto-utils/src/portable/portable.ts#L34) и [isDangerousKey](../packages/rivto-utils/src/portable/portable.ts#L48) | Общие проверки формы объекта и имени ключа. Простой объект может происходить из другой среды JavaScript, например iframe. Ключи `__proto__`, `constructor` и `prototype` исключаются и при проверке, и при клонировании. | [portable.ts:128](../packages/rivto-utils/src/portable/portable.ts#L128), [portable.ts:132](../packages/rivto-utils/src/portable/portable.ts#L132), [html-element-props.ts:31](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element-props.ts#L31), [clone.ts:30](../packages/document-model/src/core/utils/clone.ts#L30) |
| [assertPortableValue](../packages/rivto-utils/src/portable/portable.ts#L98) и [assertPortableRecord](../packages/rivto-utils/src/portable/portable.ts#L151) | Проверяют данные рекурсивно и сообщают путь до неверного значения. `assertPortableRecord` дополнительно требует объект верхнего уровня. Проверка значения отбрасывает циклы, неконечные числа и неподдерживаемые вложенные значения. | [document-model.ts:202](../packages/document-model/src/core/document-model.ts#L202), [block-manager.ts:514](../packages/document-model/src/core/managers/block-manager/block-manager.ts#L514), [utils.ts:55](../packages/document-model/src/core/managers/element-manager/utils.ts#L55), [plugin-data-manager.ts:138](../packages/document-model/src/core/managers/plugin-data-manager/plugin-data-manager.ts#L138) |
| [isPortableValue](../packages/rivto-utils/src/portable/portable.ts#L58) и [isPortableRecord](../packages/rivto-utils/src/portable/portable.ts#L79) | Дают результат в виде булева значения. Первый подходит для значения одного свойства, второй — для набора свойств. Оба используют ту же рекурсивную проверку, что и модель. | [frame-messages.ts:159](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L159), [frame-messages.ts:163](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L163), [widget-props.ts:32](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L32), [html-element-props.ts:31](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element-props.ts#L31) |
| [parseWidgetCommand](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L148) и [isWidgetPropKey](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L255) | Для `set-prop` проверяют непустое имя и переносимость значения. Для `set-props` и `set-list-props` проверяют весь объект одним общим правилом. | [frame-messages.ts:138](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L138), [frame-messages.ts:158](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L158) |
| [parseWidgetProps](../packages/react-rivto-editor/src/extensions/html-surface/model/widget-props.ts#L30) | После разбора JSON требует объект, который можно сохранить по общим правилам модели. Форма использует эту проверку при сохранении и при подготовке предпросмотра. | [html-source-editor.tsx:266](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L266), [html-source-editor.tsx:267](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L267), [use-draft-preview.tsx:33](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L33) |
| [validateHtmlElementProps](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element-props.ts#L24) | Проверка схемы элемента холста требует строковой `html` и переносимых значений остальных полей. `undefined` допустим в патче как указание удалить свойство. | [extension.tsx:247](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L247) |
| [requireNonemptyId](../packages/document-model/src/core/utils/ids.ts#L17) | Проверка ID осталась в `document-model`, поскольку она относится к идентичности узла. Отклоняет пустые и состоящие из пробелов строки. Возвращает принятый ID без нормализации. | [block-manager.ts:96](../packages/document-model/src/core/managers/block-manager/block-manager.ts#L96), [utils.ts:71](../packages/document-model/src/core/managers/block-manager/utils.ts#L71), [utils.ts:83](../packages/document-model/src/core/managers/element-manager/utils.ts#L83) |

Экспорты общих проверок теперь идут через [index.ts:2](../packages/rivto-utils/src/index.ts#L2) и [index.ts:1](../packages/rivto-utils/src/portable/index.ts#L1). Точка входа [document-model](../packages/document-model/src/core/index.ts#L11) и [его внутренние экспорты](../packages/document-model/src/core/utils/index.ts#L1) больше не реэкспортируют общую проверку. Идентичность узлов остаётся внутри модели. В изменениях поставки затронуты [package.json:10](../packages/rivto-utils/package.json#L10) и [pnpm-lock.yaml:686](../pnpm-lock.yaml#L686). Для правил разработки см. [AGENTS.md:80](../AGENTS.md#L80) и [SKILL.md:1](../.agents/skills/rivto-refactoring/SKILL.md#L1).

<a id="step-3"></a>

## 3. От исходника до первого снимка

Проследите рукопожатие в обе стороны. Редактор собирает srcdoc, скрипт внутри iframe создаёт MessageChannel и передаёт порт с ready. Хост сверяет окно и токен, отправляет первый снимок через принятый порт и закрывает прежнее соединение при замене документа. Затем отдельно проследите обновление контекста выделения без публикации новых данных узла.

### [packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L20)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`SrcDocOptions` · 20](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L20) | Входы сборки одного документа виджета. | [compose-src-doc.ts:63](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L63), [compose-src-doc.ts:111](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L111) |
| [`DOCUMENT_PREFIX_PIECE` · 43](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L43) | Распознаёт допустимые начальные фрагменты перед вставкой скрипта. | [compose-src-doc.ts:85](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L85) |
| [`composeSrcDoc` · 63](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L63) | Вставляет служебный скрипт перед авторским кодом с сохранением начала документа. | [use-html-frame.ts:156](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L156) |
| [`findBridgeInsertionPoint` · 82](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L82) | Находит позицию вставки с учётом открывающей разметки. | [compose-src-doc.ts:71](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L71) |
| [`bridgeScript` · 111](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L111) | Собирает зависимые части скрипта в порядке их выполнения. | [compose-src-doc.ts:69](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L69) |

### [packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L34)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`bridgeCoreScript` · 34](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L34) | Собирает код создания MessageChannel и API window.rivto. | [compose-src-doc.ts:115](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L115) |
| [`connection` · 36](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L36) | Пара портов для связи одного документа с хостом. | [bridge-runtime.ts:37](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L37), [bridge-runtime.ts:149](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L149) |
| [`port` · 37](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L37) | Конец канала, который остаётся в документе виджета. | [bridge-runtime.ts:53](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L53), [bridge-runtime.ts:124](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L124) и др. |
| [`currentNode` · 39](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L39) | Последний снимок, включая контекст отображения. | [bridge-runtime.ts:103](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L103), [bridge-runtime.ts:104](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L104) и др. |
| [`readyWaiters` · 41](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L41) | Ожидающие первого снимка вызовы ready. | [bridge-runtime.ts:105](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L105), [bridge-runtime.ts:138](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L138) |
| [`nodeListeners` · 43](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L43) | Подписчики изменений данных узла. | [bridge-runtime.ts:106](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L106), [bridge-runtime.ts:140](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L140) |
| [`contextListeners` · 45](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L45) | Подписчики изменений его представления. | [bridge-runtime.ts:107](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L107), [bridge-runtime.ts:121](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L121), [bridge-runtime.ts:141](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L141) |
| [`send` · 52](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L52) | Добавляет метки документа и посылает сообщение в порт. | [bridge-runtime.ts:142](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L142), [bridge-runtime.ts:143](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L143) и др. |
| [`sameContext` · 63](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L63) | Сравнивает видимые виджету поля контекста. | [bridge-runtime.ts:107](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L107), [bridge-runtime.ts:119](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L119) |
| [`notify` · 75](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L75) | Вызывает подписчиков со свежим значением. | [bridge-runtime.ts:106](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L106), [bridge-runtime.ts:107](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L107), [bridge-runtime.ts:121](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L121) |
| [`subscribeTo` · 86](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L86) | Добавляет подписчика и возвращает действие отписки. | [bridge-runtime.ts:140](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L140), [bridge-runtime.ts:141](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L141) |
| [`publishNode` · 102](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L102) | Сохраняет снимок, разрешает ожидающие ready и уведомляет подписчиков. | [bridge-runtime.ts:127](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L127) |
| [`publishContext` · 118](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L118) | Обновляет только контекст и соответствующих подписчиков. | [bridge-runtime.ts:128](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L128) |
| геттер [`node` · 133](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L133) | Геттер последнего снимка узла. | API скрипта. [Описание](../packages/react-rivto-editor/docs/html-surface.md#L36) |
| геттер [`props` · 134](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L134) | Геттер свойств последнего снимка. | API скрипта. [Описание](../packages/react-rivto-editor/docs/html-surface.md#L38) |
| геттер [`context` · 135](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L135) | Геттер текущего контекста отображения. | API скрипта. [Описание](../packages/react-rivto-editor/docs/html-surface.md#L38) |
| [`ready` · 136](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L136) | Возвращает промис первого доступного снимка. | [animated-samples.ts:26](../demo/src/extensions/html-surface/animated-samples.ts#L26), [animated-samples.ts:77](../demo/src/extensions/html-surface/animated-samples.ts#L77) и др. |
| [`subscribe` · 140](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L140) | Подписывает на последующие изменения данных. | [animated-samples.ts:52](../demo/src/extensions/html-surface/animated-samples.ts#L52), [animated-samples.ts:85](../demo/src/extensions/html-surface/animated-samples.ts#L85) и др. |
| [`subscribeContext` · 141](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L141) | Подписывает на изменения режима или выделения. | API скрипта. [Описание](../packages/react-rivto-editor/docs/html-surface.md#L46) |
| [`setProp` · 142](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L142) | Отправляет запись одного свойства. | [animated-samples.ts:50](../demo/src/extensions/html-surface/animated-samples.ts#L50), [animated-samples.ts:84](../demo/src/extensions/html-surface/animated-samples.ts#L84) и др. |
| [`setProps` · 143](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L143) | Отправляет частичное обновление свойств. | API скрипта. [Описание](../packages/react-rivto-editor/docs/html-surface.md#L49) |
| [`setListProps` · 144](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L144) | Запрашивает изменение свойств списка блока. | API скрипта. [Описание](../packages/react-rivto-editor/docs/html-surface.md#L51) |
| [`setContent` · 145](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L145) | Запрашивает замену исходника виджета. | API скрипта. [Описание](../packages/react-rivto-editor/docs/html-surface.md#L52) |
| [`pointerNotificationScript` · 162](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L162) | Генерирует уведомления о нажатиях основной кнопки. | [compose-src-doc.ts:117](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L117) |
| [`frameHeightScript` · 178](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L178) | Генерирует наблюдение за высотой для автоматического размера блока. | [compose-src-doc.ts:119](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L119) |
| [`reportHeight` · 181](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L181) | Измеряет высоту содержимого и посылает её хосту. | [bridge-runtime.ts:188](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L188), [bridge-runtime.ts:192](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L192), [bridge-runtime.ts:195](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L195) |
| [`connectionTeardownScript` · 208](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L208) | Генерирует закрытие порта при уходе со страницы. | [compose-src-doc.ts:123](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L123) |

<details>
<summary>Встроенные функции и обработчики (8)</summary>

- [Строка 76](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L76) — Вызывает одного наблюдателя.
- [Строка 88](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L88) — Удаляет подписку.
- [Строка 105](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L105) — Разрешает одно ожидание первого снимка.
- [Строка 124](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L124) — Принимает данные, контекст или команду снять выделение.
- [Строка 138](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L138) — Сохраняет resolve до первого снимка.
- [Строка 164](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L164) — Сообщает о нажатии хосту.
- [Строка 190](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L190) — Начинает наблюдение за высотой после готовности DOM.
- [Строка 210](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/bridge-runtime.ts#L210) — Закрывает порт при уходе.

</details>

### JavaScript-копии скриптов iframe

Четыре читаемые JS-копии соответствуют тексту, который генерируют соседние TS-модули. Генераторы по-прежнему формируют `srcdoc`. У копий есть заголовки о синхронизации с генераторами, а форматирование исключено из общей обработки, чтобы сохранять текст скриптов.

- Подключение порта, `window.rivto`, указатель, высота и очистка. [bridge-runtime.js](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/reference/bridge-runtime.js#L1)
- Геометрия областей, где указатель принимает редактор. [editor-pointer-region-runtime.js](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/reference/editor-pointer-region-runtime.js#L1)
- Передача координат текстового жеста в Page. [text-selection-runtime.js](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/reference/text-selection-runtime.js#L1)
- Объекты доступа к редактору и ответы на запросы. [unsafe-runtime.js](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/reference/unsafe-runtime.js#L1)

### [packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L35)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| тип [`HtmlFrameMessage` · 35](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L35) | Объединяет сообщения iframe, которые разбирает основной протокол, включая служебные сигналы подключения, размеров, областей указателя и Unsafe HTML. После их обработки `useHtmlFrame` передаёт варианты `HtmlWidgetCommand` в `onCommand`. | [frame-messages.ts:115](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L115), [frame-messages.ts:187](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L187), [html-frame-connection.ts:38](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L38), [use-html-frame.ts:214](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L214) |
| [`HtmlFrameMessageInput` · 52](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L52) | Форма входящего сообщения с `namespace` и `token`. Поля запроса Unsafe HTML приходят рядом с `kind`, а после проверки оказываются вложены в `request`. | [`parseFrameMessage` · 101](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L101) |
| тип [`HtmlHostMessage` · 72](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L72) | Сообщения от хоста к конкретному документу виджета. | [frame-messages.ts:86](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L86), [html-frame-connection.ts:88](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L88), [use-html-frame.ts:176](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L176) |
| [`postHostMessage` · 86](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L86) | Добавляет поле `namespace` и токен перед отправкой в порт. Пространство имён маркирует протокол, токен связывает обмен с конкретным документом iframe. | [html-frame-connection.ts:90](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L90) |
| [`parseFrameMessage` · 101](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L101) | Показывает ожидаемую форму входящего сообщения в первой перегрузке. Реальный вход с порта имеет тип `unknown`; парсер проверяет принадлежность документа и поля сообщения. | [html-frame-connection.ts:132](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L132), [html-frame-connection.ts:164](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L164) |
| [`parseWidgetCommand` · 148](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L148) | Проверяет форму команд нажатия и записи данных. | [frame-messages.ts:138](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L138) |
| [`parseEditorPointerRegions` · 187](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L187) | Проверяет количество и данные областей, отсекает выход за границы. | [frame-messages.ts:132](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L132) |
| [`parseRegion` · 221](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L221) | Ожидает четыре числовых поля `x`, `y`, `width`, `height`. Проверяет вход и обрезает прямоугольник по границам viewport. Возвращает `null` для пустой области и `undefined` для некорректного входа. | [frame-messages.ts:204](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L204) |
| [`clamp` · 237](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L237) | Ограничивает координату допустимым интервалом. | [frame-messages.ts:238](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L238), [frame-messages.ts:239](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L239), [frame-messages.ts:240](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L240), [frame-messages.ts:241](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L241) |

### [packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L15)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlFrameDocument` · 15](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L15) | Токен, ключ выделения и лимит областей для одного srcdoc. | [html-frame-connection.ts:76](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L76), [use-html-frame.ts:134](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L134) |
| интерфейс [`HtmlFrameConnectionHandlers` · 25](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L25) | Два уведомления, связывающие соединение с владельцем. | [html-frame-connection.ts:77](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L77) |
| [`onConnect` · 31](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L31) | На каждом новом соединении отправляет актуальный снимок. | [html-frame-connection.ts:119](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L119) |
| [`onMessage` · 38](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L38) | Передаёт владельцу разобранное сообщение. | [html-frame-connection.ts:166](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L166) |
| класс [`HtmlFrameConnection` · 61](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L61) | Владеет портом одного документа iframe и временем жизни его обработчиков. | [use-html-frame.ts:88](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L88), [use-html-frame.ts:108](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L108), [use-html-frame.ts:216](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L216) |
| конструктор [`constructor` · 74](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L74) | Начинает слушать ready от окна iframe. | [use-html-frame.ts:108](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L108) |
| метод [`post` · 88](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L88) | Отправляет сообщение в текущий порт, если соединение установлено. | [html-frame-connection.ts:160](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L160), [use-html-frame.ts:109](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L109) и др. |
| метод [`dispose` · 99](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L99) | Снимает слушатель окна и закрывает соединение. | [use-html-frame.ts:118](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L118) |
| [`onWindowMessage` · 110](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L110) | Принимает новый порт, заменяет старый и уведомляет владельца. | [html-frame-connection.ts:79](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L79), [html-frame-connection.ts:100](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L100) |
| метод [`isReadyFromThisPage` · 128](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L128) | Сверяет окно, токен и тип сообщения ready. | [html-frame-connection.ts:112](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L112) |
| метод [`createPortListener` · 147](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L147) | Создаёт обработчик порта, различающий сообщения выделения и команды виджета. | [html-frame-connection.ts:118](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L118) |
| метод [`disconnect` · 176](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L176) | Прерывает сигнал документа и закрывает порт. | [html-frame-connection.ts:101](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L101), [html-frame-connection.ts:115](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L115) |

<details>
<summary>Встроенные функции и обработчики (1)</summary>

- [Строка 152](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L152) — Разбирает входящее сообщение конкретного порта.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-widget-context.ts](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-widget-context.ts#L24)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`useHtmlWidgetContext` · 24](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-widget-context.ts#L24) | Формирует mode, selected и preview для конкретного отображения виджета. | [html-block.tsx:221](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L221), [html-element.tsx:100](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L100) |

<details>
<summary>Встроенные функции и обработчики (1)</summary>

- [Строка 26](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-widget-context.ts#L26) — Кэширует контекст до изменения его полей.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L21)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`INITIAL_AUTO_HEIGHT` · 21](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L21) | Начальная высота до первого измерения содержимого. | [use-html-frame.ts:89](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L89) |
| интерфейс [`UseHtmlFrameOptions` · 24](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L24) | Всё, что связывает документ, оформление и операции iframe. | [use-html-frame.ts:84](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L84), [use-html-frame.ts:148](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L148) и др. |
| [`onCommand` · 52](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L52) | Получает проверенную команду интерактивного виджета. | [use-html-frame.ts:246](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L246), [html-block.tsx:206](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L206), [html-element.tsx:129](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L129) |
| интерфейс [`UseHtmlFrameResult` · 56](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L56) | Ссылка на iframe, srcdoc, высота и области захвата для React. | [use-html-frame.ts:84](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L84) |
| [`useHtmlFrame` · 84](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L84) | Владеет соединением и обновляет данные отдельно от контекста представления. | [html-frame.tsx:37](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame.tsx#L37) |
| [`onConnect` · 109](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L109) | Отправляет актуальный снимок сразу после ready. | [html-frame-connection.ts:119](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L119) |
| [`onMessage` · 110](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L110) | Направляет сообщение обработчику с последними параметрами. | [html-frame-connection.ts:166](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L166) |
| интерфейс [`ComposedFrameDocument` · 134](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L134) | Готовый srcdoc вместе с ключами и лимитами. | [use-html-frame.ts:148](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L148) |
| [`useFrameDocument` · 148](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L148) | Пересобирает документ при изменении исходника, режима или встраиваемых параметров. | [use-html-frame.ts:86](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L86) |
| [`nodeMessage` · 176](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L176) | Упаковывает данные узла с текущим контекстом. | [use-html-frame.ts:109](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L109), [use-html-frame.ts:124](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L124) |
| интерфейс [`FrameStateSetters` · 181](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L181) | Операции изменения представления по сообщениям виджета. | [use-html-frame.ts:217](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L217) |
| [`setHeight` · 188](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L188) | Устанавливает высоту блока. | [use-html-frame.ts:111](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L111), [use-html-frame.ts:225](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L225) |
| [`setEditorPointerRegions` · 195](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L195) | Заменяет набор областей захвата. | [use-html-frame.ts:111](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L111), [use-html-frame.ts:231](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L231) |
| [`handleFrameMessage` · 213](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L213) | Разводит resize, области захвата, разрешения и команды документа. | [use-html-frame.ts:111](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L111) |
| [`clampFrameHeight` · 258](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L258) | Округляет высоту и ограничивает диапазоном от нуля до максимума. | [use-html-frame.ts:224](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L224) |

<details>
<summary>Встроенные функции и обработчики (7)</summary>

- [Строка 96](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L96) — Обновляет ссылку на параметры.
- [Строка 102](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L102) — Открывает соединение с документом iframe.
- [Строка 117](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L117) — Закрывает соединение при замене документа.
- [Строка 123](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L123) — Отправляет новый снимок.
- [Строка 126](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L126) — Отправляет контекст представления.
- [Строка 153](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L153) — Собирает новый srcdoc и ключи.
- [Строка 225](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L225) — Сравнивает высоту с предыдущей.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame.tsx](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame.tsx#L36)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`HtmlFrame` · 36](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame.tsx#L36) | Создаёт sandboxed iframe и размещает цели перетаскивания поверх него. | [html-block.tsx:198](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L198), [html-element.tsx:122](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L122) |

<a id="step-4"></a>

## 4. Блок Page и элемент Edgeless

Начните с общего iframe, затем сравните две пары функций: toBlockView и toElementView формируют входы для скрипта, applyBlockCommand и applyElementCommand применяют его записи. Для блока дополнительно есть пустое состояние со вставкой. Для элемента важны рамка холста, выбор группы и запрет записи из предпросмотра.

### Идентификация виджета

Редактор монтирует iframe для виджета без `title` и `name`. Атрибут `data-html-label` обёртки и встроенное свойство `label` тоже удалены. Авторский HTML может читать сохранённый `props.label` как обычное свойство и выводить его в собственной разметке.

В браузерных сценариях iframe ищут внутри владельца по `data-block-id` или `data-edgeless-object-id`. У созданных в тесте узлов ID возвращает операция вставки, а у демопримеров `props.sample` помогает найти текущий ID в модели. Для Preview используют секцию предпросмотра или конкретный объект `Frame` внутри формы.

### [packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L28)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| тип [`HtmlBlockPanel` · 28](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L28) | Минимальные операции панели для блочного виджета. | [html-block.tsx:219](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L219), [html-block.tsx:264](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L264), [html-block.tsx:301](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L301) |
| [`HtmlBlock` · 49](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L49) | Связывает обычный блок с состоянием редактирования текущей панели. | [extension.tsx:134](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L134) |
| [`HtmlBlockEditSlot` · 78](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L78) | Кнопка редактирования в правом слоте блока. | [extension.tsx:145](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L145) |
| интерфейс [`HtmlBlockOccurrenceProps` · 84](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L84) | Входы общего представления для обычного и Unsafe HTML. | [html-block.tsx:138](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L138), [html-block.tsx:170](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L170) |
| [`onCloseEditor` · 98](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L98) | Закрывает форму блока. | [html-block.tsx:178](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L178), [html-block.tsx:186](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L186) и др. |
| [`onDraftSaved` · 105](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L105) | Сообщает владельцу о сохранении перед закрытием формы. | [html-block.tsx:177](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L177), [html-block.tsx:167](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L167), [unsafe-html-block.tsx:66](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L66) |
| [`HtmlBlockOccurrence` · 138](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L138) | Собирает оболочку блока и передаёт снимок и состояние редактирования в `HtmlBlockBody`. Оболочка служит якорем выделения Page. | [html-block.tsx:60](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L60), [unsafe-html-block.tsx:60](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L60) |
| [`HtmlBlockBody` · 162](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L162) | Выбирает форму редактирования, поле вставки или работающий iframe. | [html-block.tsx:143](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L143) |
| [`saveDraft` · 175](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L175) | Записывает черновик, уведомляет владельца и закрывает форму. | [html-block.tsx:187](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L187) |
| [`storeSource` · 194](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L194) | Сохраняет первый вставленный исходник. | [html-block.tsx:195](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L195) |
| [`useBlockWidget` · 219](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L219) | Готовит снимок блока, контекст и обработчик команд для iframe. | [html-block.tsx:172](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L172) |
| [`onCommand` · 223](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L223) | Привязывает команду виджета к конкретному блоку. | [html-block.tsx:227](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L227) |
| [`toBlockView` · 237](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L237) | Составляет доступную виджету проекцию блока, включая ID детей. | [html-block.tsx:222](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L222) |
| [`applyBlockCommand` · 263](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L263) | Разбирает нажатия и команды записи блока, включая свойства списка. | [html-block.tsx:224](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L224) |
| [`commitBlockDraft` · 301](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L301) | Сохраняет изменённые поля черновика одной операцией истории. | [html-block.tsx:176](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L176) |

<details>
<summary>Встроенные функции и обработчики (5)</summary>

- [Строка 65](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L65) — Закрывает форму блока.
- [Строка 80](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L80) — Открывает форму из слота.
- [Строка 222](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L222) — Кэширует снимок блока.
- [Строка 224](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L224) — Передаёт команду блочному менеджеру.
- [Строка 307](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L307) — Группирует запись исходника и свойств.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L13)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlBlockEmptyProps` · 13](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L13) | Контракт передачи первого исходника владельцу блока. | [html-block-empty.tsx:34](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L34) |
| [`onCommit` · 20](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L20) | Получает непустой исходник после вставки или кнопки Render. | [html-block-empty.tsx:38](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L38), [html-block-empty.tsx:34](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L34), [html-block.tsx:195](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L195) |
| [`HtmlBlockEmpty` · 34](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L34) | Показывает поле для пустого виджета. | [html-block.tsx:195](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L195) |
| [`commit` · 36](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L36) | Отбрасывает пустой текст перед передачей владельцу. | [html-block-empty.tsx:49](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L49), [html-block-empty.tsx:56](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L56) |
| [`paste` · 41](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L41) | Берёт text/plain или text/html из буфера и поглощает обработанную вставку. | [html-block-empty.tsx:66](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L66) |

<details>
<summary>Встроенные функции и обработчики (2)</summary>

- [Строка 54](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L54) — Подтверждает введённый текст.
- [Строка 67](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L67) — Обновляет текст пустого блока.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L30)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`HOST_OWNED_PROPS` · 30](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L30) | Свойства холста и HTML, исключаемые из редактируемого JSON. | [html-element.tsx:112](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L112), [html-element.tsx:284](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L284) |
| тип [`HtmlElementPanel` · 33](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L33) | Операции панели для HTML-элемента. | [html-element.tsx:154](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L154), [html-element.tsx:245](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L245), [html-element.tsx:279](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L279) |
| тип [`HtmlElementSelection` · 41](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L41) | Операции выделения, доступные обработчику нажатий. | [html-element.tsx:155](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L155), [html-element.tsx:188](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L188) |
| [`HtmlElementEditSlot` · 58](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L58) | Кнопка формы в правом слоте элемента. | [extension.tsx:264](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L264) |
| [`HtmlElement` · 95](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L95) | Выбирает редактор или iframe, растянутый на геометрию элемента. | [extension.tsx:249](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L249) |
| [`useHtmlElementCommand` · 153](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L153) | Привязывает команды виджета к элементу и выделению его панели. | [html-element.tsx:102](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L102) |
| [`selectHtmlElement` · 188](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L188) | Обновляет выделение холста с учётом модификатора. | [html-element.tsx:167](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L167) |
| [`toElementView` · 219](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L219) | Формирует снимок элемента с рамкой, z-index и дочерними ID. | [html-element.tsx:101](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L101) |
| [`applyElementCommand` · 244](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L244) | Обновляет свойства элемента, для set-content записывает props.html. Удалённый элемент и команды свойств списка пропускает. | [html-element.tsx:165](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L165) |
| [`commitElementDraft` · 279](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L279) | Сохраняет исходник в props.html и изменённые свойства одним шагом истории. | [html-element.tsx:115](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L115) |

<details>
<summary>Встроенные функции и обработчики (8)</summary>

- [Строка 67](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L67) — Открывает форму элемента.
- [Строка 68](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L68) — Обрабатывает нажатие в слоте элемента.
- [Строка 101](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L101) — Кэширует снимок элемента.
- [Строка 113](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L113) — Закрывает форму.
- [Строка 114](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L114) — Сохраняет черновик и закрывает форму.
- [Строка 160](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L160) — Направляет нажатие или запись элементу.
- [Строка 206](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L206) — Исключает ID из выделения.
- [Строка 293](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L293) — Записывает изменённые свойства пакетно.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/html-starter.ts](../packages/react-rivto-editor/src/extensions/html-surface/html-starter.ts#L2)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`HTML_STARTER` · 2](../packages/react-rivto-editor/src/extensions/html-surface/html-starter.ts#L2) | Статичная стартовая разметка нового элемента холста. Показывает «HTML» и подсказку редактирования. Верхняя полоса остаётся целью перетаскивания. | [extension.tsx:246](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L246) |

<a id="step-5"></a>

## 5. Редактирование и сохранение

Проследите одно нажатие Edit → изменение HTML или JSON → раскрытие формы → Done. ID панели разделяет сеансы одного узла. Владелец формы держит черновик над диалогом и сохраняет состояние CodeMirror при перемонтировании. В конце вернитесь к commitBlockDraft или commitElementDraft в предыдущем разделе и проверьте, какие поля действительно записываются.

### [packages/react-rivto-editor/src/panels/types.ts](../packages/react-rivto-editor/src/panels/types.ts#L68)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`ReactPanelApi` · 68](../packages/react-rivto-editor/src/panels/types.ts#L68) | Публичный интерфейс панели. Здесь явно объявлен ID для изоляции состояния формы между панелями. | [types.ts:17](../packages/react-rivto-editor/src/managers/block-context-menu/types.ts#L17), [targets.ts:19](../packages/react-rivto-editor/src/managers/block-context-menu/targets.ts#L19) и др. |

### [packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L14)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlEditingStore` · 14](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L14) | Хранилище признаков открытой формы в одной установке расширения. | [use-html-editing.ts:45](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L45), [use-html-editing.ts:57](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L57), [use-html-editing.ts:122](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L122), [extension.tsx:35](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L35) |
| метод [`subscribe` · 22](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L22) | Подписывает на один ключ и возвращает отписку. | [use-html-editing.ts:129](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L129) |
| метод [`get` · 29](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L29) | Читает признак по ключу. | [use-html-editing.ts:132](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L132) |
| метод [`set` · 39](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L39) | Меняет признак и уведомляет слушателей. | [use-html-editing.ts:134](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L134) |
| интерфейс [`HtmlEditingStoreProps` · 43](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L43) | Передаёт одно хранилище рендереру и его слоту. | [html-block.tsx:53](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L53), [html-block.tsx:78](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L78), [html-element.tsx:61](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L61), [html-element.tsx:96](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L96) |
| [`createHtmlEditingStore` · 57](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L57) | Создаёт хранилище для одной установки расширения. | [extension.tsx:83](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L83) |
| метод [`subscribe` · 67](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L67) | Создаёт запись при первой подписке, удаляет при последней отписке. | [use-html-editing.ts:129](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L129) |
| метод [`get` · 87](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L87) | Возвращает false для отсутствующей записи. | [use-html-editing.ts:132](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L132) |
| метод [`set` · 97](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L97) | Меняет существующую запись только при смене значения. | [use-html-editing.ts:134](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L134) |
| [`useHtmlEditing` · 121](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L121) | Связывает панель, тип и ID узла с React через useSyncExternalStore. | [html-block.tsx:55](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L55), [html-block.tsx:79](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L79), [html-element.tsx:63](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L63), [html-element.tsx:99](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L99) |
| [`subscribe` · 128](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L128) | Подписывает React на вычисленный ключ. | [use-html-editing.ts:133](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L133) |
| [`read` · 132](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L132) | Читает текущее значение для React. | [use-html-editing.ts:133](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L133) |
| [`setActive` · 134](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L134) | Привязывает запись к текущему ключу. | [use-html-editing.ts:135](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L135) |

<details>
<summary>Встроенные функции и обработчики (6)</summary>

- [Строка 74](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L74) — Снимает подписку и освобождает неиспользуемый ключ.
- [Строка 103](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L103) — Уведомляет одного наблюдателя.
- [Строка 129](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L129) — Подписывает на ключ панели.
- [Строка 132](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L132) — Читает признак редактирования.
- [Строка 133](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L133) — Возвращает серверный снимок признака.
- [Строка 134](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-html-editing.ts#L134) — Записывает новое значение.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L15)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| тип [`UnsafeHtmlAccessState` · 15](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L15) | Состояния доступа, которые показывает кнопка Unsafe HTML. | [html-edit-button.tsx:22](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L22), [unsafe-html-block.tsx:113](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L113), [unsafe-html-block.tsx:159](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L159) |
| интерфейс [`HtmlEditButtonProps` · 18](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L18) | Видимость формы, статус доступа и действия кнопки. | [html-edit-button.tsx:56](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L56) |
| [`onOpen` · 28](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L28) | Открывает редактор исходника. | [html-edit-button.tsx:79](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L79), [html-edit-button.tsx:56](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L56) и др. |
| [`onPointerDown` · 35](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L35) | Обрабатывает нажатие до click, чтобы холст успел выделить элемент. | [html-edit-button.tsx:76](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L76), [html-edit-button.tsx:56](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L56), [html-element.tsx:68](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L68) |
| [`HtmlEditButton` · 56](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L56) | Показывает кнопку редактирования и состояние доступа. | [html-block.tsx:80](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L80), [html-element.tsx:65](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L65), [unsafe-html-block.tsx:79](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L79) |

<details>
<summary>Встроенные функции и обработчики (1)</summary>

- [Строка 77](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-edit-button.tsx#L77) — Открывает редактор кнопкой.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L24)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlSourceEditorProps` · 24](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L24) | Исходник, свойства, дополнительные поля и действия формы. | [html-source-editor.tsx:78](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L78) |
| [`onSave` · 42](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L42) | Получает проверенный черновик по Done. | [html-source-editor.tsx:82](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L82), [html-source-editor.tsx:81](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L81), [html-block.tsx:187](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L187), [html-element.tsx:114](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L114) |
| [`onCancel` · 48](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L48) | Закрывает без сохранения. | [html-source-editor.tsx:96](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L96), [html-source-editor.tsx:81](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L81), [html-block.tsx:186](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L186), [html-element.tsx:113](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L113) |
| [`HtmlSourceEditor` · 78](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L78) | Владеет черновиком, флагом Preview и режимом разворачивания. Передаёт принятый предпросмотр в используемую панель и сохраняет черновик при переключении между встроенным и полноэкранным режимами. | [html-block.tsx:181](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L181), [html-element.tsx:107](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L107) |
| [`pane` · 87](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L87) | Собирает одно представление с общим черновиком и предпросмотром. Встроенный режим и диалог используют это представление по очереди. | [html-source-editor.tsx:111](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L111), [html-source-editor.tsx:119](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L119) |
| [`focusExpandButton` · 101](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L101) | Возвращает фокус на кнопку раскрытия. | [html-source-editor.tsx:116](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L116) |
| интерфейс [`HtmlEditorPaneProps` · 127](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L127) | Данные для одного представления формы. | [html-source-editor.tsx:183](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L183) |
| [`onToggleExpanded` · 147](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L147) | Переключает размер формы. | [html-source-editor.tsx:190](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L190), [html-source-editor.tsx:95](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L95), [html-source-editor.tsx:181](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L181) |
| [`onCancel` · 153](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L153) | Закрывает форму с отказом от черновика. | [html-source-editor.tsx:192](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L192), [html-source-editor.tsx:96](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L96), [html-source-editor.tsx:182](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L182) |
| [`HtmlEditorPane` · 173](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L173) | Располагает действия, поля и предпросмотр. Рядом с полями показывает ошибку сохранения или общую подсказку API. | [html-source-editor.tsx:88](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L88) |
| интерфейс [`SourceDraft` · 206](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L206) | Редактируемые тексты и операция сохранения одного сеанса. | [html-source-editor.tsx:137](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L137), [html-source-editor.tsx:258](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L258), [html-source-editor.tsx:293](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L293) |
| [`setHtml` · 221](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L221) | Заменяет HTML в черновике. | [html-source-editor.tsx:276](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L276), [html-source-editor.tsx:307](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L307) |
| [`setPropsText` · 228](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L228) | Заменяет текст JSON в черновике. | [html-source-editor.tsx:276](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L276), [html-source-editor.tsx:317](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L317) |
| [`save` · 235](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L235) | Проверяет JSON и передаёт изменения владельцу. | [html-source-editor.tsx:191](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L191), [html-source-editor.tsx:276](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L276) |
| [`useSourceDraft` · 253](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L253) | Запоминает начальные значения и ведёт локальный черновик до Done. | [html-source-editor.tsx:82](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L82) |
| [`save` · 267](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L267) | Вычисляет изменения относительно открытия формы и показывает ошибку разбора. | [html-source-editor.tsx:276](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L276) |
| [`HtmlEditorFields` · 288](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L288) | Размещает поля HTML, свойств и доступных только для чтения данных. | [html-source-editor.tsx:197](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L197) |
| [`CodeFieldLabel` · 345](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L345) | Связывает заголовок поля с его представлением. | [html-source-editor.tsx:300](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L300), [html-source-editor.tsx:310](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L310), [html-source-editor.tsx:321](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L321) |
| интерфейс [`HtmlEditorActionsProps` · 371](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L371) | Действия строки заголовка формы. | [html-source-editor.tsx:414](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L414) |
| [`onTogglePreview` · 379](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L379) | Переключает видимость предпросмотра, сохраняя черновик формы. | [html-source-editor.tsx:91](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L91), [html-source-editor.tsx:185](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L185), [html-source-editor.tsx:432](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L432) |
| [`onToggleExpanded` · 387](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L387) | Меняет встроенный и полноэкранный режим. | [html-source-editor.tsx:443](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L443), [html-source-editor.tsx:190](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L190), [html-source-editor.tsx:415](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L415) |
| [`onSave` · 393](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L393) | Подтверждает черновик. | [html-source-editor.tsx:457](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L457), [html-source-editor.tsx:191](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L191), [html-source-editor.tsx:415](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L415) |
| [`onCancel` · 399](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L399) | Отбрасывает черновик. | [html-source-editor.tsx:453](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L453), [html-source-editor.tsx:192](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L192), [html-source-editor.tsx:415](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L415) |
| [`HtmlEditorActions` · 414](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L414) | Показывает Preview, раскрытие, Close и Done. Активность Preview отражается в `aria-pressed` и цветах при том же варианте кнопки. | [html-source-editor.tsx:186](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L186) |

<details>
<summary>Встроенные функции и обработчики (5)</summary>

- [Строка 85](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L85) — Готовит текстовое представление свойств списка.
- [Строка 95](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L95) — Переключает размер панели.
- [Строка 109](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L109) — Удерживает жест в редакторе исходника.
- [Строка 259](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L259) — Фиксирует исходные HTML и свойства.
- [Строка 263](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L263) — Создаёт хранилище состояний полей.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/editing/html-widget-api-hint.tsx](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-widget-api-hint.tsx#L20)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`HtmlWidgetApiHint` · 20](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-widget-api-hint.tsx#L20) | Показывает общую справку по API виджета рядом с полем первого ввода и в редакторе исходника. | [html-block-empty.tsx:59](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block-empty.tsx#L59), [html-source-editor.tsx:200](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L200) |

### [packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L8)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`AcceptedDraft` · 8](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L8) | Хранит HTML и JSON-свойства, принятые вместе после проверки. При некорректном JSON сохраняется последняя валидная пара. | [use-draft-preview.tsx:23](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L23), [use-draft-preview.tsx:109](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L109) |
| [`DraftText` · 9](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L9) | Минимальные входы предпросмотра: HTML и текст поля JSON. | [use-draft-preview.tsx:22](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L22), [use-draft-preview.tsx:57](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L57) |
| [`useAcceptedDraft` · 22](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L22) | При включённом Preview ждёт `previewDelayMs` после последней правки. Отменяет предыдущий таймер, при ошибке оставляет последнее валидное содержимое, при выключении сбрасывает принятое состояние. | [use-draft-preview.tsx:66](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L66) |
| [`useDraftPreview` · 55](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L55) | Создаёт отдельный iframe с `preview: true` и `interactive: false`. В Page высота подстраивается под HTML, на холсте размер берётся из рамки узла. Команды записи и доступ Unsafe HTML из этого iframe не применяются. | [html-source-editor.tsx:86](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L86) |
| [`previewNode` · 107](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L107) | Подменяет данные снимка принятым черновиком. Блок получает HTML в `content`, элемент — в `props.html`, а скрытые свойства элемента сохраняют значения хоста. | [use-draft-preview.tsx:68](../packages/react-rivto-editor/src/extensions/html-surface/editing/use-draft-preview.tsx#L68) |



### [packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L14)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`htmlCodeTheme` · 14](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L14) | Настраивает цвета полей и нумерации строк CodeMirror. | [html-code-field.tsx:183](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L183) |
| тип [`HtmlCodeLanguage` · 29](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L29) | Выбор подсветки HTML или JSON. | [html-code-field.tsx:48](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L48), [html-code-field.tsx:125](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L125) |
| тип [`HtmlCodeFieldStates` · 37](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L37) | Состояния полей по меткам на время редактирования. | [html-code-field.tsx:42](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L42), [html-code-field.tsx:121](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L121), [html-source-editor.tsx:214](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L214) |
| интерфейс [`HtmlCodeFieldProps` · 40](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L40) | Значение, язык, доступность записи и состояние одного поля. | [html-code-field.tsx:92](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L92) |
| [`onChange` · 59](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L59) | Передаёт полный текст поля после изменения. | [html-code-field.tsx:91](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L91), [html-source-editor.tsx:307](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L307), [html-source-editor.tsx:317](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L317) |
| [`HtmlCodeField` · 84](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L84) | Монтирует CodeMirror и синхронизирует его с React. | [html-source-editor.tsx:301](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L301), [html-source-editor.tsx:311](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L311), [html-source-editor.tsx:322](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L322) |
| [`onChange` · 108](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L108) | Передаёт текст актуальному обработчику через ref. | [html-code-field.tsx:188](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L188) |
| интерфейс [`CodeViewOptions` · 119](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L119) | Параметры одного экземпляра EditorView. | [html-code-field.tsx:151](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L151), [html-code-field.tsx:179](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L179) |
| [`onChange` · 134](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L134) | Получает обновлённый документ из EditorView. | [html-code-field.tsx:188](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L188) |
| [`mountCodeView` · 147](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L147) | Создаёт EditorView, восстанавливает выделение и историю. При очистке сохраняет состояние и уничтожает представление. | [html-code-field.tsx:103](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L103) |
| [`codeExtensions` · 179](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L179) | Подключает подсветку, доступное имя, обработчик текста и режим чтения. | [html-code-field.tsx:157](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L157) |
| [`replaceCodeDocument` · 208](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L208) | Обновляет документ CodeMirror при изменившемся внешнем значении. | [html-code-field.tsx:112](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L112) |

<details>
<summary>Встроенные функции и обработчики (6)</summary>

- [Строка 98](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L98) — Обновляет ссылки на актуальные параметры.
- [Строка 102](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L102) — Монтирует представление поля.
- [Строка 111](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L111) — Синхронизирует текст извне.
- [Строка 154](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L154) — Возвращает пустую очистку при отсутствии DOM-узла.
- [Строка 165](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L165) — Сохраняет состояние и уничтожает EditorView.
- [Строка 186](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-code-field.tsx#L186) — Передаёт новый текст после правки документа.

</details>

### [packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L44)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`BlockModal` · 44](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L44) | Передаёт полноэкранное представление доски общему диалогу. | [kanban.tsx:50](../packages/react-rivto-editor/src/extensions/containers/kanban/kanban.tsx#L50), [bento.tsx:85](../packages/react-rivto-editor/src/extensions/containers/bento/bento.tsx#L85) и др. |
| тип [`BlockModalDialogProps` · 84](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L84) | Видимость, содержимое и восстановление фокуса контролирует владелец. | [block-modal.tsx:123](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L123) |
| [`onExpanded` · 94](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L94) | Сообщает владельцу о смене видимости. | [block-modal.tsx:69](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L69), [block-modal.tsx:121](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L121), [html-source-editor.tsx:115](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L115) |
| [`restoreFocus` · 100](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L100) | Возвращает фокус на кнопку исходного представления. | [block-modal.tsx:134](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L134), [block-modal.tsx:71](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L71), [block-modal.tsx:122](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L122), [html-source-editor.tsx:116](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L116) |
| [`BlockModalDialog` · 117](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L117) | Общий диалог для доски и редактора исходника. Монтирует содержимое при раскрытии. | [block-modal.tsx:67](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L67), [html-source-editor.tsx:112](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L112) |

<details>
<summary>Встроенные функции и обработчики (2)</summary>

- [Строка 71](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L71) — Возвращает фокус на кнопку раскрытия.
- [Строка 132](../packages/react-rivto-editor/src/blocks/block-modal/block-modal.tsx#L132) — Перехватывает автовосстановление фокуса диалога.

</details>

### [packages/react-rivto-editor/src/components/ui/button-group.tsx](../packages/react-rivto-editor/src/components/ui/button-group.tsx#L11)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`ButtonGroup` · 11](../packages/react-rivto-editor/src/components/ui/button-group.tsx#L11) | Соединяет соседние кнопки действий общей границей, сохраняя видимый фокус. | [html-source-editor.tsx:424](../packages/react-rivto-editor/src/extensions/html-surface/editing/html-source-editor.tsx#L424) |

<a id="step-6"></a>

## 6. Доступ Unsafe HTML

Проследите выдачу доступа от флажка до конкретного менеджера блоков. Постоянное решение хранит один провайдер на установку расширения. Индивидуальное разрешение связывает документ, блок и точный исходник. При каждом запросе хост заново проверяет интерактивность и текущий текст, выбирает операции панели или всего редактора и отправляет ответ по порту.

### Установка политики Unsafe HTML

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [HtmlSurfaceOptions.permissions](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L17) | Фабрика, через которую хост задаёт политику доступа для одного открытого документа. Если опцию не передали, расширение создаёт локальный браузерный провайдер. `HtmlSurfaceLimits` исключает эту опцию из настроек размера и предпросмотра. | [extension.tsx:86](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L86), [custom-blocks.tsx:256](../demo/src/blocks/custom-blocks.tsx#L256) |
| [HtmlPermission](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L5) и [HtmlPermissionRequest](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L8) | `editorAccess` обозначает доступ к API блоков редактора. Запрос связывает возможность с ID блока и точной строкой HTML. Идентичность документа уже известна провайдеру. | [permissions.ts:30](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L30), [permissions.ts:38](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L38), [unsafe-html-block.tsx:152](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L152), [unsafe-html-block.tsx:184](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L184) |
| [HtmlPermissionDecision](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L15) | Результат чтения политики. `denied` отключает доступ, `block` означает индивидуальное разрешение, `document` — разрешение уровня документа. В последнем случае форма показывает статус политики документа. | [permissions.ts:30](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L30), [unsafe-html-block.tsx:156](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L156), [document-permissions.tsx:61](../demo/src/extensions/html-surface/document-permissions.tsx#L61) |
| [HtmlPermissionDocument](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L18) | Узкий вход фабрики. Для ключей хранения нужен ID документа, для проверки и отзыва — чтение блока и подписка на него. | [options.ts:17](../packages/react-rivto-editor/src/extensions/html-surface/options.ts#L17), [permissions.ts:64](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L64), [permissions.ts:80](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L80), [document-permissions.tsx:55](../demo/src/extensions/html-surface/document-permissions.tsx#L55) |
| [HtmlPermissions](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L23) | Контракт политики, которую заимствуют все отображения Unsafe HTML в установке. `read` синхронно читает действующее решение, `write` меняет индивидуальную запись, `subscribe` уведомляет о необходимости перечитать решение, `dispose` снимает наблюдателей. | [extension.tsx:86](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L86), [extension.tsx:166](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L166), [unsafe-html-block.tsx:141](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L141), [document-permissions.tsx:55](../demo/src/extensions/html-surface/document-permissions.tsx#L55) |
| [htmlSurfaceExtension.setup](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L80) | Получает канонический документ и создаёт один провайдер на установку. Владеет его освобождением и снимает уже полученные регистрации, если установка прервалась. | [extension-manager.ts:186](../packages/react-rivto-editor/src/managers/extensions/extension-manager.ts#L186), [extension.tsx:95](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L95) |
| [registerUnsafeHtmlBlock](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L163) | Передаёт общий провайдер рендереру. Рендереру доступны чтение, запись и подписка. Освобождение провайдера остаётся у установки. | [extension.tsx:95](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L95), [unsafe-html-block.tsx:39](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L39) |

### Индивидуальное разрешение и запрос из iframe

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [createLocalHtmlPermissions](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L64) и [LocalHtmlPermissions](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L69) | Браузерный провайдер хранит точный одобренный HTML в `localStorage`. Версионированный ключ включает ID документа, возможность `editorAccess` и ID блока. Запись переживает закрытие отображения и перезагрузку при том же ID документа. Она хранится у браузера отдельно от CRDT-данных блока. | [extension.tsx:86](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L86), [document-permissions.tsx:56](../demo/src/extensions/html-surface/document-permissions.tsx#L56), [index.ts:10](../packages/react-rivto-editor/src/extensions/html-surface/index.ts#L10) |
| [constructor](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L80) | Открывает хранилище, подписывается на события `storage` и восстанавливает наблюдение по ключам своего документа. Если хранилище недоступно, прочитать разрешение нельзя. | [permissions.ts:65](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L65), [permissions.ts:87](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L87) |
| [read](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L101) и [sourceFor](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L156) | Чтение выдаёт `block` при совпадении одобренной строки с переданной. Отсутствующая, повреждённая или недоступная запись читается как отсутствие разрешения. | [unsafe-html-block.tsx:152](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L152), [unsafe-html-block.tsx:187](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L187), [document-permissions.tsx:64](../demo/src/extensions/html-surface/document-permissions.tsx#L64) |
| [write](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L116) и [save](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L201) | Записывают одобренный исходник или удаляют отдельный ключ блока. После записи провайдер отправляет событие для потребителей в текущем окне. Другие вкладки получают браузерное событие `storage`. | [unsafe-html-block.tsx:189](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L189), [permissions.ts:121](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L121), [permissions.ts:183](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L183), [document-permissions.tsx:58](../demo/src/extensions/html-surface/document-permissions.tsx#L58) |
| [watch](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L171) и [validate](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L176) | Пока у блока есть сохранённое разрешение, наблюдают за каноническим узлом даже при закрытой форме. При наблюдаемой смене исходника, преобразовании в другой тип или удалении запись отзывается. Удаление записи также освобождает подписку на блок. | [permissions.ts:90](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L90), [permissions.ts:186](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L186), [permissions.ts:188](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L188), [permissions.ts:230](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L230) |
| [changed](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L220), [subscribe](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L131) и [dispose](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L141) | Обновляют наблюдателей при принятом событии хранилища, а затем уведомляют подписанные представления. Очистка установки снимает подписки и оставляет сохранённые записи доступными следующей установке. | [permissions.ts:87](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/permissions.ts#L87), [extension.tsx:87](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L87), [unsafe-html-block.tsx:148](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L148), [document-permissions.tsx:66](../demo/src/extensions/html-surface/document-permissions.tsx#L66) |
| [UnsafeHtmlBlock](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L39) и [openEditor](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L55) | При открытии формы сбрасывают локальное значение флажка. Пока пользователь его не менял, форма показывает действующее индивидуальное разрешение. После сохранения HTML `onDraftSaved` передаёт исходник и выбранное решение в `grant.decide`. | [extension.tsx:174](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L174), [unsafe-html-block.tsx:66](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L66), [unsafe-html-block.tsx:79](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L79) |
| [useUnsafeHtmlGrant](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L141) | Читает решение через `useSyncExternalStore` и передаёт во фрейм текущую доступность API. Состояние предупреждения после отказа остаётся локальным для представления. | [unsafe-html-block.tsx:48](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L48), [unsafe-html-block.tsx:67](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L67), [unsafe-html-block.tsx:79](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L79) |
| [isAuthorized](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L173) и [decide](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L184) | Перед исполнением запроса сверяются актуальный тип блока, совпадение исходника с исходником фрейма и свежее решение провайдера. `decide` записывает разрешение, когда блок уже содержит переданный HTML и выключено разрешение уровня документа. | [unsafe-html-block.tsx:66](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L66), [unsafe-requests.ts:181](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L181) |

Разрешение управляет операциями через `rivto.panel` и `rivto.reactEditor`. При отказе обычный JavaScript виджета продолжает выполняться в iframe. [Документация доступа](../packages/react-rivto-editor/docs/html-surface.md#L120)

### Разрешение уровня документа в демо

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [documentKey](../demo/src/extensions/html-surface/document-permissions.tsx#L14) и [allowsAll](../demo/src/extensions/html-surface/document-permissions.tsx#L24) | Используют отдельный ключ документа для общего флажка. Политика читает ключ синхронно, поэтому уже поставленный в очередь запрос увидит текущее решение, когда дойдёт до проверки. | [document-permissions.tsx:26](../demo/src/extensions/html-surface/document-permissions.tsx#L26), [document-permissions.tsx:41](../demo/src/extensions/html-surface/document-permissions.tsx#L41), [document-permissions.tsx:62](../demo/src/extensions/html-surface/document-permissions.tsx#L62), [document-permissions.tsx:102](../demo/src/extensions/html-surface/document-permissions.tsx#L102) |
| [subscribeDocument](../demo/src/extensions/html-surface/document-permissions.tsx#L39) | Следит за изменением ключа и общей очисткой хранилища. На событие отзыва подписчики перечитывают политику. Возвращаемая функция снимает слушатель окна. | [document-permissions.tsx:68](../demo/src/extensions/html-surface/document-permissions.tsx#L68), [document-permissions.tsx:86](../demo/src/extensions/html-surface/document-permissions.tsx#L86) |
| [createDemoHtmlPermissions](../demo/src/extensions/html-surface/document-permissions.tsx#L55) | Объединяет политику документа с индивидуальными решениями пакета. Включённый флажок даёт `document` всем Unsafe HTML этого документа, включая новые и отредактированные блоки. При выключении снова учитываются сохранившиеся индивидуальные решения. Запись и очистка делегируются провайдеру пакета. | [custom-blocks.tsx:256](../demo/src/blocks/custom-blocks.tsx#L256) |
| [DocumentHtmlPermissionToggle](../demo/src/extensions/html-surface/document-permissions.tsx#L84) | Показывает действующий флажок в демо и обновляет отдельный ключ в браузере. После записи уведомляет потребителей в этом окне, а при ошибке хранения выводит сообщение у флажка. | [App.tsx:1176](../demo/src/App.tsx#L1176) |

В демо общий флажок размещён в панели инструментов, которая передаёт ID активного документа. Панель используется в трёх представлениях демо. [DemoToolbar](../demo/src/App.tsx#L1045) · [Деможурнал](../demo/src/App.tsx#L1399) · [Режим с несколькими редакторами](../demo/src/App.tsx#L1552) · [Режим проверки синхронизации](../demo/src/App.tsx#L1816)

### [packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L39)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`UnsafeHtmlBlock` · 39](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L39) | Добавляет к общему блочному представлению управление доступом к редактору. | [extension.tsx:174](../packages/react-rivto-editor/src/extensions/html-surface/extension.tsx#L174) |
| [`openEditor` · 55](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L55) | Открывает форму и сбрасывает локальное изменение флажка. До первого переключения флажок отражает индивидуальное решение провайдера. | [unsafe-html-block.tsx:79](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L79) |
| [`EditorAccessCheckbox` · 92](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L92) | Показывает флажок доступа к блокам редактора. | [unsafe-html-block.tsx:74](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L74) |
| [`onChange` · 97](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L97) | Записывает выбор флажка в локальное состояние формы. | [unsafe-html-block.tsx:74](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L74), [unsafe-html-block.tsx:94](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L94) |
| интерфейс [`UnsafeHtmlGrant` · 109](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L109) | Состояние разрешения и возможности конкретного отображения блока. | [unsafe-html-block.tsx:141](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L141) |
| [`decide` · 124](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L124) | При сохранении связывает решение пользователя с текстом исходника. | [unsafe-html-block.tsx:66](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L66) |
| [`useUnsafeHtmlGrant` · 141](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L141) | Через useSyncExternalStore читает сохранённое решение, общее для всех отображений блока в документе. Предупреждение о попытке доступа сохраняется отдельно в текущем отображении. | [unsafe-html-block.tsx:48](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L48) |
| [`isAuthorized` · 173](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L173) | Снова читает канонический блок и решение провайдера перед выполнением запроса. Проверяет тип, неизменность исходника для данного iframe и наличие индивидуального или общего разрешения. | [unsafe-requests.ts:181](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L181) |
| [`onDenied` · 182](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L182) | Показывает состояние отказа после попытки без разрешения. | [unsafe-requests.ts:182](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L182), [use-html-frame.ts:235](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L235) |
| [`decide` · 184](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L184) | Запоминает одобренный текст или отзывает доступ и сбрасывает индикацию отказа. | [unsafe-html-block.tsx:66](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L66) |

<details>
<summary>Встроенные функции и обработчики (3)</summary>

- [Строка 65](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L65) — Закрывает форму Unsafe HTML.
- [Строка 66](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L66) — Применяет выбор доступа к сохранённому исходнику.
- [Строка 102](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L102) — Переводит состояние флажка в булево значение.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L29)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`unsafeAccessScript` · 29](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L29) | Собирает API расширенного доступа с учётом выданного разрешения. | [compose-src-doc.ts:122](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L122) |
| [`request` · 45](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L45) | Создаёт промис запроса к хосту и связывает его с ID ответа. | [unsafe-runtime.ts:69](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L69) |
| [`proxy` · 66](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L66) | Создаёт неизменяемый объект с методами для выбранной области. | [unsafe-runtime.ts:73](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L73) |
| [`blocks[method]` · 69](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L69) | Динамически превращает каждое разрешённое имя метода в запрос через порт. | [unsafe-samples.ts:33](../demo/src/extensions/html-surface/unsafe-samples.ts#L33), [unsafe-samples.ts:34](../demo/src/extensions/html-surface/unsafe-samples.ts#L34), [unsafe-samples.ts:37](../demo/src/extensions/html-surface/unsafe-samples.ts#L37), [unsafe-samples.ts:38](../demo/src/extensions/html-surface/unsafe-samples.ts#L38) |
| [`get` · 75](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L75) | Геттер panel или reactEditor проверяет доступ перед возвратом объекта. | [unsafe-samples.ts:30](../demo/src/extensions/html-surface/unsafe-samples.ts#L30) |

<details>
<summary>Встроенные функции и обработчики (5)</summary>

- [Строка 31](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L31) — Устанавливает API доступа внутри документа.
- [Строка 46](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L46) — Запоминает промис конкретного запроса.
- [Строка 52](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L52) — Завершает промис по ID ответа.
- [Строка 68](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L68) — Создаёт прокси для одного разрешённого метода.
- [Строка 74](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L74) — Устанавливает геттер для каждой области доступа.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L13)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| тип [`UnsafeHtmlBlocks` · 13](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L13) | Набор операций с блоками, доступных мосту в выбранной области. | [unsafe-requests.ts:55](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L55), [unsafe-requests.ts:57](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L57), [unsafe-requests.ts:126](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L126) |
| [`UNSAFE_HTML_METHODS` · 19](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L19) | Список имён методов для построения прокси и проверки запросов. | [unsafe-runtime.ts:68](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/unsafe-runtime.ts#L68) |
| интерфейс [`UnsafeHtmlRequest` · 28](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L28) | Проверенная оболочка запроса с аргументами, требующими дальнейшей проверки. | [unsafe-requests.ts:100](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L100), [unsafe-requests.ts:131](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L131), [unsafe-requests.ts:179](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L179), [frame-messages.ts:43](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L43) |
| [`UnsafeHtmlRequestInput` · 40](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L40) | Связывает имя операции с её позиционными аргументами. Чтение корней принимает пустой список, чтение блока или его связей принимает ID, запись HTML принимает ID и строку содержимого. | [`parseUnsafeHtmlRequest` · 96](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L96), [`executeUnsafeHtmlRequest` · 125](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L125), [`UnsafeHtmlRequestInput` · 61](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L61) |
| интерфейс [`UnsafeHtmlFrameAccess` · 51](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L51) | Предоставленные хостом менеджеры и проверка актуального разрешения. | [unsafe-requests.ts:177](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L177), [use-html-frame.ts:44](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L44), [html-block.tsx:107](../packages/react-rivto-editor/src/extensions/html-surface/block/html-block.tsx#L107), [unsafe-html-block.tsx:115](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-html-block.tsx#L115) |
| [`isAuthorized` · 63](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L63) | Перепроверяет разрешение в момент запроса. | [unsafe-requests.ts:181](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L181) |
| [`onDenied` · 69](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L69) | Сообщает о попытке воспользоваться недоступным API. | [unsafe-requests.ts:182](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L182), [use-html-frame.ts:235](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L235) |
| интерфейс [`UnsafeHtmlResult` · 81](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L81) | Ответ с ID, значением или ошибкой для ожидающего промиса. | [unsafe-requests.ts:180](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L180), [frame-messages.ts:76](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L76) |
| [`UnsafeHtmlOperationResult` · 73](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L73) | Описывает фактические ответы операций: ID, список ID, снимок блока, `true` после записи или `null` при отсутствии результата. | [`value` · 85](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L85), [`executeUnsafeHtmlRequest` · 125](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L125) |
| [`parseUnsafeHtmlRequest` · 96](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L96) | Проверяет ID, область, строковое имя и наличие массива аргументов. Перегрузка показывает ожидаемые аргументы каждого метода. Значения и число аргументов проверяются при исполнении. | [frame-messages.ts:134](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/frame-messages.ts#L134) |
| [`executeUnsafeHtmlRequest` · 125](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L125) | Проверяет аргументы выбранной операции и вызывает её на переданном менеджере. | [unsafe-requests.ts:187](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L187) |
| [`answerUnsafeHtmlRequest` · 176](../packages/react-rivto-editor/src/extensions/html-surface/unsafe/unsafe-requests.ts#L176) | Проверяет разрешение, выбирает менеджер и преобразует исключения в ответ. | [use-html-frame.ts:240](../packages/react-rivto-editor/src/extensions/html-surface/frame/use-html-frame.ts#L240) |

<a id="step-7"></a>

## 7. Зоны захвата, выделение и перемещение

Здесь сходятся три разных жеста. Для перемещения виджета iframe сообщает прямоугольники, поверх которых хост рисует цели захвата. Для выделения текста iframe сохраняет физический указатель и передаёт координаты в Page. Для жеста, начатого в самом Page или на холсте, владельцу нужно продолжать принимать события при пересечении iframe. Посмотрите, кто останавливает каждый жест при отпускании, отмене или демонтаже.

### [packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L29)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`INTERACTIVE_SELECTOR` · 29](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L29) | Селекторы элементов, которым нужны собственные жесты. | [editor-pointer-region-runtime.ts:201](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L201) |
| [`OBSERVED_ATTRIBUTES` · 54](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L54) | Атрибуты, влияющие на геометрию зон захвата. | [editor-pointer-region-runtime.ts:281](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L281) |
| [`editorPointerRegionScript` · 88](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L88) | Генерирует измерение зон в iframe и доставку результата редактору. | [compose-src-doc.ts:118](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L118) |
| [`sizeObserver` · 90](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L90) | Наблюдает за изменениями размеров. | [editor-pointer-region-runtime.ts:239](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L239), [editor-pointer-region-runtime.ts:249](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L249), [editor-pointer-region-runtime.ts:252](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L252) |
| [`sizeObservedElements` · 92](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L92) | Хранит набор целей ResizeObserver. | [editor-pointer-region-runtime.ts:248](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L248), [editor-pointer-region-runtime.ts:252](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L252), [editor-pointer-region-runtime.ts:254](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L254) |
| [`listenerElements` · 94](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L94) | Слабые ссылки на элементы с обработчиками. | [editor-pointer-region-runtime.ts:207](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L207), [editor-pointer-region-runtime.ts:209](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L209), [editor-pointer-region-runtime.ts:352](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L352), [editor-pointer-region-runtime.ts:397](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L397) |
| [`listenerEntries` · 96](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L96) | Связывает DOM-элемент с его активными регистрациями. | [editor-pointer-region-runtime.ts:332](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L332), [editor-pointer-region-runtime.ts:347](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L347) и др. |
| [`lastSentRegions` · 98](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L98) | Предыдущее сообщение для пропуска одинаковой геометрии. | [editor-pointer-region-runtime.ts:270](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L270), [editor-pointer-region-runtime.ts:271](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L271) |
| [`pendingFrame` · 100](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L100) | Номер запланированного кадра измерения. | [editor-pointer-region-runtime.ts:104](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L104), [editor-pointer-region-runtime.ts:259](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L259) |
| [`scheduleMeasurement` · 103](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L103) | Объединяет несколько изменений в одно измерение за кадр. | [editor-pointer-region-runtime.ts:90](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L90), [editor-pointer-region-runtime.ts:279](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L279) и др. |
| [`visibleRectangle` · 119](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L119) | Вычисляет видимую часть элемента с учётом прокручиваемых предков. | [editor-pointer-region-runtime.ts:199](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L199), [editor-pointer-region-runtime.ts:265](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L265) |
| [`subtractRectangle` · 160](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L160) | Вычитает перекрытие, сохраняя ограниченное число прямоугольников. | [editor-pointer-region-runtime.ts:199](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L199), [editor-pointer-region-runtime.ts:219](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L219) |
| [`automaticRegions` · 196](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L196) | Вычитает интерактивное содержимое из площади iframe. | [editor-pointer-region-runtime.ts:267](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L267) |
| [`exclude` · 198](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L198) | Исключает видимый прямоугольник конкретной цели. | [editor-pointer-region-runtime.ts:201](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L201), [editor-pointer-region-runtime.ts:205](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L205), [editor-pointer-region-runtime.ts:210](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L210) |
| [`observeRelevantSizes` · 238](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L238) | Обновляет набор элементов под наблюдением ResizeObserver. | [editor-pointer-region-runtime.ts:261](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L261) |
| [`measureAndReport` · 258](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L258) | Выбирает явные или автоматические области и отправляет изменившийся результат. | [editor-pointer-region-runtime.ts:104](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L104) |
| [`listenerTrackingScript` · 306](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L306) | Генерирует учёт DOM-слушателей, чтобы их цели оставались интерактивными. | [editor-pointer-region-runtime.ts:291](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L291) |
| [`nativeAddListener` · 308](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L308) | Сохраняет штатную регистрацию слушателей. | [editor-pointer-region-runtime.ts:377](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L377), [editor-pointer-region-runtime.ts:392](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L392), [editor-pointer-region-runtime.ts:402](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L402) |
| [`nativeRemoveListener` · 309](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L309) | Сохраняет штатное удаление слушателей. | [editor-pointer-region-runtime.ts:350](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L350), [editor-pointer-region-runtime.ts:411](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L411), [editor-pointer-region-runtime.ts:414](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L414) |
| [`TRACKED_EVENTS` · 310](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L310) | Типы событий, влияющие на доступность перетаскивания. | [editor-pointer-region-runtime.ts:376](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L376) |
| [`captureFlag` · 318](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L318) | Читает capture из обеих форм параметров DOM-события. | [editor-pointer-region-runtime.ts:379](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L379), [editor-pointer-region-runtime.ts:408](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L408) |
| [`findRegistration` · 331](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L331) | Ищет регистрацию по типу, обработчику и capture. | [editor-pointer-region-runtime.ts:382](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L382), [editor-pointer-region-runtime.ts:409](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L409) |
| [`forgetRegistration` · 346](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L346) | Удаляет запись и прекращает отслеживание элемента после последнего слушателя. | [editor-pointer-region-runtime.ts:371](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L371), [editor-pointer-region-runtime.ts:387](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L387), [editor-pointer-region-runtime.ts:412](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L412) |
| [`abortHandler` · 368](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L368) | Создаёт обработчик отмены регистрации через AbortSignal. | [editor-pointer-region-runtime.ts:401](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L401) |
| [`addEventListener` · 375](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L375) | Оборачивает регистрацию событий внутри документа виджета. | [interactive-samples.ts:93](../demo/src/extensions/html-surface/interactive-samples.ts#L93), [interactive-samples.ts:151](../demo/src/extensions/html-surface/interactive-samples.ts#L151) и др. |
| [`callback` · 386](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L386) | Обрабатывает вызов слушателя с сохранением семантики once. | [editor-pointer-region-runtime.ts:392](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L392) |
| [`removeEventListener` · 407](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L407) | Оборачивает снятие слушателя, синхронизируя учёт зон. | Вызывается авторским скриптом при снятии слушателя внутри iframe. |

<details>
<summary>Встроенные функции и обработчики (12)</summary>

- [Строка 162](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L162) — Вычитает пересечение из одного прямоугольника.
- [Строка 202](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L202) — Исключает элементы с локальным обработчиком или курсором pointer.
- [Строка 207](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L207) — Удаляет устаревшую ссылку либо исключает интерактивную цель.
- [Строка 218](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L218) — Вычитает прямоугольник строки текста.
- [Строка 243](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L243) — Добавляет элемент для наблюдения в автоматическом режиме.
- [Строка 245](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L245) — Добавляет маркер и его предков.
- [Строка 248](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L248) — Прекращает наблюдение за исчезнувшей целью.
- [Строка 251](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L251) — Начинает наблюдение за новой целью.
- [Строка 265](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L265) — Измеряет явный маркер.
- [Строка 290](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L290) — Сбрасывает зоны при уходе.
- [Строка 333](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L333) — Сопоставляет параметры регистрации.
- [Строка 369](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/editor-pointer-region-runtime.ts#L369) — Забывает отменённую регистрацию.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/frame/html-editor-pointer-targets.tsx](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-editor-pointer-targets.tsx#L11)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlEditorPointerTargetsProps` · 11](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-editor-pointer-targets.tsx#L11) | Нормализованные прямоугольники и поверхность для обработчиков перетаскивания. | [html-editor-pointer-targets.tsx:41](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-editor-pointer-targets.tsx#L41) |
| [`HtmlEditorPointerTargets` · 41](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-editor-pointer-targets.tsx#L41) | Накладывает прозрачные цели жеста поверх соответствующих участков iframe. | [html-frame.tsx:52](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame.tsx#L52) |

<details>
<summary>Встроенные функции и обработчики (1)</summary>

- [Строка 49](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-editor-pointer-targets.tsx#L49) — Размещает одну цель захвата.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L19)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`NATIVE_INPUT_SELECTOR` · 19](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L19) | Исключает элементы с собственным поведением указателя. | [text-selection-runtime.ts:85](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L85) |
| [`textSelectionScript` · 36](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L36) | Собирает скрипт отслеживания выделения текста внутри iframe. | [compose-src-doc.ts:116](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/compose-src-doc.ts#L116) |
| [`post` · 40](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L40) | Сохраняет привязанный к порту метод отправки. | [text-selection-runtime.ts:56](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L56) |
| [`readX` · 41](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L41) | Сохраняет нативный геттер координаты мыши до запуска авторского скрипта. | [text-selection-runtime.ts:87](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L87), [text-selection-runtime.ts:92](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L92), [text-selection-runtime.ts:100](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L100) |
| [`readY` · 42](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L42) | Сохраняет нативный геттер координаты мыши до запуска авторского скрипта. | [text-selection-runtime.ts:87](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L87), [text-selection-runtime.ts:92](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L92), [text-selection-runtime.ts:100](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L100) |
| [`report` · 55](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L55) | Отправляет фазу жеста и координаты через отдельный ключ. | [text-selection-runtime.ts:60](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L60), [text-selection-runtime.ts:78](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L78) |
| [`reset` · 59](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L59) | Сбрасывает слежение и при необходимости сообщает об отмене. | [text-selection-runtime.ts:82](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L82), [text-selection-runtime.ts:91](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L91) и др. |
| [`update` · 70](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L70) | Начинает передачу координат при выходе с непустым выделением. | [text-selection-runtime.ts:93](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L93), [text-selection-runtime.ts:96](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L96), [text-selection-runtime.ts:101](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L101) |

<details>
<summary>Встроенные функции и обработчики (9)</summary>

- [Строка 38](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L38) — Изолирует состояние выделения данного документа.
- [Строка 80](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L80) — Начинает наблюдение за жестом мыши.
- [Строка 89](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L89) — Читает координаты движения.
- [Строка 95](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L95) — Проверяет появление выделения.
- [Строка 98](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L98) — Отправляет конец жеста.
- [Строка 105](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L105) — Отменяет жест по Escape.
- [Строка 108](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L108) — Сбрасывает жест при потере фокуса окна.
- [Строка 112](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L112) — Отдаёт жест захватившему указатель виджету.
- [Строка 115](../packages/react-rivto-editor/src/extensions/html-surface/sandbox/runtime/text-selection-runtime.ts#L115) — Назначает очистку на события отмены.

</details>

### [packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L15)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`TextSelectionReport` · 15](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L15) | Проверенные фаза и координаты текстового жеста внутри iframe. | [iframe-text-selection.ts:106](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L106), [iframe-text-selection.ts:174](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L174) |
| [`TextSelectionReportInput` · 25](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L25) | Форма отчёта из iframe с ключом выделения, фазой жеста и координатами. Проверка поля `selectionKey` на первом шаге лишь направляет сообщение к парсеру. | [`relay` · 43](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L43), [`parseReport` · 172](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L172) |
| интерфейс [`IframeTextSelectionRelay` · 28](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L28) | Две операции ретранслятора одного документа. | [iframe-text-selection.ts:68](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L68) |
| метод [`isReport` · 35](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L35) | Отличает отчёт выделения от обычного сообщения виджета. | [html-frame-connection.ts:156](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L156) |
| метод [`relay` · 43](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L43) | Передаёт проверенные координаты Page. | [html-frame-connection.ts:159](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L159) |
| [`createIframeTextSelectionRelay` · 64](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L64) | Создаёт ретранслятор и привязывает его очистку к документу. | [html-frame-connection.ts:150](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L150) |
| [`isReport` · 72](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L72) | Проверяет наличие поля selectionKey. Его значение сверяется при разборе отчёта. | [html-frame-connection.ts:156](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L156) |
| метод [`relay` · 79](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L79) | Разбирает отчёт и сообщает, перехватил ли Page жест. | [html-frame-connection.ts:159](../packages/react-rivto-editor/src/extensions/html-surface/frame/html-frame-connection.ts#L159) |
| [`dispatchToPage` · 103](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L103) | Переводит координаты iframe в координаты родительского окна и посылает событие. | [iframe-text-selection.ts:84](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L84) |
| [`createLazyOriginMarker` · 135](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L135) | Лениво создаёт SVG-маркер для пересчёта координат с учётом трансформаций. | [iframe-text-selection.ts:69](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L69) |
| метод [`get` · 143](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L143) | Создаёт маркер при первом обращении. | [iframe-text-selection.ts:84](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L84) |
| метод [`remove` · 158](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L158) | Удаляет созданный маркер. | [iframe-text-selection.ts:70](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L70), [iframe-text-selection.ts:86](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L86) |
| [`parseReport` · 172](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L172) | Отбрасывает неверные фазы и координаты отчёта. | [iframe-text-selection.ts:80](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L80) |

### [packages/rivto-page/src/editor/events/block-input-event.ts](../packages/rivto-page/src/editor/events/block-input-event.ts#L6)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`IFRAME_TEXT_SELECTION_EVENT` · 6](../packages/rivto-page/src/editor/events/block-input-event.ts#L6) | Имя события передачи текстового жеста из iframe в Page. | [block-input-event.ts:19](../packages/rivto-page/src/editor/events/block-input-event.ts#L19), [block-pointer-selection.ts:131](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L131) и др. |
| интерфейс [`IframeTextSelectionDetail` · 9](../packages/rivto-page/src/editor/events/block-input-event.ts#L9) | Фаза, координаты в окне родителя и сигнал жизни исходного документа. | [block-input-event.ts:19](../packages/rivto-page/src/editor/events/block-input-event.ts#L19), [index.ts:117](../packages/rivto-page/src/index.ts#L117), [iframe-text-selection.ts:17](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L17), [iframe-text-selection.ts:114](../packages/react-rivto-editor/src/extensions/html-surface/frame/iframe-text-selection.ts#L114) |
| интерфейс [`BlockInputEventMap` · 18](../packages/rivto-page/src/editor/events/block-input-event.ts#L18) | Добавляет типизированное событие iframe к событиям Page. | [block-input-event.ts:30](../packages/rivto-page/src/editor/events/block-input-event.ts#L30), [block-input-event.ts:48](../packages/rivto-page/src/editor/events/block-input-event.ts#L48) и др. |

### [packages/rivto-page/src/index.ts](../packages/rivto-page/src/index.ts#L113)

- [Строка 113](../packages/rivto-page/src/index.ts#L113) — Публикует имя и тип события текстового жеста для React-хоста.

### [packages/rivto-page/src/adapter/types.ts](../packages/rivto-page/src/adapter/types.ts#L133)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`BlockEditorSelection` · 133](../packages/rivto-page/src/adapter/types.ts#L133) | Контракт хоста для выделения блоков в Page. | [types.ts:218](../packages/rivto-page/src/adapter/types.ts#L218), [block-virtualization-controller.ts:56](../packages/rivto-page/src/editor/virtualization/block-virtualization-controller.ts#L56) и др. |
| метод [`canStartSelection` · 140](../packages/rivto-page/src/adapter/types.ts#L140) | Допускает как нативное событие, так и переданный iframe жест. | [block-pointer-selection.ts:278](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L278), [block-pointer-selection.ts:362](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L362) и др. |

### [packages/react-rivto-editor/src/surfaces/page/page-selection.ts](../packages/react-rivto-editor/src/surfaces/page/page-selection.ts#L43)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| класс [`PageSelection` · 43](../packages/react-rivto-editor/src/surfaces/page/page-selection.ts#L43) | Адаптер выделения Page, который согласует жесты с режимом текущей панели. | [react-panel.ts:72](../packages/react-rivto-editor/src/panels/react-panel.ts#L72), [react-panel.ts:132](../packages/react-rivto-editor/src/panels/react-panel.ts#L132) |
| метод [`canStartSelection` · 135](../packages/react-rivto-editor/src/surfaces/page/page-selection.ts#L135) | Принимает Event, чтобы проверка режима работала и для события из iframe. | [block-pointer-selection.ts:278](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L278), [block-pointer-selection.ts:362](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L362) и др. |

### [packages/rivto-page/src/editor/pointer/block-pointer-ownership.ts](../packages/rivto-page/src/editor/pointer/block-pointer-ownership.ts#L2)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| класс [`BlockPointerOwnership` · 2](../packages/rivto-page/src/editor/pointer/block-pointer-ownership.ts#L2) | Арбитр жестов указателя для одного представления Page. | [block-editor-api.ts:20](../packages/rivto-page/src/editor/block-editor-api.ts#L20), [block-editor-controller.ts:50](../packages/rivto-page/src/editor/block-editor-controller.ts#L50), [index.ts:157](../packages/rivto-page/src/index.ts#L157) |
| метод [`acquire` · 14](../packages/rivto-page/src/editor/pointer/block-pointer-ownership.ts#L14) | На время владения помечает переданный корень и снимает метку при освобождении. | [block-pointer-selection.ts:368](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L368), [block-pointer-selection.ts:656](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L656), [block-drag-extension.ts:368](../packages/rivto-page/src/editor/drag-and-drop/block-drag-extension.ts#L368) |

<details>
<summary>Встроенные функции и обработчики (1)</summary>

- [Строка 21](../packages/rivto-page/src/editor/pointer/block-pointer-ownership.ts#L21) — Снимает метку только у текущего владельца жеста.

</details>

### [packages/rivto-page/src/editor/selection/block-pointer-selection.ts](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L39)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`PointerSelection` · 39](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L39) | Привязывает начатое в iframe выделение к сигналу конкретного документа. | [block-pointer-selection.ts:63](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L63), [block-pointer-selection.ts:301](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L301), [block-pointer-selection.ts:416](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L416), [block-pointer-selection.ts:647](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L647) |
| класс [`BlockPointerSelection` · 58](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L58) | Владеет диапазоном выделения и жизненным циклом жеста в Page. | [block-native-selection.ts:31](../packages/rivto-page/src/editor/selection/block-native-selection.ts#L31), [block-selection-feedback.ts:24](../packages/rivto-page/src/editor/selection/block-selection-feedback.ts#L24), [block-selection-controller.ts:14](../packages/rivto-page/src/editor/selection/block-selection-controller.ts#L14), [block-selection-controller.ts:26](../packages/rivto-page/src/editor/selection/block-selection-controller.ts#L26) |
| метод [`install` · 96](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L96) | Подписывает представление в том числе на событие текстового жеста из iframe. | [block-selection-controller.ts:55](../packages/rivto-page/src/editor/selection/block-selection-controller.ts#L55) |
| [`onIframeTextSelection` · 343](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L343) | При переходе в соседний блок строит диапазон по ID. Возвращаясь в исходный блок, отдаёт жест нативному выделению. | [block-pointer-selection.ts:135](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L135) |
| [`cancelIframeSelection` · 402](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L402) | Освобождает жест из iframe и снимает промежуточное выделение блоков. | [block-pointer-selection.ts:353](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L353), [block-pointer-selection.ts:358](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L358) и др. |
| [`stop` · 530](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L530) | Завершает выделение, учитывая владельца жеста и слушатель отключения iframe. | [block-pointer-selection.ts:158](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L158), [block-pointer-selection.ts:389](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L389), [block-pointer-selection.ts:728](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L728) |
| [`onPointerDown` · 604](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L604) | При начале жеста в Page захватывает корень, чтобы пройти указателем над iframe. | [block-pointer-selection.ts:123](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L123) |
| [`cancel` · 817](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L817) | Сбрасывает жест и отложенное восстановление, снимает слушатель отмены документа. | [block-pointer-selection.ts:172](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L172), [block-pointer-selection.ts:220](../packages/rivto-page/src/editor/selection/block-pointer-selection.ts#L220) и др. |

### [packages/rivto-page/src/editor/drag-and-drop/block-drag-extension.ts](../packages/rivto-page/src/editor/drag-and-drop/block-drag-extension.ts#L212)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| класс [`BlockDragController` · 212](../packages/rivto-page/src/editor/drag-and-drop/block-drag-extension.ts#L212) | Владеет жестом за ручку одного блока и его отменой. | [block-drag-extension.ts:200](../packages/rivto-page/src/editor/drag-and-drop/block-drag-extension.ts#L200), [block-drag-extension.ts:215](../packages/rivto-page/src/editor/drag-and-drop/block-drag-extension.ts#L215) |
| метод [`start` · 354](../packages/rivto-page/src/editor/drag-and-drop/block-drag-extension.ts#L354) | Просит эксклюзивный захват с корнем Page, чтобы iframe не перехватил перетаскивание. | [block-drag-extension.ts:241](../packages/rivto-page/src/editor/drag-and-drop/block-drag-extension.ts#L241) |

### [packages/rivto-page/src/presentation/components/block-editor/block-editor.css](../packages/rivto-page/src/presentation/components/block-editor/block-editor.css#L10)

- [Строка 10](../packages/rivto-page/src/presentation/components/block-editor/block-editor.css#L10) — На время жеста, начатого в Page, вложенные iframe пропускают события указателя к хосту. Селектор зависит от метки, которую устанавливает BlockPointerOwnership.acquire.

### [packages/react-rivto-editor/src/extensions/edgeless/edgeless-pointer-target.ts](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-pointer-target.ts#L2)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`EdgelessPointerTarget` · 2](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-pointer-target.ts#L2) | Попадание указателя, родитель, текущее выделение и модификатор. | [edgeless-pointer-target.ts:24](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-pointer-target.ts#L24) |
| [`resolveEdgelessPointerTarget` · 24](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-pointer-target.ts#L24) | Выбирает группу при первом нажатии, затем конкретного ребёнка. Модификатор сразу адресует ребёнка. | [edgeless-transform.ts:1177](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L1177), [html-element.tsx:191](../packages/react-rivto-editor/src/extensions/html-surface/element/html-element.tsx#L191) |

### [packages/react-rivto-editor/src/extensions/edgeless/types.ts](../packages/react-rivto-editor/src/extensions/edgeless/types.ts#L14)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`TransformStart` · 14](../packages/react-rivto-editor/src/extensions/edgeless/types.ts#L14) | Запоминает DOM-цель и ID захваченного указателя на время трансформации. | [edgeless-transform.ts:218](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L218), [edgeless-transform.ts:635](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L635), [edgeless-transform.ts:765](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L765), [edgeless-transform.ts:1280](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L1280) |

### [packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L13)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| класс [`EdgelessSelectionController` · 13](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L13) | Владеет жестом рамочного выделения для одного холста. | [edgeless-selection.tsx:33](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx#L33) |
| метод [`install` · 70](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L70) | Подключает события, включая потерю захвата указателя. | [edgeless-selection.tsx:36](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx#L36) |
| метод [`destroy` · 126](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L126) | Снимает обработчики и завершает захват при демонтаже. | [edgeless-selection-controller.ts:109](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L109), [edgeless-selection-controller.ts:112](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L112) |
| метод [`stop` · 150](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L150) | Освобождает захваченный указатель и останавливает рамку. | [edgeless-selection-controller.ts:99](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L99), [edgeless-selection-controller.ts:106](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L106), [edgeless-selection-controller.ts:130](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L130), [edgeless-selection.tsx:39](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx#L39) |
| метод [`start` · 169](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L169) | Начинает выделение и захватывает указатель для прохода над iframe. | [edgeless-selection-controller.ts:80](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L80) |

<details>
<summary>Встроенные функции и обработчики (4)</summary>

- [Строка 99](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L99) — Завершает жест рамки.
- [Строка 106](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L106) — Завершает жест при потере захвата его указателя.
- [Строка 130](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L130) — Освобождает захваченный указатель.
- [Строка 131](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection-controller.ts#L131) — Уничтожает рамку.

</details>

### [packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx#L26)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`EdgelessInteractionOverlay` · 26](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx#L26) | Останавливает рамочное выделение при выходе из режима Edgeless. | [index.ts:38](../packages/react-rivto-editor/src/extensions/edgeless/index.ts#L38) |

<details>
<summary>Встроенные функции и обработчики (1)</summary>

- [Строка 37](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx#L37) — Привязывает жизненный цикл выделения к представлению.

</details>

### [packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L89)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| класс [`EdgelessTransformController` · 89](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L89) | Владеет переносом и другой трансформацией объектов одной панели. | [edgeless-transform.ts:58](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L58), [edgeless-controls-adapter.ts:23](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-controls-adapter.ts#L23), [edgeless-transform-controls.tsx:26](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform-controls.tsx#L26) |
| [`finish` · 1028](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L1028) | Завершает или отменяет трансформацию и освобождает указатель. | [edgeless-transform.ts:261](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L261), [edgeless-transform.ts:392](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L392) и др. |
| [`onPointerDown` · 1136](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L1136) | Выбирает объект внутри группы и захватывает указатель исходной целью перемещения. | [edgeless-transform.ts:465](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts#L465) |

<a id="step-8"></a>

## 8. Стили и поставка

Сопоставьте классы формы, iframe и кнопки доступа с правилами CSS, а импорты CodeMirror — с прямыми зависимостями пакета. Для интеграции хосту нужны регистрация расширения из первого раздела и общий файл стилей.

### [packages/react-rivto-editor/src/extensions/html-surface/html-surface.css](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L24)

- [Строка 24](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L24) — Позиции и видимость кнопок в слотах блока и холста.
- [Строка 80](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L80) — Контейнеры блока, холста и iframe с автоматической высотой или заполнением рамки.
- [Строка 124](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L124) — Встроенная форма вставки и редактор исходника.
- [Строка 235](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L235) — Поля CodeMirror, прокрутка, выделение текста и индикация фокуса.
- [Строка 263](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L263) — Раскладка HTML и JSON в полноэкранном диалоге.
- [Строка 297](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L297) — Состояния доступа Unsafe HTML, сообщение об отказе и уменьшение движения.

- [Строка 10](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L10) — Выравнивает внешние границы HTML-блока с обводкой выделения, скрывает пустые крайние слоты и их flex-отступы.
- [Строка 396](../packages/react-rivto-editor/src/extensions/html-surface/html-surface.css#L396) — Оформляет панель Preview и её iframe в обычной и полноэкранной форме.

### [packages/react-rivto-editor/src/styles/index.css](../packages/react-rivto-editor/src/styles/index.css#L68)

- [Строка 68](../packages/react-rivto-editor/src/styles/index.css#L68) — Подключает оформление расширения к общим стилям редактора.

### [packages/react-rivto-editor/package.json](../packages/react-rivto-editor/package.json#L60)

- [Строка 60](../packages/react-rivto-editor/package.json#L60) — Прямые зависимости CodeMirror для HTML, JSON, состояния, представления и базовой настройки.

### [pnpm-lock.yaml](../pnpm-lock.yaml#L416)

- [Строка 416](../pnpm-lock.yaml#L416) — Зафиксированные версии зависимостей CodeMirror и их транзитивных пакетов.

### [packages/crdt-doc/package.json](../packages/crdt-doc/package.json#L18)

Публикуемые экспорты и декларации указывают на `dist/esm`. Рабочий workspace использует исходный файл для типов.

### [.prettierignore](../.prettierignore#L19)

Указывает путь к четырём JS-копиям iframe, формат которых совпадает с текстом генераторов.

### [package.json](../package.json#L22)

Корневой запуск проверок теперь включает пакет `rivto-utils`.

<a id="step-9"></a>

## 9. Демонстрационные виджеты

Начните с наполнения журнала, затем откройте скрипт интересующего виджета. Priority board показывает отдельный сценарий: перетаскивание меняет порядок строк внутри iframe, а список сохраняется через rivto.setProp. В микшере удобно проследить разницу между локальным состоянием аудио и свойствами узла. Два Unsafe-примера выполняют одно действие через разные области доступа.

### [demo/src/journal-content.ts](../demo/src/journal-content.ts#L211)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`seedJournalDemo` · 211](../demo/src/journal-content.ts#L211) | Добавляет HTML-раздел перед журналом и примеры элементов после планов. | [App.tsx:465](../demo/src/App.tsx#L465) |
| [`seedCanvasPlans` · 269](../demo/src/journal-content.ts#L269) | Собирает существующие рисунки и планы и снимает начальное выделение. | [journal-content.ts:258](../demo/src/journal-content.ts#L258) |

### [demo/src/extensions/html-surface/seed.ts](../demo/src/extensions/html-surface/seed.ts#L13)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlSeedEditor` · 13](../demo/src/extensions/html-surface/seed.ts#L13) | Операции документа, нужные для вставки демонстрационных данных. | [seed.ts:99](../demo/src/extensions/html-surface/seed.ts#L99), [seed.ts:142](../demo/src/extensions/html-surface/seed.ts#L142), [seed.ts:164](../demo/src/extensions/html-surface/seed.ts#L164) |
| [`HTML_BLOCK_CARD_FRAME` · 26](../demo/src/extensions/html-surface/seed.ts#L26) | Прямоугольник карточки с блочными примерами на холсте. | [seed.ts:124](../demo/src/extensions/html-surface/seed.ts#L124) |
| [`appendHtmlBlockSection` · 99](../demo/src/extensions/html-surface/seed.ts#L99) | Вставляет раздел, карточку на холсте и разделитель. Возвращает ID для продолжения журнала. | [journal-content.ts:212](../demo/src/journal-content.ts#L212) |
| [`appendUnsafeHtmlSamples` · 142](../demo/src/extensions/html-surface/seed.ts#L142) | Ставит перед каждым Unsafe HTML отдельный абзац, который пример сможет изменить. | [seed.ts:121](../demo/src/extensions/html-surface/seed.ts#L121) |
| [`seedHtmlElements` · 164](../demo/src/extensions/html-surface/seed.ts#L164) | Создаёт подпись и самостоятельные HTML-элементы на холсте. | [journal-content.ts:259](../demo/src/journal-content.ts#L259) |

### Хранение Pomodoro в демо

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`JournalSeedEditor` · 12](../demo/src/journal-content.ts#L12) | Разрешает демозагрузчику читать созданный блок и подписываться на изменения таймера. Эти операции заимствуются у менеджера документа. | [journal-content.ts:211](../demo/src/journal-content.ts#L211), [seed.ts:13](../demo/src/extensions/html-surface/seed.ts#L13) |
| [`POMODORO_STORAGE_KEY` · 29](../demo/src/extensions/html-surface/seed.ts#L29) | Ключ настроек таймера для деможурнала, который создаётся заново при открытии. | [seed.ts:38](../demo/src/extensions/html-surface/seed.ts#L38), [seed.ts:77](../demo/src/extensions/html-surface/seed.ts#L77) |
| [`readPomodoroProps` · 36](../demo/src/extensions/html-surface/seed.ts#L36) | Читает длительность и отметку запуска из локального хранилища. При недоступном или неподходящем значении остаются начальные настройки демовиджета. | [seed.ts:111](../demo/src/extensions/html-surface/seed.ts#L111) |
| [`persistPomodoroProps` · 64](../demo/src/extensions/html-surface/seed.ts#L64) | Подписывается на созданный блок и сохраняет только изменения длительности или отметки запуска. Менеджер освобождает подписку при закрытии редактора. | [seed.ts:117](../demo/src/extensions/html-surface/seed.ts#L117) |



### [demo/src/extensions/html-surface/samples.ts](../demo/src/extensions/html-surface/samples.ts#L15)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`HtmlBlockSample` · 15](../demo/src/extensions/html-surface/samples.ts#L15) | Данные блочного примера для вставки на страницу. | [samples.ts:528](../demo/src/extensions/html-surface/samples.ts#L528) |
| интерфейс [`HtmlElementSample` · 27](../demo/src/extensions/html-surface/samples.ts#L27) | Данные примера для холста вместе с начальной геометрией. | [samples.ts:578](../demo/src/extensions/html-surface/samples.ts#L578) |
| [`POMODORO_HTML` · 43](../demo/src/extensions/html-surface/samples.ts#L43) | Таймер хранит длительность в минутах и время старта `startedAt` в миллисекундах с начала эпохи. Остаток вычисляется по текущим часам, поэтому пересоздание iframe не сбрасывает отсчёт. | [samples.ts:531](../demo/src/extensions/html-surface/samples.ts#L531) |
| [`paint` · 134](../demo/src/extensions/html-surface/samples.ts#L134) | Вычисляет остаток времени относительно отметки запуска и обновляет текст и индикатор. Возвращает признак активного отсчёта. | [samples.ts:155](../demo/src/extensions/html-surface/samples.ts#L155) |
| [`tick` · 154](../demo/src/extensions/html-surface/samples.ts#L154) | Обновляет таймер и доступность кнопок. По окончании снимает интервал, оставляя на экране нулевое время. | [samples.ts:187](../demo/src/extensions/html-surface/samples.ts#L187), [samples.ts:188](../demo/src/extensions/html-surface/samples.ts#L188) |
| [`apply` · 174](../demo/src/extensions/html-surface/samples.ts#L174) | Читает длительность и время старта из снимка. Запускает один обновляющий интервал, если таймер ещё активен. | [samples.ts:192](../demo/src/extensions/html-surface/samples.ts#L192), [samples.ts:193](../demo/src/extensions/html-surface/samples.ts#L193) |
| [`GOAL_HTML` · 210](../demo/src/extensions/html-surface/samples.ts#L210) | Карточка прогресса к цели. | [samples.ts:536](../demo/src/extensions/html-surface/samples.ts#L536) |
| [`paint` · 247](../demo/src/extensions/html-surface/samples.ts#L247) | Показывает достигнутое значение цели. | [samples.ts:257](../demo/src/extensions/html-surface/samples.ts#L257), [samples.ts:263](../demo/src/extensions/html-surface/samples.ts#L263), [samples.ts:268](../demo/src/extensions/html-surface/samples.ts#L268) |
| [`apply` · 251](../demo/src/extensions/html-surface/samples.ts#L251) | Переносит параметры цели из props в карточку. | [samples.ts:259](../demo/src/extensions/html-surface/samples.ts#L259), [samples.ts:260](../demo/src/extensions/html-surface/samples.ts#L260) |
| [`QUOTE_HTML` · 274](../demo/src/extensions/html-surface/samples.ts#L274) | Карточка с цитатой. | [samples.ts:551](../demo/src/extensions/html-surface/samples.ts#L551) |
| [`apply` · 297](../demo/src/extensions/html-surface/samples.ts#L297) | Обновляет текст цитаты и подпись. | [samples.ts:301](../demo/src/extensions/html-surface/samples.ts#L301), [samples.ts:302](../demo/src/extensions/html-surface/samples.ts#L302) |
| [`MOOD_HTML` · 306](../demo/src/extensions/html-surface/samples.ts#L306) | Выбор настроения. | [samples.ts:566](../demo/src/extensions/html-surface/samples.ts#L566) |
| [`apply` · 334](../demo/src/extensions/html-surface/samples.ts#L334) | Отмечает выбранное настроение на кнопках. | [samples.ts:341](../demo/src/extensions/html-surface/samples.ts#L341), [samples.ts:342](../demo/src/extensions/html-surface/samples.ts#L342) |
| [`CIRCLE_HTML` · 351](../demo/src/extensions/html-surface/samples.ts#L351) | Вращающийся круг. | [samples.ts:581](../demo/src/extensions/html-surface/samples.ts#L581) |
| [`apply` · 379](../demo/src/extensions/html-surface/samples.ts#L379) | Применяет параметры анимации круга. | [samples.ts:387](../demo/src/extensions/html-surface/samples.ts#L387), [samples.ts:388](../demo/src/extensions/html-surface/samples.ts#L388) |
| [`CLOCK_HTML` · 392](../demo/src/extensions/html-surface/samples.ts#L392) | Часы. | [samples.ts:587](../demo/src/extensions/html-surface/samples.ts#L587) |
| [`paint` · 419](../demo/src/extensions/html-surface/samples.ts#L419) | Обновляет параметры отображения часов. | [samples.ts:431](../demo/src/extensions/html-surface/samples.ts#L431), [samples.ts:432](../demo/src/extensions/html-surface/samples.ts#L432) |
| [`tick` · 422](../demo/src/extensions/html-surface/samples.ts#L422) | Обновляет показание времени. | [samples.ts:433](../demo/src/extensions/html-surface/samples.ts#L433), [samples.ts:434](../demo/src/extensions/html-surface/samples.ts#L434) |
| [`TALLY_HTML` · 438](../demo/src/extensions/html-surface/samples.ts#L438) | Интерактивный счётчик. | [samples.ts:593](../demo/src/extensions/html-surface/samples.ts#L593) |
| [`paint` · 464](../demo/src/extensions/html-surface/samples.ts#L464) | Показывает текущее значение счётчика. | [samples.ts:471](../demo/src/extensions/html-surface/samples.ts#L471), [samples.ts:472](../demo/src/extensions/html-surface/samples.ts#L472) |
| [`SIGNAL_HTML` · 481](../demo/src/extensions/html-surface/samples.ts#L481) | Индикатор сигнала. | [samples.ts:605](../demo/src/extensions/html-surface/samples.ts#L605) |
| [`apply` · 511](../demo/src/extensions/html-surface/samples.ts#L511) | Обновляет индикатор по свойствам сигнала. | [samples.ts:516](../demo/src/extensions/html-surface/samples.ts#L516), [samples.ts:517](../demo/src/extensions/html-surface/samples.ts#L517) |
| [`HTML_BLOCK_SAMPLES` · 528](../demo/src/extensions/html-surface/samples.ts#L528) | Порядок и начальные свойства блочных примеров. | [seed.ts:105](../demo/src/extensions/html-surface/seed.ts#L105) |
| [`HTML_ELEMENT_SAMPLES` · 578](../demo/src/extensions/html-surface/samples.ts#L578) | Расположение и свойства примеров на холсте. | [seed.ts:172](../demo/src/extensions/html-surface/seed.ts#L172) |

<details>
<summary>Встроенные функции и обработчики (17)</summary>

- [Строка 118](../demo/src/extensions/html-surface/samples.ts#L118) — Инициализирует таймер.
- [Строка 194](../demo/src/extensions/html-surface/samples.ts#L194) — Меняет длительность и очищает отметку старта.
- [Строка 199](../demo/src/extensions/html-surface/samples.ts#L199) — Записывает длительность и текущую отметку запуска.
- [Строка 204](../demo/src/extensions/html-surface/samples.ts#L204) — Сбрасывает отметку запуска, когда пользователь останавливает отсчёт.
- [Строка 241](../demo/src/extensions/html-surface/samples.ts#L241) — Инициализирует карточку цели.
- [Строка 261](../demo/src/extensions/html-surface/samples.ts#L261) — Увеличивает значение.
- [Строка 266](../demo/src/extensions/html-surface/samples.ts#L266) — Уменьшает значение.
- [Строка 294](../demo/src/extensions/html-surface/samples.ts#L294) — Инициализирует цитату.
- [Строка 331](../demo/src/extensions/html-surface/samples.ts#L331) — Инициализирует выбор настроения.
- [Строка 336](../demo/src/extensions/html-surface/samples.ts#L336) — Отмечает активную кнопку.
- [Строка 343](../demo/src/extensions/html-surface/samples.ts#L343) — Назначает действие каждой кнопке.
- [Строка 344](../demo/src/extensions/html-surface/samples.ts#L344) — Записывает выбранное настроение.
- [Строка 375](../demo/src/extensions/html-surface/samples.ts#L375) — Инициализирует вращающийся круг.
- [Строка 414](../demo/src/extensions/html-surface/samples.ts#L414) — Инициализирует часы.
- [Строка 460](../demo/src/extensions/html-surface/samples.ts#L460) — Инициализирует счётчик.
- [Строка 473](../demo/src/extensions/html-surface/samples.ts#L473) — Увеличивает и сохраняет счётчик.
- [Строка 508](../demo/src/extensions/html-surface/samples.ts#L508) — Инициализирует индикатор.

</details>

### [demo/src/extensions/html-surface/animated-samples.ts](../demo/src/extensions/html-surface/animated-samples.ts#L4)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`WEEKLY_PROGRESS_HTML` · 4](../demo/src/extensions/html-surface/animated-samples.ts#L4) | Недельная диаграмма с сохранением завершённых сессий. | [samples.ts:561](../demo/src/extensions/html-surface/samples.ts#L561) |
| [`paint` · 38](../demo/src/extensions/html-surface/animated-samples.ts#L38) | Перерисовывает столбцы по данным недельного прогресса. | [animated-samples.ts:52](../demo/src/extensions/html-surface/animated-samples.ts#L52) |
| [`ORBIT_HTML` · 57](../demo/src/extensions/html-surface/animated-samples.ts#L57) | Анимированная орбита с сохранением состояния движения. | [samples.ts:599](../demo/src/extensions/html-surface/samples.ts#L599) |
| [`paint` · 79](../demo/src/extensions/html-surface/animated-samples.ts#L79) | Включает или останавливает анимацию орбиты по снимку. | [animated-samples.ts:85](../demo/src/extensions/html-surface/animated-samples.ts#L85) |

<details>
<summary>Встроенные функции и обработчики (6)</summary>

- [Строка 26](../demo/src/extensions/html-surface/animated-samples.ts#L26) — Инициализирует недельную диаграмму.
- [Строка 30](../demo/src/extensions/html-surface/animated-samples.ts#L30) — Создаёт столбец дня.
- [Строка 41](../demo/src/extensions/html-surface/animated-samples.ts#L41) — Обновляет высоту и подпись столбца.
- [Строка 48](../demo/src/extensions/html-surface/animated-samples.ts#L48) — Записывает очередную сессию.
- [Строка 77](../demo/src/extensions/html-surface/animated-samples.ts#L77) — Инициализирует орбиту.
- [Строка 84](../demo/src/extensions/html-surface/animated-samples.ts#L84) — Переключает движение.

</details>

### [demo/src/extensions/html-surface/interactive-samples.ts](../demo/src/extensions/html-surface/interactive-samples.ts#L4)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [`PRIORITY_BOARD_HTML` · 4](../demo/src/extensions/html-surface/interactive-samples.ts#L4) | Доска задач с перестановкой внутри iframe мышью и кнопками. | [samples.ts:541](../demo/src/extensions/html-surface/samples.ts#L541), [samples.ts:617](../demo/src/extensions/html-surface/samples.ts#L617) |
| [`addTask` · 27](../demo/src/extensions/html-surface/interactive-samples.ts#L27) | Хранит действие формы до получения первого снимка. | [interactive-samples.ts:30](../demo/src/extensions/html-surface/interactive-samples.ts#L30), [interactive-samples.ts:190](../demo/src/extensions/html-surface/interactive-samples.ts#L190) |
| [`save` · 45](../demo/src/extensions/html-surface/interactive-samples.ts#L45) | Обновляет список и записывает порядок в props. | [interactive-samples.ts:63](../demo/src/extensions/html-surface/interactive-samples.ts#L63), [interactive-samples.ts:192](../demo/src/extensions/html-surface/interactive-samples.ts#L192) |
| [`move` · 57](../demo/src/extensions/html-surface/interactive-samples.ts#L57) | Переставляет задачу и восстанавливает фокус на её кнопке. | [interactive-samples.ts:93](../demo/src/extensions/html-surface/interactive-samples.ts#L93), [interactive-samples.ts:172](../demo/src/extensions/html-surface/interactive-samples.ts#L172) |
| [`render` · 75](../demo/src/extensions/html-surface/interactive-samples.ts#L75) | Создаёт строки задач и кнопки перестановки. | [interactive-samples.ts:47](../demo/src/extensions/html-surface/interactive-samples.ts#L47), [interactive-samples.ts:109](../demo/src/extensions/html-surface/interactive-samples.ts#L109) |
| [`apply` · 105](../demo/src/extensions/html-surface/interactive-samples.ts#L105) | Применяет новый список, сохраняя DOM и фокус при равных данных. | [interactive-samples.ts:196](../demo/src/extensions/html-surface/interactive-samples.ts#L196) |
| [`mark` · 117](../demo/src/extensions/html-surface/interactive-samples.ts#L117) | Показывает место вставки относительно строки. | [interactive-samples.ts:145](../demo/src/extensions/html-surface/interactive-samples.ts#L145), [interactive-samples.ts:161](../demo/src/extensions/html-surface/interactive-samples.ts#L161) |
| [`targetRow` · 135](../demo/src/extensions/html-surface/interactive-samples.ts#L135) | Находит строку под захваченным указателем в координатах iframe. | [interactive-samples.ts:161](../demo/src/extensions/html-surface/interactive-samples.ts#L161), [interactive-samples.ts:168](../demo/src/extensions/html-surface/interactive-samples.ts#L168) |
| [`endDrag` · 144](../demo/src/extensions/html-surface/interactive-samples.ts#L144) | Снимает маркер и захват указателя. | [interactive-samples.ts:78](../demo/src/extensions/html-surface/interactive-samples.ts#L78), [interactive-samples.ts:170](../demo/src/extensions/html-surface/interactive-samples.ts#L170), [interactive-samples.ts:177](../demo/src/extensions/html-surface/interactive-samples.ts#L177), [interactive-samples.ts:182](../demo/src/extensions/html-surface/interactive-samples.ts#L182) |
| [`addTask` · 190](../demo/src/extensions/html-surface/interactive-samples.ts#L190) | После инициализации добавляет непустую задачу из формы. | [interactive-samples.ts:27](../demo/src/extensions/html-surface/interactive-samples.ts#L27), [interactive-samples.ts:30](../demo/src/extensions/html-surface/interactive-samples.ts#L30) |
| [`MIXER_HTML` · 201](../demo/src/extensions/html-surface/interactive-samples.ts#L201) | Микшер с мелодией Web Audio и регулятором громкости. | [samples.ts:546](../demo/src/extensions/html-surface/samples.ts#L546), [samples.ts:611](../demo/src/extensions/html-surface/samples.ts#L611) |
| [`renderPlayback` · 241](../demo/src/extensions/html-surface/interactive-samples.ts#L241) | Согласует кнопку воспроизведения с состоянием аудио. | [interactive-samples.ts:284](../demo/src/extensions/html-surface/interactive-samples.ts#L284), [interactive-samples.ts:333](../demo/src/extensions/html-surface/interactive-samples.ts#L333), [interactive-samples.ts:348](../demo/src/extensions/html-surface/interactive-samples.ts#L348), [interactive-samples.ts:371](../demo/src/extensions/html-surface/interactive-samples.ts#L371) |
| [`applyVolume` · 251](../demo/src/extensions/html-surface/interactive-samples.ts#L251) | Меняет усиление звучащего микшера во время движения ползунка. | [interactive-samples.ts:326](../demo/src/extensions/html-surface/interactive-samples.ts#L326), [interactive-samples.ts:367](../demo/src/extensions/html-surface/interactive-samples.ts#L367), [interactive-samples.ts:373](../demo/src/extensions/html-surface/interactive-samples.ts#L373) |
| [`stopSound` · 262](../demo/src/extensions/html-surface/interactive-samples.ts#L262) | Останавливает воспроизведение и освобождает аудиоресурсы. | [interactive-samples.ts:339](../demo/src/extensions/html-surface/interactive-samples.ts#L339), [interactive-samples.ts:353](../demo/src/extensions/html-surface/interactive-samples.ts#L353) и др. |
| [`schedulePhrase` · 291](../demo/src/extensions/html-surface/interactive-samples.ts#L291) | Планирует ноты следующей фразы по часам AudioContext. | [interactive-samples.ts:343](../demo/src/extensions/html-surface/interactive-samples.ts#L343), [interactive-samples.ts:344](../demo/src/extensions/html-surface/interactive-samples.ts#L344), [interactive-samples.ts:345](../demo/src/extensions/html-surface/interactive-samples.ts#L345) |
| [`startSound` · 312](../demo/src/extensions/html-surface/interactive-samples.ts#L312) | Создаёт и запускает аудио при пользовательском действии. | [interactive-samples.ts:379](../demo/src/extensions/html-surface/interactive-samples.ts#L379) |
| [`apply` · 365](../demo/src/extensions/html-surface/interactive-samples.ts#L365) | Обновляет интерфейс микшера по снимку виджета. | [interactive-samples.ts:383](../demo/src/extensions/html-surface/interactive-samples.ts#L383) |

<details>
<summary>Встроенные функции и обработчики (19)</summary>

- [Строка 28](../demo/src/extensions/html-surface/interactive-samples.ts#L28) — Отправляет форму после инициализации.
- [Строка 32](../demo/src/extensions/html-surface/interactive-samples.ts#L32) — Инициализирует список и его жесты.
- [Строка 82](../demo/src/extensions/html-surface/interactive-samples.ts#L82) — Создаёт строку.
- [Строка 87](../demo/src/extensions/html-surface/interactive-samples.ts#L87) — Создаёт кнопки для двух направлений.
- [Строка 93](../demo/src/extensions/html-surface/interactive-samples.ts#L93) — Перемещает задачу кнопкой.
- [Строка 106](../demo/src/extensions/html-surface/interactive-samples.ts#L106) — Оставляет строковые задачи.
- [Строка 107](../demo/src/extensions/html-surface/interactive-samples.ts#L107) — Проверяет, сохранился ли порядок.
- [Строка 151](../demo/src/extensions/html-surface/interactive-samples.ts#L151) — Захватывает строку по указателю.
- [Строка 159](../demo/src/extensions/html-surface/interactive-samples.ts#L159) — Обновляет место вставки.
- [Строка 164](../demo/src/extensions/html-surface/interactive-samples.ts#L164) — Фиксирует порядок при отпускании.
- [Строка 175](../demo/src/extensions/html-surface/interactive-samples.ts#L175) — Отменяет жест после потери захвата.
- [Строка 180](../demo/src/extensions/html-surface/interactive-samples.ts#L180) — Обрабатывает отмену с клавиатуры.
- [Строка 221](../demo/src/extensions/html-surface/interactive-samples.ts#L221) — Инициализирует микшер.
- [Строка 280](../demo/src/extensions/html-surface/interactive-samples.ts#L280) — Завершает обработку ошибки закрытия аудио.
- [Строка 297](../demo/src/extensions/html-surface/interactive-samples.ts#L297) — Планирует очередную ноту.
- [Строка 334](../demo/src/extensions/html-surface/interactive-samples.ts#L334) — Продолжает запуск после возобновления AudioContext.
- [Строка 349](../demo/src/extensions/html-surface/interactive-samples.ts#L349) — Обрабатывает отказ запуска аудио.
- [Строка 374](../demo/src/extensions/html-surface/interactive-samples.ts#L374) — Сохраняет итоговую громкость.
- [Строка 375](../demo/src/extensions/html-surface/interactive-samples.ts#L375) — Переключает воспроизведение.

</details>

### [demo/src/extensions/html-surface/unsafe-samples.ts](../demo/src/extensions/html-surface/unsafe-samples.ts#L4)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| интерфейс [`UnsafeHtmlSample` · 4](../demo/src/extensions/html-surface/unsafe-samples.ts#L4) | Демо-описание Unsafe HTML с ключом `sample`, исходником и текстом предшествующего абзаца. Ключ помогает найти ID экземпляра после заполнения документа. | [unsafe-samples.ts:44](../demo/src/extensions/html-surface/unsafe-samples.ts#L44) |
| [`unsafeExample` · 19](../demo/src/extensions/html-surface/unsafe-samples.ts#L19) | Собирает пример изменения предыдущего блока через выбранную область доступа. | [unsafe-samples.ts:45](../demo/src/extensions/html-surface/unsafe-samples.ts#L45), [unsafe-samples.ts:49](../demo/src/extensions/html-surface/unsafe-samples.ts#L49) |
| [`UNSAFE_HTML_SAMPLES` · 44](../demo/src/extensions/html-surface/unsafe-samples.ts#L44) | Две версии одного действия через panel и reactEditor. | [seed.ts:143](../demo/src/extensions/html-surface/seed.ts#L143) |

<details>
<summary>Встроенные функции и обработчики (1)</summary>

- [Строка 29](../demo/src/extensions/html-surface/unsafe-samples.ts#L29) — Изменяет текст предыдущего блока по нажатию.

</details>

### Ping Pong

`1fe2e673` добавил Ping Pong в набор демонстрационных Page-блоков. Игра показывает, что обработка мыши, клавиш, анимации и счёта может целиком жить внутри iframe. Состояние игры локально для загруженного экземпляра HTML. Игра не вызывает `rivto.setProp` и не требует доступа Unsafe HTML. [Регистрация примера](../demo/src/extensions/html-surface/samples.ts#L570)

| Декларация | Что делает и зачем нужна | Где используется |
| --- | --- | --- |
| [PING_PONG_HTML](../demo/src/extensions/html-surface/ping-pong.ts#L2) | Хранит разметку, стили и скрипт демовиджета. Ракетка обрабатывает перетаскивание с захватом указателя и клавиши стрелок. | [samples.ts:572](../demo/src/extensions/html-surface/samples.ts#L572), [ping-pong.ts:195](../demo/src/extensions/html-surface/ping-pong.ts#L195), [ping-pong.ts:231](../demo/src/extensions/html-surface/ping-pong.ts#L231) |
| [movePaddle](../demo/src/extensions/html-surface/ping-pong.ts#L76) и [endDrag](../demo/src/extensions/html-surface/ping-pong.ts#L86) | Первая функция двигает ракетку к цели в пределах поля. Вторая очищает состояние drag и отпускает захват указателя, если он ещё у ракетки. | [ping-pong.ts:162](../demo/src/extensions/html-surface/ping-pong.ts#L162), [ping-pong.ts:166](../demo/src/extensions/html-surface/ping-pong.ts#L166), [ping-pong.ts:113](../demo/src/extensions/html-surface/ping-pong.ts#L113), [ping-pong.ts:226](../demo/src/extensions/html-surface/ping-pong.ts#L226) |
| [finishPoint](../demo/src/extensions/html-surface/ping-pong.ts#L101) и [advanceBall](../demo/src/extensions/html-surface/ping-pong.ts#L122) | Рассчитывают движение мяча, отражения и попадания в ракетку. Когда мяч выходит за поле, начисляется очко, мяч возвращается в центр, а игра ждёт следующей подачи. | [ping-pong.ts:147](../demo/src/extensions/html-surface/ping-pong.ts#L147), [ping-pong.ts:168](../demo/src/extensions/html-surface/ping-pong.ts#L168) |
| [tick](../demo/src/extensions/html-surface/ping-pong.ts#L157) и [serve](../demo/src/extensions/html-surface/ping-pong.ts#L184) | `serve` запускает розыгрыш, если он ещё не идёт. `tick` ограничивает время одного шага, обновляет координаты и ставит следующий кадр только пока розыгрыш активен. | [ping-pong.ts:175](../demo/src/extensions/html-surface/ping-pong.ts#L175), [ping-pong.ts:191](../demo/src/extensions/html-surface/ping-pong.ts#L191), [ping-pong.ts:220](../demo/src/extensions/html-surface/ping-pong.ts#L220), [ping-pong.ts:236](../demo/src/extensions/html-surface/ping-pong.ts#L236) |

<a id="step-10"></a>

## 10. Правила разработки и история ревью

Эти документы объясняют требования к расширениям и причины некоторых решений в коде. Три заметки ревью описывают более раннее состояние ветки: для сегодняшних имён и расположения деклараций используйте ссылки из разделов выше.

### [AGENTS.md](../AGENTS.md#L69)

- [Строка 69](../AGENTS.md#L69) — Лимиты и пороги расширения должны настраиваться через фабрику, с проверками и описанием значений по умолчанию.

### [.agents/skills/rivto-blocks/SKILL.md](../.agents/skills/rivto-blocks/SKILL.md#L230)

- [Строка 230](../.agents/skills/rivto-blocks/SKILL.md#L230) — Правила для интерактивных контролов блока и переход к руководству по iframe.

### [.agents/skills/rivto-elements/SKILL.md](../.agents/skills/rivto-elements/SKILL.md#L254)

- [Строка 254](../.agents/skills/rivto-elements/SKILL.md#L254) — Связь между контрактом элемента холста и правилами для HTML-содержимого.

### [.agents/skills/rivto-html-extensions/SKILL.md](../.agents/skills/rivto-html-extensions/SKILL.md#L1)

- [Строка 1](../.agents/skills/rivto-html-extensions/SKILL.md#L1) — Руководство по реализации HTML-расширений, протоколу и распределению жестов между хостом и iframe.

### [dev_notes/html-surface-review-against-main.md](../dev_notes/html-surface-review-against-main.md#L1)

- [Строка 1](../dev_notes/html-surface-review-against-main.md#L1) — Исходные замечания к предыдущей версии реализации.

### [dev_notes/html-surface-review-todo.md](../dev_notes/html-surface-review-todo.md#L1)

- [Строка 1](../dev_notes/html-surface-review-todo.md#L1) — Исторический перечень задач по замечаниям.

### [dev_notes/html-surface-review-fixes-ru.md](../dev_notes/html-surface-review-fixes-ru.md#L1)

- [Строка 1](../dev_notes/html-surface-review-fixes-ru.md#L1) — Как исправлялись замечания и какие сценарии их мотивировали. Часть ссылок ведёт на прежнюю структуру каталогов.
