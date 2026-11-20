import { basename, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { WheelInput } from "@chulane/rivto-root";

test("normalized passive and active listeners preserve browser cancellation", async ({ page }) => {
  await page.route("**/__root-input__/*.js", (route) =>
    route.fulfill({
      path: resolve(
        process.cwd(),
        "packages/rivto-root/dist/esm",
        basename(new URL(route.request().url()).pathname),
      ),
      contentType: "text/javascript",
    }),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/__root-input__/browser.js";
    const { BrowserEvents } = await import(modulePath);
    const root = document.createElement("div");
    document.body.append(root);
    const listeners = new BrowserEvents();
    listeners.register({
      id: "passive",
      type: "wheel",
      passive: true,
      handle: (input: WheelInput) => {
        input.preventDefault();
      },
    });
    const detach = listeners.attach(root);
    const passive = new WheelEvent("wheel", { cancelable: true });
    root.dispatchEvent(passive);
    detach();
    listeners.register({
      id: "active",
      type: "wheel",
      handle: (input: WheelInput) => {
        input.preventDefault();
      },
    });
    const detachAgain = listeners.attach(root);
    const active = new WheelEvent("wheel", { cancelable: true });
    root.dispatchEvent(active);
    detachAgain();
    root.remove();
    return { passive: passive.defaultPrevented, active: active.defaultPrevented };
  });
  expect(result).toEqual({ passive: false, active: true });
});
