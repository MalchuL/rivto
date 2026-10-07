import { expect, test } from "@playwright/test";
import type { RivtoEditorApi } from "@chulane/rivto";
import type { ReactEditor } from "@chulane/rivto-react";

interface DemoInspection {
  __rivtoDemo: { editor: RivtoEditorApi; reactEditor: ReactEditor };
}

test("core mode changes render the surface while embeddings keep their page view", async ({ page }) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.locator('[data-rivto-surface]').first()).toHaveAttribute("data-rivto-surface", "block");
  await page.evaluate(() => {
    const { editor, reactEditor } = (window as unknown as DemoInspection).__rivtoDemo;
    if (reactEditor.mode !== editor.mode) throw new Error("React must share the core mode manager");
    editor.mode.set("edgeless");
  });
  await expect(today.locator('[data-rivto-surface]').first()).toHaveAttribute("data-rivto-surface", "edgeless");
  await expect(today.getByRole("button", { name: "Edgeless", exact: true })).toHaveAttribute("aria-pressed", "true");
  const embedded = today.getByRole("region", { name: "Block editor" });
  await expect(embedded).toHaveAttribute("data-rivto-surface", "block");
  const content = embedded.locator('[data-block-content]').first();
  await content.focus();
  await expect.poll(() => page.evaluate(() => {
    const { editor, reactEditor } = (window as unknown as DemoInspection).__rivtoDemo;
    return { core: editor.mode.get(), surface: reactEditor.events.getSurfaceType() };
  })).toEqual({ core: "edgeless", surface: "block" });
  await today.getByRole("button", { name: "Page", exact: true }).click();
  await expect(today.locator('[data-rivto-surface]').first()).toHaveAttribute("data-rivto-surface", "block");
  expect(await page.evaluate(() => (window as unknown as DemoInspection).__rivtoDemo.editor.mode.get())).toBe("block");
});

test("mode controls change only their own document editor", async ({ page }) => {
  await page.goto("/?editors=2");
  const left = page.locator('[data-multi-editor="left"]');
  const right = page.locator('[data-multi-editor="right"]');
  await left.getByRole("button", { name: "Edgeless", exact: true }).click();
  await expect(left.locator('[data-rivto-surface]').first()).toHaveAttribute("data-rivto-surface", "edgeless");
  await expect(right.locator('[data-rivto-surface]').first()).toHaveAttribute("data-rivto-surface", "block");
  await expect(right.getByRole("button", { name: "Page", exact: true })).toHaveAttribute("aria-pressed", "true");
});
