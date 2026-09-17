import type {
  EditorElement,
  EditorElementInput,
  EditorElementPatch,
  EditorElementUpdate,
} from "../../editor/model";
import type {
  DocumentElement,
  DocumentModel,
  ElementInput,
  ElementPatch,
  ElementProcessor,
  ElementUpdate,
} from "@chulane/document-model";
import type { CommandHandler, RegisteredCommand } from "../command-registry";
import { commandPayload, commandString } from "../utils";
import type { RivtoEditorApi } from "../../editor/types";

/** Public command-backed facade for generic first-class canvas elements. */
export class ElementManager {
  private readonly registrations: RegisteredCommand[] = [];
  /**
   * Creates the element facade from its editor and document model.
   * @param editor - Owning editor providing commands and batch boundaries.
   * @param document - Private document model providing canonical element storage.
   */
  constructor(
    private readonly editor: RivtoEditorApi,
    private readonly document: DocumentModel,
  ) { this.registerCommands(); }

  /** Runs one element operation inside the shared transaction boundary. */
  private batchUpdates<Result>(operation: () => Result): Result {
    return this.editor.batchUpdates(operation);
  }

  /** Registers a document element processor and returns its disposer. */
  registerProcessor(processor: ElementProcessor): () => void {
    return this.document.elements.pipe.register(processor);
  }

  /** @param id - Stable element ID. @returns Detached element or undefined. */
  getElement(id: string): EditorElement | undefined {
    return this.document.elements.getElement(id) satisfies DocumentElement | undefined;
  }

  /** @returns Every detached first-class element. */
  getElements(): EditorElement[] {
    return this.document.elements.getElements() satisfies DocumentElement[];
  }

  /** @param listener - Collection-change callback. @returns Its disposer. */
  subscribe(listener: () => void): () => void {
    return this.document.elements.subscribe(listener);
  }

  /** @param id - Element to observe. @param listener - Change callback. @returns Its disposer. */
  subscribeElement(id: string, listener: () => void): () => void {
    return this.document.elements.subscribeElement(id, listener);
  }

  /** @param listener - Membership-change callback. @returns Its disposer. */
  subscribeMembership(listener: () => void): () => void {
    return this.document.elements.subscribeMembership(listener);
  }

  /** @param input - Complete element creation data. @returns Stable new ID. */
  insertElement(input: EditorElementInput): string {
    return this.editor.commands.execute("element.insert", { input }) as string;
  }

  /**
   * Resolves source element identities for a destination import.
   *
   * Free IDs survive cut-and-paste, while conflicts receive identities from
   * the destination element manager. The returned map lets extensions rewrite
   * opaque group and connector references before insertion.
   *
   * @param sourceIds - Stable source element IDs in import order.
   * @returns Source-to-destination identity mapping.
   */
  resolveImportIds(sourceIds: readonly string[]): ReadonlyMap<string, string> {
    const assigned = new Set<string>();
    return new Map(sourceIds.map((sourceId) => {
      const reusable = !this.document.elements.getElement(sourceId) && !assigned.has(sourceId);
      const id = reusable ? sourceId : this.document.elements.generateId();
      assigned.add(id);
      return [sourceId, id];
    }));
  }

  /** @param id - Element to patch. @param patch - Geometry, layer, or props changes. */
  updateElement(id: string, patch: EditorElementPatch): void {
    this.editor.commands.execute("element.update", { id, patch });
  }

  /** Applies identified element patches atomically. */
  updateElements(updates: readonly EditorElementUpdate[]): void {
    this.editor.commands.execute("element.update-many", { updates });
  }

  /** Removes one element without implicit cascading. */
  removeElement(id: string): void { this.editor.commands.execute("element.remove", { id }); }

  /** Removes identified elements atomically. */
  removeElements(ids: readonly string[]): void { this.editor.commands.execute("element.remove-many", { ids }); }

  /** Releases this manager's command registrations. */
  destroy(): void { this.registrations.splice(0).reverse().forEach((item) => item.dispose()); }

  private registerCommands(): void {
    const documentCommand = (handler: CommandHandler): CommandHandler => (value) => this.batchUpdates(() => handler(value));
    const register = (name: string, handler: CommandHandler) => this.registrations.push(this.editor.commands.register(name, documentCommand(handler)));
    register("element.insert", (value) => {
      const data = commandPayload(value) as unknown as { input: ElementInput };
      return this.document.elements.insertElement(commandPayload(data.input) as unknown as ElementInput);
    });
    register("element.update", (value) => {
      const data = commandPayload(value) as unknown as { id: string; patch: ElementPatch };
      this.document.elements.updateElement(commandString(data.id, "id"), commandPayload(data.patch) as ElementPatch);
    });
    register("element.update-many", (value) => {
      const data = commandPayload(value) as unknown as { updates: readonly ElementUpdate[] };
      const updates = data.updates;
      if (!Array.isArray(updates)) throw new Error("Element updates must be an array");
      this.document.elements.updateElements(updates);
    });
    register("element.remove", (value) => {
      const data = commandPayload(value) as unknown as { id: string };
      this.document.elements.removeElement(commandString(data.id, "id"));
    });
    register("element.remove-many", (value) => {
      const data = commandPayload(value) as unknown as { ids: readonly string[] };
      const ids = data.ids;
      if (!Array.isArray(ids)) throw new Error("Element IDs must be an array");
      this.document.elements.removeElements(ids.map((id) => commandString(id, "id")));
    });
  }
}
