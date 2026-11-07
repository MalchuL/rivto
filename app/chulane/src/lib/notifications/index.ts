/**
 * Exposes application notifications through a stable import boundary.
 * The implementation owns Sonner; consumers depend on the application contract.
 */
export { notifications, ToastNotifications } from "./notifications";
export type { ErrorNotifications } from "./types";
