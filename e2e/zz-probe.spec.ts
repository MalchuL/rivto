import { expect, test } from "@playwright/test";

test.describe(() => {
  test.use({ viewport: { width: 1280, height: 400 } });
  test("probe multi-editor scrollability at 400h", async ({ page }) => {
    await page.goto("/?editors=2");
    const metrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    console.log("MULTI400", JSON.stringify(metrics));
    const nested = await page.locator('[data-multi-editor="right"] [data-block-id="right-nested"]').boundingBox();
    console.log("RIGHT-NESTED-BOX", JSON.stringify(nested));
    expect(metrics.scrollHeight).toBeGreaterThan(0);
  });
});

test.describe(() => {
  test.use({ viewport: { width: 900, height: 430 } });
  test("probe kanban modal scrollability at 430h", async ({ page }) => {
    await page.goto("/");
    const board = page.locator('[data-block-type="kanban"]').first();
    await board.scrollIntoViewIfNeeded();
    await board.getByRole("button", { name: "Expand Kanban", exact: true }).click();
    const modal = page.locator("dialog:modal");
    const metrics = await modal.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      cards: [...element.querySelectorAll("[data-block-id]")].map((node) => ({
        id: (node as HTMLElement).dataset.blockId,
        text: node.querySelector("[data-block-content]")?.textContent,
      })),
    }));
    console.log("MODAL430", JSON.stringify(metrics));
    expect(metrics.clientHeight).toBeGreaterThan(0);
  });
});

test("probe root ids and target geometry", async ({ page }) => {
  await page.goto("/");
  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".page-surface > [data-block-id]")].map((block) => ({
      id: (block as HTMLElement).dataset.blockId,
      text: block.querySelector("[data-block-content]")?.textContent?.slice(0, 40),
      children: block.querySelectorAll(":scope > .page-block-children > [data-block-id]").length,
    }));
    return rows;
  });
  console.log("ROOTS", JSON.stringify(info, null, 1));
  expect(info.length).toBeGreaterThan(0);
});
