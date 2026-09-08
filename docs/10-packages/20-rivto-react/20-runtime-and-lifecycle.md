# React runtime и lifecycle

## `createReactEditor(options)`

- **Аргументы:** `options: CreateReactEditorOptions`.
- **Возвращает:** `ReactEditor`.
- **Исключения:** registration conflicts, duplicate extension IDs, invalid setup и ошибки пользовательского `setup()`.

Managers создаются до extensions. При ошибке setup уже созданные registrations очищаются.

### `CreateReactEditorOptions`

- **`editor: RivtoEditorApi`:** обязательный core runtime; React runtime его не уничтожает.
- **`extensions?: readonly ReactEditorExtension[]`:** устанавливаются синхронно в declaration order.
- **`keymap?: KeymapOverrides`:** overrides по binding ID; `[]` отключает binding.
- **`unknownBlockRenderer?: BlockRenderer`:** fallback для persisted type без renderer.

## `EditorView`

### Properties

- **`editor: ReactEditor`:** host-owned React runtime.
- **`children?: ReactNode`:** application chrome рядом с extension UI и surface.

### Вызов

- **Аргументы:** `EditorViewProps`.
- **Возвращает:** context providers без собственного DOM wrapper.
- **Исключения:** `No React surface is registered for editor mode <mode>` либо ошибки rendering.

View подписывается на core revision, mode, surface registry и extension UI. Active surface выбирается по `editor.editor.mode`.

## Properties `ReactEditor`

- **`editor: RivtoEditorApi`:** core runtime.
- **`revision: number`:** core revision getter.
- **`createDefaultBlock: CreateDefaultBlock`:** writing factory; throws до установки writing extension.
- **`isEmptyBlock: IsEmptyBlock`:** empty predicate; throws до установки writing extension.
- **`renderers`, `blocks`, `clipboard`, `surfaces`, `extensions`, `events`, `keyboard`, `selection`, `slashCommands`:** focused public capabilities.

Чтение properties безопасно; их operations могут валидировать registrations и payloads.

## Methods `ReactEditor`

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

Disposer idempotent и удаляет только соответствующую function. Immediate notification при подписке отсутствует. `ReactEditor.subscribe()` сообщает только core runtime revisions; изменения React-only renderer/surface/extension registries нужно слушать через их собственные `subscribe()` streams.

### `destroy()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** custom extension cleanup errors.

Повторный вызов безопасен. Уничтожаются React subscriptions/extensions/slash/keyboard/events, но не core editor.

## Автоматическая reconciliation

Runtime подписан на core document и через `queueMicrotask()` объединяет updates перед восстановлением edgeless block-element projection. Host ничего дополнительно не вызывает.
