import type { ReactPanelApi } from "../../panels/types";
import type { PanelSlashCommandsApi } from "./api";
import type { SlashCommandRegistry } from "./slash-command-registry";

/** Executes commands in one occurrence while sharing the document command registry. */
export class PanelSlashCommandManager implements PanelSlashCommandsApi {
  /** @param commands - Document command registrations. @param reactPanel - Invoking occurrence. */
  constructor(
    private readonly commands: SlashCommandRegistry,
    private readonly reactPanel: ReactPanelApi,
  ) {}
  /**
   * Reads the slash-command registry's observable revision.
   *
   * @returns Current revision number.
   */
  get revision() {
    return this.commands.revision;
  }
  /**
   * Observes slash-command registration changes.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe: PanelSlashCommandsApi["subscribe"] = (listener) => this.commands.subscribe(listener);
  /**
   * Returns contextually available commands in declaration order.
   * @param context - Active block context evaluated by availability predicates.
   * @returns Available definitions in registry order for this panel.
   */
  getAll: PanelSlashCommandsApi["getAll"] = (context) => {
    const commandContext = { ...context, reactPanel: this.reactPanel };
    return this.commands
      .getAll()
      .filter((command) => command.isAvailable?.(commandContext) !== false);
  };

  /**
   * Executes one available command.
   * @param id - Stable command identity.
   * @param context - Active block context revalidated before execution.
   * @throws For an unknown or unavailable command, or when its callback fails.
   */
  execute: PanelSlashCommandsApi["execute"] = (id, context) => {
    const command = this.commands.get(id);
    if (!command) {
      throw new Error(`Unknown slash command ${id}`);
    }
    const commandContext = { ...context, reactPanel: this.reactPanel };
    if (command.isAvailable?.(commandContext) === false) {
      throw new Error(`Slash command ${id} is unavailable`);
    }
    command.execute(commandContext);
  };
}
