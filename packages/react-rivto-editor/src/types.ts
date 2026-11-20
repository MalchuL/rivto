export type { PanelInputRegistration, ReactPanelApi } from "./panels/types";
export type { CreateReactEditorOptions } from "./editor/types";

/** Context supplied when a rendered Markdown link is activated. */
export interface MarkdownLinkClick {
  /** Block containing the rendered link. */
  readonly blockId: string;
  /** Sanitized standard URL or explicitly enabled custom-protocol URL. */
  readonly href: string;
  /**
   * Prevents the browser's default navigation for this link activation.
   *
   * Call synchronously while the callback is running; later calls cannot cancel
   * a navigation that has already started.
   *
   * @returns The link's browser default action is prevented when cancelable.
   */
  preventDefault(): void;
}
