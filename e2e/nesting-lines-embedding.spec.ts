import { expect, test } from "@playwright/test";

test("embedded nesting lines follow the Edgeless camera and are removed with their surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/?test_features=1");
  const today = page.locator('[data-journal-document="today"]');
  await today.locator(".page-surface").first().waitFor();
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  const embedded = today.getByRole("region", { name: "Block editor" }).first();
  await expect(embedded.locator("[data-block-id]")).toHaveCount(5);
  const paths = page.locator("[data-nesting-lines] path");
  await expect(paths).toHaveCount(2);
  const path = paths.nth(1);
  await expect.poll(() => path.getAttribute("d")).toMatch(/^M /);
  const before = await path.getAttribute("d");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => path.getAttribute("d")).not.toBe(before);
  await expect
    .poll(() =>
      embedded.evaluate((root) => {
        const overlay = document.querySelectorAll<SVGSVGElement>("[data-nesting-lines]")[1]!;
        const row = root.querySelectorAll<HTMLElement>(".rivto-block-row")[0]!;
        const y = Number(
          overlay
            .querySelector("path")!
            .getAttribute("d")!
            .match(/^M [\d.]+ ([\d.]+)/)![1],
        );
        return Math.abs(
          y + overlay.getBoundingClientRect().top - row.getBoundingClientRect().bottom,
        );
      }),
    )
    .toBeLessThan(1);
  await page.evaluate(() => window.scrollTo(0, 150));
  await expect
    .poll(() =>
      embedded.evaluate((root) => {
        const overlay = document.querySelectorAll<SVGSVGElement>("[data-nesting-lines]")[1]!;
        const viewport = root.closest<HTMLElement>(".edgeless-viewport")!;
        const inset = overlay.style.clipPath.match(/inset\(([-\d.]+)px ([-\d.]+)px ([-\d.]+)px/)!;
        return Math.abs(
          overlay.getBoundingClientRect().bottom -
            Number(inset[3]) -
            viewport.getBoundingClientRect().bottom,
        );
      }),
    )
    .toBeLessThan(1);
  await today.getByRole("button", { name: "Page", exact: true }).click();
  await expect(page.locator("[data-nesting-lines] path")).toHaveCount(2);
});
