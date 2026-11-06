import { expect, test } from "@playwright/test";

for (const duration of [0, 1.28]) {
  test(`dismisses an upload error safely with duration ${duration}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    const root = page.locator(".page-surface").first();
    await root.evaluate((element, seconds) => {
      const host = window as unknown as {
        __rivtoDemo: {
          reactEditor: {
            animations: Record<string, number>;
            events: { delete: (id: string) => void };
          };
        };
      };
      host.__rivtoDemo.reactEditor.animations.upload = seconds;
      host.__rivtoDemo.reactEditor.events.delete("file.paste");
      Object.defineProperty(navigator.clipboard, "readText", {
        configurable: true,
        value: async () => {
          throw new Error("Clipboard read denied");
        },
      });
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], items: [], types: ["text/uri-list"], getData: () => "" },
      });
      element.dispatchEvent(event);
    }, duration);
    const cards = page.locator(".rivto-image-upload");
    const card = cards.first();
    await expect(card).toContainText("Clipboard read denied");
    const timings = await card.evaluate((element) =>
      element.getAnimations().map((animation) => animation.effect?.getTiming().duration),
    );
    if (duration) {
      expect(timings).toContain(duration * 1000);
    } else {
      expect(timings).toHaveLength(0);
    }
    await card.evaluate((element: HTMLElement) => {
      element.style.left = "100px";
      element.style.top = "100px";
    });
    await card.getByRole("button", { name: "Dismiss" }).click();
    if (duration) {
      await expect(card).toHaveAttribute("aria-hidden", "true");
      await expect(card).toHaveAttribute("inert", "");
      await expect(card).toHaveCSS("pointer-events", "none");
    }
    await expect(cards).toHaveCount(0);
  });
}
