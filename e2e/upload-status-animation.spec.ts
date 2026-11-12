import { expect, test } from "@playwright/test";

for (const reducedMotion of [false, true]) {
  test(`dismisses an upload error safely with reduced motion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await page.goto("/?test_features=1");
    const root = page.locator(".page-surface").first();
    await root.evaluate((element) => {
      const host = window as unknown as {
        __rivtoDemo: {
          reactEditor: {
            events: { delete: (id: string) => void };
          };
        };
      };
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
    });
    const cards = page.locator(".rivto-image-upload");
    const card = cards.first();
    await expect(card).toContainText("Clipboard read denied");
    await card.evaluate((element: HTMLElement) => {
      element.style.left = "100px";
      element.style.top = "100px";
    });
    await card.getByRole("button", { name: "Dismiss" }).click();
    await expect(card).toHaveAttribute("aria-hidden", "true");
    await expect(card.locator("button:disabled")).toHaveCount(2);
    await expect(card).toHaveCSS("pointer-events", "none");
    await expect(cards).toHaveCount(0);
  });
}
