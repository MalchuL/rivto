import type { ReactPanelApi } from "../../panels/types";
import type { PanelSlashCommandsApi } from "./api";
import type { SlashCommandRegistry } from "./slash-command-registry";

/** Executes commands in one occurrence while sharing the document command registry. */
export class PanelSlashCommandManager implements PanelSlashCommandsApi {
  /**
   * Binds shared slash commands to the panel that invokes them.
   *
   * @param commands - Document command registrations borrowed by this panel.
   * @param reactPanel - Occurrence supplied to command availability checks and execution.
   */
  constructor(
    private readonly commands: Pick<
      SlashCommandRegistry,
      "revision" | "register" | "delete" | "get" | "getAll" | "subscribe"
    >,
    private readonly reactPanel: ReactPanelApi,
  ) {}
  /**
   * Registers a slash command with the shared React runtime.
   *
   * @param command - Complete command definition.
   * @returns Disposer owned by the shared extension lifecycle.
   * @throws If the runtime is inactive or the command is invalid or duplicated.
   */
  readonly register: PanelSlashCommandsApi["register"] = (command) =>
    this.commands.register(command);
  /**
   * Removes a shared slash command by ID.
   *
   * @param id - Registered command identity.
   * @returns Whether a registration was removed.
   * @throws If the shared extension lifecycle is inactive.
   */
  readonly delete: PanelSlashCommandsApi["delete"] = (id) => this.commands.delete(id);
  /**
   * Looks up a shared slash command without evaluating availability.
   *
   * @param id - Registered command identity.
   * @returns The definition, or undefined when unregistered.
   */
  readonly get: PanelSlashCommandsApi["get"] = (id) => this.commands.get(id);
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
   * @param context - Active block context evaluated by availability predicates;
   * omit to read all shared definitions without panel availability filtering.
   * @returns Available definitions in registry order, or all definitions when context is omitted.
   */
  getAll: PanelSlashCommandsApi["getAll"] = (context) => {
    if (!context) {
      return this.commands.getAll();
    }
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
