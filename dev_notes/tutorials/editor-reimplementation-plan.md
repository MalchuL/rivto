# План переимплементации editor

Этот план нужен для ситуации, когда слой `src/editor` очищен или почти очищен и
его нужно собрать заново поверх уже существующего `DocumentModel`. Идём маленькими
вертикальными срезами: каждая фаза должна компилироваться, иметь тесты и давать
понятный результат в demo.

## 0. Зафиксировать границы

Цель: не смешать данные документа, runtime-состояние и React UI.

1. Принять `DocumentModelImpl` как единственный source of truth для блоков,
   текста, children, layout, links и plugin data.
2. Договориться, что локальное состояние редактора не пишется в документ:
   режим `block | edgeless`, selection, focus, открытые меню, hover, viewport.
3. Оставить правило мутаций: UI и plugins не меняют модель напрямую, а вызывают
   команды runtime.
4. Проверить публичные exports в `src/index.ts`, чтобы новый editor не ломал
   внешний API без явного решения.

Готово, когда есть короткий список публичных типов editor и понятно, какие
модули имеют право импортировать `DocumentModelImpl`.

## 1. Собрать минимальное ядро runtime

Цель: получить компилируемый `EditorRuntime`, который умеет создать документ,
подписаться на изменения и уничтожиться.

1. Создать `src/editor/editor/types.ts` с базовыми типами:
   `EditorMode`, `CreateRivtoEditorOptions`, `RivtoEditorApi`.
2. Создать `src/editor/editor/rivto-editor.ts` с классом `EditorRuntime`.
3. В конструкторе принять существующий `CRDTDoc` или создать `YjsDoc`.
4. Добавить `revision`, `subscribe(listener)`, приватный `changed()` и
   `destroy()`.
5. Подписать runtime на `document.subscribe`, чтобы любые изменения модели,
   включая изменения от AI или collaboration, инвалидировали renderer.
6. Экспортировать runtime через `src/editor/editor/index.ts` и `src/editor/index.ts`.

Готово, когда `pnpm check-types` проходит, а unit-тест подтверждает, что
изменение `DocumentModelImpl` увеличивает `revision` и вызывает listener.

## 2. Восстановить BlockRegistry

Цель: отделить persisted block type от renderer и validation.

1. Создать `src/editor/blocks/block-definition.ts` с `BlockDefinition` и
   `BlockRenderProps`.
2. Создать `src/editor/blocks/block-registry.ts`.
3. Реализовать `register`, `get`, `has`, `getRenderer`, `prepare`, `validate`.
4. Поддержать `defaultProps` и `propSchema` через `zod`.
5. Сохранять unknown block types в документе без потери данных, но запрещать
   создание unknown block через editor command.
6. Добавить минимальные native definitions: `paragraph`, `heading`, `todo`,
   `list`, `code`.

Готово, когда можно зарегистрировать блок, вставить его через runtime-команду и
получить валидированные props в `DocumentModel`.

## 3. Ввести CommandRegistry

Цель: сделать один вход для всех изменений документа.

1. Создать `src/editor/managers/command-registry.ts`.
2. Реализовать `register(name, handler)`, `execute(name, payload)`,
   `unregister`, `clear`.
3. Типизировать built-in commands через `BuiltInCommandMap`.
4. В `EditorRuntime` зарегистрировать команды:
   `block.insert`, `block.update`, `block.remove`, `block.move`,
   `text.set`, `text.insert`, `text.delete`, `block.prop.set`,
   `block.layout.set`, `document.load`.
5. Внутри команд валидировать payload на runtime-границе, потому что команды
   могут прийти не только из TypeScript.
6. Все команды должны делегировать реальные CRDT-операции в `DocumentModelImpl`.

Готово, когда demo может создать runtime, вставить paragraph, изменить текст и
получить snapshot без прямого вызова document mutation из UI.

## 4. Добавить React renderer для block mode

Цель: увидеть документ и редактировать простой текст.

1. Создать `src/editor/react/RivtoEditor.tsx`.
2. Использовать `useSyncExternalStore` для подписки на `runtime.subscribe`.
3. Рендерить root blocks в порядке `DocumentModel`.
4. Для каждого блока выбрать custom renderer из `BlockRegistry` или fallback.
5. Для inline-блоков использовать `contenteditable` и команду `text.set`.
6. Добавить data-атрибуты: `data-rivto-editor`, `data-rivto-block`,
   `data-rivto-block-type`.
7. Не хранить DOM node в runtime.

Готово, когда в demo отображается документ, ввод текста меняет `DocumentModel`,
а внешнее изменение модели перерисовывает React.

## 5. SelectionManager и focus

Цель: получить portable selection, который можно использовать для команд,
clipboard и будущего AI.

1. Создать `SelectionManager` с discriminated union:
   `text`, `block`, `edgeless`.
2. Реализовать `get`, `set`, `clear`, `subscribe`.
3. Добавить в runtime команды `selection.set` и `selection.clear`.
4. Валидировать block IDs и text offsets перед сохранением selection.
5. В React добавить мост из DOM selection в runtime selection для одного
   текстового блока.
6. Добавить `runtime.focus(blockId?)`, который только просит DOM сфокусироваться
   после render commit.

Готово, когда selection переживает rerender, очищается при удалении блока и не
попадает в collaborative document.

## 6. EventRouter и keyboard fallback

Цель: убрать обработку editing-логики из React-компонентов.

1. Создать `RuntimeEvent` и `EventRouter`.
2. React должен только нормализовать DOM events и передать их в router.
3. Добавить fallback для Enter: создать paragraph после текущего блока.
4. Добавить fallback для Backspace на пустом paragraph: удалить блок или
   смержить с предыдущим, если такая операция уже есть в модели.
5. Добавить Tab и Shift+Tab для indent/outdent.
6. Возвращать `true`, если router полностью обработал событие, чтобы React
   вызвал `preventDefault`.

Готово, когда базовые клавиши работают через commands, а не через прямые
изменения в компоненте блока.

## 7. Clipboard

Цель: поддержать copy, cut и paste через document-aware commands.

1. Создать `ClipboardManager`.
2. Для text selection копировать markdown-фрагмент.
3. Для block selection копировать structured JSON плюс plain text fallback.
4. Для paste сначала пробовать structured JSON, затем markdown/plain text.
5. Добавить команды `clipboard.copy`, `clipboard.cut`, `clipboard.paste`,
   `clipboard.copyEvent`, `clipboard.pasteEvent`.
6. Убедиться, что paste создаёт блоки через `block.insert`, а не напрямую через
   модель.

Готово, когда e2e-тест покрывает copy/paste одного блока и paste plain text.

## 8. History

Цель: подключить undo/redo к adapter-neutral CRDT history.

1. Создать `HistoryManager` поверх `CRDTUndoManager`.
2. Добавить локальный transaction origin для текущего runtime.
3. Зарегистрировать команды `history.undo` и `history.redo`.
4. После initial content очистить history, чтобы seed-документ не был первым
   undo-шагом.
5. Не включать remote collaboration updates в локальный undo stack.

Готово, когда undo/redo работает для insert, text edit и remove block.

## 9. Plugins и UIRegistry

Цель: сделать расширения частью runtime, а не набором специальных случаев.

1. Создать `PluginManager`.
2. Описать `RivtoPlugin`: `id`, optional `blocks`, `commands`,
   `eventHandlers`, `ui`, `setup`.
3. Устанавливать plugin атомарно: если одна часть падает, откатить уже
   зарегистрированные contributions.
4. Создать `UIRegistry` для toolbar, side menu и slash menu items.
5. Все UI contributions должны запускать commands, а не callback с прямой
   мутацией документа.
6. Добавить dispose для каждого plugin.

Готово, когда demo-plugin добавляет block type, slash item и toolbar action, а
после dispose всё это исчезает.

## 10. Slash menu и block actions

Цель: вернуть основные UX-инструменты block editor.

1. Slash menu хранит только локальное UI-состояние: открыт/закрыт, query,
   anchor block, выбранный item.
2. Items берутся из `UIRegistry` и фильтруются по mode, query и block type.
3. Выбор item вызывает command.
4. Side menu и block toolbar работают по тем же contribution-правилам.
5. React-компоненты меню не должны знать о деталях `DocumentModel`.

Готово, когда `/` открывает меню, можно вставить heading/todo/code, а plugin
может добавить свой пункт.

## 11. Drag-and-drop в block mode

Цель: переставлять блоки без нарушения дерева документа.

1. Начать с простого reorder root blocks.
2. Затем добавить перенос nested blocks.
3. Hit testing и hover indicator держать в локальном React/UI состоянии.
4. Drop должен вызывать `block.move` или отдельную команду move-to-parent, если
   текущего API модели недостаточно.
5. Проверять запрет циклов: блок нельзя перенести внутрь своего потомка.

Готово, когда e2e-тест переставляет два блока и snapshot показывает новый
порядок.

## 12. Edgeless vertical slice

Цель: не строить весь canvas сразу, а получить минимальный режим.

1. Добавить `ModeManager` и команду `mode.set`.
2. В React выбрать renderer по mode: block tree или edgeless canvas.
3. В edgeless показать блоки с layout `{ x, y, width, height, zIndex }`.
4. Реализовать pan/zoom как локальное состояние renderer.
5. Перемещение объекта вызывает `block.layout.set`.
6. Selection в edgeless хранит IDs выбранных блоков, не DOM state.

Готово, когда один и тот же документ можно переключать между block и edgeless,
а перемещение блока сохраняется в `DocumentModel`.

## 13. Collaboration и providers

Цель: сделать внешний sync подключаемым, а не зашитым в runtime.

1. Создать `ProviderManager`, который принимает adapter-neutral provider.
2. Runtime не должен импортировать конкретный `y-webrtc` provider напрямую.
3. Provider lifecycle должен быть независим от React lifecycle.
4. Проверить, что remote updates вызывают `document.subscribe` и renderer
   обновляется без специальных hooks.

Готово, когда два runtime поверх одного CRDT adapter видят изменения друг друга
через подписку.

## 14. Тестовая лестница

Порядок проверок после каждой фазы:

1. `pnpm check-types`
2. `pnpm test`
3. `pnpm demo:check`
4. Для UI-фаз: `pnpm test:e2e`

Минимальные unit-тесты:

1. runtime subscribe/revision/destroy;
2. command registry duplicate/dispose/execute;
3. block registry defaults/validation/unknown type behavior;
4. selection validation and cleanup;
5. plugin install rollback/dispose;
6. history local undo/redo.

Минимальные e2e-тесты:

1. render initial document;
2. edit paragraph text;
3. insert block with Enter or slash menu;
4. select/copy/paste block;
5. undo/redo text edit;
6. switch block/edgeless mode.

## 15. Рекомендуемый порядок коммитов

1. `editor: restore runtime shell`
2. `editor: add block registry`
3. `editor: add command registry and built-ins`
4. `editor-react: render block mode`
5. `editor: add selection manager`
6. `editor: route keyboard events`
7. `editor: add clipboard commands`
8. `editor: add history manager`
9. `editor: add plugin and ui registries`
10. `editor-react: add slash menu and block actions`
11. `editor-react: add block drag and drop`
12. `editor-react: add edgeless vertical slice`

Главное правило: не переходить к следующей фазе, пока текущая не компилируется и
не имеет хотя бы одного теста на свой главный контракт.
