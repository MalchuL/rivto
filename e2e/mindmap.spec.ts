import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`custom mindmap grows branches, previews properties, undoes and copies, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    const diagrams = toolbar.getByRole("button", { name: "Diagrams", exact: true });
    await expect(diagrams).toHaveText("");
    await expect(diagrams.locator("svg")).toBeVisible();
    await diagrams.click();
    const mindmapTool = toolbar.getByRole("button", { name: "Mindmap", exact: true });
    await expect(mindmapTool).toHaveText("Mindmap");
    await expect(mindmapTool).toHaveAttribute("title", "Mindmap");
    await expect(mindmapTool.locator("svg")).toBeVisible();
    await mindmapTool.click();
    const canvas = page.locator(".edgeless-viewport");
    const bounds = await canvas.boundingBox();
    await page.mouse.click(bounds!.x + 200, bounds!.y + 220);
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    const mindmap = page.locator("[data-mindmap]");
    await expect(mindmap).toHaveCount(1);
    const nodes = mindmap.locator("[data-mindmap-node]");
    await expect(nodes).toHaveCount(1);
    await mindmap.getByRole("button", { name: "Add branch to Mindmap" }).click();
    await expect(nodes).toHaveCount(2);
    await nodes.nth(1).getByRole("textbox").fill("Topic");
    await mindmap.getByRole("button", { name: "Add branch to Topic" }).click();
    await expect(nodes).toHaveCount(3);
    await mindmap.getByRole("button", { name: "Add branch to Mindmap" }).click();
    await expect(nodes).toHaveCount(4);
    const color = page.getByLabel("Mindmap branch color");
    await color.fill("#ff0000");
    await expect(nodes.first()).toHaveCSS("border-top-color", "rgb(255, 0, 0)");
    await color.press("Escape");
    await expect(nodes.first()).toHaveCSS("border-top-color", "rgb(99, 102, 241)");
    await color.fill("#00aa00");
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    await canvas.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(nodes.first()).toHaveCSS("border-top-color", "rgb(99, 102, 241)");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(nodes.first()).toHaveCSS("border-top-color", "rgb(0, 170, 0)");
    await color.fill("#112233");
    // Keyboard activation has no outside pointerdown: unmount itself must commit.
    await page.locator('[data-editor-mode="block"]').focus();
    await page.keyboard.press("Enter");
    await expect(mindmap).toHaveCount(0);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await expect(nodes).toHaveCount(4);
    await expect(nodes.first()).toHaveCSS("border-top-color", "rgb(17, 34, 51)");
    await expect(nodes.nth(1).getByRole("textbox")).toHaveValue("Topic");
    // Select the element's empty frame, then duplicate through the real canvas shortcut.
    const frame = page.locator('[data-edgeless-visual-kind="mindmap"]');
    await frame.click({ position: { x: 5, y: 5 } });
    await canvas.focus();
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(mindmap).toHaveCount(2);
    await expect(mindmap.nth(1).locator("[data-mindmap-node]")).toHaveCount(4);
    expect(errors).toEqual([]);
  });
}

test("custom properties remain available with the creation toolbar disabled", async ({ page }) => {
  await page.goto("/?elementRegistration=1&hideToolbar=1");
  const panel = page.locator('[data-canvas="first"]');
  await expect(panel.getByRole("toolbar", { name: "Visual objects" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Create badge", exact: true }).click();
  await panel.getByLabel("Badge text").fill("Preview");
  await expect(panel.locator("[data-custom-badge]")).toHaveText("Preview");
  await expect(panel.locator("[data-custom-state]")).toContainText('"title":"Badge"');
  await panel.getByLabel("Badge text").press("Escape");
  await expect(panel.locator("[data-custom-badge]")).toHaveText("Badge");
  await panel.getByLabel("Badge text").fill("Committed");
  await panel.getByRole("button", { name: "Double width", exact: true }).click();
  await expect(panel.locator("[data-custom-state]")).toContainText('"title":"Committed"');
});
