import type { InputRoot } from "@chulane/rivto-root";

/** Parent occurrence capabilities borrowed to restore focus after a modal closes. */
export interface BlockModalFocusPanel {
  readonly mountedRoot:
    Pick<InputRoot, "isAttached" | "captureRegionByIdentity" | "focusRegionByIdentity"> | undefined;
}
