import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`drag handle keeps compact icon geometry, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const handle = page.locator(".block-handle").first();
    await handle.locator("..").locator("..").hover();
    await handle.hover();
    await expect(handle).toHaveAttribute("aria-roledescription", "draggable");
    const geometry = await handle.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const icon = element.querySelector(".block-handle-grip")!.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        padding: style.padding,
        margin: style.margin,
        gap: style.gap,
        icon: [icon.width, icon.height],
      };
    });
    console.log(JSON.stringify({ repeat, geometry }));
    expect(geometry).toEqual({
      width: 24,
      height: 24,
      padding: "0px",
      margin: "0px",
      gap: "0px",
      icon: [16, 16],
    });
    const box = (await handle.boundingBox())!;
    expect(
      await page.evaluate(
        ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".block-handle")),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ),
    ).toBe(true);
  });
}
