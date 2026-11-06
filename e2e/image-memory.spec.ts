import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Object URLs observed during image paste and deletion. */
interface ImageMemoryWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
  readonly imageUrls: { readonly created: string[]; readonly active: Set<string> };
}

for (const virtualized of [false, true]) {
  test(`releases image URLs after repeated paste and deletion with virtualization ${virtualized ? "on" : "off"}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const host = window as unknown as ImageMemoryWindow;
      const created: string[] = [];
      const active = new Set<string>();
      Object.assign(host, { imageUrls: { created, active } });
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        created.push(url);
        active.add(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        active.delete(url);
        revoke(url);
      };
    });
    await page.goto("/?test_features=1");
    const surface = page.locator(".page-surface").first();
    await expect(surface).toBeVisible();
    if (virtualized) {
      await page.getByRole("checkbox", { name: "Virtualize page", exact: true }).check();
    }
    for (let cycle = 0; cycle < 3; cycle++) {
      const before = await page.evaluate(() => {
        const host = window as unknown as ImageMemoryWindow;
        return {
          ids: host.__rivtoDemo.editor.blocks.getRootIds(),
          urls: host.imageUrls.created.length,
        };
      });
      await surface.evaluate((element) => {
        const bytes = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          ),
          (character) => character.charCodeAt(0),
        );
        const data = new DataTransfer();
        data.items.add(new File([bytes], "memory.png", { type: "image/png" }));
        const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: data });
        element.dispatchEvent(event);
      });
      if (virtualized) {
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as unknown as ImageMemoryWindow).__rivtoDemo.editor.blocks.getRootIds()
                  .length,
            ),
          )
          .toBeGreaterThan(before.ids.length);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      }
      const image = page.locator('[data-block-type="image"] .rivto-image').first();
      await expect(image).toHaveAttribute("alt", "memory.png");
      await expect(image).toHaveAttribute("src", /^blob:/);
      expect(
        await page.evaluate(
          () => (window as unknown as ImageMemoryWindow).imageUrls.created.length,
        ),
      ).toBeGreaterThan(before.urls);
      await page.evaluate((previousIds) => {
        const editor = (window as unknown as ImageMemoryWindow).__rivtoDemo.editor;
        const added = editor.blocks.getRootIds().filter((id) => !previousIds.includes(id));
        editor.blocks.removeBlocks(added);
      }, before.ids);
      await expect(image).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate((first) => {
            const { created, active } = (window as unknown as ImageMemoryWindow).imageUrls;
            return created.slice(first).filter((url) => active.has(url)).length;
          }, before.urls),
        )
        .toBe(0);
    }
  });
}
