import type { DocumentModel } from "@chulane/document-model";
import type { BrowserInputRootApi } from "@chulane/rivto-root";
import type { PanelInputRegistration } from "../../../panels/types";

/** Active slash query and the exact occurrence that started it. */
export interface SlashSession {
  /** Document supplying commands and block state. */
  readonly document?: DocumentModel;
  /** Optional subtree boundary displayed by this occurrence. */
  readonly rootBlockId?: string;
  /** Registration-scoped viewport, identity, focus, and selection operations borrowed from input. */
  readonly inputRoot: Pick<
    BrowserInputRootApi,
    | "isAttached"
    | "isConnected"
    | "clearSelection"
    | "focus"
    | "readViewport"
    | "getElementIdentity"
  >;
  /** Routing lifetime that received the trigger. */
  readonly inputRegistration: PanelInputRegistration;
  /** Block containing the trigger. */
  readonly blockId: string;
  /** UTF-16 offset of the slash in the block. */
  readonly slashOffset: number;
  /** Text following the slash up to the caret. */
  readonly query: string;
  /** Query length of the latest successful command match. */
  readonly lastMatchedLength: number;
  /** Horizontal popup position in viewport CSS pixels. */
  readonly left: number;
  /** Vertical popup anchor in viewport CSS pixels. */
  readonly top: number;
  /** Whether the menu is positioned above the caret. */
  readonly above: boolean;
  /** Index of the currently highlighted command. */
  readonly activeIndex: number;
}
