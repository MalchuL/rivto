import type { EventsCapability, KeyboardCapability, ClipboardCapability, SlashCommandsCapability, ExtensionsCapability } from "./capabilities";
import type { EditorViewApi as EditorViewApiContract } from "./types";
import type { EditorRuntime } from "./editor-runtime";
import type { DocumentViewScope } from "./managers/events/document-view";
import { ViewEventManager } from "./managers/events/view-event-manager";
import { ViewKeyboardManager } from "./managers/events/view-keyboard-manager";
import { ReactSelectionManager } from "./managers/selection/selection-manager";
import { ViewClipboardManager } from "./managers/clipboard/view-clipboard-manager";
import { ViewSlashCommandManager } from "./managers/slash/view-slash-command-manager";

/** Operations for one rendered occurrence of a shared document runtime. */
export class EditorViewApi implements EditorViewApiContract {
  readonly events: EventsCapability;
  readonly keyboard: KeyboardCapability;
  readonly selection: ReactSelectionManager;
  readonly clipboard: ClipboardCapability;
  readonly slashCommands: SlashCommandsCapability;
  /**
   * Scopes selection and DOM events to a rendered occurrence of this document.
   *
   * The returned API acquires no document and shares presentation registrations
   * with its host. Managers delegate directly to the permanently bound core,
   * so retained callbacks keep using their source after focus changes.
   * Subscriptions remain attached to the model used when they are registered.
   * Synchronous transaction callbacks use that same core; asynchronous
   * work must call the returned managers again after awaiting.
   * Selection reads return empty values outside the selected document and
   * occurrence; local shortcuts and event registrations are owned by the scope.
   *
   * The controller's rootBlockId constrains selection and navigation. Its mounted
   * DOM root routes local events and shortcuts; the controller owns their cleanup.
   * Document managers, registries, and lifecycle remain shared by these views.
   * Retained manager methods use this model on every call, including after focus
   * changes. Transaction callbacks are synchronous; after awaiting, call the
   * bound managers again rather than relying on a surrounding context.
   * Destruction cancels local DOM work; acquisition and runtime destruction stay with their owners.
   *
   * @param runtime - Fixed document runtime shared by these occurrences.
   * @param view - DOM root and registration lifecycle owned by the controller.
   * @param rootBlockId - Optional subtree boundary; omitted for the full document.
   * @returns Document-bound API sharing registries, DOM events, and lifecycle with this editor.
   */
  constructor(readonly runtime: EditorRuntime, readonly view: DocumentViewScope, readonly rootBlockId?: string) {
    this.events = new ViewEventManager(runtime.events, view);
    this.keyboard = new ViewKeyboardManager(runtime.keyboard, view);
    this.selection = new ReactSelectionManager(this, runtime.selection);
    this.clipboard = new ViewClipboardManager(runtime.clipboard, this);
    this.slashCommands = new ViewSlashCommandManager(runtime.slashCommands, this);
  }
  get blocks(): EditorViewApiContract["blocks"] { return this.runtime.blocks; }
  get blockElements(): EditorViewApiContract["blockElements"] { return this.runtime.blockElements; }
  get blockTypes(): EditorViewApiContract["blockTypes"] { return this.runtime.blockTypes; }
  get blockListProps(): EditorViewApiContract["blockListProps"] { return this.runtime.blockListProps; }
  get elements(): EditorViewApiContract["elements"] { return this.runtime.elements; }
  get mode(): EditorViewApiContract["mode"] { return this.runtime.mode; }
  get commands(): EditorViewApiContract["commands"] { return this.runtime.commands; }
  get history(): EditorViewApiContract["history"] { return this.runtime.history; }
  get renderers(): EditorViewApiContract["renderers"] { return this.runtime.renderers; }
  get views(): EditorViewApiContract["views"] { return this.runtime.views; }
  get surfaces(): EditorViewApiContract["surfaces"] { return this.runtime.surfaces; }
  get extensions(): ExtensionsCapability { return this.runtime.extensions; }
  get revision(): EditorViewApiContract["revision"] { return this.runtime.revision; }
  get createDefaultBlock(): EditorViewApiContract["createDefaultBlock"] { return this.runtime.createDefaultBlock; }
  get isEmptyBlock(): EditorViewApiContract["isEmptyBlock"] { return this.runtime.isEmptyBlock; }
  set createDefaultBlock(value) { this.runtime.createDefaultBlock = value; }
  set isEmptyBlock(value) { this.runtime.isEmptyBlock = value; }
  get documentId() { return this.runtime.getDocument().id; }
  installDefaultWriting: EditorViewApiContract["installDefaultWriting"] = (options) => this.runtime.installDefaultWriting(options);
  subscribe: EditorViewApiContract["subscribe"] = (listener) => this.runtime.subscribe(listener);
  getDocument() { return this.runtime.getDocument(); }
  /** Cancels this occurrence's pending DOM work; the owner releases registrations and acquisition. */
  destroy(): void { this.selection.destroy(); }
}
