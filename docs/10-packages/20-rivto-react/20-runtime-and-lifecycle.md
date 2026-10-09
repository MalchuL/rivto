# React runtime и lifecycle

## `createEditorRuntime(options)`

- **Аргументы:** `options: CreateEditorRuntimeOptions`.
- **Возвращает:** `EditorRuntime`.
- **Исключения:** registration conflicts, duplicate extension IDs, invalid setup и ошибки пользовательского `setup()`.

Managers создаются до extensions. При ошибке setup уже созданные registrations очищаются.

### `CreateEditorRuntimeOptions`

- **`editor: RivtoEditorApi`:** обязательный core, постоянно связанный с одним документом. Caller или EditorStorage владеет его lifecycle.
- **`extensions?: readonly ReactEditorExtension[]`:** устанавливаются синхронно в declaration order.
- **`keymap?: KeymapOverrides`:** overrides по binding ID; `[]` отключает binding.
- **`unknownBlockRenderer?: BlockRenderer`:** fallback для persisted type без renderer.

## `EditorView`

### Properties

- **`runtime: EditorRuntime`:** общий runtime документа, принадлежащий host.
- **`children?: ReactNode`:** application chrome рядом с extension UI и surface.

### Вызов

- **Аргументы:** `EditorViewProps`.
- **Возвращает:** context providers без собственного DOM wrapper.
- **Исключения:** `No React surface is registered for editor mode <mode>` либо ошибки rendering.

View подписывается на загрузку документа и React registries. Surface задаётся явно через children: `<PageSurface />` или `<EdgelessSurface />`; режим не хранится в редакторе.

## `EditorStorageContext`

`<EditorStorageContext.Provider value={editors}>` передаёт host-owned кеш
представлениям и вложенным embedding. EditorRuntime хранит свой core и не содержит ссылку на storage; EditorViewApi
связывает этот runtime с конкретным отображением. Каждый пользователь может предоставить собственный
кеш; вложенные views используют ближайший provider. Provider не создаёт storage
и не уничтожает его: application явно вызывает `editors.destroy()` при cleanup.
Обычные команды обращаются напрямую к единственному core, без поиска документа.
Без provider standalone view использует caller-owned editor, а embedding сообщает,
что resolution недоступен. Provider требуется для автоматического retain/release.

## Properties `EditorViewApi`

- **`revision: number`:** core revision getter.
- **`createDefaultBlock: CreateDefaultBlock`:** writing factory; throws до установки writing extension.
- **`isEmptyBlock: IsEmptyBlock`:** empty predicate; throws до установки writing extension.
- **`renderers`, `blocks`, `clipboard`, `surfaces`, `extensions`, `events`, `keyboard`, `selection`, `slashCommands`:** focused public capabilities.

Чтение properties безопасно; их operations могут валидировать registrations и payloads.

## Methods `EditorViewApi`

### `installDefaultWriting(options)`

- **Аргументы:** `{ createDefaultBlock; isEmptyBlock }`.
- **Возвращает:** `void`.
- **Исключения:** отсутствуют для корректных function values.

Обычно вызывается `defaultWritingBlockExtension()`, не application.

### `subscribe(listener)`

- **Аргументы:** `listener: () => void`.
- **Возвращает:** unsubscribe function.
- **Исключения:** core subscription либо listener errors.

Метод делегирует core stream; renderer/surface registries имеют отдельные revisions.

Одновременно разрешено несколько distinct listeners; новая подписка не заменяет предыдущую. Поскольку delegation ведёт в core `Listeners` с `Set`, одинаковая function reference регистрируется эффективно один раз. Для разных независимых consumers передавайте разные callbacks и храните каждый returned disposer.

Disposer idempotent и удаляет только соответствующую function. Immediate notification при подписке отсутствует. `EditorViewApi.subscribe()` сообщает только core runtime revisions; изменения React-only renderer/surface/extension registries нужно слушать через их собственные `subscribe()` streams.

### Core mode и отображаемая поверхность

`editorRuntime.mode` — общий для документа core ModeManager. Он определяет выбор
основной presentation и сохраняет независимый stream изменений.
`editorRuntime.events.getSurfaceType()` — метод чтения типа отображаемой поверхности: у view это его
собственная поверхность, у общего runtime — активный view. Без mounted view
возвращается core mode. Page embedding остаётся `block`, когда тот же документ
открыт в `edgeless`; дополнительное состояние режима не сохраняется.
EventManager читает тип поверхности из DOM root текущего view и
записывает его один раз в `event.mode`, handlers используют полученный snapshot.
Команды вне DOM dispatch могут читать `events.getSurfaceType()`, если поведение
зависит от отображаемого view. Для выбора presentation всего документа используйте
`mode.get()`. Общие surface registries
и их identity остаются прежними; дополнительных manager wrappers нет.

### `getDocument()` и `EditorView`

`getDocument()` всегда возвращает модель этого редактора, включая вызовы до mount
и после await. EditorViewApi предоставляет focused managers своего core без
getter для core. Все managers постоянно связаны с ним; selection и history
независимы от других документов. Storage создаёт и хранит core и передаёт его
в `createEditor(editor)`; последующее уничтожение core остаётся обязанностью storage.
`EditorViewController`, принадлежащий компоненту `EditorView`, ограничивает DOM
events и selection одним displayed occurrence, сохраняя document managers и
registrations этого EditorViewApi. Контроллер создаёт локальные adapters, регистрирует
DOM root и освобождает их при unmount; публичного `EditorViewApi.getView()` больше нет.

`EditorView` принимает уже выбранный EditorViewApi без documentId. При наличии `EditorStorageContext.Provider`
view автоматически получает отдельный consumer и освобождает его при unmount,
включая вложенные embedding views. Для открытия другого документа используйте
`await editors.acquireEditor(id)` или `await editors.getSingleEditor(id)`.
Последний сохраняет explicit ownership до `editors.closeEditor(id)`.
Embedding хранит document ID и block ID и сначала проверяет указанный документ.
При отсутствии блока resolver ищет в остальных известных документах без загрузки
их содержимого, показывает первый по сортировке ID и сообщает неоднозначность.
Приложение может переопределить resolver; найденный адрес не меняет props ссылки. Обычный
renderer вызывает `blocks.updateBlock(id, patch)` своего редактора без resolver.

### `destroy()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** custom extension cleanup errors.

Повторный вызов безопасен. Уничтожаются React subscriptions/extensions/built-ins/slash/keyboard/events; core и модель остаются у lifecycle owner. Для кеша дождитесь `editors.destroy()`, который сначала уничтожает каждый EditorViewApi, затем core, затем модель и providers. После этого host уничтожает DocumentStorage. Без кеша host сам вызывает React cleanup, core.destroy и await model.destroy.

## Автоматическая reconciliation

Runtime подписан на root/elements updates своего документа и через `queueMicrotask()` объединяет updates перед восстановлением edgeless block-element projection. Host ничего дополнительно не вызывает.

`useEditorView()` возвращает экземпляр отображения. Его `runtime` общий для
повторных отображений документа. `EditorViewController` владеет acquisition и
локальными registrations; `EditorViewApi.destroy()` отменяет DOM-задачи отображения,
а `EditorRuntime.destroy()` освобождает общие расширения и менеджеры.
