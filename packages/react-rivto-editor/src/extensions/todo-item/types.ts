import type { ReactPanelApi } from "../../panels/types";
import type { PromptMatch } from "./todo-item-model";

export interface TodoCandidate extends PromptMatch {
  readonly editor: ReactPanelApi;
  readonly blockId: string;
  readonly contentElement: HTMLElement;
}
