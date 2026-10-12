import type { PanelAPI } from "../../panels/types";
import type { PromptMatch } from "./todo-item-model";

export interface TodoCandidate extends PromptMatch {
  readonly editor: PanelAPI;
  readonly blockId: string;
  readonly contentElement: HTMLElement;
}
