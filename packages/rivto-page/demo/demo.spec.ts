import { expect, test, type Locator } from "@playwright/test";
import { BACKGROUND_COLORS, type DemoMetrics } from "./demo-adapter";

test("updates all list modes and node fields without changing node identity", async ({ page }) => {
  await page.goto("/");
  const row = page.locator('[data-block-id="block-1"]');
  await page.getByRole("textbox", { name: "Текст block-1", exact: true }).fill("Новый текст");
  await page.getByRole("checkbox", { name: "Checked block-1", exact: true }).check();
  await page.getByRole("checkbox", { name: "Collapsed block-1", exact: true }).check();
  await page.getByLabel("Фон block-1", { exact: true }).selectOption("red");
  const state = page.getByLabel("Состояние block-1", { exact: true });
  for (const mode of [
    "list",
    "checkbox",
    "numbered_list",
    "start_numbered_list",
    "continue_numbered_list",
    "",
  ]) {
    await page.getByLabel("List type block-1", { exact: true }).selectOption(mode);
    await expect(state).toHaveText(
      JSON.stringify({
        listType: mode || null,
        checked: true,
        collapsed: true,
        color: "red",
      }),
    );
  }
  await expect(row).toHaveAttribute("data-block-background", "red");
  await expect(row.locator('[data-node-identity="changed"]')).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Текст child-0", exact: true })).toBeVisible();
  await page.getByLabel("Фон block-1", { exact: true }).selectOption("");
  await expect(state).toContainText('"color":null');
  await expect(row).not.toHaveAttribute("data-block-background");
});

test("changes block background while preserving text and child backgrounds", async ({ page }) => {
  await page.goto("/");
  const block = page.locator('[data-block-id="block-1"] > .demo-node');
  const child = page.locator('[data-block-id="child-0"] > .demo-node');
  const originalTextColor = await block.evaluate((element) => getComputedStyle(element).color);
  const originalChildBackground = await child.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  for (const color of BACKGROUND_COLORS) {
    await page.getByLabel("Фон block-1", { exact: true }).selectOption(color);
    await expect(block).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(block).toHaveCSS("color", originalTextColor);
    await expect(child).toHaveCSS("background-color", originalChildBackground);
  }
  await page.getByLabel("Фон block-1", { exact: true }).selectOption("");
  await expect(block).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("keeps host state through reorder, renderer registration, and editor remount", async ({
  page,
}) => {
  await page.goto("/");
  const text = page.getByRole("textbox", { name: "Текст block-1", exact: true });
  await text.fill("Сохраняется при remount");
  await page.getByRole("button", { name: "Выделить block-1", exact: true }).click();
  await expect(page.locator('[data-block-id="block-1"]')).toHaveAttribute(
    "data-block-selected",
    "true",
  );
  await expect(page.getByRole("textbox", { name: "Текст block-5", exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Custom renderer", exact: true }).check();
  await expect(page.getByRole("textbox", { name: "Текст block-5", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Обратить порядок корней", exact: true }).click();
  await expect(page.locator("[data-rivto-block-editor] > [data-block-id]").first()).toHaveAttribute(
    "data-block-id",
    "block-5",
  );
  await expect(text).toHaveValue("Сохраняется при remount");
  await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Редактор смонтирован", exact: true }).uncheck();
  await expect(page.locator("[data-rivto-block-editor]")).toHaveCount(0);
  await page.getByRole("button", { name: "Обновить статистику", exact: true }).click();
  const metrics: DemoMetrics = JSON.parse(
    (await page.locator("[data-demo-metrics]").textContent())!,
  );
  expect(metrics.subscriptions).toBe(0);
  await page.getByRole("checkbox", { name: "Редактор смонтирован", exact: true }).check();
  await expect(text).toHaveValue("Сохраняется при remount");
  await expect(page.getByRole("textbox", { name: "Текст block-5", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Снять выделение", exact: true }).click();
  await expect(page.locator('[data-block-selected="true"]')).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Custom renderer", exact: true }).uncheck();
  await expect(page.getByRole("textbox", { name: "Текст block-5", exact: true })).toHaveCount(0);
});

/**
 * Captures one native change event through two animation frames in the browser.
 *
 * @param select - Real list selector whose next change will be driven by Playwright.
 * @returns Resolves after the one-shot measurement listener is installed.
 */
async function captureChangeTiming(select: Locator): Promise<void> {
  await select.evaluate((element) => {
    element.removeAttribute("data-dom-ms");
    element.addEventListener(
      "change",
      () => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            element.setAttribute("data-dom-ms", String(performance.now() - start));
          }),
        );
      },
      { once: true, capture: true },
    );
  });
}

for (const repeat of [1, 200]) {
  test(`bounds real list changes with repeat=${repeat} @performance`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?repeat=${repeat}`);
    await expect(page.locator("[data-block-id]")).toHaveCount(repeat * 6);
    const select = page.getByLabel("List type block-1", { exact: true });
    await select.selectOption("checkbox");
    const samples: { commandMs: number; domMs: number; nodeReads: number }[] = [];
    for (const mode of [
      "numbered_list",
      "start_numbered_list",
      "continue_numbered_list",
      "",
      "list",
    ]) {
      await page.getByRole("button", { name: "Сбросить счётчики", exact: true }).click();
      await select.focus();
      await captureChangeTiming(select);
      await page.keyboard.press(mode === "" ? "Home" : "ArrowDown");
      await expect(page.getByLabel("Состояние block-1", { exact: true })).toContainText(
        `"listType":${JSON.stringify(mode || null)}`,
      );
      await expect(select).toHaveAttribute("data-dom-ms", /\d/);
      await page.getByRole("button", { name: "Обновить статистику", exact: true }).click();
      const metrics: DemoMetrics = JSON.parse(
        (await page.locator("[data-demo-metrics]").textContent())!,
      );
      expect(metrics.rootReads).toBe(0);
      expect(metrics.nodeReads).toBeLessThanOrEqual(24);
      expect(metrics.notifications).toBe(2);
      await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
      samples.push({
        commandMs: metrics.commandMs,
        domMs: Number(await select.getAttribute("data-dom-ms")),
        nodeReads: metrics.nodeReads,
      });
    }
    await testInfo.attach(`list-change-repeat-${repeat}`, {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    console.log(`${testInfo.project.name} repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}

for (const repeat of [1, 200]) {
  test(`bounds real background changes with repeat=${repeat} @performance`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?repeat=${repeat}`);
    await expect(page.locator("[data-block-id]")).toHaveCount(repeat * 6);
    const row = page.locator('[data-block-id="block-1"]');
    const block = row.locator(".demo-node").first();
    const originalTextColor = await block.evaluate((element) => getComputedStyle(element).color);
    const select = page.getByLabel("Фон block-1", { exact: true });
    await select.selectOption("gray");
    const samples: { commandMs: number; domMs: number; nodeReads: number }[] = [];
    for (const color of ["red", "orange", "yellow", "green", "blue"]) {
      await page.getByRole("button", { name: "Сбросить счётчики", exact: true }).click();
      await select.focus();
      await captureChangeTiming(select);
      await page.keyboard.press("ArrowDown");
      await expect(row).toHaveAttribute("data-block-background", color);
      await expect(block).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(block).toHaveCSS("color", originalTextColor);
      await expect(select).toHaveAttribute("data-dom-ms", /\d/);
      await page.getByRole("button", { name: "Обновить статистику", exact: true }).click();
      const metrics: DemoMetrics = JSON.parse(
        (await page.locator("[data-demo-metrics]").textContent())!,
      );
      expect(metrics.rootReads).toBe(0);
      expect(metrics.nodeReads).toBeLessThanOrEqual(24);
      expect(metrics.notifications).toBe(2);
      await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
      samples.push({
        commandMs: metrics.commandMs,
        domMs: Number(await select.getAttribute("data-dom-ms")),
        nodeReads: metrics.nodeReads,
      });
    }
    await testInfo.attach(`background-change-repeat-${repeat}`, {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    console.log(`${testInfo.project.name} background repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
