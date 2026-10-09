import type { SlashCommandsCapability } from "../../capabilities";
import type { EditorViewApi } from "../../types";
import type { ReactSlashCommandManager } from "./slash-command-manager";

/** Executes commands in one occurrence while sharing the document command registry. */
export class ViewSlashCommandManager implements SlashCommandsCapability {
  /** @param shared - Document command registrations. @param editor - Invoking occurrence. */
  constructor(private readonly shared: ReactSlashCommandManager, private readonly editor: EditorViewApi) {}
  get revision() { return this.shared.revision; }
  register: SlashCommandsCapability["register"] = (command) => this.shared.register(command);
  delete: SlashCommandsCapability["delete"] = (id) => this.shared.delete(id);
  subscribe: SlashCommandsCapability["subscribe"] = (listener) => this.shared.subscribe(listener);
  getAll: SlashCommandsCapability["getAll"] = (context) => this.shared.getAll({ ...context, editorView: this.editor });
  execute: SlashCommandsCapability["execute"] = (id, context) => this.shared.execute(id, { ...context, editorView: this.editor });
}
