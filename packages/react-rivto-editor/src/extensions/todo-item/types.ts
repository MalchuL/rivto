import type { PanelInputRegistration, ReactPanelApi } from "../../panels/types";
import type { PromptMatch } from "./todo-item-model";
import type { InputRoot } from "@chulane/rivto-root";
import type { ContentInput } from "../../managers/events/types";
import type { ReactNode } from "react";

/** Properties for one toolbar disclosure menu. */
export interface TodoStorageMenuProps {
  /** Visible trigger text, for example `Filter`. */
  readonly label: string;
  /** Accessible name announced for the opened panel, for example `Filters`. */
  readonly panelLabel: string;
  /** Panel content rendered only while the menu is open. */
  readonly children: ReactNode;
}

/** Panel operations required to validate and convert a todo prompt. */
export interface TodoPromptPanel {
  /** Current input registration, used to validate candidate ownership. */
  readonly inputRoot?: ReactPanelApi["inputRoot"];
  /** Current routing lifetime, used when revalidating a decorated host. */
  readonly inputRegistration?: PanelInputRegistration;
  /** Reads and updates the candidate block. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "getBlockNode" | "setBlockType" | "updateBlock">;
  /** Resolves the currently registered content host. */
  readonly selection: Pick<ReactPanelApi["selection"], "contentInput">;
  /** Batches the block conversion. */
  readonly batchUpdates: ReactPanelApi["batchUpdates"];
}

export interface TodoCandidate extends PromptMatch {
  readonly editor: TodoPromptPanel;
  readonly blockId: string;
  readonly content: Pick<
    ContentInput,
    "isConnected" | "decoratePrefix" | "isSameHost" | "readAncestorAttribute"
  >;
  readonly inputRoot: Pick<InputRoot, "isAttached">;
  /** Routing lifetime that supplied the candidate input. */
  readonly inputRegistration: PanelInputRegistration;
}
