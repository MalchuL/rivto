import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { Composition } from "./fixtures/composition";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

for (const mode of ["block", "edgeless"]) {
  for (const repeat of [0, 200]) {
    test(`composition owns its candidate, commits once and cancels in ${mode}, repeat=${repeat}`, async ({
      page,
      browserName,
    }) => {
      await page.goto(`/?repeat=${repeat}`);
      const today = page.locator('[data-journal-document="today"]');
      await today.locator(`[data-editor-mode="${mode}"]`).click();
      const content = today.locator(".markdown-editor").nth(1);
      await content.fill("");
      const id = await content.evaluate((element) =>
        element.closest("[data-block-id]")!.getAttribute("data-block-id")!,
      );
      const roots = await page.evaluate(() =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getRootIds(),
      );
      // A preceding root makes an accidentally routed Tab capable of changing hierarchy.
      expect(roots.indexOf(id)).toBeGreaterThan(0);
      const session =
        browserName === "chromium" ? await page.context().newCDPSession(page) : undefined;
      const composition = new Composition(content, session);
      try {
        for (const candidate of ["に", "日本"]) {
          await composition.update(candidate);
          await expect(content).toHaveText(candidate);
          expect(
            await page.evaluate(
              (id) =>
                (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(id)
                  ?.content,
              id,
            ),
          ).toBe("");
        }
        // Explicit composing key events test command routing without simulating OS candidate UI.
        await content.evaluate((element) => {
          for (const key of ["Enter", "Tab", "Backspace", "z"]) {
            element.dispatchEvent(
              new KeyboardEvent("keydown", {
                key,
                code: key === "z" ? "KeyZ" : key,
                ctrlKey: key === "z",
                isComposing: true,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        });
        await expect(content).toHaveText("日本");
        expect(
          await page.evaluate(() =>
            (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getRootIds(),
          ),
        ).toEqual(roots);
        await page.evaluate(async (id) => {
          const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
          editor.blocks.updateBlock(id, { content: "External" });
          editor.history.clear();
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }, id);
        await expect(content).toHaveText("日本");
        await composition.finish();
        await expect
          .poll(() =>
            page.evaluate(
              (id) =>
                (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(id)
                  ?.content,
              id,
            ),
          )
          .toBe("日本");
        await expect(content).toBeFocused();
        expect(
          await content.evaluate((element) => {
            const selection = element.ownerDocument.getSelection()!;
            const range = element.ownerDocument.createRange();
            range.selectNodeContents(element);
            range.setEnd(selection.focusNode!, selection.focusOffset);
            return range.toString().length;
          }),
        ).toBe(2);
        await page.keyboard.press("Control+z");
        await expect(content).toHaveText("External");
        await page.keyboard.press("Control+Shift+z");
        await expect(content).toHaveText("日本");
        await content.fill("");
        await page.evaluate(() =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.history.clear(),
        );
        await composition.update("取消");
        await composition.finish(true);
        await expect(content).toHaveText("");
        expect(
          await page.evaluate(
            (id) =>
              (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(id)?.content,
            id,
          ),
        ).toBe("");
        await page.keyboard.type("A");
        await expect
          .poll(() =>
            page.evaluate(
              (id) =>
                (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(id)
                  ?.content,
              id,
            ),
          )
          .toBe("A");
        await page.keyboard.press("Control+z");
        await expect(content).toHaveText("");
      } finally {
        await session?.detach();
      }
    });
  }
}
