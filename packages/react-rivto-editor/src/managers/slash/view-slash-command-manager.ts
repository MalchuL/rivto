import type { EditorViewApi } from "../../editor-view/types";
import type { ViewSlashCommandsApi } from "./api";
import type { SlashCommandRegistry } from "./slash-command-registry";

/** Executes commands in one occurrence while sharing the document command registry. */
export class ViewSlashCommandManager implements ViewSlashCommandsApi {
  /** @param commands - Document command registrations. @param editorView - Invoking occurrence. */
  constructor(private readonly commands: SlashCommandRegistry, private readonly editorView: EditorViewApi) {}
  get revision() { return this.commands.revision; }
  subscribe: ViewSlashCommandsApi["subscribe"] = (listener) => this.commands.subscribe(listener);
  /**
   * Returns contextually available commands in declaration order.
   * @param context - Active block context evaluated by availability predicates.
   * @returns Available definitions in registry order for this view.
   */
  getAll: ViewSlashCommandsApi["getAll"] = (context) => {
    const commandContext = { ...context, editorView: this.editorView };
    return this.commands.getAll().filter((command) => command.isAvailable?.(commandContext) !== false);
  };

  /**
   * Executes one available command.
   * @param id - Stable command identity.
   * @param context - Active block context revalidated before execution.
   * @throws For an unknown or unavailable command, or when its callback fails.
   */
  execute: ViewSlashCommandsApi["execute"] = (id, context) => {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown slash command ${id}`);
    const commandContext = { ...context, editorView: this.editorView };
    if (command.isAvailable?.(commandContext) === false) throw new Error(`Slash command ${id} is unavailable`);
    command.execute(commandContext);
  };
}
