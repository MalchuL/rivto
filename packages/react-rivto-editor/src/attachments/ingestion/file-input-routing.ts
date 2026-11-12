import type { BinaryProvider } from "../types";
import type { ReactEditorApi } from "../../editor/types";

/** Operations exposed by the installed generic file extension. */
export interface FileExtensionFields {
  /** Provider used to resolve and store this extension's file references. */
  readonly provider: BinaryProvider;
  /**
   * Reports whether a native transfer belongs to the generic file input router.
   *
   * @param events - Event registrations belonging to the receiving editor.
   * @param event - Current native paste or drop event.
   * @param data - Transfer data for the event, or null when unavailable.
   * @returns True when the active generic router owns a file transfer in this dispatch.
   */
  ownsTransfer(
    events: Pick<ReactEditorApi["events"], "has">,
    event: Event,
    data: DataTransfer | null,
  ): boolean;
}
