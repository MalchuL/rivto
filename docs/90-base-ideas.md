- Chulane Development
	- Editor
	- ![image.png](../assets/image_1764442339339_0.png){:height 593, :width 749} ![image.png](../assets/image_1764371587425_0.png)
	-
	- [ChatGPT](https://chatgpt.com/c/692a1bf6-21fc-8331-b475-212f0c549d28)
	- Отлично — делаю то, что ты просил: сначала переписываю **исходные 18 пунктов** из первого большого сообщения в исправлённом и согласованном виде с учётом всех твоих правок (абстракция над Yjs, Document wrapper, Selection вынесен, ClipboardManager в runtime и т.д.). После этого даю **обновлённый план реализации** (вехи) и минимальные **TypeScript-интерфейсы** (EditorCore, Document, BlockDefinition, Plugin API, CRDTDoc adapter, ClipboardManager, ProviderManager, Renderer), чтобы сразу можно было стартовать реализацию.
	    
	  Я сделал пункты компактными, но оставил ключевые детали — если нужно, потом разверну любой пункт в отдельную страницу спецификации или пример кода.  
	    
---
	- Frameworks
		- Lit
		- [Konva - JavaScript Canvas 2d Library](https://konvajs.org/) - Для канвас
		- [Automerge](https://automerge.org/)
		- yjs
	- # Обновлённые 18 пунктов (исправленный и расширенный список)
	  collapsed:: true
		- ## Основная идея / Source of truth
			- Единый «источник правды» — это `Document` (high-level wrapper), который внутри хранит CRDT-документ через абстракцию `CRDTDoc` (по умолчанию Yjs реализует `CRDTDoc`). Всё состояние, относящееся к содержимому страницы (блоки, links/связи, meta) хранится в `Document`. UI-состояние (selection, active tool, локальные курсоры) хранится в отдельных менеджерах (SelectionManager, ToolState) и не смешивается с Document по умолчанию.
		- ## CRDT-абстракция
			- Вводим интерфейс `CRDTDoc` (attachProvider, transact, getArray/getMap/getText, on('update')). Реализация `YjsDocAdapter` скрывает детали Yjs за этим API. Это даёт возможность заменить CRDT без слома public API.
		- ## Document wrapper
			- `Document` предоставляет высокоуровневые методы: `getBlocks()`, `createBlock()`, `updateBlock()`, `deleteBlock()`, `getLinks()`, `createLink()`, `deleteLink()`, `getCRDT()` (low-level). `Document` не хранит selection и не управляет provider напрямую — ProviderManager в EditorCore привязывает провайдеры к CRDTDoc.
		- ## Модель блока (минималистичная и расширяемая)
			- `BlockCore` содержит: `id`, `type`, `order` (int для flow), `position?` (x,y), `size?`, `zIndex?`, `connectedWith?` (string|null) и `pluginState: Record<pluginId, any>`. Всё интерактивное состояние блоков (текстовые CRDT, таблицы и т.д.) хранится в CRDT через ключи, соответствующие `block.id` (Document/CRDT хранит Y.Text/Y.Map для state, доступный плагинам через Document.getCRDT()).
		- ## Links / Connections (граф связей)
			- Для горизонтального/вертикального «склеивания» блоков и любых связей — `Link` объект (`id, from, to, meta`). Links хранятся в Document CRDT (отдельный массив), а renderer использует их для отрисовки соединений. На их основе плагины могут формировать composite/group view.
		- ## Selection и SelectionManager
			- Selection — отдельная сущность, управляемая `SelectionManager` (локальная, опционально можно реплицировать через awareness). SelectionManager отвечает за multi-select, bounding box, drag selection. Document **не** содержит selection по умолчанию.
		- ## ProviderManager
			- ProviderManager — runtime компонент в EditorCore, который подключает провайдеры (y-websocket, hocuspocus, y-webrtc, indexeddb) к `CRDTDoc`. Document остаётся agnostic: провайдеры прикрепляются через CRDTDoc.attachProvider(provider) по решению EditorCore/ProviderManager.
		- ## Renderer abstraction (мост / Strategy)
			- Абстрактный `Renderer` с методами `mount`, `unmount`, `renderSnapshot`, `applyCRDTUpdate`, `focusBlock`. Реализации: `BlockDOMRenderer` (flow/block mode) и `EdgelessCanvasRenderer` (canvas + absolute DOM для интерактивных блоков). Блоки сами предоставляют `renderDOM` и/или `renderCanvas`, renderer вызывает соответствующие функции.
		- ## BlockDefinition / Plugin API
			- Плагин регистрирует `BlockDefinition`(ы) и предоставляет: `type`, lifecycle hooks (`onCreate`, `onDestroy`, `onAttach`), рендереры (`renderDOM`, `renderCanvas`), сериализаторы (`toJSON`/`fromJSON`), команды и keymaps. `pluginId` выступает namespace для `pluginState`.
		- ## PluginState namespace
			- Внутри блока все плагины хранят своё состояние в `pluginState[pluginId]` (ключ — `pluginId`). При сериализации/десериализации core вызывает плагинные конвертеры, которые читают/пишут `pluginState[pluginId]`. Это убирает конфликты ключей и даёт явное ownership.
		- ## Сериализация / Десериализация (chain of responsibility)
			- Core собирает блоки и вызывает `BlockDefinition.toJSON` для каждого блока. Если плагин отсутствует — core делает safe fallback (stub: id, type, order, position, size, raw pluginState). Десериализация пытаетс я найти `BlockDefinition.fromJSON`; если отсутствует — импортируется как generic block с raw state. Bundle содержит мета (version, registered plugin IDs) для future-proof.
		- ## ClipboardManager (EditorRuntime, не блок)
			- ClipboardManager — глобальный сервис в EditorCore: отвечает за copy/paste. Copy формирует multi-mime payload:
			- `application/x-myeditor+json` (structured bundle),
			- `text/html` (fallback, via plugins),
			- `text/plain`.
			- Paste: приоритет structured JSON → HTML → plain. ClipboardManager использует SelectionManager и PluginManager, генерирует новые IDs при вставке и вызывает Document API внутри транзакции.
		- ## Nested editors (links via reference)
			- Блок может иметь `nestedDocRef?: string`. `DocumentStore` + `EditorCore` лениво монтируют и раскрывают вложенный `Document` через `openDocument(nestedDocRef)`; не храним `nestedDocs` глобально в Document. Это даёт lazy-load и разделение ответственности.
		- ## Undo/Redo
			- `UndoManager` — абстракция с адаптером `YjsUndoManagerAdapter` (если CRDT == Yjs) и/или локальным stack. Undo/Redo — scoped per Document или per block (настраиваемо).
		- ## Events / Handlers
			- Renderer обрабатывает низкоуровневые события (pointer, keyboard, drag) и нормализует их в EditorCore; PluginManager/BlockDefinition могут подписываться на событие `onPointerDown/onKeyDown/onDrag` для кастомной логики. Event flow: DOM/Canvas → Renderer → EditorCore → PluginManager → Block hooks.
		- ## Performance patterns
			- Batching (RAF), virtualization (for long lists/tables), canvas layers & offscreen caching, throttle layout updates, lazy mounting nested docs, stable IDs, incremental rendering on CRDT updates.
		- ## Theming
			- `ThemeManager` предоставляет global theme tokens (CSS variables) и per-block overrides. BlockDefinition описывает использованные theme tokens. Renderer применяет CSS vars to DOM or passes tokens to canvas renderer.
		- ## Security / Plugin sandboxing
			- Plugins получают ограниченный runtime API (EditorCore public surface). Heavy or untrusted logic can run in WebWorker/iframe. Plugin manifests include version, author, allowed scopes. Управление разрешениями — опционально.
			    
---
		- # Обновлённый план реализации (вехи, с учётом абстракции CRDT и других изменений)
		    
		  **MILESTONE 0 — Основа**  
		- Инициализация репо + монорепо/пакет.
		- Настроить tooling: TypeScript, tsup/rollup, eslint, vitest.
		    
		  **MILESTONE 1 — CRDT и Document**  
		- Определить интерфейс `CRDTDoc`.
		- Реализовать `YjsDocAdapter` (Y.Doc wrapper).
		- Реализовать `Document` wrapper (blocks + links API).
		    
		  **MILESTONE 2 — Core & Managers**  
		- Скелет `EditorCore`.
		- Реализовать `PluginManager`, `DocumentStore`, `ProviderManager`.
		- Реализовать `SelectionManager` (локальная) и `ClipboardManager`.
		    
		  **MILESTONE 3 — Renderer & basic blocks**  
		- Интерфейс `Renderer`.
		- `BlockDOMRenderer` (простая flow отрисовка).
		- `EdgelessCanvasRenderer` (canvas + absolute DOM).
		- Реализовать `paragraph` plugin (Y.Text) с DOM и minimal canvas preview.
		    
		  **MILESTONE 4 — Plugins & Serialization**  
		- Полная система регистрации плагинов и `pluginState` namespace.
		- Сериализаторы/десериализаторы плагинов.
		- Implement copy/paste flow (structured mime + html fallback).
		    
		  **MILESTONE 5 — Collaboration & Providers**  
		- `ProviderManager` + `y-websocket` и `y-indexeddb`.
		- Awareness presence (cursors).
		- `YjsUndoManagerAdapter`.
		    
		  **MILESTONE 6 — Nested editors & advanced blocks**  
		- `nestedDocRef` handling + lazy mounting nested editors.
		- `table` plugin skeleton (Y.Array based), virtualization.
		- Links + group/composite plugin.
		    
		  **MILESTONE 7 — Polish**  
		- Theming system + examples.
		- Performance optimizations.
		- Tests, CI, docs, playground example app (React).
		    
---
		- # Короткие интерфейсы TypeScript (минимум для старта)
		    
		  Ниже — компактные определения, которые можно сразу вставить в код как контракт.  
		-
		  ```typescript
		  // crdt.ts
		  export type Unsubscribe = () => void;
		  - export interface CRDTTransaction { /* marker */ }
		  export interface CRDTArray { toArray(): any[]; push(...items:any[]): void; }
		  export interface CRDTMap { get(key:string): any; set(key:string, val:any): void; toObject(): any; }
		  export interface CRDTText { toString(): string; insert(pos:number, text:string): void; }
		  - export interface CRDTDoc {
		  id: string;
		  attachProvider(provider: any): Promise<void>;
		  detachProvider(): Promise<void>;
		  transact(fn:(tx:CRDTTransaction)=>void): void;
		  getArray(path: string): CRDTArray;
		  getMap(path: string): CRDTMap;
		  getText(path: string): CRDTText;
		  on(event: 'update'|'sync'|'snapshot', handler: Function): Unsubscribe;
		  getSnapshot(): any;
		  applySnapshot(snapshot: any): void;
		  destroy(): void;
		  }
		  ```
		-
		  ```typescript
		  // document.ts
		  export type BlockID = string;
		  - export interface BlockCore {
		  id: BlockID;
		  type: string;
		  order: number;
		  position?: { x:number; y:number };
		  size?: { width:number; height:number };
		  zIndex?: number;
		  connectedWith?: string | null;
		  pluginState?: Record<string, any>; // pluginId -> payload
		  }
		  - export interface Link {
		  id: string;
		  from: { blockId: BlockID; port?: string };
		  to: { blockId: BlockID; port?: string };
		  meta?: any;
		  }
		  - export class Document {
		  readonly id: string;
		  constructor(crdt: CRDTDoc);
		  getCRDT(): CRDTDoc;
		  getBlocks(): Promise<BlockCore[]>;
		  createBlock(type:string, initState?:any, opts?: Partial<BlockCore>): Promise<BlockCore>;
		  updateBlock(id: BlockID, patch: Partial<BlockCore>): Promise<void>;
		  deleteBlock(id: BlockID): Promise<void>;
		  getLinks(): Promise<Link[]>;
		  createLink(link: Link): Promise<void>;
		  deleteLink(id: string): Promise<void>;
		  }
		  ```
		-
		  ```typescript
		  // editor-core.ts
		  export interface EditorOptions {
		  container: HTMLElement;
		  document?: Document;
		  plugins?: EditorPlugin[];
		  renderer?: Renderer;
		  }
		  - export class EditorCore {
		  constructor(opts: EditorOptions);
		  registerPlugin(p: EditorPlugin): void;
		  unregisterPlugin(id: string): void;
		  createDocument(id?: string): Document;
		  openDocument(id: string): Promise<Document>;
		  setRenderer(r: Renderer): void;
		  getSelectionManager(): SelectionManager;
		  getClipboardManager(): ClipboardManager;
		  getProviderManager(): ProviderManager;
		  serializeDocument(docId: string, format?: 'json'|'html'): Promise<string>;
		  deserializeDocument(payload: string|object, opts?: { targetDoc?: string }): Promise<Document>;
		  destroy(): void;
		  }
		  ```
		-
		  ```typescript
		  // plugin.ts
		  export interface BlockRenderContext {
		  doc: Document;
		  editor: EditorCore;
		  selection: SelectionManager;
		  getState<T>(block: BlockCore): Promise<T>;
		  setState(blockId: BlockID, state: any): Promise<void>;
		  }
		  - export interface BlockDefinition {
		  type: string;
		  pluginId: string; // namespace
		  onCreate?(ctx: BlockRenderContext, block: BlockCore, initialState?: any): Promise<void>;
		  onDestroy?(ctx: BlockRenderContext, block: BlockCore): Promise<void>;
		  renderDOM?(ctx: BlockRenderContext, block: BlockCore): HTMLElement | Promise<HTMLElement>;
		  renderCanvas?(ctx: BlockRenderContext, block: BlockCore, ctx2d: CanvasRenderingContext2D, transform: DOMMatrix): void;
		  toJSON?(block: BlockCore, state: any): any;
		  fromJSON?(payload: any): { block: BlockCore, state: any };
		  commands?: Record<string, (...args:any[])=>any>;
		  }
		  - export interface EditorPlugin {
		  id: string;
		  register(editor: EditorCore): void;
		  unregister?(editor: EditorCore): void;
		  blocks?: BlockDefinition[];
		  }
		  ```
		-
		  ```typescript
		  // clipboard.ts
		  export interface ClipboardBundle {
		  version: number;
		  source?: { editorId?: string; docId?: string; timestamp?: number };
		  blocks: any[]; // serialized blocks
		  position?: { x:number; y:number };
		  }
		  - export interface ClipboardManager {
		  copySelection(): Promise<void>;
		  handleCopyEvent(ev: ClipboardEvent): Promise<void>;
		  handlePasteEvent(ev: ClipboardEvent): Promise<void>;
		  pasteAt(point?: {x:number;y:number}): Promise<BlockCore[]>;
		  }
		  ```
		-
		  ```typescript
		  // provider.ts
		  export interface ProviderConfig {
		  type: 'websocket'|'hocuspocus'|'webrtc'|'indexeddb'|'custom';
		  url?: string;
		  options?: any;
		  }
		  export interface ProviderManager {
		  attachProvider(docId: string, cfg: ProviderConfig): Promise<void>;
		  detachProvider(docId: string): Promise<void>;
		  getProvider(docId: string): any;
		  }
		  ```
		-
		  ```typescript
		  // renderer.ts
		  export interface Renderer {
		  mount(container: HTMLElement): void;
		  unmount(): void;
		  renderSnapshot(doc: Document): Promise<void>;
		  applyCRDTUpdate(update: any): void;
		  focusBlock(id: BlockID): void;
		  }
		  ```
		-
---
	- # Второе сообщение
	  collapsed:: true
		- Отлично — собираю обновлённую архитектуру. Ниже — аккуратно структурированный набор артефактов, которые можно взять как спецификацию для реализации:
		- интерфейсы блоков, 2) интерфейсы редактора, 3) интерфейсы плагинов, 4) расширённая архитектурная диаграмма (компоненты + их связи), 5) финальный список npm-пакетов, 6) пример API `editor.defineBlock()` и пример использования. В конце — **PlantUML**-диаграмма зависимости (текст PlantUML + краткая инструкция, как натянуть png/svg).
		- # Архитектура (кратко)
		- **Document (high-level)** — единственный источник правды для содержимого страницы: хранит список блоков, links/graph, meta; внутри использует `CRDTDoc` (абстракция над Yjs).
		- **EditorCore (runtime/controller)** — orchestration: DocumentStore, PluginManager, ProviderManager, Renderer, SelectionManager, ClipboardManager, UndoManager, ThemeManager.
		- **CRDTDoc** — интерфейс-адаптер для CRDT (по умолчанию `YjsDocAdapter`), предоставляет `transact`, `getArray/getMap/getText`, `attachProvider`, `on('update')`.
		- **BlockDefinition (plugin-owned)** — моделирует тип блока: lifecycle, renderDOM/renderCanvas, serializers, commands. Плагин хранит `pluginId` и регистрирует `BlockDefinition`s.
		- **ClipboardManager** — глобальный, работает с SelectionManager и PluginManager, делает multi-mime copy/paste (structured JSON + HTML + plain).
		- **Renderer** — мост между моделью и UI; две реализации: `BlockDOMRenderer` и `EdgelessCanvasRenderer`. Блоки сами поставляют рендер-функции; renderer вызывает их и управляет контейнерами.
		- **ThemeManager** — глобальные токены (CSS vars) + per-block overrides.
		- **ProviderManager** — прикрепляет провайдеры (WebSocket/Hocuspocus/IndexedDB) к CRDTDoc через CRDT-адаптер.
		- # 1. Интерфейсы блоков (TypeScript)
		    
		  ```typescript
		  // types/block.ts
		  export type BlockID = string;
		  
		  export interface Rect {
		  x: number;
		  y: number;
		  }
		  export interface Size {
		  width: number;
		  height: number;
		  }
		  
		  export interface BlockCore {
		  id: BlockID;
		  type: string;
		  order: number;                     // integer order for flow-mode
		  position?: Rect;                   // for edgeless absolute coords
		  size?: Size;
		  zIndex?: number;
		  connectedWith?: string | null;     // previous block id (simple linear link)
		  pluginState?: Record<string, any>; // pluginId -> arbitrary plugin payload (namespaced)
		  meta?: Record<string, any>;        // optional metadata (flags, style keys)
		  }
		  ```
		    
		  **Примечание:** реальное интерактивное состояние (текст CRDT, таблицы и т.д.) хранится в CRDTDoc; `pluginState` используется для небольших сериализуемых данных, маппинга и мета.  
		- # 2. Интерфейсы редактора (EditorCore и менеджеры)
		    
		  ```typescript
		  // types/editor.ts
		  import { Document } from './document';
		  import { Renderer } from './renderer';
		  import { EditorPlugin } from './plugin';
		  import { ProviderConfig } from './provider';
		  import { BlockCore } from './block';
		  
		  export interface EditorOptions {
		  container: HTMLElement;
		  document?: Document;      // optional initial doc
		  renderer?: Renderer;
		  plugins?: EditorPlugin[];
		  themeId?: string;
		  }
		  
		  export interface Selection {
		  blockIds: BlockID[];      // selected blocks (multi)
		  // for edgeless: bounding box & anchor point on paste
		  bounds?: { x:number; y:number; width:number; height:number };
		  }
		  
		  export interface EditorCore {
		  // lifecycle
		  init(): Promise<void>;
		  destroy(): Promise<void>;
		  
		  // documents
		  createDocument(id?: string): Document;
		  openDocument(id: string): Promise<Document>;
		  closeDocument(id: string): Promise<void>;
		  getCurrentDocument(): Document | null;
		  
		  // plugin
		  registerPlugin(plugin: EditorPlugin): void;
		  unregisterPlugin(pluginId: string): void;
		  
		  // renderer and UI
		  setRenderer(r: Renderer): void;
		  getRenderer(): Renderer;
		  
		  // managers access
		  getSelectionManager(): SelectionManager;
		  getClipboardManager(): ClipboardManager;
		  getProviderManager(): ProviderManager;
		  getUndoManager(): UndoManager;
		  getThemeManager(): ThemeManager;
		  
		  // convenience block ops
		  createBlock(type: string, initialState?: any, opts?: Partial<BlockCore>): Promise<BlockCore>;
		  deleteBlock(id: BlockID): Promise<void>;
		  // serialization
		  serializeDocument(format?: 'json'|'html'|'md'): Promise<any>;
		  deserializeDocument(payload: any, opts?: { targetDocId?: string }): Promise<Document>;
		  }
		  ```
		    
		  Дополнительно — интерфейсы менеджеров (качественно):  
		    
		  ```typescript
		  // SelectionManager
		  interface SelectionManager {
		  getSelection(): Selection;
		  setSelection(sel: Selection): void;
		  clear(): void;
		  on(event: 'change'|'select'|'deselect', handler: Function): Unsubscribe;
		  }
		  
		  // ClipboardManager (multi-mime)
		  interface ClipboardManager {
		  copy(selection?: Selection): Promise<void>;
		  paste(at?: { x:number; y:number }): Promise<BlockCore[]>;
		  handleCopyEvent(ev: ClipboardEvent): Promise<void>;
		  handlePasteEvent(ev: ClipboardEvent): Promise<void>;
		  }
		  
		  // ProviderManager
		  type ProviderType = 'websocket'|'hocuspocus'|'webrtc'|'indexeddb'|'custom';
		  interface ProviderConfig {
		  type: ProviderType;
		  url?: string;
		  options?: any;
		  }
		  interface ProviderManager {
		  attachProvider(docId: string, cfg: ProviderConfig): Promise<void>;
		  detachProvider(docId: string): Promise<void>;
		  getProvider(docId: string): any;
		  }
		  ```
		- # 3. Интерфейсы плагинов и BlockDefinition
		    
		  ```typescript
		  // types/plugin.ts
		  import { Document } from './document';
		  import { EditorCore } from './editor';
		  import { BlockCore } from './block';
		  
		  export interface BlockRenderContext {
		  doc: Document;
		  editor: EditorCore;
		  selectionManager: SelectionManager;
		  // helpers to read/write block inner state via CRDT
		  getState<T = any>(block: BlockCore): Promise<T>;
		  setState(blockId: BlockID, state: any): Promise<void>;
		  }
		  
		  // BlockDefinition = contract for a block type
		  export interface BlockDefinition {
		  type: string;            // block type name: "paragraph", "table", "image", "chart:bar"
		  pluginId: string;        // owner plugin ID (namespace for pluginState)
		  // lifecycle
		  onCreate?(ctx: BlockRenderContext, block: BlockCore, initState?: any): Promise<void>;
		  onDestroy?(ctx: BlockRenderContext, block: BlockCore): Promise<void>;
		  onAttach?(ctx: BlockRenderContext, block: BlockCore, container: HTMLElement): void;
		  
		  // rendering (either or both)
		  renderDOM?(ctx: BlockRenderContext, block: BlockCore): Promise<HTMLElement> | HTMLElement;
		  renderCanvas?(ctx: BlockRenderContext, block: BlockCore, ctx2d: CanvasRenderingContext2D, transform: DOMMatrix): void;
		  
		  // serialization
		  toJSON?(block: BlockCore, state: any): any;
		  fromJSON?(payload: any): { block: Partial<BlockCore>, state?: any };
		  
		  // optional commands/keymaps/UI hooks
		  commands?: Record<string, (...args:any[])=>any>;
		  keymaps?: Array<{ key: string; command: string }>;
		  }
		  
		  // EditorPlugin = package that registers one or more BlockDefinitions and UI
		  export interface EditorPlugin {
		  id: string; // unique plugin id
		  register(editor: EditorCore): void;   // called on registration
		  unregister?(editor: EditorCore): void;
		  blocks?: BlockDefinition[];           // one or more block types
		  // optional UI bits (toolbar components, panels) can be authored as React components
		  ui?: {
		    Toolbar?: any;
		    Inspector?: any;
		  };
		  }
		  ```
		    
		  **Принцип ownership:** `pluginId` — namespace. При сериализации плагин отвечает за `pluginState[pluginId]`.  
		- # 4. CRDTDoc интерфейс (адаптер)
		    
		  ```typescript
		  // types/crdt.ts
		  export type Unsubscribe = () => void;
		  
		  export interface CRDTTransaction { /* context marker */ }
		  
		  export interface CRDTArray {
		  toArray(): any[];
		  push(...items:any[]): void;
		  delete(index:number, count?:number): void;
		  }
		  export interface CRDTMap {
		  get(key:string): any;
		  set(key:string, val:any): void;
		  toObject(): Record<string, any>;
		  }
		  export interface CRDTText {
		  toString(): string;
		  insert(pos:number, text:string): void;
		  delete(pos:number, length:number): void;
		  }
		  
		  export interface CRDTDoc {
		  id: string;
		  attachProvider(provider: any): Promise<void>;
		  detachProvider(): Promise<void>;
		  transact(fn:(tx:CRDTTransaction)=>void): void;
		  getArray(path: string): CRDTArray;
		  getMap(path: string): CRDTMap;
		  getText(path: string): CRDTText;
		  on(event: 'update'|'sync'|'snapshot', handler: Function): Unsubscribe;
		  getSnapshot(): any;
		  applySnapshot(snapshot: any): void;
		  destroy(): void;
		  }
		  ```
		    
		  Реализация: `YjsDocAdapter implements CRDTDoc`, скрывает Yjs в адаптере.  
		- # 5. Renderer интерфейс
		    
		  ```typescript
		  // types/renderer.ts
		  import { Document } from './document';
		  import { BlockCore } from './block';
		  
		  export interface Renderer {
		  mount(container: HTMLElement): void;
		  unmount(): void;
		  renderSnapshot(doc: Document): Promise<void>;
		  applyCRDTUpdate(update: any): void; // incremental update hook
		  focusBlock(id: BlockID): void;
		  toScreenCoords(pos: {x:number;y:number}): {x:number;y:number};
		  fromScreenCoords(p: {x:number;y:number}): {x:number;y:number};
		  }
		  ```
		- # 6. ThemeManager (contract)
		    
		  ```typescript
		  export interface Theme {
		  id: string;
		  tokens: Record<string, string>; // CSS vars (e.g. --bg, --accent)
		  meta?: any;
		  }
		  
		  export interface ThemeManager {
		  getCurrentTheme(): Theme;
		  setTheme(id: string): Promise<void>;
		  registerTheme(theme: Theme): void;
		  applyThemeToBlock(block: BlockCore, element: HTMLElement): void;
		  }
		  ```
		- # 7. Serialization contract (core flow)
		- `serializeDocument(format)` iterates blocks; for each block:
			- if plugin has `toJSON` → call it, include returned payload under block entry.
			- else generate fallback stub `{ id, type, order, position, size, pluginState }`.
		- `deserializeDocument(bundle)`:
			- For each block entry: find plugin by `block.type`/`bundle.pluginId`:
				- if `fromJSON` exists → call and create block with returned `block` + create CRDT state using `state`.
				- else create generic block with raw `pluginState`.
				    
				  **Bundle shape (JSON):**  
				    
				  ```
				  {
				  "version": 1,
				  "meta": { "createdBy": "editor-v1" },
				  "blocks": [
				  {
				    "id": "b1",
				    "type": "table",
				    "order": 1,
				    "position": { "x": 120, "y": 40 },
				    "pluginState": {
				       "table": { ... },
				       "text-formatting": { ... }
				    },
				    "payload": { ... } // plugin-specific if toJSON returned different shape
				  }
				  ]
				  }
				  ```
		- # 8. Clipboard flow (detailed)
		- **Copy**
			- `ClipboardManager.copy(selection)`:
				- collect `BlockCore[]` from Document.
				- for each block, call plugin `toJSON` (if available) to get plugin-specific serialized payload; otherwise include fallback `pluginState`.
				- assemble `ClipboardBundle` and put to system clipboard with multi-mime:
					- `application/x-myeditor+json` → JSON string of bundle,
					- `text/html` → plugin-provided HTML or core fallback,
					- `text/plain` → simple text.
				- also keep ephemeral in-memory cache keyed with a short ID to support richer restores on paste (if system clipboard strips format).
		- **Paste**
			- On paste: examine clipboard types; prefer `application/x-myeditor+json`. If missing, try `text/html` (run HTML importer converters), else `text/plain`.
			- After decoding bundle:
				- remap IDs → generate new UUIDs for each block and update internal references (links, connectedWith).
				- if pasting into edgeless and bundle has absolute positions — offset by paste point.
				- insert blocks in a single CRDT transaction (Document.transact) using Document.createBlock (which will call plugin hooks `fromJSON` to create CRDT state).
				- set selection to newly inserted blocks.
		- # 9. Links / composite grouping / horizontal joins
		- **Links are first-class**: stored in Document as array of `Link {id, from, to, meta}`. Links can represent horizontal joins, edges between nodes, or logical groups.
		- **Composite plugin**: a plugin can observe links and create a logical group (groupId) — UI shows them as a single composite block (but underlying model remains separate blocks linked).
		- **Renderer** draws visual connectors (edgeless) based on links; in block-mode the composite plugin may present a combined view.
		- # 10. Where provider is attached
		- `ProviderManager.attachProvider(docId, cfg)` → finds `Document` → calls `Document.getCRDT().attachProvider(provider)` with provider implementation from cfg (e.g., y-websocket connector).
		- Providers live in runtime (EditorCore/ProviderManager), not in Document model.
		- # 11. Undo/Redo
		- `UndoManager` is an Editor-level manager with adapters:
			- `YjsUndoAdapter` uses `Y.UndoManager()` scoped to keys (e.g., key per block text).
			- fallback local stack for non-CRDT operations.
		- Undo can be scoped to Document or global.
		- # 12. Security / plugin scope
		- Plugins receive limited API (`editor` public surface + helpers).
		- Optionally heavy or untrusted logic runs in WebWorker/iframe; UI components provided by plugin should be React components that the host mounts (so host can control sandboxing).
		    
---
		- # 13. Расширенная архитектурная диаграмма (компоненты и взаимодействия)
		    
		  Текстовая блок-схема (для быстрого понимания):  
		    
		  ```
		  [App (React)]
		   |
		   v
		  [EditorCore]-----------------------------+
		  |  |  |  |   |   |   |                 |
		  |  |  |  |   |   |   +--> [ThemeManager]
		  |  |  |  |   |   +----> [ProviderManager] --> Provider (y-websocket/hocuspocus/...)
		  |  |  |  |   +--------> [PluginManager] --> [Plugins (blocks definitions)]
		  |  |  |  +------------> [DocumentStore] -> Document -> CRDTDoc (YjsDocAdapter) -> Y.Doc
		  |  |  +---------------> [SelectionManager]
		  |  +------------------> [ClipboardManager]
		  +---------------------> [Renderer] ---> BlockDOMRenderer | EdgelessCanvasRenderer
		                              |
		                              +--> Mounts plugin DOM renderers for interactive blocks
		                              +--> Renders canvas layers (edges, decorations)
		  ```
		- # 14. Финальный список пакетов (рекомендуемые, проверенные)
		    
		  >   
		    
		  Сфокусирован на стабильности, совместимости с React и Yjs. Делать минимальные зависимости — принцип.  
		    
		  **CRDT & sync**  
		- `yjs` — CRDT core.
		- `y-websocket` — websocket provider.
		- `y-webrtc` — optional peer-to-peer provider.
		- `y-indexeddb` — persistence/offline.
		- `y-protocols` (awareness) — presence.
		    
		  **Backend / server**  
		- `@hocuspocus/server` and `@hocuspocus/provider` — modern server/provider (optional, recommended).
		- `ws` — if writing custom WebSocket server.
		    
		  **React & UI**  
		- `react`, `react-dom`
		- `zustand` — optional small state for non-CRDT UI bits (tool panels).
		- `@tanstack/react-virtual` — virtualized lists/tables.
		- `react-aria` (optional) — accessibility helpers.
		    
		  **Canvas / drawing**  
		- `konva` + `react-konva` — optional higher-level canvas lib (useful for edgeless interactions).
		- OR plain Canvas2D (no deps) — recommended for maximum control.
		    
		  **Utilities**  
		- `nanoid` or `uuid` — id generation.
		- `ajv` — JSON schema validation for plugin/properties (optional).
		- `lodash` — utilities (optional).
		    
		  **Build / tooling / tests**  
		- `typescript`
		- `tsup` or `rollup` — bundling
		- `vitest` / `jest` — unit tests
		- `playwright` / `cypress` — e2e
		- `storybook` — UI components showcase
		- `docusaurus` — docs
		    
		  **Serialization / HTML**  
		- `turndown` / `html-to-text` — for html/markdown conversion (optional)
		- # 15. Пример API:  `editor.defineBlock()`  и использование
		    
		  Ниже — пример кода, как плагин регистрирует блок и как хоста вызывает API.  
		    
		  ```typescript
		  // example/plugins/paragraph.ts
		  import { EditorPlugin, BlockDefinition, BlockRenderContext } from 'my-editor-types';
		  import { nanoid } from 'nanoid';
		  
		  const PARAGRAPH_PLUGIN_ID = 'core.paragraph';
		  
		  const paragraphBlock: BlockDefinition = {
		  type: 'paragraph',
		  pluginId: PARAGRAPH_PLUGIN_ID,
		  
		  async onCreate(ctx, block, initialState) {
		    // Create a Y.Text in the document CRDT under key "block:{id}:text"
		    const crdt = ctx.doc.getCRDT();
		    crdt.transact(() => {
		      const key = `block:${block.id}:text`;
		      const txt = crdt.getText(key);
		      if (initialState?.text) {
		        txt.insert(0, initialState.text);
		      }
		    });
		  },
		  
		  renderDOM(ctx, block) {
		    const el = document.createElement('div');
		    el.className = 'block paragraph';
		    el.dataset.blockId = block.id;
		    // Wire CRDT text -> contentEditable
		    const key = `block:${block.id}:text`;
		    const crdt = ctx.doc.getCRDT();
		    const ytext = crdt.getText(key);
		    el.contentEditable = 'true';
		    el.innerText = ytext.toString();
		    // simple sync: listen to input and write back (real impl must use transactions + diff)
		    el.addEventListener('input', (ev) => {
		      const text = el.innerText;
		      crdt.transact(() => {
		        // naive update: replace whole content
		        const t = crdt.getText(key);
		        t.delete(0, t.toString().length);
		        t.insert(0, text);
		      });
		    });
		    return el;
		  },
		  
		  toJSON(block, state) {
		    // Read minimal state (for portability): read text from CRDT and return
		    return {
		      id: block.id,
		      type: block.type,
		      order: block.order,
		      position: block.position,
		      payload: state?.text ?? null
		    };
		  },
		  
		  fromJSON(payload) {
		    const blk: Partial<BlockCore> = {
		      id: payload.id ?? `p-${nanoid()}`,
		      type: 'paragraph',
		      order: payload.order ?? 0,
		      position: payload.position
		    };
		    return { block: blk, state: { text: payload.payload } };
		  }
		  };
		  
		  export const ParagraphPlugin: EditorPlugin = {
		  id: PARAGRAPH_PLUGIN_ID,
		  register(editor) {
		    editor.registerBlockDefinition(paragraphBlock);
		  }
		  };
		  ```
		    
		  **Как хост использует:**  
		    
		  ```typescript
		  const editor = createEditor({ container: rootEl }); // returns EditorCore
		  editor.registerPlugin(ParagraphPlugin);
		  
		  // higher-level helper:
		  editor.defineBlock = (def: BlockDefinition) => {
		  editor.registerPlugin({
		    id: def.pluginId,
		    register(ed) { ed.registerBlockDefinition(def); }
		  });
		  };
		  
		  // usage:
		  editor.defineBlock(paragraphBlock);
		  ```
		    
		  **Примечание:** `registerBlockDefinition` — метод на PluginManager/EditorCore, который привязывает BlockDefinition к типу и плагину. Реализация должна валидировать `type`/`pluginId` на уникальность.  
		- # 16. PlantUML диаграмма зависимости
		    
		  Ниже — текст PlantUML для визуализации архитектуры. Можно сохранить в `architecture.puml` и отрисовать локально (`plantuml`) или через PlantUML online.  
		    
		  ```typescript
		  @startuml EditorArchitecture
		  skinparam dpi 150
		  left to right direction
		  actor "Host App (React)" as Host
		  
		  rectangle "EditorCore" as Core {
		  [PluginManager]
		  [ProviderManager]
		  [DocumentStore]
		  [Renderer]
		  [SelectionManager]
		  [ClipboardManager]
		  [UndoManager]
		  [ThemeManager]
		  }
		  
		  rectangle "Document" as Doc {
		  [Blocks Array]
		  [Links Array]
		  [Meta]
		  [CRDTDoc Adapter]
		  }
		  
		  rectangle "CRDT Layer" as CRDT {
		  [Y.Doc (Yjs)]
		  [Providers (y-websocket, indexeddb)]
		  }
		  
		  rectangle "Plugins" as Plugins {
		  [Paragraph Plugin]
		  [Table Plugin]
		  [Image Plugin]
		  [Custom Plugins...]
		  }
		  
		  rectangle "Renderers" as Renders {
		  [BlockDOMRenderer]
		  [EdgelessCanvasRenderer]
		  }
		  
		  Host --> Core : instantiates / interacts
		  Core --> Doc : open/create documents
		  Core --> Plugins : registers plugins
		  Core --> Renders : setRenderer/mount
		  Plugins --> Doc : create/update block states via Document API
		  Doc --> CRDT : delegates to CRDTDoc adapter
		  Core --> ProviderManager : attach/detach providers
		  ProviderManager --> CRDT
		  Renders --> Plugins : invokes renderDOM/renderCanvas
		  Renders --> Doc : reads blocks & links
		  Core --> SelectionManager
		  Core --> ClipboardManager
		  Core --> UndoManager
		  Core --> ThemeManager
		  
		  @enduml
		  ```
		    
		  **Как отрисовать:**  
		- Локально: установить PlantUML + JRE, затем:
		    
		  ```
		  plantuml architecture.puml
		  ```
		    
		  В результате получите `architecture.png`/`svg`.  
		- Онлайн: вставьте Puml в [[PlantUML Web Server](https://www.plantuml.com/plantuml/](https://www.plantuml.com/plantuml/)) or any PlantUML server.
		- # 17. Резюме — что вы получите из этой спецификации
		- Полностью модульную архитектуру: Document (CRDT-агностичен) + EditorCore runtime + Plugin system.
		- Возможность переключения renderer-ов без изменения модели.
		- Надёжный clipboard/serialization pipeline с fallback-ами.
		- Namespaced plugin state (`pluginId`) — безопасно, предсказуемо.
		- Поддержка nested editors через `nestedDocRef` и lazy DocumentStore.
		- Темing, links/graph, undo/redo — на уровне менеджеров.
		- CRDT абстракция позволяет сменить Yjs на другую CRDT, если потребуется.
		    
---
		    
		  Если нужно, могу прямо сейчас (в следующем сообщении) **сгенерировать skeleton репозитория** (файлы `src/` с интерфейсами, пустыми классами-адаптерами и простой demo app), либо начать реализацию конкретного модуля — скажи, что предпочитаешь первым.  
	- # 3 сообщение
	  collapsed:: true
		- Точно — в предыдущей версии интерфейсов **не было механизма регистрации блоков**. Это нормально: мы только тогда собирали минимальный каркас. Теперь, когда архитектура усложнилась (плагины, сериализация, схемы данных), без регистрации уже нельзя.
		    
		  Поэтому сейчас я обновлю архитектуру и добавлю недостающие элементы.  
		    
		  Ниже — **актуальный, расширенный, полный набор интерфейсов**, включая:  
		- интерфейсы блоков
		- интерфейсы редактора
		- интерфейсы плагинов
		- BlockRegistry / PluginRegistry
		- API вроде `editor.defineBlock()`
		- и объяснение, где что живёт
		    
		  Если хочешь — после этого собираю PlantUML.  
		    
---
		- # ✅  **1. Интерфейсы блоков (финальная версия)**
		    
		  ```
		  export interface BlockSchema<Data = any> {
		  version: string;
		  defaults: Data;
		  validate?: (data: unknown) => data is Data;
		  }
		  
		  export interface BlockDefinition<
		  Type extends string = string,
		  Data = any,
		  Instance extends BlockInstance = BlockInstance
		  > {
		  type: Type;
		  schema: BlockSchema<Data>;
		  create: (initial?: Partial<Data>) => Instance;
		  }
		  
		  export interface BlockInstance<Type extends string = string, Data = any> {
		  readonly type: Type;
		  id: string;
		  data: Data;
		  
		  // API
		  update(data: Partial<Data>): void;
		  toJSON(): any;
		  }
		  ```
		    
---
		- # ✅  **2. Block Registry (новое, обязательное)**
		    
		  ```
		  export interface BlockRegistry {
		  register(def: BlockDefinition): void;
		  
		  has(type: string): boolean;
		  
		  /**
		   * Creates a block instance by type.
		   */
		  create(type: string, initial?: any): BlockInstance;
		  
		  /**
		   * Given a JSON representation of block, restore instance.
		   */
		  fromJSON(json: any): BlockInstance;
		  }
		  ```
		    
		  Примечания:  
		- `register(def)` — регистрация по типу.
		- `create(type)` — фабрика (единственно правильный способ создавать блоки).
		- `fromJSON` — используется при загрузке документа.
		    
---
		- # ✅  **3. Интерфейсы редактора (с регистрацией)**
		    
		  ```
		  export interface Editor {
		  blocks: BlockRegistry;
		  plugins: PluginRegistry;
		  
		  load(doc: any): void;
		  save(): any;
		  
		  defineBlock(def: BlockDefinition): void;
		  use(plugin: EditorPlugin): void;
		  }
		  ```
		    
---
		- # ✅  **4. Интерфейсы плагинов**
		    
		  ```
		  export interface EditorPluginContext {
		  editor: Editor;
		  getBlock<T = any>(id: string): BlockInstance<T>;
		  on(event: string, cb: (...args: any[]) => void): void;
		  }
		  
		  export interface EditorPlugin {
		  name: string;
		  
		  /**
		   * Called when plugin is attached to editor
		   */
		  setup(ctx: EditorPluginContext): void;
		  
		  /**
		   * Optional: plugin can extend schema of blocks
		   */
		  extendBlockSchema?(
		    type: string,
		    extend: (schema: BlockSchema) => BlockSchema
		  ): void;
		  
		  /**
		   * Optional: plugin-level storage under editor.save()
		   */
		  save?(): any;
		  load?(data: any): void;
		  }
		  ```
		    
---
		- # ✅  **5. Plugin Registry (новое)**
		    
		  ```
		  export interface PluginRegistry {
		  register(plugin: EditorPlugin): void;
		  
		  get(name: string): EditorPlugin | undefined;
		  
		  save(): Record<string, any>;
		  load(data: Record<string, any>): void;
		  }
		  ```
		    
---
		- # ✅  **6. Расширенная архитектура пакетов**
		    
		  ```
		  packages/
		  core/
		    editor/
		    block-registry/
		    plugin-registry/
		    types/
		  blocks/
		    paragraph/
		    heading/
		    table/
		    image/
		  plugins/
		    history/
		    selection/
		    markdown/
		    collaborative/
		  ```
		    
---
		- # ✅  **7. API пример: editor.defineBlock()**
		    
		  ```
		  editor.defineBlock({
		  type: "table",
		  schema: {
		    version: "1.0.0",
		    defaults: { rows: 2, cols: 2 }
		  },
		  create: (initial) => new TableBlock(initial)
		  });
		  ```
		    
		  Тогда создать блок можно так:  
		    
		  ```
		  const block = editor.blocks.create("table", { rows: 4 });
		  ```
		    
		  А загрузить документ из JSON:  
		    
		  ```
		  const doc = editor.blocks.fromJSON(json);
		  ```
		    
---
	- # Вот финалочка
		- # 🧩 Ты был прав — регистрация отсутствовала, теперь она  **нормально встроена** .
		    
		  Если хочешь, сейчас выполню вторую часть запроса:  
		    
		  👉 **нарисовать PlantUML диаграмму зависимости редактора, блоков, плагинов, реестров**.  
		    
		  Сказать?  
		- Отлично — собираю **полную, согласованную архитектуру v3**: все компоненты, интерфейсы (TypeScript), менеджеры, события, flow сериализации/clipboard, registration и примеры API. В конце — **PlantUML** диаграмма (текст) и инструкция, как её отрисовать. Всё готово, чтобы сразу браться за реализацию.
		    
		  Я держал баланс: достаточно деталей для безопасной имплементации, но без избыточного «воды». Если хочешь, затем могу сгенерировать skeleton-репо по этой спецификации.  
		    
---
		- # Содержание (быстрая навигация)
		- Ключевая идея / краткая схема
		- Все основные компоненты (с ролями)
		- Полные интерфейсы (TypeScript)
			- Core types: Block, Link, Bundle
			- DocumentModel & CRDT adapter
			- BlockRegistry & BlockDefinition & BlockInstance
			- PluginRegistry & EditorPlugin
			- EditorCore & EditorView
			- Managers: SelectionManager, ClipboardManager, ProviderManager, UndoManager, ThemeManager, EventBus
			- Renderer interface(s)
		- Серилизация / Clipboard flow (детально)
		- Registration и lifecycle: defineBlock / registerPlugin / createBlock
		- Пример: `editor.defineBlock()` + paragraph plugin snippet
		- PlantUML диаграмма (текст + инструкция)
		- Резюме и следующий шаг
		    
---
		- # 1. Ключевая идея (коротко)
		- `DocumentModel` — **высокоуровневый источник правды** содержимого (блоки, links, meta), агрегирует CRDT через `CRDTDoc` (по умолчанию Yjs через адаптер).
		- `EditorCore` — runtime/orchestrator: держит `DocumentStore`, `PluginRegistry`, `BlockRegistry`, `ProviderManager`, `Renderer`, `SelectionManager`, `ClipboardManager`, `UndoManager`, `ThemeManager`, `EventBus`.
		- `EditorView` — UI-слой (React) который монтирует `Renderer` и подключает DOM события к `ClipboardManager`/`SelectionManager`.
		- `Plugins` регистрируют `BlockDefinition`(ы), UI-виджеты и сериализаторы.
		- `BlockRegistry` — обязателен: регистрирует типы блоков (фабрики/схемы/версионирование) и используется при `deserialize`/`create`.
		    
---
		- # 2. Основные компоненты (роли)
		- **BlockRegistry** — регистрация типов блоков (type → BlockDefinition factory).
		- **PluginRegistry** — регистрация плагинов (lifecycle hooks).
		- **DocumentModel** — CRUD и транзакции над блоками/links + наблюдатели.
		- **CRDTDoc** — адаптер к CRDT (YjsDocAdapter implements CRDTDoc).
		- **EditorCore** — объединяет всё, public API.
		- **EditorView** — React component (mount/unmount) + DOM event hooks.
		- **Renderer** — Bridge: renders Document → DOM/Canvas.
		- **Managers** — SelectionManager, ClipboardManager, ProviderManager, UndoManager, ThemeManager, EventBus.
		- **Plugins** — define blocks, serializers, UI portions.
		    
---
		- # 3. Полные интерфейсы (TypeScript)
		    
		  >   
		    
		  Привожу компактные, но полные интерфейсы. Это контракт для реализации.  
		- ### a) Core types: Block, Link, Bundle
		    
		  ```
		  // core/types.ts
		  export type ID = string;
		  
		  export interface Rect { x: number; y: number; }
		  export interface Size { width: number; height: number; }
		  
		  export interface BlockCore {
		  id: ID;
		  type: string;
		  order: number;               // flow position
		  position?: Rect;             // edgeless coords
		  size?: Size;
		  zIndex?: number;
		  connectedWith?: ID | null;   // simple chain link
		  pluginState?: Record<string, any>; // pluginId => payload
		  meta?: Record<string, any>;
		  }
		  
		  export interface Link {
		  id: ID;
		  from: { blockId: ID; port?: string };
		  to: { blockId: ID; port?: string };
		  meta?: any;
		  }
		  
		  export interface DocumentBundle {
		  version: number;
		  meta?: Record<string, any>;
		  blocks: Array<any>; // serialized block payloads
		  links?: Link[];
		  plugins?: Record<string, any>; // plugin-level saved data
		  }
		  ```
		    
---
		- ### b) CRDTDoc (adapter)
		    
		  ```
		  // core/crdt.ts
		  export type Unsubscribe = () => void;
		  export interface CRDTTransaction { meta?: any }
		  
		  export interface CRDTArray {
		  toArray(): any[];
		  push(...items:any[]): void;
		  delete(index:number, count?:number): void;
		  }
		  export interface CRDTMap {
		  get(key:string): any;
		  set(key:string, val:any): void;
		  toObject(): Record<string, any>;
		  }
		  export interface CRDTText {
		  toString(): string;
		  insert(pos:number, text:string): void;
		  delete(pos:number, length:number): void;
		  // ...other helpers
		  }
		  
		  export interface CRDTDoc {
		  id: string;
		  attachProvider(provider: any): Promise<void>;
		  detachProvider(): Promise<void>;
		  transact(fn:(tx:CRDTTransaction)=>void): void;
		  getArray(path: string): CRDTArray;
		  getMap(path: string): CRDTMap;
		  getText(path: string): CRDTText;
		  on(event: 'update'|'sync'|'snapshot', handler: Function): Unsubscribe;
		  getSnapshot(): any;
		  applySnapshot(snapshot: any): void;
		  destroy(): void;
		  }
		  ```
		    
		  >   
		    
		  Реализация: `YjsDocAdapter implements CRDTDoc` (wraps Y.Doc, maps getArray->Y.Array etc).  
		    
---
		- ### c) DocumentModel (high-level)
		    
		  ```
		  // core/document.ts
		  import { BlockCore, Link } from './types';
		  import { CRDTDoc } from './crdt';
		  
		  export interface DocumentModelEvents {
		  on(event: 'change'|'blocks.update'|'links.update', cb: Function): Unsubscribe;
		  }
		  
		  export interface DocumentModel extends DocumentModelEvents {
		  id: string;
		  crdt: CRDTDoc;
		  
		  // blocks
		  getBlock(id: ID): Promise<BlockCore | null>;
		  getBlocks(): Promise<BlockCore[]>;
		  insertBlock(block: BlockCore, afterId?: ID | null): Promise<void>;
		  removeBlock(id: ID): Promise<void>;
		  moveBlock(id: ID, afterId: ID | null): Promise<void>;
		  updateBlock(id: ID, patch: Partial<BlockCore>): Promise<void>;
		  
		  // links
		  getLinks(): Promise<Link[]>;
		  createLink(link: Link): Promise<void>;
		  removeLink(id: ID): Promise<void>;
		  
		  // snapshot/serialization
		  toBundle(): Promise<DocumentBundle>;
		  loadFromBundle(bundle: DocumentBundle): Promise<void>;
		  
		  // low-level access
		  transact(fn:(tx: CRDTTransaction)=>void): void;
		  }
		  ```
		    
---
		- ### d) BlockDefinition / BlockInstance / BlockRegistry
		    
		  ```
		  // core/block.ts
		  import { DocumentModel } from './document';
		  import { EditorCore } from './editor';
		  
		  export interface BlockSchema<Data = any> {
		  version: string;
		  defaults: Data;
		  validate?: (data: unknown) => data is Data;
		  }
		  
		  export interface BlockInstance<Data = any> {
		  id: ID;
		  type: string;
		  data: Data;
		  update(patch: Partial<Data>): Promise<void>;
		  toJSON(): any;
		  }
		  
		  export interface BlockDefinition<Data = any> {
		  type: string;
		  pluginId: string; // namespace / owner
		  schema: BlockSchema<Data>;
		  create(initial?: Partial<Data>): BlockInstance<Data>;
		  // lifecycle hooks called by DocumentModel or EditorCore
		  onCreate?(doc: DocumentModel, block: BlockInstance<Data>, ctx?: any): Promise<void>;
		  onDestroy?(doc: DocumentModel, blockId: ID): Promise<void>;
		  // render API is separate (see Renderer / View)
		  toJSON?(block: BlockInstance<Data>, doc: DocumentModel): Promise<any>;
		  fromJSON?(payload: any): Promise<{ block: Partial<BlockCore>, state?: any }>;
		  }
		  
		  export interface BlockRegistry {
		  register(def: BlockDefinition): void;
		  unregister(type: string): void;
		  has(type: string): boolean;
		  create(type: string, initial?: any): BlockInstance;
		  fromJSON(json:any): BlockInstance;
		  get(type: string): BlockDefinition | undefined;
		  }
		  ```
		    
---
		- ### e) PluginRegistry & EditorPlugin
		    
		  ```
		  // core/plugin.ts
		  import { EditorCore } from './editor';
		  
		  export interface EditorPluginContext {
		  editor: EditorCore;
		  document?: DocumentModel;
		  on(event: string, cb: Function): Unsubscribe;
		  }
		  
		  export interface EditorPlugin {
		  id: string;
		  setup(ctx: EditorPluginContext): void | Promise<void>;
		  teardown?(ctx: EditorPluginContext): void | Promise<void>;
		  
		  // optional: register blocks, commands, UI
		  blocks?: BlockDefinition[];
		  // optional storage: save/load
		  save?(): any;
		  load?(data: any): void;
		  }
		  
		  export interface PluginRegistry {
		  register(plugin: EditorPlugin): void;
		  unregister(pluginId: string): void;
		  get(pluginId: string): EditorPlugin | undefined;
		  list(): EditorPlugin[];
		  save(): Record<string, any>;
		  load(data: Record<string, any>): void;
		  }
		  ```
		    
---
		- ### f) EventBus (pub/sub)
		    
		  ```
		  // core/events.ts
		  export type EventHandler = (...args:any[])=>void;
		  export interface EventBus {
		  on(event: string, handler: EventHandler): Unsubscribe;
		  off(event: string, handler: EventHandler): void;
		  emit(event: string, ...args:any[]): void;
		  }
		  ```
		    
---
		- ### g) Managers: SelectionManager, ClipboardManager, ProviderManager, UndoManager, ThemeManager
		    
		  ```
		  // core/managers.ts
		  import { BlockCore } from './types';
		  import { DocumentModel } from './document';
		  import { ProviderConfig } from './provider';
		  
		  export interface Selection {
		  focusBlockId: ID | null;
		  selectedBlockIds: ID[];
		  bounds?: { x:number;y:number;width:number;height:number };
		  }
		  
		  export interface SelectionManager {
		  get(): Selection;
		  set(sel: Selection): void;
		  clear(): void;
		  on(event:'change', cb: (s:Selection)=>void): Unsubscribe;
		  }
		  
		  export interface ClipboardBundle {
		  id?: string; // ephemeral local id
		  createdAt?: number;
		  bundle: DocumentBundle; // see core/types
		  // optional: original selection and coords
		  source?: { docId?: string; selection?: Selection; pos?: {x:number;y:number} };
		  }
		  
		  export interface ClipboardManager {
		  copy(doc: DocumentModel, selection: Selection): Promise<void>;
		  paste(doc: DocumentModel, at?: { x:number; y:number }): Promise<BlockCore[]>;
		  handleCopyEvent(ev: ClipboardEvent): Promise<void>;
		  handlePasteEvent(ev: ClipboardEvent): Promise<void>;
		  // exposes ephemeral cache (optional)
		  getCache(id: string): ClipboardBundle | undefined;
		  }
		  
		  export interface ProviderConfig {
		  type: 'websocket'|'hocuspocus'|'webrtc'|'indexeddb'|'custom';
		  url?: string;
		  options?: any;
		  }
		  
		  export interface ProviderManager {
		  attach(docId: string, cfg: ProviderConfig): Promise<void>;
		  detach(docId: string): Promise<void>;
		  getProvider(docId: string): any;
		  }
		  
		  export interface UndoManager {
		  undo(scope?: { docId?: string }): Promise<void>;
		  redo(scope?: { docId?: string }): Promise<void>;
		  // optional: integrate with CRDT Undo managers
		  }
		  
		  export interface Theme {
		  id: string;
		  tokens: Record<string,string>; // CSS variables
		  meta?: any;
		  }
		  export interface ThemeManager {
		  getCurrent(): Theme;
		  setTheme(id: string): Promise<void>;
		  register(theme: Theme): void;
		  applyToBlock(block: BlockCore, el: HTMLElement): void;
		  }
		  ```
		    
---
		- ### h) Renderer & EditorView
		    
		  ```
		  // core/renderer.ts
		  import { DocumentModel } from './document';
		  
		  export interface RendererOptions { reactMode?: boolean; /* etc */ }
		  
		  export interface Renderer {
		  mount(container: HTMLElement, options?: RendererOptions): void;
		  unmount(): void;
		  renderSnapshot(doc: DocumentModel): Promise<void>;
		  applyDocumentUpdate(doc: DocumentModel, patch?: any): void;
		  focusBlock(id: ID): void;
		  // coordinate transforms
		  toScreenCoords(p: {x:number;y:number}): {x:number;y:number};
		  fromScreenCoords(p: {x:number;y:number}): {x:number;y:number};
		  }
		  ```
		    
		  ```
		  // core/view.ts
		  export interface EditorView {
		  mount(element: HTMLElement): void;
		  unmount(): void;
		  getRootElement(): HTMLElement;
		  editor: EditorCore;
		  // view hooks: input events forwarded to editor (keyboard/pointer)
		  }
		  ```
		    
---
		- ### i) EditorCore (public API)
		    
		  ```
		  // core/editor.ts
		  import { DocumentModel } from './document';
		  import { BlockRegistry } from './block';
		  import { PluginRegistry } from './plugin';
		  import { Renderer } from './renderer';
		  import { SelectionManager, ClipboardManager, ProviderManager, UndoManager, ThemeManager } from './managers';
		  import { EventBus } from './events';
		  
		  export interface EditorOptions {
		  container?: HTMLElement;
		  initialDocumentId?: string;
		  renderer?: Renderer;
		  plugins?: EditorPlugin[];
		  providers?: ProviderConfig[];
		  themeId?: string;
		  }
		  
		  export interface EditorCore {
		  // lifecycle
		  init(): Promise<void>;
		  destroy(): Promise<void>;
		  
		  // registries
		  blocks: BlockRegistry;
		  plugins: PluginRegistry;
		  
		  // documents
		  createDocument(id?: string): Promise<DocumentModel>;
		  openDocument(id: string): Promise<DocumentModel>;
		  closeDocument(id: string): Promise<void>;
		  getDocument(id: string): DocumentModel | null;
		  getCurrentDocument(): DocumentModel | null;
		  
		  // managers
		  selection: SelectionManager;
		  clipboard: ClipboardManager;
		  providers: ProviderManager;
		  undo: UndoManager;
		  theme: ThemeManager;
		  
		  // renderer/view
		  setRenderer(renderer: Renderer): void;
		  view?: EditorView;
		  
		  // events
		  events: EventBus;
		  
		  // helpful ops
		  defineBlock(def: BlockDefinition): void; // convenience => blocks.register(def)
		  use(plugin: EditorPlugin): void;          // register plugin
		  serializeDocument(docId: string): Promise<DocumentBundle>;
		  deserializeDocument(bundle: DocumentBundle, opts?: { targetDocId?: string }): Promise<DocumentModel>;
		  }
		  ```
		    
---
		- # 4. Сериализация / Clipboard flow (детально)
		- ## Copy flow
		- `SelectionManager.get()` → list of block IDs (and optional bounds/coords).
		- `ClipboardManager.copy(doc, selection)`:
			- For each block: retrieve BlockCore from DocumentModel.
			- For each block, obtain BlockDefinition via BlockRegistry.
			- If `toJSON` exists on BlockDefinition → call it to get plugin-level payload. Else fallback to minimal `{ id, type, order, position, pluginState }`.
			- Build `DocumentBundle` with `blocks` array and `links`.
			- Put into system clipboard with multi-mime:
				- `application/x-myeditor+json` → JSON.stringify(bundle)
				- `text/html` → plugin-provided HTML or core fallback
				- `text/plain` → stripped text
			- Put ephemeral copy in local in-memory cache with short id (useful if system clipboard strips custom mimetype).
		- ## Paste flow
		- On paste event: `ClipboardManager.handlePasteEvent(ev)` called by EditorView.
		- Inspect `ev.clipboardData.types`: prefer `application/x-myeditor+json`. If not found, try HTML importers (plugins may register HTML importers) or plain text.
		- When bundle obtained:
			- Generate mapping of old IDs → new UUIDs for each block (prevent collision).
			- Remap links and `connectedWith`.
			- If paste into edgeless at point `p` and original blocks had `position`, offset all positions by paste coordinates.
			- Insert blocks in single `DocumentModel.transact` call:
				- For each block: call BlockRegistry.fromJSON or BlockRegistry.create(type) then set internal CRDT state by calling BlockDefinition.fromJSON / plugin hooks to instantiate CRDT contents.
			- Update selection to the newly inserted blocks.
			    
			  **Edge handling**: if pasted types have unknown block types, create `fallback` generic blocks that preserve pluginState for later recovery.  
			    
---
		- # 5. Registration & lifecycle (defineBlock / registerPlugin / createBlock)
		- **`editor.defineBlock(def)`** is convenience wrapper which calls `editor.blocks.register(def)`. It must:
			- validate uniqueness of `def.type`
			- store schema & factory
			- optionally run migrations if an older schema exists
		- **Plugin registration:**
			- `editor.use(plugin)` → `PluginRegistry.register(plugin)` → `plugin.setup({ editor })` called synchronously or async.
			- Plugin can register blocks by calling `editor.defineBlock(...)` inside setup.
		- **Block creation flow:**
			- Host code: `editor.createBlock(type, initialData)` or `document.insertBlock(...)`
			- BlockRegistry.create(type, initial) → returns BlockInstance (in-memory representation for DocumentModel to insert)
			- DocumentModel.insertBlock runs a CRDT transaction (via `crdt.transact`) and persists minimal metadata + calls BlockDefinition.onCreate to create CRDT state (Y.Text / Y.Map etc).
			- DocumentModel emits `blocks.update` event; Renderer/EditorView receive and re-render.
			    
---
		- # 6. Пример:  `editor.defineBlock()`  и paragraph plugin
		    
		  ```typescript
		  // plugins/paragraph.ts (conceptual)
		  const ParagraphDef: BlockDefinition<{ text?: string }> = {
		  type: 'paragraph',
		  pluginId: 'core.paragraph',
		  schema: { version: '1.0.0', defaults: { text: '' } },
		  
		  create(initial) {
		    const id = nanoid();
		    const instance: BlockInstance = {
		      id,
		      type: 'paragraph',
		      data: { ...this.schema.defaults, ...initial },
		      async update(patch) { Object.assign(this.data, patch); /* trigger CRDT write via onCreate or Document hooks */ },
		      toJSON() { return { id, type: 'paragraph', data: this.data }; }
		    };
		    return instance;
		  },
		  
		  async onCreate(doc, block) {
		    // create CRDT text container bound to block.id
		    doc.transact(() => {
		      const textKey = `block:${block.id}:text`;
		      const ytext = doc.crdt.getText(textKey);
		      if (block.data.text) ytext.insert(0, block.data.text);
		    });
		  },
		  
		  async toJSON(block, doc) {
		    const textKey = `block:${block.id}:text`;
		    const txt = doc.crdt.getText(textKey).toString();
		    return { id: block.id, type: block.type, payload: { text: txt } };
		  },
		  
		  async fromJSON(payload) {
		    return { block: { id: payload.id, type: 'paragraph' }, state: { text: payload.payload.text } };
		  }
		  };
		  
		  // register
		  editor.defineBlock(ParagraphDef);
		  ```
		    
---
		- # 7. PlantUML диаграмма (архитектура + регистрация)
		    
		  Скопируй в файл `architecture.puml` и отрисуй через PlantUML.  
		    
		  ```
		  @startuml EditorArchitectureV3
		  skinparam dpi 150
		  left to right direction
		  
		  actor "Host App (React)" as Host
		  
		  rectangle "EditorCore" as Core {
		  [BlockRegistry]
		  [PluginRegistry]
		  [DocumentStore]
		  [ProviderManager]
		  [Renderer]
		  [SelectionManager]
		  [ClipboardManager]
		  [UndoManager]
		  [ThemeManager]
		  [EventBus]
		  }
		  
		  rectangle "EditorView (React)" as View {
		  [DOM Event Hooks]
		  [Mount/Unmount]
		  [Clipboard Listeners]
		  }
		  
		  rectangle "DocumentModel" as Doc {
		  [Blocks Array]
		  [Links]
		  [Meta]
		  [CRDTDoc Adapter]
		  }
		  
		  rectangle "CRDT Layer" as CRDT {
		  [Y.Doc (Yjs)]
		  [Providers (y-websocket, indexeddb)]
		  }
		  
		  rectangle "Plugins & Blocks" as Plugins {
		  [Plugin A]
		  [Plugin B]
		  [BlockDefs...]
		  }
		  
		  rectangle "Renderers" as Renders {
		  [BlockDOMRenderer]
		  [EdgelessCanvasRenderer]
		  }
		  
		  Host --> Core : create / configure
		  Core --> View : attaches (setRenderer / mount)
		  View --> Core : forwards events (copy/paste/keyboard)
		  Core --> Doc : open/create documents
		  Doc --> CRDT : delegates CRDT ops
		  Core --> ProviderManager : attach providers
		  ProviderManager --> CRDT
		  Core --> Plugins : registers plugins (plugin.setup)
		  Plugins --> Core : defineBlock / register
		  Core --> BlockRegistry : register block types
		  Core --> Renders : instruct renderSnapshot / updates
		  Renders --> Doc : read blocks & links
		  Renders --> Plugins : call render hooks when mounting DOM for block instances
		  Core --> SelectionManager
		  Core --> ClipboardManager
		  Core --> UndoManager
		  Core --> ThemeManager
		  Core --> EventBus
		  
		  @enduml
		  ```
		    
		  **Как отрисовать:**  
		- Локально: `plantuml architecture.puml` → `architecture.png`.
		- Онлайн: вставь текст в [[PlantUML Web Server](https://www.plantuml.com/plantuml/](https://www.plantuml.com/plantuml/)) и получишь картинку.
		    
---
		- # 8. Резюме и предлагаемый следующий шаг
		    
		  Мы собрали полную архитектуру v3:  
		- Добавили обязательный `BlockRegistry` (регистрация типов) и `PluginRegistry`.
		- Представили `DocumentModel` как high-level API поверх CRDT.
		- Спроектировали managers (Selection, Clipboard, Provider, Undo, Theme) и `EventBus`.
		- Описали flow сериализации и подробный copy/paste с multi-mime и fallback.
		- Привели TypeScript контракты для всех ключевых точек интеграции.
		- Дали PlantUML диаграмму, готовую к отрисовке.
		    
		  **Следующие варианты (предлагаю выбрать один):**  
		- Сгенерировать skeleton-репо (TS source files + basic implementations/stubs для всех интерфейсов, package.json, build config).
		- Реализовать конкретный модуль: `YjsDocAdapter` (CRDT adapter) + DocumentModel implementation + simple provider (y-websocket) — чтобы иметь работающий collaborative core.
		- Сделать working demo: React app + EditorCore + BlockDOMRenderer + paragraph plugin + copy/paste.
		- Писать подробную спецификацию для каждого интерфейса (примерный код, тесты, edge cases).
		    
		  Что выбираем дальше?
