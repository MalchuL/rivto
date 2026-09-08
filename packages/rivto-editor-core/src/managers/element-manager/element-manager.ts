import type {
  EditorElement,
  EditorElementInput,
  EditorElementPatch,
  EditorElementUpdate,
} from "../../editor/model";
import type { DocumentElement, ElementInput, ElementPatch, ElementUpdate } from "../../store/document-model";
import type { RivtoEditorApi } from "../../editor/types";
import type { CommandHandler, RegisteredCommand } from "../command-registry";
import { commandPayload, commandString } from "../utils";

/** Public command-backed facade for generic first-class canvas elements. */
export class ElementManager {
  private readonly registrations: RegisteredCommand[] = [];

  /** @param editor - Owning editor and document runtime. */
  constructor(private readonly editor: RivtoEditorApi) { this.registerCommands(); }

  /** @param id - Stable element ID. @returns Detached element or undefined. */
  getElement(id: string): EditorElement | undefined {
    return this.editor.document.elements.getElement(id) satisfies DocumentElement | undefined;
  }

  /** @returns Every detached first-class element. */
  getElements(): EditorElement[] {
    return this.editor.document.elements.getElements() satisfies DocumentElement[];
  }

  /** @param input - Complete element creation data. @returns Stable new ID. */
  insertElement(input: EditorElementInput): string {
    return this.editor.commands.execute("element.insert", { input }) as string;
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
    const documentCommand = (handler: CommandHandler): CommandHandler => (value) => this.editor.batchUpdates(() => handler(value));
    const register = (name: string, handler: CommandHandler) => this.registrations.push(this.editor.commands.register(name, documentCommand(handler)));
    register("element.insert", (value) => {
      const data = commandPayload(value) as unknown as { input: ElementInput };
      return this.editor.document.elements.insertElement(commandPayload(data.input) as unknown as ElementInput);
    });
    register("element.update", (value) => {
      const data = commandPayload(value) as unknown as { id: string; patch: ElementPatch };
      this.editor.document.elements.updateElement(commandString(data.id, "id"), commandPayload(data.patch) as ElementPatch);
    });
    register("element.update-many", (value) => {
      const data = commandPayload(value) as unknown as { updates: readonly ElementUpdate[] };
      const updates = data.updates;
      if (!Array.isArray(updates)) throw new Error("Element updates must be an array");
      this.editor.document.elements.updateElements(updates);
    });
    register("element.remove", (value) => {
      const data = commandPayload(value) as unknown as { id: string };
      this.editor.document.elements.removeElement(commandString(data.id, "id"));
    });
    register("element.remove-many", (value) => {
      const data = commandPayload(value) as unknown as { ids: readonly string[] };
      const ids = data.ids;
      if (!Array.isArray(ids)) throw new Error("Element IDs must be an array");
      this.editor.document.elements.removeElements(ids.map((id) => commandString(id, "id")));
    });
  }
}
