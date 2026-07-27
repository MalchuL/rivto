# PRD: Block Editor Runtime with Block Mode, Edgeless Mode, Plugins, Commands, Selection, Drag-and-Drop, Slash Menu and AI-ready Architecture

## 1. Summary

Мы разрабатываем frontend runtime для блочного редактора, похожего на BlockSuite / Logseq, с двумя режимами представления одного и того же документа:

* **Block Mode** — линейный outliner/document editor, где блоки идут в иерархическом порядке.
* **Edgeless Mode** — canvas-like режим, где часть блоков может свободно позиционироваться, связываться, группироваться и рендериться как объекты на бесконечной доске.

`DocumentModel` уже реализована и является source of truth для данных документа. Новый runtime должен предоставить слой для регистрации блоков, команд, плагинов, selection, drag-and-drop, slash menu, toolbar/side menu/actions, стилизации и mode-aware rendering.

Главная архитектурная цель: **DocumentModel остаётся моделью данных, а editor runtime становится управляемым слоем поведения, UI и взаимодействий**.

---

## 2. Goals

### 2.1 Product Goals

1. Позволить создавать кастомные блоки через `defineBlock`.
2. Поддержать два режима отображения документа: `block` и `edgeless`.
3. Сделать selection первым классом системы:

   * text selection;
   * block selection;
   * multi-block selection;
   * edgeless object selection.
4. Реализовать drag-and-drop:

   * reorder блоков в Block Mode;
   * move/resize blocks в Edgeless Mode;
   * перенос блоков между контейнерами;
   * вставка внешнего контента через drop.
5. Реализовать slash menu как command-driven систему.
6. Сделать plugin architecture для расширения поведения без переписывания core.
7. Сделать command registry, через который работают toolbar, slash menu, keyboard shortcuts, AI actions и plugins.
8. Сделать registry для toolbar / side menu / block actions.
9. Поддержать кастомизацию поведения блока:
   * enter/backspace handling;
   * paste/drop handling;
   * transform block;
   * rendering only in specific modes.
10. Подготовить архитектуру под AI-фичи, которые взаимодействуют с `DocumentModel` напрямую.
11. За референс можно взять `blocksuite`. Там почти все реализовано, используй его как ориентир, но не копируй архитектуру целиком.
12. Учитывай при реализации, что AI может взаимодействовать с `DocumentModel`, поэтому код не должен игнорировать обновления через CRDT
13. Это должен быть WYSIWYG, т.е. мы можем редактировать текст в блоке, а рендеринг происходить, когда мы не редактируем
---



## 4. Core Principle

Редактор должен быть разделён на четыре слоя:

```txt
DocumentModel
  Source of truth: blocks, props, children, relations, layout data.

Editor Runtime
  Commands, plugins, selection, transactions, registry, event routing.

Rendering Layer
  Block Mode renderer, Edgeless renderer, block views, overlays.

UI Layer
  Toolbar, side menu, slash menu, context menu, drag handles, AI buttons.
```

Главное правило:

**Никакой UI-компонент не должен напрямую мутировать документ. Все изменения идут через commands, которые работают с DocumentModel через единый transaction/update API.**

---

## 5. High-Level Architecture

```txt
┌─────────────────────────────────────────────────────────────┐
│                         App Shell                           │
│  routes, layout, theme provider, document loading, AI panel  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                      Editor Runtime                         │
│                                                             │
│  EditorContext                                               │
│  BlockRegistry                                               │
│  CommandRegistry                                             │
│  PluginManager                                               │
│  SelectionManager                                            │
│  EventRouter                                                 │
│  ModeManager                                                 │
│  History/Undo adapter                                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                       DocumentModel                         │
│  blocks, children, props, text, layout, relations, metadata  │
└──────────────────────────────┬──────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
┌─────────────▼─────────────┐       ┌───────────▼─────────────┐
│      Block Mode View      │       │      Edgeless View      │
│ linear block tree         │       │ canvas / viewport       │
│ outliner interactions     │       │ objects / shapes        │
└─────────────┬─────────────┘       └───────────┬─────────────┘
              │                                 │
┌─────────────▼─────────────────────────────────▼─────────────┐
│                       UI Overlays                            │
│ slash menu, side menu, block toolbar, context menu, handles  │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Key Concepts

### 6.1 Block

Блок — минимальная структурная единица документа.

Примеры:

* paragraph;
* heading;
* todo;
* list item;
* image;
* code block;
* database/table;
* embed;
* frame;
* whiteboard shape;
* connector;
* note card;
* AI-generated block.

Блок может быть:

```ts
type BlockId = string;

type BlockModel = {
  id: BlockId;
  type: string;
  props: Record<string, unknown>;
  children: BlockId[];
  parentId?: BlockId | null;
};
```

`DocumentModel` уже может хранить это иначе, но runtime должен работать через адаптерный интерфейс.

---

### 6.2 Block Mode

Block Mode — линейное представление документа.

Характеристики:

* блоки рендерятся в порядке дерева;
* основной interaction model — caret, text editing, indent/outdent, reorder;
* drag-and-drop меняет положение блока в иерархии;
* slash menu вставляет блоки в текущую позицию;
* side menu привязан к hovered/selected block;
* multi-block selection работает по order traversal документа.

---

### 6.3 Edgeless Mode

Edgeless Mode — canvas-представление.

Характеристики:

* блоки могут иметь layout metadata: `x`, `y`, `width`, `height`, `rotation`, `zIndex`;
* часть блоков доступна только в Edgeless Mode;
* часть обычных блоков может иметь alternative rendering в Edgeless Mode;
* selection похож на canvas/object selection;
* drag-and-drop перемещает объекты, а не меняет порядок в документе;
* возможны frame, group, connector, sticky note, drawing blocks;
* viewport, zoom, pan являются частью editor state, но не DocumentModel, кроме сохранённых layout props.

---

### 6.4 Mode-aware Block

Один и тот же block type может иметь разные стратегии рендера:

```ts
defineBlock({
  type: 'paragraph',

  render: {
    block: ParagraphBlockView,
    edgeless: ParagraphCardView,
  },
});
```
Для ситуации когда блок доступен в обоих режимах, можно использовать:
```ts
defineBlock({
  type: 'paragraph',

  render: ParagraphBlockView,
});
```

Некоторые блоки могут быть доступны только в одном режиме:

```ts
defineBlock({
  type: 'connector',

  supportedModes: ['edgeless'],

  render: {
    edgeless: ConnectorView,
  },
});
```

---

## 7. `defineBlock` Architecture

### 7.1 Requirement

Нужен DSL для определения блока, который регистрирует:

* model schema;
* props;
* supported modes;
* renderers;
* commands;
* slash menu metadata;
* toolbar actions;
* side menu actions;
* drag behavior;
* selection behavior;
* keyboard behavior;
* paste/drop behavior;
* AI capabilities;
* serialization hooks.

### 7.2 Proposed API

```ts
export function defineBlock<Props>(spec: BlockSpec<Props>): BlockDefinition<Props>;
```

Пример:

```ts
export const CalloutBlock = defineBlock({
  type: 'callout',

  displayName: 'Callout',

  supportedModes: ['block', 'edgeless'],

  props: {
    variant: {
      type: 'string',
      default: 'info',
      values: ['info', 'warning', 'error', 'success'],
    },
    collapsed: {
      type: 'boolean',
      default: false,
    },
  },

  content: {
    kind: 'children',
    allowedChildren: ['paragraph', 'heading', 'todo', 'image'],
  },

  render: {
    block: CalloutBlockView,
    edgeless: CalloutEdgelessView,
  },

  slash: {
    title: 'Callout',
    aliases: ['note', 'warning', 'info'],
    group: 'Basic',
    icon: CalloutIcon,
    command: 'block.insert.callout',
  },

  toolbar: [
    {
      id: 'callout.changeVariant',
      title: 'Change variant',
      icon: PaletteIcon,
      command: 'block.callout.changeVariant',
    },
  ],

  sideMenu: {
    showDragHandle: true,
    showAddButton: true,
    actions: ['block.duplicate', 'block.delete', 'block.turnInto'],
  },

  behavior: {
    selectable: true,
    draggable: true,

    onEnter: 'splitBlock',
    onBackspaceAtStart: 'mergeWithPrevious',
    onPaste: 'default',
    onDrop: 'default',
  },

  ai: {
    readable: true,
    writable: true,
    summaryRole: 'container',
    allowedOperations: ['summarize', 'rewrite', 'expand', 'extractTasks'],
  },
});
```

### 7.3 BlockSpec Type

```ts
type EditorMode = 'block' | 'edgeless';

type BlockSpec<Props> = {
  type: string;
  displayName?: string;

  supportedModes?: EditorMode[];

  props?: BlockPropsSchema<Props>;

  content?: BlockContentSpec;

  render: Partial<Record<EditorMode, BlockRenderer<Props>>>;

  slash?: SlashMenuBlockContribution;

  toolbar?: ToolbarContribution[];

  sideMenu?: SideMenuContribution;

  commands?: CommandContribution[];

  behavior?: BlockBehaviorSpec<Props>;

  ai?: BlockAICapabilitySpec;

  serialize?: BlockSerializationSpec<Props>;

  style?: BlockStyleSpec;
};
```

### 7.4 Registry Output

После регистрации блок должен быть доступен через `BlockRegistry`.

```ts
const registry = new BlockRegistry();

registry.register(ParagraphBlock);
registry.register(CalloutBlock);
registry.register(ConnectorBlock);
```

Registry должен уметь:

```ts
registry.getBlock(type);
registry.getSupportedBlocks(mode);
registry.getSlashItems(mode, context);
registry.getToolbarItems(blockType, context);
registry.getSideMenuItems(blockType, context);
registry.getRenderer(blockType, mode);
registry.getBehavior(blockType);
registry.getAICapabilities(blockType);
```

---

## 8. Rendering Architecture

### 8.1 Requirement

Rendering должен:

1. Работать с уже существующей `DocumentModel`.
2. Поддерживать разные renderers для `block` и `edgeless`.
3. Позволять части блоков существовать только в Edgeless.
4. Поддерживать overlays: selection, drop indicator, drag handles, side menu, toolbar.
5. Не смешивать document mutations с React state.

### 8.2 Block Mode Renderer

Block Mode рендерит дерево документа.

```tsx
function BlockModeEditor({ editor }: { editor: EditorRuntime }) {
  const rootBlocks = editor.document.getRootBlocks();

  return (
    <div className="editor editor--block-mode">
      {rootBlocks.map((blockId) => (
        <BlockTreeNode key={blockId} editor={editor} blockId={blockId} />
      ))}

      <EditorOverlays editor={editor} mode="block" />
    </div>
  );
}
```

`BlockTreeNode`:

```tsx
function BlockTreeNode({ editor, blockId }) {
  const block = useBlockModel(editor, blockId);
  const definition = editor.blocks.getBlock(block.type);
  const View = editor.blocks.getRenderer(block.type, 'block');

  if (!View) {
    return <UnsupportedBlockView block={block} mode="block" />;
  }

  return (
    <BlockWrapper editor={editor} block={block} mode="block">
      <View editor={editor} block={block} />
      {block.children.map((childId) => (
        <BlockTreeNode key={childId} editor={editor} blockId={childId} />
      ))}
    </BlockWrapper>
  );
}
```

### 8.3 Edgeless Renderer

Edgeless Mode рендерит canvas viewport.

```tsx
function EdgelessEditor({ editor }: { editor: EditorRuntime }) {
  const viewport = useViewport(editor);
  const objects = useEdgelessObjects(editor);

  return (
    <div className="editor editor--edgeless-mode">
      <EdgelessViewport editor={editor} viewport={viewport}>
        {objects.map((blockId) => (
          <EdgelessBlockObject
            key={blockId}
            editor={editor}
            blockId={blockId}
          />
        ))}
      </EdgelessViewport>

      <EditorOverlays editor={editor} mode="edgeless" />
    </div>
  );
}
```

`EdgelessBlockObject`:

```tsx
function EdgelessBlockObject({ editor, blockId }) {
  const block = useBlockModel(editor, blockId);
  const layout = useBlockLayout(editor, blockId);
  const View = editor.blocks.getRenderer(block.type, 'edgeless');

  if (!View) {
    return null;
  }

  return (
    <div
      className="edgeless-object"
      data-block-id={block.id}
      data-block-type={block.type}
      style={{
        transform: `translate(${layout.x}px, ${layout.y}px)`,
        width: layout.width,
        height: layout.height,
        zIndex: layout.zIndex,
      }}
    >
      <View editor={editor} block={block} layout={layout} />
    </div>
  );
}
```

### 8.4 Rendering Rule

Block renderer не должен сам решать, можно ли рендерить блок в текущем режиме. Это ответственность registry.

```ts
const renderer = registry.getRenderer(block.type, mode);

if (!renderer) {
  return mode === 'block'
    ? <UnsupportedBlockView />
    : null;
}
```

---

## 9. Editor Runtime

### 9.1 Runtime Responsibilities

`EditorRuntime` — центральный объект редактора.

Он должен содержать:

```ts
type EditorRuntime = {
  document: DocumentModelAdapter;

  mode: ModeManager;

  blocks: BlockRegistry;

  commands: CommandRegistry;

  plugins: PluginManager;

  selection: SelectionManager;

  events: EventRouter;

  history: HistoryAdapter;

  ui: UIRegistry;

  ai: AIIntegrationRegistry;
};
```

### 9.2 DocumentModelAdapter

Так как `DocumentModel` уже есть, runtime не должен зависеть от её конкретной внутренней реализации. Нужен adapter.

```ts
type DocumentModelAdapter = {
  getBlock(id: BlockId): BlockModel | null;
  getRootBlocks(): BlockId[];
  getChildren(id: BlockId): BlockId[];

  insertBlock(input: InsertBlockInput): BlockId;
  updateBlock(id: BlockId, patch: BlockPatch): void;
  deleteBlock(id: BlockId): void;
  moveBlock(input: MoveBlockInput): void;

  getBlockLayout(id: BlockId): BlockLayout | null;
  updateBlockLayout(id: BlockId, patch: Partial<BlockLayout>): void;

  transact<T>(fn: () => T, options?: TransactionOptions): T;

  subscribe(listener: DocumentChangeListener): Unsubscribe;
};
```

---

## 10. Commands

### 10.1 Requirement

Commands — единый способ изменения документа и editor state.

Через commands должны работать:

* slash menu;
* toolbar;
* side menu;
* keyboard shortcuts;
* drag-and-drop;
* AI actions;
* programmatic API.

### 10.2 Command Type

```ts
type CommandContext = {
  editor: EditorRuntime;
  document: DocumentModelAdapter;
  selection: SelectionManager;
  mode: EditorMode;
};

type Command<TPayload = unknown, TResult = void> = {
  id: string;
  title?: string;

  canExecute?: (ctx: CommandContext, payload: TPayload) => boolean;

  execute: (ctx: CommandContext, payload: TPayload) => TResult;
};
```

### 10.3 Command Registry

```ts
editor.commands.register({
  id: 'block.insert',
  execute(ctx, payload: InsertBlockPayload) {
    return ctx.document.transact(() => {
      const id = ctx.document.insertBlock(payload);
      ctx.selection.setBlockSelection({ blockIds: [id] });
      return id;
    });
  },
});
```

### 10.4 Core Commands

MVP commands:

```txt
block.insert
block.update
block.delete
block.duplicate
block.move
block.turnInto
block.split
block.merge
block.indent
block.outdent

selection.setBlockSelection
selection.clear
selection.selectAll
selection.extend

edgeless.moveObjects
edgeless.resizeObject
edgeless.updateViewport
edgeless.group
edgeless.ungroup

clipboard.copy
clipboard.cut
clipboard.paste

history.undo
history.redo
```

### 10.5 AI Commands

AI-фичи тоже должны вызывать commands, а не мутировать UI.

```txt
ai.insertGeneratedBlocks
ai.replaceBlockContent
ai.appendSummary
ai.extractTasks
ai.rewriteSelection
ai.createMindmapFromSelection
```

AI может взаимодействовать с `DocumentModel` напрямую, но лучше через один из двух путей:

1. **Direct DocumentModel transaction**, если AI system находится ниже editor runtime.
2. **Editor command**, если AI action инициирована из UI.

Рекомендация: AI engine генерирует `DocumentPatch`, а editor применяет его через command.

```ts
type AIDocumentPatch = {
  operations: Array<
    | { type: 'insertBlock'; payload: InsertBlockInput }
    | { type: 'updateBlock'; blockId: BlockId; patch: BlockPatch }
    | { type: 'deleteBlock'; blockId: BlockId }
    | { type: 'moveBlock'; payload: MoveBlockInput }
  >;
};
```

---

## 11. Selection

### 11.1 Requirement

Selection должен быть отдельной подсистемой, а не локальным React state.

Нужны типы selection:

```ts
type EditorSelection =
  | TextSelection
  | BlockSelection
  | EdgelessSelection
  | MixedSelection
  | null;
```

### 11.2 BlockSelection

```ts
type BlockSelection = {
  kind: 'block';
  blockIds: BlockId[];
  anchorBlockId: BlockId;
  focusBlockId: BlockId;
};
```

BlockSelection используется в Block Mode для:

* multi-select blocks;
* copy/cut/delete;
* drag selected blocks;
* toolbar over selection;
* AI actions over selected blocks.

### 11.3 EdgelessSelection

```ts
type EdgelessSelection = {
  kind: 'edgeless';
  objectIds: BlockId[];
  anchorObjectId?: BlockId;
  bounds: Rect;
};
```

EdgelessSelection используется для:

* canvas object selection;
* resize handles;
* group operations;
* z-index operations;
* alignment;
* AI actions over selected visual objects.

### 11.4 SelectionManager

```ts
type SelectionManager = {
  get(): EditorSelection;

  set(selection: EditorSelection): void;

  setBlockSelection(input: {
    blockIds: BlockId[];
    anchorBlockId?: BlockId;
    focusBlockId?: BlockId;
  }): void;

  setEdgelessSelection(input: {
    objectIds: BlockId[];
  }): void;

  clear(): void;

  subscribe(listener: SelectionListener): Unsubscribe;
};
```

### 11.5 Selection Rendering

Selection visual state должен рендериться через:

* `data-block-selected` attributes;
* overlay layer;
* decorations;
* wrapper state.

Block Mode:

```html
<div data-block-id="b1" data-block-selected="true">
  ...
</div>
```

Edgeless Mode:

```html
<div class="edgeless-selection-box">
  <div class="resize-handle resize-handle--nw" />
  <div class="resize-handle resize-handle--se" />
</div>
```

### 11.6 Selection Ownership

```txt
Text selection
  handled by rich text engine / contenteditable layer.

Block selection
  handled by SelectionManager + BlockSelectionPlugin.

Edgeless selection
  handled by SelectionManager + EdgelessSelectionPlugin.

Visual selection
  rendered by overlays and block wrappers.
```

---

## 12. Drag-and-Drop

### 12.1 Requirement

DnD должен поддерживать разные стратегии в разных режимах.

### 12.2 Block Mode DnD

Block Mode drag-and-drop означает:

* reorder block before/after another block;
* move block into another block;
* drag multiple selected blocks;
* drag from side handle;
* show drop indicator.

```ts
type BlockDropTarget = {
  mode: 'block';
  targetBlockId: BlockId;
  placement: 'before' | 'after' | 'inside';
};
```

### 12.3 Edgeless Mode DnD

Edgeless DnD означает:

* move object on canvas;
* resize object;
* drop external content into viewport;
* convert block into edgeless object;
* drag selected group.

```ts
type EdgelessDropTarget = {
  mode: 'edgeless';
  point: { x: number; y: number };
  frameId?: BlockId;
};
```

### 12.4 DragManager

```ts
type DragManager = {
  getState(): DragState;

  startDrag(input: DragStartInput): void;

  updateDrag(input: DragUpdateInput): void;

  endDrag(input: DragEndInput): void;

  cancelDrag(): void;
};
```

### 12.5 Drag State

```ts
type DragState =
  | {
      kind: 'none';
    }
  | {
      kind: 'block-drag';
      blockIds: BlockId[];
      source: {
        parentId: BlockId | null;
        index: number;
      };
      target?: BlockDropTarget;
    }
  | {
      kind: 'edgeless-object-drag';
      objectIds: BlockId[];
      startPoint: Point;
      currentPoint: Point;
    };
```

### 12.6 DnD Rule

Drag-and-drop не должен сам менять документ через DOM.

Правильный flow:

```txt
pointerdown on drag handle
  -> DragManager.startDrag()

pointermove
  -> DragManager.updateDrag()
  -> overlay renders preview/drop indicator

pointerup/drop
  -> command.execute('block.move' / 'edgeless.moveObjects')
  -> DocumentModel transaction
  -> selection update
```

---

## 13. Slash Menu

### 13.1 Requirement

Slash menu должен быть registry-driven и command-driven.

Блоки могут добавлять slash items через `defineBlock`, но runtime slash menu должен быть глобальным plugin’ом.

### 13.2 Slash Item

```ts
type SlashMenuItem = {
  id: string;
  title: string;
  subtitle?: string;
  aliases?: string[];
  group?: string;
  icon?: React.ReactNode;
  supportedModes?: EditorMode[];

  isVisible?: (ctx: SlashMenuContext) => boolean;
  isEnabled?: (ctx: SlashMenuContext) => boolean;

  commandId: string;
  payload?: unknown;
};
```

### 13.3 Slash Menu Plugin

Responsibilities:

* detect `/`;
* build query;
* get available items from registry;
* filter by query/mode/context;
* render popup;
* execute selected command;
* remove typed slash query.

```txt
User types "/cal"
  -> SlashPlugin opens
  -> query = "cal"
  -> items = registry.getSlashItems(mode)
  -> filtered = fuzzySearch(items, query)
  -> user selects "Callout"
  -> commandRegistry.execute('block.insert.callout')
  -> plugin removes "/cal"
```

### 13.4 Slash Menu Context

```ts
type SlashMenuContext = {
  editor: EditorRuntime;
  mode: EditorMode;
  currentBlockId?: BlockId;
  selection: EditorSelection;
};
```

### 13.5 AI Slash Items

AI фичи добавляются как обычные slash items:

```ts
{
  id: 'ai.summarize',
  title: 'Summarize with AI',
  aliases: ['summary', 'ai'],
  group: 'AI',
  commandId: 'ai.summarizeSelection',
  supportedModes: ['block', 'edgeless'],
}
```

---

## 14. Plugins

### 14.1 Requirement

Plugins должны расширять editor runtime без изменения core.

Плагины должны уметь:

* регистрировать commands;
* регистрировать UI contributions;
* слушать document changes;
* слушать selection changes;
* обрабатывать keyboard/pointer events;
* добавлять overlays;
* добавлять slash items;
* добавлять toolbar actions;
* добавлять block behavior.

### 14.2 Plugin API

```ts
type EditorPlugin = {
  id: string;

  setup?: (ctx: PluginSetupContext) => void | Cleanup;

  commands?: Command[];

  slashItems?: SlashMenuItem[];

  toolbarItems?: ToolbarContribution[];

  sideMenuItems?: SideMenuContribution[];

  keymap?: KeymapContribution[];

  eventHandlers?: EditorEventHandlers;

  overlays?: OverlayContribution[];

  onDocumentChange?: (event: DocumentChangeEvent, ctx: EditorRuntime) => void;

  onSelectionChange?: (selection: EditorSelection, ctx: EditorRuntime) => void;
};
```

### 14.3 PluginManager

```ts
class PluginManager {
  register(plugin: EditorPlugin): void;
  unregister(pluginId: string): void;

  getCommands(): Command[];
  getSlashItems(): SlashMenuItem[];
  getToolbarItems(): ToolbarContribution[];
  getOverlays(): OverlayContribution[];

  dispatchEvent(event: EditorEvent): boolean;
}
```

### 14.4 Core Plugins

MVP core plugins:

```txt
BlockSelectionPlugin
BlockDragDropPlugin
EdgelessSelectionPlugin
EdgelessDragPlugin
SlashMenuPlugin
KeyboardShortcutsPlugin
ClipboardPlugin
SideMenuPlugin
ToolbarPlugin
ContextMenuPlugin
HistoryPlugin
BlockNormalizationPlugin
AIActionsPlugin
```

---

## 15. Toolbar / Side Menu / Block Actions Registry

### 15.1 Requirement

Toolbar, side menu and block actions must be registry-based.

No hardcoded logic like:

```ts
if (block.type === 'image') showImageToolbar()
```

Instead:

```ts
registry.getToolbarItems(block.type, context)
```

### 15.2 Toolbar Contribution

```ts
type ToolbarContribution = {
  id: string;
  title: string;
  icon?: React.ReactNode;

  placement: 'floating-toolbar' | 'block-toolbar' | 'edgeless-toolbar';

  supportedModes?: EditorMode[];

  blockTypes?: string[];

  isVisible?: (ctx: ToolbarContext) => boolean;
  isEnabled?: (ctx: ToolbarContext) => boolean;

  commandId: string;
  payload?: unknown;
};
```

### 15.3 Side Menu Contribution

```ts
type SideMenuContribution = {
  showDragHandle?: boolean;
  showAddButton?: boolean;

  actions?: Array<{
    id: string;
    title: string;
    icon?: React.ReactNode;
    commandId: string;
    payload?: unknown;
  }>;
};
```

### 15.4 Block Actions

Block actions are command aliases bound to current block context.

Examples:

```txt
Duplicate
Delete
Turn into
Copy link
Ask AI
Summarize children
Move to page
Convert to card
Open in Edgeless
```

### 15.5 AI Actions

AI actions should be just actions:

```ts
{
  id: 'ai.rewriteBlock',
  title: 'Rewrite with AI',
  icon: SparklesIcon,
  placement: 'block-toolbar',
  blockTypes: ['paragraph', 'callout', 'heading'],
  commandId: 'ai.rewriteBlock',
}
```

---

## 16. Styling and Theming

### 16.1 Requirement

Styling must support:

* default theme;
* dark/light theme;
* custom block styles;
* data attributes for state;
* CSS variables;
* component overrides.

### 16.2 DOM Convention

Every block wrapper should expose stable attributes:

```html
<div
  data-editor-block
  data-block-id="..."
  data-block-type="callout"
  data-editor-mode="block"
  data-block-selected="true"
  data-hovered="false"
  data-dragging="false"
  data-empty="false"
>
  ...
</div>
```

### 16.3 CSS Variables

```css
.editor-root {
  --editor-bg: #ffffff;
  --editor-fg: #171717;
  --editor-muted-fg: #737373;

  --editor-selection-bg: rgba(59, 130, 246, 0.14);
  --editor-selection-border: #3b82f6;

  --editor-block-gap: 4px;
  --editor-block-radius: 6px;
  --editor-side-menu-width: 32px;

  --editor-edgeless-bg: #f8fafc;
  --editor-edgeless-grid-color: rgba(0, 0, 0, 0.06);
}
```

### 16.4 Block Style Spec

```ts
type BlockStyleSpec = {
  className?: string;
  dataAttributes?: Record<string, string | boolean | number>;
};
```

### 16.5 Component Overrides

```tsx
<EditorProvider
  components={{
    BlockWrapper: CustomBlockWrapper,
    SideMenu: CustomSideMenu,
    SlashMenu: CustomSlashMenu,
    FloatingToolbar: CustomFloatingToolbar,
    EdgelessObjectWrapper: CustomEdgelessObjectWrapper,
  }}
/>
```

---

## 17. Custom Block Behavior

### 17.1 Requirement

Blocks must customize behavior without owning the global editor.

### 17.2 Behavior Spec

```ts
type BlockBehaviorSpec<Props> = {
  selectable?: boolean;
  draggable?: boolean;

  canHaveChildren?: boolean;
  canBeChildOf?: string[] | ((parent: BlockModel) => boolean);

  onEnter?:
    | 'splitBlock'
    | 'insertParagraphAfter'
    | 'newline'
    | CustomBlockHandler<Props>;

  onBackspaceAtStart?:
    | 'mergeWithPrevious'
    | 'deleteBlock'
    | 'liftBlock'
    | CustomBlockHandler<Props>;

  onTab?: 'indent' | 'focusNext' | CustomBlockHandler<Props>;

  onShiftTab?: 'outdent' | 'focusPrevious' | CustomBlockHandler<Props>;

  onPaste?: 'default' | 'plainText' | CustomPasteHandler<Props>;

  onDrop?: 'default' | CustomDropHandler<Props>;

  normalize?: (ctx: BlockNormalizeContext<Props>) => BlockPatch | null;
};
```

### 17.3 Behavior Execution

Global keyboard plugin routes events:

```txt
keydown Enter
  -> find current block
  -> get block behavior
  -> execute behavior handler
  -> handler calls command
```

Пример:

```ts
function handleEnter(ctx: KeyboardContext) {
  const block = ctx.editor.selection.getCurrentBlock();
  const behavior = ctx.editor.blocks.getBehavior(block.type);

  return runBlockBehavior(behavior.onEnter, ctx);
}
```

Блок описывает поведение, но не слушает DOM events напрямую, если это можно централизовать.

---

## 18. Edgeless-specific Blocks

### 18.1 Requirement

Некоторые блоки существуют только в Edgeless Mode.

Examples:

```txt
shape
connector
frame
freehand
mindmap-node
sticky-note
canvas-image
```

### 18.2 Edgeless-only Block

```ts
export const ConnectorBlock = defineBlock({
  type: 'connector',

  supportedModes: ['edgeless'],

  props: {
    from: { type: 'string' },
    to: { type: 'string' },
    label: { type: 'string', default: '' },
  },

  render: {
    edgeless: ConnectorView,
  },

  behavior: {
    selectable: true,
    draggable: false,
  },
});
```

### 18.3 Layout Metadata

Edgeless blocks require layout.

```ts
type BlockLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  frameId?: BlockId | null;
};
```

Recommendation:

* content props live in block props;
* visual layout lives in layout storage;
* selection/hover/drag state lives in editor runtime state.

---

## 19. AI Integration

### 19.1 Requirement

AI features must be easy to add and should interact with `DocumentModel` for creating/updating blocks.

### 19.2 AI Design Principle

AI should not know about React components.

AI works with:

```txt
DocumentModel
BlockRegistry metadata
Selection
Commands
DocumentPatch
```

### 19.3 AI Capability Registry

Blocks can expose AI metadata:

```ts
type BlockAICapabilitySpec = {
  readable?: boolean;
  writable?: boolean;

  summaryRole?: 'text' | 'container' | 'media' | 'canvas-object';

  allowedOperations?: Array<
    | 'summarize'
    | 'rewrite'
    | 'expand'
    | 'extractTasks'
    | 'generateChildren'
    | 'convertToMindmap'
    | 'explain'
  >;

  getAIText?: (block: BlockModel, ctx: AIContext) => string;

  applyAIResult?: (
    block: BlockModel,
    result: AIBlockResult,
    ctx: AIContext
  ) => AIDocumentPatch;
};
```

### 19.4 AI Action Flow

```txt
User selects blocks
  -> clicks "Summarize with AI"
  -> command ai.summarizeSelection
  -> AI service reads selected blocks from DocumentModel
  -> AI returns DocumentPatch
  -> command ai.applyPatch
  -> DocumentModel transaction
  -> selection moves to inserted/updated blocks
```

### 19.5 AI Patch Example

```ts
{
  operations: [
    {
      type: 'insertBlock',
      payload: {
        type: 'callout',
        props: {
          variant: 'info',
        },
        content: {
          text: 'Summary...',
        },
        position: {
          afterBlockId: 'b123',
        },
      },
    },
  ],
}
```

### 19.6 AI in Edgeless Mode

AI should be able to create canvas structures:

```txt
Generate mind map
Generate flow diagram
Convert selected notes to cards
Cluster selected blocks
Create frame around related blocks
Create connector between related ideas
```

This requires AI output to include layout suggestions:

```ts
{
  operations: [
    {
      type: 'insertBlock',
      payload: {
        type: 'sticky-note',
        props: { text: 'Main idea' },
        layout: { x: 100, y: 120, width: 240, height: 120 },
      },
    },
  ],
}
```

---

## 20. Clipboard and Serialization

### 20.1 Requirement

Copy/paste should support:

* internal block JSON;
* plain text;
* markdown;
* HTML;
* image/file drops;
* edgeless object copy.

### 20.2 Internal Clipboard Format

```ts
type EditorClipboardPayload = {
  version: number;
  mode: EditorMode;
  blocks: SerializedBlock[];
  layouts?: Record<BlockId, BlockLayout>;
};
```

### 20.3 Block Serialization Hooks

```ts
type BlockSerializationSpec<Props> = {
  toText?: (block: BlockModel<Props>, ctx: SerializeContext) => string;

  toMarkdown?: (block: BlockModel<Props>, ctx: SerializeContext) => string;

  toHTML?: (block: BlockModel<Props>, ctx: SerializeContext) => string;

  fromMarkdown?: (input: MarkdownBlockInput, ctx: ParseContext) => BlockInput<Props> | null;

  fromHTML?: (input: HTMLElement, ctx: ParseContext) => BlockInput<Props> | null;
};
```

---

## 21. Event Routing

### 21.1 Requirement

Pointer/keyboard events should be centralized.

Bad approach:

```txt
Every block manually handles all keydown/mouse/paste/drop events.
```

Better approach:

```txt
Editor root captures event
  -> EventRouter
  -> plugins by priority
  -> active block behavior
  -> default behavior
```

### 21.2 EventRouter

```ts
type EditorEventRouter = {
  dispatch(event: EditorEvent): boolean;
};
```

### 21.3 Priority

Plugins should have priority:

```txt
Critical:
  IME/composition guard
  text editing engine

High:
  selection
  drag
  slash menu
  clipboard

Normal:
  keyboard shortcuts
  block behavior

Low:
  analytics
  hover state
```

---

## 22. Mode Switching

### 22.1 Requirement

Switching between Block Mode and Edgeless Mode should not duplicate document state.

```txt
Same DocumentModel
Different renderer
Different interaction plugins
Different overlays
Different layout interpretation
```

### 22.2 ModeManager

```ts
type ModeManager = {
  getMode(): EditorMode;
  setMode(mode: EditorMode): void;
  subscribe(listener: ModeChangeListener): Unsubscribe;
};
```

### 22.3 Plugin Activation by Mode

Plugins can declare supported modes:

```ts
type EditorPlugin = {
  id: string;
  supportedModes?: EditorMode[];
};
```

Example:

```txt
BlockDragDropPlugin
  supportedModes: ['block']

EdgelessDragPlugin
  supportedModes: ['edgeless']

SlashMenuPlugin
  supportedModes: ['block', 'edgeless']
```

### 22.4 Selection on Mode Switch

When switching modes:

```txt
BlockSelection -> EdgelessSelection
  if selected blocks have edgeless representations.

EdgelessSelection -> BlockSelection
  if selected objects have block representations.

Unsupported selection
  clear selection or select closest valid parent.
```

---

## 23. State Ownership

### 23.1 Persistent State

Stored in `DocumentModel`:

```txt
block type
block props
block children
text content
edgeless layout
relations/connectors
document metadata
```

### 23.2 Runtime State

Stored in `EditorRuntime`:

```txt
current mode
selection
hovered block
drag state
slash menu state
toolbar state
viewport pan/zoom, unless intentionally persisted
composition state
active plugin state
```

### 23.3 UI Local State

Stored in React local state only if not meaningful globally:

```txt
temporary popover open state
input value inside toolbar
local animation state
temporary hover inside menu
```

---

## 24. MVP Scope

### 24.1 MVP Blocks

```txt
paragraph
heading
todo
bulleted list item
numbered list item
callout
image
code
edgeless note/card
edgeless shape
edgeless frame
edgeless connector
```

### 24.2 MVP Features

1. `defineBlock`.
2. `BlockRegistry`.
3. `CommandRegistry`.
4. `PluginManager`.
5. `Block Mode Renderer`.
6. `Edgeless Mode Renderer`.
7. `BlockSelection`.
8. `EdgelessSelection`.
9. Block Mode drag-and-drop.
10. Edgeless object move.
11. Slash menu.
12. Side menu.
13. Floating toolbar.
14. Basic styling system.
15. AI command integration via `DocumentPatch`.

---

## 25. Acceptance Criteria

### 25.1 Block Definition

* Developer can define a new block with `defineBlock`.
* The block appears in Block Mode if it supports `block`.
* The block appears in Edgeless Mode if it supports `edgeless`.
* The block can contribute slash menu items.
* The block can contribute toolbar/side menu actions.
* The block can define custom behavior for enter/backspace/paste/drop.

### 25.2 Selection

* User can select one block.
* User can select multiple blocks.
* Selected blocks are visually highlighted.
* User can delete selected blocks.
* User can copy selected blocks.
* Edgeless objects can be selected with click.
* Multiple edgeless objects can be selected with marquee or shift-click.

### 25.3 Drag-and-Drop

* User can drag block by handle in Block Mode.
* User sees drop indicator.
* User can reorder selected blocks.
* User can drag edgeless object on canvas.
* Drag operations are undoable.
* Drag operations update `DocumentModel`, not React state only.

### 25.4 Slash Menu

* Typing `/` opens slash menu.
* Slash items are collected from block registry and plugins.
* Slash menu filters by query.
* Selecting item executes command.
* AI actions can be added as slash items.

### 25.5 Plugins

* Plugin can register command.
* Plugin can register slash item.
* Plugin can register toolbar action.
* Plugin can listen to selection changes.
* Plugin can be active only in selected modes.

### 25.6 AI

* AI action can read selected blocks from `DocumentModel`.
* AI action can return document patch.
* Patch can insert/update/delete/move blocks.
* AI-created blocks render through same block registry.

---

## 26. Recommended Folder Structure

```txt
src/editor/
  core/
    EditorRuntime.ts
    EditorContext.ts
    ModeManager.ts
    EventRouter.ts

  document/
    DocumentModelAdapter.ts
    DocumentPatch.ts

  blocks/
    defineBlock.ts
    BlockRegistry.ts
    BlockSpec.ts
    builtin/
      ParagraphBlock.tsx
      HeadingBlock.tsx
      CalloutBlock.tsx
      ImageBlock.tsx
      EdgelessShapeBlock.tsx

  commands/
    Command.ts
    CommandRegistry.ts
    coreCommands.ts
    blockCommands.ts
    edgelessCommands.ts
    aiCommands.ts

  selection/
    SelectionManager.ts
    selectionTypes.ts
    BlockSelectionPlugin.ts
    EdgelessSelectionPlugin.ts

  drag/
    DragManager.ts
    BlockDragDropPlugin.ts
    EdgelessDragPlugin.ts

  plugins/
    Plugin.ts
    PluginManager.ts
    SlashMenuPlugin.ts
    ClipboardPlugin.ts
    KeyboardShortcutsPlugin.ts
    HistoryPlugin.ts

  renderers/
    BlockModeEditor.tsx
    BlockTreeNode.tsx
    BlockWrapper.tsx
    EdgelessEditor.tsx
    EdgelessViewport.tsx
    EdgelessObjectWrapper.tsx

  ui/
    SlashMenu/
    SideMenu/
    Toolbar/
    ContextMenu/
    Overlays/

  ai/
    AIIntegrationRegistry.ts
    AIDocumentPatch.ts
    aiCapabilities.ts

  styles/
    editor.css
    themes.css
```

---

## 27. Risks

### 27.1 Risk: Block logic leaks into UI components

If block components directly mutate DocumentModel, behavior becomes inconsistent.

Mitigation:

* All mutations through commands.
* Block views receive `editor` but use command API.
* Lint rule/code review rule: no direct `document.updateBlock` inside random UI except command implementations.

### 27.2 Risk: Edgeless Mode becomes a separate editor

If Edgeless Mode forks the model, sync between modes becomes painful.

Mitigation:

* Same DocumentModel.
* Different renderer and plugins.
* Layout stored as block layout metadata.

### 27.3 Risk: Plugin order bugs

Selection, drag, slash menu and keyboard shortcuts can conflict.

Mitigation:

* Explicit event priority.
* Plugin lifecycle.
* Tests for event routing.

### 27.4 Risk: AI bypasses validation

AI may generate invalid blocks.

Mitigation:

* AI returns `DocumentPatch`.
* Patch is validated against BlockRegistry.
* Invalid block types rejected or converted to fallback.

### 27.5 Risk: Too much in `defineBlock`

If `defineBlock` becomes huge, blocks become hard to maintain.

Mitigation:

* Keep `defineBlock` declarative.
* Complex behavior should be extracted into commands/plugins.
* Block spec contributes metadata, not full global behavior.

---

## 28. Implementation Plan

### Phase 1: Runtime Foundation

Deliver:

* `EditorRuntime`;
* `DocumentModelAdapter`;
* `BlockRegistry`;
* `defineBlock`;
* `CommandRegistry`;
* basic Block Mode renderer.

### Phase 2: Core Interactions

Deliver:

* `SelectionManager`;
* `BlockSelection`;
* side menu;
* block toolbar;
* keyboard shortcuts;
* block commands.

### Phase 3: Slash Menu and Plugins

Deliver:

* `PluginManager`;
* `SlashMenuPlugin`;
* plugin contribution system;
* slash items from blocks and plugins.

### Phase 4: Drag-and-Drop

Deliver:

* `DragManager`;
* Block Mode drag-and-drop;
* drop indicator;
* multi-block drag;
* undoable move commands.

### Phase 5: Edgeless Mode

Deliver:

* Edgeless renderer;
* viewport/pan/zoom;
* edgeless object wrappers;
* edgeless selection;
* edgeless drag/move;
* mode switching.

### Phase 6: AI-ready Integration

Deliver:

* AI capability metadata in block specs;
* AI command namespace;
* `AIDocumentPatch`;
* patch validation;
* example AI action: summarize selection into callout block.

---

## 29. Architectural Decision

The editor should be implemented as a **runtime + registry + plugins architecture**, not as a collection of independent React components.

`defineBlock` should describe block capabilities declaratively. Global systems like selection, drag-and-drop, slash menu, toolbar and AI should read from registries and execute commands.

Final architecture rule:

```txt
Block defines capabilities.
Plugins implement interactions.
Commands mutate the document.
Renderers display the document.
DocumentModel stores the truth.
AI produces document patches.
```
