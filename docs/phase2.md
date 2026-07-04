Следующий уровень после `DocumentModel` — **Editor Runtime / Editor Core**.

Не renderer, не React-компоненты, не toolbar. Именно **runtime-слой**, который берёт уже существующую модель документа и превращает её в “редактируемую систему”: commands, selection, plugins, modes, history, event routing.

Я бы разложил уровни так:

```txt
Level 0. Storage / Persistence
  Файлы, IndexedDB, backend, sync, snapshots.

Level 1. DocumentModel
  Данные документа: блоки, связи, дерево, props, layout, references.

Level 2. Editor Runtime / Editor Core
  Сессия редактирования: commands, selection, plugins, mode, history, events.

Level 3. Interaction Plugins
  Slash menu, drag-n-drop, block selection, keyboard, clipboard, AI actions.

Level 4. View Model / Render Adapters
  Подготовка DocumentModel к Block Mode / Edgeless Mode rendering.

Level 5. UI Rendering
  React-компоненты, block views, canvas views, overlays, menus, toolbars.

Level 6. App Shell
  Роутинг, layout приложения, side panels, document switcher, auth, settings.
```

Главный ответ: **следующим после `DocumentModel` должен быть `EditorRuntime`**.

---

# 1. Что такое `DocumentModel`

Сейчас у тебя есть слой типа “внутренняя база данных документа”.

Он знает:

```ts
DocumentModel
  blocks
  block props
  block children
  relations
  references
  layouts
  metadata
```

Например:

```ts
document.getBlock(id)
document.getChildren(id)
document.insertBlock(...)
document.updateBlock(...)
document.deleteBlock(...)
document.moveBlock(...)
document.getRelations(...)
document.getLayout(...)
```

Это слой **что есть в документе**.

Но он не должен решать:

* какой блок сейчас выбран;
* открыт ли slash menu;
* какой drag сейчас активен;
* что делает `Enter`;
* какие actions показывать в toolbar;
* как переключиться между Block Mode и Edgeless Mode;
* как обработать paste;
* как применить AI patch;
* какой renderer использовать.

Это уже не ответственность `DocumentModel`.

---

# 2. Следующий уровень: `EditorRuntime`

`EditorRuntime` — это объект сессии редактирования.

Он живёт поверх `DocumentModel`.

```ts
type EditorRuntime = {
  document: DocumentModel

  blocks: BlockRegistry
  commands: CommandRegistry
  plugins: PluginManager

  selection: SelectionManager
  mode: ModeManager
  history: HistoryManager

  events: EventRouter
  ui: UIRegistry
}
```

То есть:

```txt
DocumentModel хранит состояние документа.
EditorRuntime хранит состояние редактора.
```

---

# 3. Что должно быть внутри EditorRuntime

## 3.1 `BlockRegistry`

Это registry всех block types.

```ts
editor.blocks.register(ParagraphBlock)
editor.blocks.register(HeadingBlock)
editor.blocks.register(ImageBlock)
editor.blocks.register(ShapeBlock)
```

Он отвечает за вопросы:

```ts
editor.blocks.get('paragraph')
editor.blocks.getRenderer('paragraph', 'block')
editor.blocks.getRenderer('shape', 'edgeless')
editor.blocks.getSlashItems()
editor.blocks.getToolbarItems(block)
editor.blocks.getBehavior(block.type)
```

`DocumentModel` может знать, что есть блок:

```ts
{
  id: 'b1',
  type: 'callout',
  props: { variant: 'warning' }
}
```

Но только `BlockRegistry` знает:

```txt
callout можно вставлять через slash
callout рендерится в Block Mode
callout рендерится в Edgeless Mode как card
callout имеет toolbar action "change variant"
callout можно drag-n-drop
callout можно summarise через AI
```

---

## 3.2 `CommandRegistry`

Это единая точка изменения документа.

```ts
editor.commands.execute('block.insert', {
  type: 'paragraph',
  after: currentBlockId,
})
```

Команды должны использовать `DocumentModel`, но UI не должен напрямую его мутировать.

Плохо:

```ts
button.onClick = () => {
  document.deleteBlock(blockId)
}
```

Хорошо:

```ts
button.onClick = () => {
  editor.commands.execute('block.delete', { blockId })
}
```

Почему это важно:

* undo/redo;
* plugins;
* AI;
* analytics;
* validation;
* selection update;
* collaboration в будущем;
* одинаковая логика для toolbar, slash, hotkeys, drag-n-drop.

---

## 3.3 `SelectionManager`

Тут живёт editor selection.

```ts
type EditorSelection =
  | TextSelection
  | BlockSelection
  | EdgelessSelection
  | null
```

Например:

```ts
editor.selection.set({
  type: 'block',
  blockIds: ['b1', 'b2', 'b3'],
  anchorBlockId: 'b1',
  focusBlockId: 'b3',
})
```

`DocumentModel` не должен хранить текущий selection. Selection — это runtime state, а не состояние документа.

---

## 3.4 `ModeManager`

Режимы:

```ts
type EditorMode = 'block' | 'edgeless'
```

```ts
editor.mode.set('block')
editor.mode.set('edgeless')
editor.mode.get()
```

Mode влияет на:

* какие blocks доступны;
* какие renderers используются;
* какие plugins активны;
* как работает selection;
* как работает drag-n-drop;
* какие toolbar actions видны.

---

## 3.5 `PluginManager`

Плагины — это расширения editor runtime.

Примеры:

```txt
SlashMenuPlugin
BlockSelectionPlugin
BlockDragDropPlugin
EdgelessSelectionPlugin
EdgelessDragPlugin
KeyboardPlugin
ClipboardPlugin
AIActionsPlugin
ToolbarPlugin
SideMenuPlugin
```

Они должны подключаться к runtime, а не к React напрямую.

```ts
editor.plugins.register(SlashMenuPlugin)
editor.plugins.register(BlockDragDropPlugin)
editor.plugins.register(AIActionsPlugin)
```

---

## 3.6 `EventRouter`

Это слой, который принимает DOM/editor events и отдаёт их plugins/behavior.

Например:

```txt
keydown Enter
  -> EventRouter
  -> SlashMenuPlugin maybe handles
  -> KeyboardPlugin maybe handles
  -> current block behavior handles
  -> fallback behavior
```

Без этого у тебя быстро получится хаос, где каждый блок сам слушает `keydown`, `paste`, `drop`, `pointermove`.

---

# 4. Ключевая граница

Я бы провёл границу так:

```txt
DocumentModel:
  "Что хранится в документе?"

EditorRuntime:
  "Что сейчас происходит в редакторе?"

Renderer:
  "Как это показать?"

UI:
  "Как пользователь с этим взаимодействует?"
```

Пример:

## Пользователь нажал `/`

```txt
UI получает keyboard event
  -> EventRouter
  -> SlashMenuPlugin открывает slash state
  -> UI рендерит SlashMenu
```

`DocumentModel` пока не меняется.

---

## Пользователь выбрал “Callout”

```txt
SlashMenu item
  -> CommandRegistry.execute('block.insert')
  -> DocumentModel.insertBlock(...)
  -> SelectionManager selects new block
  -> Renderer перерисовывает документ
```

---

## Пользователь перетащил блок

```txt
DragDropPlugin tracks pointer
  -> показывает drop indicator
  -> on drop вызывает command 'block.move'
  -> DocumentModel.moveBlock(...)
  -> SelectionManager updates selection
```

---

## AI создал mind map

```txt
AI returns DocumentPatch
  -> CommandRegistry.execute('ai.applyPatch')
  -> validate patch against BlockRegistry
  -> DocumentModel.transact(...)
  -> ModeManager maybe switches to edgeless
  -> SelectionManager selects created blocks
```

---

# 5. Где находится `defineBlock`

`defineBlock` я бы поставил между `DocumentModel` и `EditorRuntime`.

Формально это часть **Editor Runtime definition layer**.

```txt
DocumentModel
  хранит block.type = "callout"

BlockRegistry / defineBlock
  объясняет runtime, что такое "callout"

EditorRuntime
  использует registry для commands/plugins/rendering
```

То есть `defineBlock` не внутри `DocumentModel`.

`DocumentModel` не должен импортировать React-компоненты, toolbar, slash menu, icons и AI actions.

Правильно:

```txt
DocumentModel:
  type: "callout"
  props: { variant: "warning" }

BlockRegistry:
  callout renderer
  callout slash item
  callout toolbar
  callout behavior
  callout AI capabilities
```

---

# 6. Минимальный следующий слой

Я бы начал не со всех plugins, а с вот такого минимального `EditorRuntime`:

```ts
type EditorRuntime = {
  document: DocumentModel

  blocks: BlockRegistry
  commands: CommandRegistry

  selection: SelectionManager
  mode: ModeManager

  plugins: PluginManager
}
```

И первое, что реализовать:

```txt
1. BlockRegistry
2. defineBlock
3. CommandRegistry
4. SelectionManager
5. ModeManager
6. PluginManager skeleton
```

После этого уже можно добавлять:

```txt
7. BlockModeRenderer
8. EdgelessRenderer
9. SlashMenuPlugin
10. DragDropPlugin
11. ToolbarPlugin
12. AI actions
```

---

# 7. Итоговая структура уровней

Я бы выбрал такую архитектуру:

```txt
┌────────────────────────────────────────────┐
│ App Shell                                  │
│ Pages, routes, layout, document loading    │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ UI Layer                                   │
│ React components, menus, toolbar, overlays │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Render Layer                               │
│ BlockModeRenderer, EdgelessRenderer        │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Interaction Plugins                        │
│ Slash, drag, selection, keyboard, AI        │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Editor Runtime / Editor Core               │
│ Commands, plugins, mode, selection, events │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Block Definition Layer                     │
│ defineBlock, BlockRegistry, block behavior │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ DocumentModel                              │
│ Blocks, links, tree, props, layout, graph   │
└────────────────────────────────────────────┘
```

Если совсем коротко:

**Следующий уровень после `DocumentModel` — `EditorRuntime`, но перед полноценным runtime тебе нужен `BlockRegistry/defineBlock` как semantic layer, который объясняет редактору, что означают типы блоков из DocumentModel.**
