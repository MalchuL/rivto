import type { ReactNode } from "react";
import type { InputRoot } from "@chulane/rivto-root";
import type { PageDragExtensionOptions } from "../../extensions/block-drag/types";
import type { ModeManagerApi, PanelAPI } from "@chulane/rivto";
import type { PanelSelectionApi } from "../../managers/selection/api";
import type { BlockTypesApi } from "../../managers/blocks/block-types-api";
import type { BlockBehaviorsApi } from "../../managers/blocks/block-behaviors-api";
import type { CrossDocumentBlockPanel } from "../../extensions/block-drag/cross-document/panel";

/** One borrowed child-ID list in a bounded preview traversal; no descendants are copied. */
export interface PagePreviewCursor {
  readonly ids: readonly string[];
  readonly depth: number;
  index: number;
}

/** Validated translation into the existing grouped command's anchor syntax. */
export interface PageBlockMove {
  readonly targetId: string | null;
  readonly receiver: CrossDocumentBlockPanel;
  readonly position: "before" | "after" | "inside";
}

/** Existing host stores borrowed by Page; no independent writable selection is created. */
export interface PageSelectionHost {
  readonly mode?: Pick<ModeManagerApi, "get" | "subscribe">;
  readonly mountedRoot?: Pick<InputRoot, "isAttached" | "readAttribute">;
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode">;
  readonly selection: Pick<
    PanelSelectionApi,
    "snapshot" | "set" | "clear" | "subscribe" | "isBlockSelected" | "hasPendingSelectionCallback"
  >;
  readonly document: { readonly selection: Pick<PanelAPI["document"]["selection"], "snapshot"> };
  readonly editor: {
    readonly blockTypes: Pick<
      BlockTypesApi,
      "getDefinition" | "separatesBlockElements" | "subscribe"
    >;
    readonly blockBehaviors: Pick<BlockBehaviorsApi, "subscribe">;
  };
  readonly subscribe: PanelAPI["subscribe"];
}

/** Root operations borrowed by Page navigation for one mounted occurrence. */
export interface PageNavigationRoot extends Pick<
  InputRoot,
  | "isAttached"
  | "readAttribute"
  | "scrollFirstMatchingRegionIntoView"
  | "suspendScrollAnchoring"
  | "captureFrameClock"
> {
  /**
   * Identifies the mounted occurrence in the navigation registry.
   *
   * @returns Opaque identity of the occurrence's browser surface.
   */
  getElementIdentity(): object;
}

/** Root capabilities borrowed by one mounted Page drag occurrence. */
export type PageDragRoot = Pick<
  InputRoot,
  | "captureDocument"
  | "getElementIdentity"
  | "isAttached"
  | "isConnected"
  | "setTemporaryAttribute"
  | "captureRegionByIdentity"
  | "focus"
>;

/** Content rendered into the current Page occurrence's end slot. */
export interface PageEndPortalProps {
  /** Host controls placed inside the occurrence's end slot. */
  readonly children: ReactNode;
}

/** Presentation-only limits for the page's root-block window. */
export interface PageVirtualizationSettings {
  readonly threshold: boolean | number;
  readonly overscan: number;
}

/** Canvas-owned ability to mount cards required for a Page selection or focus request. */
export interface PageCanvasMount {
  /**
   * Temporarily mounts cards containing the requested blocks.
   *
   * @param blockIds - Block IDs whose rendered cards are needed.
   * @param root - Exact occurrence whose window schedules the temporary pin release.
   * @returns Available cards are mounted for the pending navigation operation.
   * @throws If mounting, frame scheduling, or cleanup fails.
   */
  mountBlocks(
    blockIds: readonly string[],
    root: Pick<InputRoot, "isAttached" | "captureFrameClock">,
  ): void;
}

/** Registration identity for a canvas surface's borrowed mounting capability. */
export interface PageCanvasAttachment {
  readonly source: PageCanvasMount;
}

/** Existing surface subtree borrowed by the optional Page drag installation. */
export interface PageDragBoundaryProps extends Omit<PageDragExtensionOptions, "children"> {
  readonly children?: ReactNode;
}
