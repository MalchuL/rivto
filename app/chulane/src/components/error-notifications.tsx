/**
 * Mounts the shared toast host and reports uncaught browser failures.
 * Listeners live for this component's lifetime and preserve native diagnostics.
 * Handled operation errors are reported by their callers through the same service.
 */
"use client";

import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { notifications } from "@/lib/notifications";

/** @returns The application toast host with lifecycle-owned browser error listeners. */
export function ErrorNotifications() {
  useEffect(() => {
    /** @param event - Browser failure. @returns No value after reporting it. */
    const onError = (event: ErrorEvent) => { notifications.error(event.error ?? event.message); };
    /** @param event - Unhandled async failure. @returns No value after reporting it. */
    const onRejection = (event: PromiseRejectionEvent) => { notifications.error(event.reason); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return <Toaster richColors closeButton />;
}
