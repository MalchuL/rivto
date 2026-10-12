import { expect, test } from "@playwright/test";
import { hostBlockIdSelector } from "./dom-markers";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`structural paste keeps selection until a text click in ${mode}, repeat=${repeat}`, async ({ page }) => {
      await page.goto(`/?repeat=${repeat}`);
      const today = page.locator('[data-journal-document="today"]');
      await today.locator("[data-block-content]").first().waitFor();
      await today.locator(`[data-editor-mode="${mode}"]`).click();
      const target = today.locator("[data-block-content]").filter({ hasText: /^Finish the selection/ }).first();
      // Long demo cards overlap; expose this card without changing document size or virtualization.
      if (mode === "edgeless") {
        const cardId = await target.evaluate(element => element.closest<HTMLElement>("[data-edgeless-root]")!.dataset.edgelessRoot!);
        await page.evaluate(id => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.elements.updateElement(id, { zIndex: 1000 }), cardId);
      }
      await target.click();
      const targetId = await target.evaluate(element => element.closest("[data-block-id]")!.getAttribute("data-block-id")!);
      const read = () => page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.selection.get());
      await expect.poll(async () => (await read())?.focusBlockId).toBe(targetId);
      await target.evaluate((element, mode) => {
        const data = new DataTransfer();
        data.setData("application/x-rivto+json", JSON.stringify({
          version: 4,
          elements: mode === "edgeless" ? [{
            id: "paste-card", type: "block", childIds: [],
            frame: { x: 900, y: 100, width: 320, height: 150 }, zIndex: 1,
            props: { startBlockId: "paste-source", endBlockId: "paste-source" },
          }] : undefined,
          blocks: [{
            id: "paste-source", type: "paragraph", content: "Structural paste regression", props: {}, pluginData: {},
            listProps: { type: "list", collapsed: false, checked: false }, children: [],
          }],
        }));
        const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: data });
        element.dispatchEvent(event);
      }, mode);
      const pasted = today.locator("[data-block-content]").filter({ hasText: /^Structural paste regression$/ });
      await expect(pasted).toHaveCount(1);
      const pastedId = await pasted.evaluate(element => element.closest("[data-block-id]")!.getAttribute("data-block-id")!);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const selection = await read();
      if (mode === "edgeless") expect(selection?.elements).toHaveLength(1);
      else expect(selection?.blocks.map(block => block.id)).toContain(pastedId);
      await target.click();
      await expect.poll(async () => (await read())?.focusBlockId).toBe(targetId);
      await expect.poll(async () => (await read())?.blocks.every(block => block.start === block.end)).toBe(true);
      expect((await read())?.elements ?? []).toHaveLength(0);
      await expect(today.locator(hostBlockIdSelector(pastedId))).not.toHaveAttribute("data-block-selected", "true");
      await page.keyboard.type("X");
      await expect(target).toContainText("X");
      await expect(pasted).toHaveText("Structural paste regression");
    });
  }
}

for (const repeat of [0, 200]) {
  test(`plain pointerdown releases whole-block selection immediately, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    const contents = today.locator("[data-block-content]").filter({ hasText: /^(Finish the selection|Type `\/`|Try the interactive checkbox)/ });
    await contents.nth(0).click({ modifiers: ["Control"] });
    await contents.nth(1).click({ modifiers: ["Control"] });
    await expect(today.locator("[data-block-selected]")).toHaveCount(2);
    await page.evaluate(() => {
      document.addEventListener("pointerdown", () => {
        const w = window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI }; selectionAtPointer?: unknown };
        w.selectionAtPointer = w.__rivtoDemo.editor.selection.get() ?? null;
      }, { once: true });
    });
    await contents.nth(2).click();
    expect(await page.evaluate(() => (window as unknown as { selectionAtPointer: unknown }).selectionAtPointer)).toBeNull();
    await expect(today.locator("[data-block-selected]")).toHaveCount(0);
    await contents.nth(0).click({ modifiers: ["Control"] });
    await contents.nth(1).click({ modifiers: ["Control"] });
    const surfaceBox = (await today.locator(":scope > .page-surface").boundingBox())!;
    const contentBox = (await contents.nth(1).boundingBox())!;
    await page.mouse.click(surfaceBox.x + 5, contentBox.y + contentBox.height / 2);
    await expect(today.locator("[data-block-selected]")).toHaveCount(0);
  });
}
