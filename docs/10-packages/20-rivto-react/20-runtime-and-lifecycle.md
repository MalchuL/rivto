# ReactEditor, ReactPanelApi и время жизни

## Слои API

- `DocumentEditorAPI` — операции над полным документом: blocks, elements, commands,
  selection, clipboard, history, snapshots и subscriptions. Корни панели сюда не передаются.
- `ReactEditor` реализует `ReactEditorApi extends DocumentEditorAPI`: blocks, elements, history
  и другие core-возможности доступны непосредственно. Дополнительные
  менеджеры регистрируют renderers, block types/behaviors, surfaces, extensions,
  DOM events, keyboard bindings, clipboard formats и slash commands.
- `PanelAPI` — framework-neutral API ограниченного дерева: `document`, `blocks`, `elements`,
  `rootBlockId`, `rootElementId`. Реализации `ChildrenPanel` и `EmbeddingPanel` находятся в core.
- `ReactPanelApi extends PanelAPI` — API одного отображения. `editor` указывает на общий ReactEditorApi;
  ограниченные blocks/elements доступны непосредственно. Selection, mode, events, keyboard, clipboard, edgeless и
  slash execution привязаны к отображению.

## `useReactEditor(options)`

`document: DocumentModel` обязателен. `extensions`, `keymap` и `unknownBlockRenderer`
передаются ReactEditor. `onError` получает ошибки setup и cleanup.

Hook создаёт core и ReactEditor после commit. Брошенный render не создаёт ресурсов.
StrictMode cleanup уничтожает созданную пару перед повторным setup. Замена document
возвращает loading, освобождает старую пару и создаёт новую. При unmount освобождаются
React resources и core, но не переданная модель. Её время жизни остаётся у приложения.

Результат — discriminated union:

- `{ status: "loading" }` — editor отсутствует;
- `{ status: "ready", editor: ReactEditorApi }` — готовая общая инфраструктура;
- `{ status: "error", error }` — ошибка создания; частичные ресурсы очищены.

Один hook обслуживает несколько EditorPanel одного документа. Extensions и keymap
фиксируются на время жизни document; для их замены перемонтируйте владельца через key.
Preset и surface не выбираются автоматически.

## Создание экземпляров в React

ReactEditor и ReactPanel нельзя создавать вручную в React-компонентах, включая
render, useMemo и initializer useState. Редактор создаёт useReactEditor после
commit; панель создаёт эффект внутреннего компонента ReactPanelProvider в EditorPanel/EditorEmbed.
useReactPanel читает существующую панель из контекста и не создаёт новую.

Конструктор ReactPanel подключает проекцию и подписки. Cleanup эффекта вызывает
panel.destroy(); при StrictMode replay создаётся новый экземпляр. Метода
attachToEditor больше нет. До эффекта, при замене editor/корней и при SSR панель
возвращает loading и не рендерит дочерние поверхности. Уничтоженная панель повторно
не используется; освобождение одной панели не уничтожает общий редактор.

## `createReactEditor(options)`

Фабрика предназначена для useReactEditor, управляемой инфраструктуры EditorStorage
и внутренних тестов; React-компоненты не создают через неё экземпляры вручную.
Низкоуровневая фабрика принимает обязательный `editor: DocumentEditorAPI` и необязательные
`extensions`, `keymap`, `unknownBlockRenderer`. Возвращает ReactEditor.
Managers создаются до setup расширений; extensions устанавливаются в порядке объявления.
Ошибка setup очищает уже созданные registrations. Дубликаты extension IDs и конфликтующие
регистрации приводят к исключению. Core и модель остаются у вызывающего владельца.

`defaultWritingBlockFactory.createEmptyBlock()`, `defaultWritingBlockFactory.isBlock()` и
`defaultWritingBlockFactory.isEmptyBlock()` выбрасывают исключение до установки writing extension.
`installDefaultWriting(defaultWritingBlockFactory)` возвращает disposer,
восстанавливающий предыдущие factories. Обычно его вызывает defaultWritingBlockExtension.

`destroy()` идемпотентен. Отменяет DOM restoration, снимает extensions и shared registrations,
затем остальные React subscriptions. Все disposers вызываются даже при ошибке одного;
ошибки собираются и передаются вызывающему. Core и модель уничтожаются отдельно владельцем.

## EditorPanel и две реализации PanelAPI

EditorPanel принимает `editor: ReactEditorApi`, явно выбранную surface в children,
необязательные `rootBlockId`, `rootElementId`, `mode` и `active`.

- `EditorPanel` — дети блока или корни документа при отсутствии rootBlockId.
- `EditorEmbed` — обязательный rootBlockId и его потомки.
  Корень можно редактировать и копировать; удаление, перемещение и удаление через merge/cut запрещены.

Обе реализации независимо выбирают element tree через rootElementId. Null означает
корни документа; ID — потомков контейнера без самого контейнера. Missing root не
переключает панель на весь документ; undo может вернуть удалённые данные.

`useReactPanel()` возвращает ближайший ReactPanelApi и выбрасывает исключение вне EditorPanel или EditorEmbed.
`usePanel()` возвращает core PanelAPI. Общий DocumentEditorAPI всегда возвращает настоящих родителей. PanelAPI возвращает null
на видимом верхнем уровне. Изменения вне панели отклоняются до записи; batch проверяет
все targets. Insertion destination панели — `{ root: true, beforeId? }` или
`{ parentId: string, beforeId? }`. DocumentEditorAPI использует реальный parentId, включая null.

Mode по умолчанию отдельный для каждой панели. Переданный ModeManager можно разделить
между несколькими панелями явно. Core и ReactEditor не содержат собственного mode.
DOM surface определяется по data-rivto-surface; без DOM панель использует свой mode.
Общий registry без mounted surface возвращает block. Event dispatch фиксирует mode
один раз, handlers читают snapshot события.

Внутренний экземпляр панели владеет локальными listeners, root registration и отложенной DOM selection.
Unmount снимает только их. При StrictMode replay предыдущая панель уничтожается и создаётся новый экземпляр со свежими selection bindings;
старые запланированные callbacks отменяются. Общая portable selection сохраняет прежнюю
семантику владения активным отображением. subscribeDeactivation закрывает локальный UI.

## EditorStorage и embedding

`acquireEditor(id, { signal? })` загружает документ и возвращает
`{ editor: ReactEditorApi, document: DocumentModel, release }`. Каждый вызов удерживает
свою ссылку; release идемпотентен. Последний release уничтожает ReactEditor, core и model.
Параллельные acquisitions разделяют одну загрузку. Abort ожидающего consumer освобождает
только его ссылку; после успешного acquire требуется вызвать release явно.
Ошибочную загрузку можно повторить. Shutdown очищает даже поздно завершившиеся загрузки.

`getEditor(id)`, `getEditors()` и `getDocuments()` не загружают документы.
Методов openCoreEditor/releaseCoreEditor и отдельного explicit ownership больше нет.
Операции core доступны непосредственно через acquisition.editor. Cache loader передаёт владение моделью
storage; factory обязана обернуть именно переданный core.

EditorPanel не получает дополнительный acquisition из context. Владелец сохраняет
acquisition до размонтирования всех зависимых panels; onReady его не освобождает.
EditorStorageContext передаёт кеш вложенным embeddings для загрузки их источников.
Provider сам не создаёт и не уничтожает кеш; приложение вызывает storage.destroy().

`storage.blockReferences.resolveBlock()` и `subscribeBlockLocation()` ищут reference
по загруженным моделям и metadata без приобретения кандидатов. Указанный документ
предпочтителен; fallback сообщает неоднозначность. Применение результата не меняет
сохранённые targetDocumentId/targetBlockId. Сам embedding удерживает acquisition
разрешённого источника и освобождает его при смене target или unmount.

## Подписки

Document revisions читаются через `editor.revision` и
`editor.subscribe(listener)`. Selection имеет отдельный stream.
React registries предоставляют собственные revisions и subscribe; document changes
не заменяют их уведомления. Разные consumers используют разные callbacks и cleanup.
У core Listeners одинаковая function reference эффективно регистрируется один раз;
подписка не вызывает callback немедленно. Возвращённый disposer идемпотентен.
