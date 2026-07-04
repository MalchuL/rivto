import type { CRDTDoc } from "../../store/crdt-doc";
import type { Block, BlockInput, BlockLayout, BlockPatch, DocumentModelImpl, Link, Snapshot } from "../../store/document-model";
import type { BlockDefinition, BlockRegistry } from "../blocks";
import type { SlashItem } from "../plugins";
import type {
  ClipboardManager,
  CommandRegistry,
  EventRouter,
  HistoryManager,
  ModeManager,
  PluginManager,
  ProviderManager,
  RivtoPlugin,
  SelectionManager,
  UIContribution,
  UIRegistry,
} from "../managers";
import type { CommandSpec } from "../managers/command-registry";

/** Local presentation strategy; never persisted in collaborative state. */
export type EditorMode = "block" | "edgeless";

/** UTF-16 text position inside a block. */
export interface EditorPosition {
  /** Stable block containing the position. */
  blockId: string;
  /** UTF-16 offset compatible with DOM Range APIs. */
  offset: number;
}

/** Directed browser-compatible text selection. */
export interface TextSelection {
  /** Discriminant for browser-compatible text selection. */
  type: "text";
  /** Endpoint where the gesture began. */
  anchor: EditorPosition;
  /** Active endpoint; may precede anchor for reverse selection. */
  head: EditorPosition;
}

/** Ordered selection of document blocks. */
export interface BlockSelection {
  /** Discriminant for ordered document-block selection. */
  type: "block";
  /** Selected IDs in visible document order. */
  blockIds: string[];
  /** Block where the selection gesture began. */
  anchorBlockId: string;
  /** Active block where the gesture currently ends. */
  focusBlockId: string;
}

/** Local selection of objects on the edgeless canvas. */
export interface EdgelessSelection {
  /** Discriminant for canvas object selection. */
  type: "edgeless";
  /** Selected object block IDs. */
  blockIds: string[];
}

/** Every local selection shape owned by SelectionManager. */
export type EditorSelection = TextSelection | BlockSelection | EdgelessSelection;
/** Markdown wrappers supported by the built-in formatting command. */
export type MarkdownFormat = "bold" | "italic" | "strike" | "code" | "link";
/** Low-level renderer events normalized for framework-independent routing. */
export type RuntimeEventType = "input" | "keydown" | "copy" | "paste" | "drop" | "pointerdown";

/**
 * Stable command contracts supplied by every EditorRuntime.
 *
 * Keeping this map beside the public editor types gives callers exact payload
 * checks and inferred results without weakening runtime validation.
 */
export type BuiltInCommandMap = {
  "block.insert": CommandSpec<{ block: BlockInput; afterId?: string | null }, string>;
  "block.update": CommandSpec<{ id: string; patch: BlockPatch }>;
  "block.remove": CommandSpec<{ id: string }>;
  "block.move": CommandSpec<{ id: string; afterId: string | null }>;
  "block.indent": CommandSpec<{ id: string }>;
  "block.outdent": CommandSpec<{ id: string }>;
  "text.set": CommandSpec<{ id: string; text: string }>;
  "text.insert": CommandSpec<{ id: string; offset: number; text: string }>;
  "text.delete": CommandSpec<{ id: string; offset: number; length: number }>;
  "text.format": CommandSpec<{ id: string; from: number; length: number; format: MarkdownFormat; value?: string }>;
  "block.prop.set": CommandSpec<{ id: string; key: string; value: unknown }>;
  "block.pluginData.set": CommandSpec<{ id: string; pluginId: string; value: unknown }>;
  "block.layout.set": CommandSpec<{ id: string; layout: Partial<BlockLayout> }>;
  "link.create": CommandSpec<{ link: Link }>;
  "link.remove": CommandSpec<{ id: string }>;
  "selection.set": CommandSpec<{ selection: EditorSelection }>;
  "selection.clear": CommandSpec;
  "mode.set": CommandSpec<{ mode: EditorMode }>;
  "history.undo": CommandSpec;
  "history.redo": CommandSpec;
  "clipboard.copy": CommandSpec<undefined, Promise<string>>;
  "clipboard.cut": CommandSpec<undefined, Promise<string>>;
  "clipboard.paste": CommandSpec<{ defaultBlockType: string; text?: string }, Promise<void>>;
  "clipboard.copyEvent": CommandSpec<{ event: ClipboardEvent }>;
  "clipboard.pasteEvent": CommandSpec<{ event: ClipboardEvent; defaultBlockType: string }>;
  "document.load": CommandSpec<{ snapshot: Snapshot }>;
};

/** Framework-neutral event routed through plugins, block behavior, then fallback. */
export interface RuntimeEvent {
  /** Normalized event category. */
  type: RuntimeEventType;
  /** Optional current block used to resolve definition behavior. */
  blockId?: string;
  /** Keyboard key for `keydown`. */
  key?: string;
  /** Normalized keyboard modifier state. */
  shiftKey?: boolean;
  /** Normalized keyboard modifier state. */
  ctrlKey?: boolean;
  /** Normalized keyboard modifier state. */
  metaKey?: boolean;
  /** Renderer-specific context consumed by commands or fallback behavior. */
  payload?: unknown;
}

/** Handler returning `true` only when it fully claims the routed event. */
export type RuntimeEventHandler = (event: RuntimeEvent, editor: RivtoEditorApi) => boolean | void;

/** Construction options for one long-lived editor runtime. */
export interface CreateRivtoEditorOptions {
  /** Existing adapter-neutral collaborative document; a Yjs adapter is created by default. */
  document?: CRDTDoc;
  /** Blocks inserted through commands only when the supplied document is empty. */
  initialContent?: BlockInput[];
  /** Trusted plugins installed after built-in block and command definitions. */
  plugins?: RivtoPlugin[];
  /** Initial local presentation mode. */
  mode?: EditorMode;
}

/**
 * Public command-driven editor runtime exposed to applications and plugins.
 *
 * Managers are readable extension points, while document mutations initiated
 * by UI or plugins belong in CommandRegistry.
 */
export interface RivtoEditorApi {
  /** Canonical collaborative document and persistence boundary. */
  readonly document: DocumentModelImpl;
  /** Native block definition registry. */
  readonly blocks: BlockRegistry;
  /** Single mutation and action entry point. */
  readonly commands: CommandRegistry<BuiltInCommandMap>;
  /** Trusted plugin lifecycle coordinator. */
  readonly plugins: PluginManager;
  /** Local discriminated selection owner. */
  readonly selection: SelectionManager;
  /** Local block/edgeless mode owner. */
  readonly mode: ModeManager;
  /** Adapter-neutral local history owner. */
  readonly history: HistoryManager;
  /** Ordered normalized interaction router. */
  readonly events: EventRouter;
  /** Command-backed toolbar and side-menu contributions. */
  readonly ui: UIRegistry;
  /** Structured browser clipboard coordinator. */
  readonly clipboard: ClipboardManager;
  /** Adapter-neutral collaboration provider coordinator. */
  readonly providers: ProviderManager;
  /** Monotonic view invalidation snapshot. */
  readonly revision: number;
  /** Subscribes to runtime view invalidation. */
  subscribe(listener: () => void): () => void;
  /** Requests browser focus after renderer reconciliation. */
  focus(blockId?: string): void;
  /** Registers a native block definition. */
  defineBlock(definition: BlockDefinition): () => void;
  /** Atomically installs a trusted plugin. */
  use(plugin: RivtoPlugin): () => void;
  /** Releases runtime-owned resources. */
  destroy(): void;
}

export type { Block, BlockDefinition, BlockInput, BlockLayout, BlockPatch, Link, RivtoPlugin, SlashItem, Snapshot, UIContribution };
