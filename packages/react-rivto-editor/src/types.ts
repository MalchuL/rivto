import type { MouseEvent } from "react";

export type { PanelAPI } from "./panels/types";
export type { CreateReactEditorOptions } from "./editor/types";

/** Context supplied when a rendered Markdown link is activated. */
export interface MarkdownLinkClick {
  /** Block containing the rendered link. */
  readonly blockId: string;
  /** Sanitized standard URL or explicitly enabled custom-protocol URL. */
  readonly href: string;
  /** Native React click wrapper; prevent its default action for local routing. */
  readonly event: MouseEvent<HTMLAnchorElement>;
}
