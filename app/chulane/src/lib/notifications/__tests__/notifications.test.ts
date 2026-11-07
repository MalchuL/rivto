/**
 * Exercises the real Sonner adapter without mounting browser UI.
 * Error normalization avoids blank toasts and leaking arbitrary object details;
 * repeated reports reuse one toast while distinct failures remain visible.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { toast } from "sonner";
import { ToastNotifications } from ".././notifications.ts";

/** @returns No value after verifying normalization and duplicate reporting. */
test("toast notifications normalize unknown errors and reuse duplicate messages", () => {
  const notifications = new ToastNotifications();
  notifications.error(new Error("  Could not save  "));
  notifications.error("Could not save");
  notifications.error({ secret: "must not be displayed" });
  notifications.error(new Error(" "));
  const toasts = toast.getToasts();
  assert.equal(toasts.filter((entry) => "title" in entry && entry.title === "Could not save").length, 1);
  assert.equal(toasts.filter((entry) => "title" in entry && entry.title === "Something went wrong. Please try again.").length, 1);
  assert.equal(toasts.length, 2);
  toast.dismiss();
});
