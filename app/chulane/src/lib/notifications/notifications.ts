/**
 * Provides Chulane error notifications through application-owned Sonner UI.
 * Unknown failures receive a useful fallback; repeated reports of the same
 * message update one toast, including failures reported by browser listeners.
 */
import { toast } from "sonner";
import type { ErrorNotifications } from "./types";

export class ToastNotifications implements ErrorNotifications {
  /**
   * Presents an error without exposing stack traces or serializing arbitrary data.
   * @param error - Failure reported by an application operation or browser listener.
   * @returns No value after queuing the error toast.
   */
  error(error: unknown): void {
    const message = (error instanceof Error ? error.message : typeof error === "string" ? error : "").trim()
      || "Something went wrong. Please try again.";
    toast.error(message, { id: message });
  }
}

export const notifications: ErrorNotifications = new ToastNotifications();
