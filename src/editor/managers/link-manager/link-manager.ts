import type { CommandHandler, RegisteredCommand } from "../../../managers";
import type { Link } from "../../../store/document-model";
import type { EditorLink } from "../../model";
import type { RivtoEditorApi } from "../../types";
import { commandPayload, commandString } from "../utils";

/**
 * Owns editor-level link commands and the typed link operation facade.
 *
 * The manager contains no collaborative state. It validates command payloads
 * and delegates persistence to the current DocumentModel.
 */
export class LinkManager {
  private readonly registrations: RegisteredCommand[] = [];

  /**
   * Creates the public link manager and installs its built-in commands.
   *
   * @param editor - Owning editor interface providing document and command capabilities.
   */
  constructor(private readonly editor: RivtoEditorApi) {
    this.registerRequiredCommands();
  }

  /**
   * Registers every link command required by the public manager API.
   *
   * @returns No value.
   */
  private registerRequiredCommands(): void {
    const documentCommand = (handler: CommandHandler): CommandHandler => (value) =>
      this.editor.batchUpdates(() => handler(value));
    this.registrations.push(
      this.editor.commands.register("link.create", documentCommand((value) => {
        const data = commandPayload(value);
        this.editor.document.links.createLink(commandPayload(data.link) as unknown as Link);
      })),
      this.editor.commands.register("link.remove", documentCommand((value) => {
        this.editor.document.links.removeLink(commandString(commandPayload(value).id, "id"));
      })),
    );
  }

  /**
   * Resolves one first-class document link.
   *
   * @param id - Stable link identifier to resolve.
   * @returns Detached editor link, or undefined when absent.
   */
  getLink(id: string): EditorLink | undefined {
    return this.editor.document.links.getLink(id) satisfies EditorLink | undefined;
  }

  /**
   * Materializes every current first-class document link.
   *
   * @returns Detached editor links in collaborative map iteration order.
   */
  getLinks(): EditorLink[] {
    return this.editor.document.links.getLinks() satisfies EditorLink[];
  }

  /**
   * Creates or replaces a first-class link through the command registry.
   *
   * @param link - Complete portable editor link.
   * @returns No value.
   */
  createLink(link: EditorLink): void {
    const command = { link } satisfies { link: Link };
    this.editor.commands.execute("link.create", command);
  }

  /**
   * Removes one first-class link through the command registry.
   *
   * @param id - Stable link identifier to remove.
   * @returns No value.
   */
  removeLink(id: string): void {
    this.editor.commands.execute("link.remove", { id });
  }

  /**
   * Releases this manager's exact built-in command registrations.
   *
   * @returns No value.
   */
  destroy(): void {
    this.registrations.splice(0).reverse().forEach((registration) => registration.dispose());
  }
}
