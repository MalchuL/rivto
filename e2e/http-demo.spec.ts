import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`demo works without native randomUUID, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
    });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/?repeat=${repeat}`);
    const content = page.locator('[data-journal-document="today"] [data-block-content]').first();
    await expect(content).toBeVisible();
    await content.fill("HTTP demo editing");
    await content.press("End");
    await content.press("Enter");
    await page.keyboard.type("New HTTP block");
    await expect(page.locator('[data-journal-document="today"] [data-block-content]').filter({ hasText: "New HTTP block" })).toBeVisible();
    const ids = await page.evaluate(() => Array.from({ length: 100 }, () => crypto.randomUUID()));
    expect(new Set(ids).size).toBe(100);
    expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
    expect(errors).toEqual([]);
  });
}
