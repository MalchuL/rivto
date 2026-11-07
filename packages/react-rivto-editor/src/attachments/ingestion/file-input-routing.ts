/** Shared function identifying file transfers owned by the generic input router. */
export const FILE_INPUT_ROUTING_KEY = "rivto.attachments.file-input-routing";

/**
 * Reports whether a native transfer belongs to the generic file input router.
 *
 * @param event - Current native paste or drop event.
 * @param data - Transfer data for the event, or null when unavailable.
 * @returns True when the active generic router owns a file transfer in this dispatch.
 */
export type FileInputRouting = (event: Event, data: DataTransfer | null) => boolean;
