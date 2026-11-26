import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("Pomodoro keeps counting across Page, Edgeless and reload", async ({ page }) => {
  const startedAt = new Date("2026-11-26T10:00:00Z").getTime();
  await page.clock.setFixedTime(startedAt);
  await page.goto("/");
  const widget = page.frameLocator('iframe[name="Pomodoro"]');
  const start = widget.getByRole("button", { name: "Start", exact: true });
  const stop = widget.getByRole("button", { name: "Stop", exact: true });
  const time = widget.getByRole("timer");
  await expect(time).toHaveText("25:00");
  await start.click();
  await expect(stop).toBeEnabled();

  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
      .__rivtoDemo;
    const card = editor.elements.getElementNodes().find((item) => {
      const start = item.props.startBlockId;
      return (
        typeof start === "string" &&
        editor.blocks.getBlockNode(start)?.content === "## HTML widgets"
      );
    });
    if (!card) {
      throw new Error("Missing HTML widget card");
    }
    editor.elements.updateElement(card.id, { frame: { ...card.frame, x: 60, y: 80 } });
  });
  await page.clock.setFixedTime(startedAt + 60_000);
  await page.locator('[data-editor-mode="edgeless"]').click();
  await expect(page.locator('.edgeless-viewport iframe[name="Pomodoro"]')).toBeVisible();
  await expect(time).toHaveText("24:00");
  await page.clock.setFixedTime(startedAt + 120_000);
  await page.locator('[data-editor-mode="block"]').click();
  await expect(time).toHaveText("23:00");
  await page.clock.setFixedTime(startedAt + 180_000);
  await page.reload();
  await expect(time).toHaveText("22:00");
  await expect(stop).toBeEnabled();
  await expect(widget.getByRole("spinbutton", { name: "Minutes" })).toBeDisabled();

  await page.clock.setFixedTime(startedAt + 25 * 60_000);
  await page.reload();
  await expect(time).toHaveText("00:00");
  await expect(start).toBeEnabled();
  await expect(stop).toBeDisabled();
  await expect(widget.getByRole("spinbutton", { name: "Minutes" })).toBeEnabled();
  await start.click();
  await expect(time).toHaveText("25:00");
  await expect(stop).toBeEnabled();
});

test("Pomodoro saves idle duration and resets the countdown with Stop", async ({ page }) => {
  const now = new Date("2026-11-26T10:00:00Z").getTime();
  await page.clock.setFixedTime(now);
  await page.goto("/");
  const widget = page.frameLocator('iframe[name="Pomodoro"]');
  const time = widget.getByRole("timer");
  const minutes = widget.getByRole("spinbutton", { name: "Minutes" });
  const start = widget.getByRole("button", { name: "Start", exact: true });
  const stop = widget.getByRole("button", { name: "Stop", exact: true });

  await minutes.fill("0");
  await start.click();
  await expect(stop).toBeDisabled();
  await expect(time).toHaveText("25:00");
  await minutes.fill("5");
  await minutes.press("Tab");
  await expect(time).toHaveText("05:00");

  await page.reload();
  await expect(minutes).toHaveValue("5");
  await start.click();
  await page.clock.setFixedTime(now + 60_000);
  await expect(time).toHaveText("04:00");
  await stop.click();
  await expect(time).toHaveText("05:00");
  await expect(minutes).toBeEnabled();

  await page.clock.setFixedTime(now + 120_000);
  await page.reload();
  await expect(time).toHaveText("05:00");
  await expect(stop).toBeDisabled();
});
