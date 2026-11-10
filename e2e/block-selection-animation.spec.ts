import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`animates structural selection and deselection with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/?test_features=1");
    const content = page.locator('[data-journal-document="today"] [data-block-content]').first();
    const block = content.locator("xpath=ancestor::*[@data-block-id][1]");
    await content.click({ modifiers: ["Control"] });
    await expect(block).toHaveAttribute("data-block-selected", "true");
    const duration = await block.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );
    expect(duration).toBe(reducedMotion === "reduce" ? "0s" : "0.15s, 0.15s");
    await expect
      .poll(() => block.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(222, 217, 247)");
    await content.click({ modifiers: ["Control"] });
    await expect(block).not.toHaveAttribute("data-block-selected", "true");
    expect(await block.evaluate((element) => getComputedStyle(element).outlineColor)).toBe(
      "rgba(0, 0, 0, 0)",
    );
    if (reducedMotion === "no-preference") {
      expect(await block.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
    }
    await expect
      .poll(() => block.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe("rgb(222, 217, 247)");
  });
}
