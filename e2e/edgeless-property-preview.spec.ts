import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "@chulane/rivto-react";

declare global {
  interface Window {
    __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
  }
}

for (const repeat of [0, 200]) {
  test(`invalidated property preview keeps the canvas mounted, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const id = await page.evaluate(() => {
      const { editor, reactEditor } = window.__rivtoDemo;
      const rectangle = reactEditor.elementTypes.get("rectangle")!;
      reactEditor.elementTypes.register({
        ...rectangle,
        definition: {
          ...rectangle.definition,
          type: "guarded-rectangle",
          /**
           * Rejects red fill changes for the fixture's locked element.
           *
           * @param props - Element properties to validate.
           * @returns The unchanged properties.
           * @throws If a locked element receives the forbidden color.
           */
          validate(props) {
            if (props.locked && props.fill === "#ff0000") {
              throw new Error("Locked color");
            }
            return props;
          },
        },
        creation: undefined,
      });
      return editor.elements.insertElement({
        type: "guarded-rectangle",
        frame: { x: 300, y: 200, width: 160, height: 120 },
        props: { fill: "#0000ff" },
        zIndex: 1000,
      }).id;
    });
    const rectangle = page.locator(`[data-edgeless-object-id="${id}"]`);
    await rectangle.click();
    const fill = page.getByRole("region", { name: "Visual properties" }).getByLabel("Fill color");
    await expect(fill).toBeVisible();
    const samples = [];
    for (let sample = 0; sample < 3; sample++) {
      await fill.fill("#ff0000");
      await expect(rectangle.locator("rect")).toHaveAttribute("fill", "#ff0000");
      const timing = await page.evaluate(async (id) => {
        const { editor } = window.__rivtoDemo;
        const start = performance.now();
        editor.elements.updateElement(id, { props: { locked: true } });
        const synchronous = performance.now() - start;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return { synchronous, rendered: performance.now() - start };
      }, id);
      samples.push(timing);
      await expect(page.locator(".edgeless-viewport")).toBeVisible();
      await expect(rectangle.locator("rect")).toHaveAttribute("fill", "#0000ff");
      expect(
        await page.evaluate(
          (id) => window.__rivtoDemo.editor.elements.getElementNode(id)?.props,
          id,
        ),
      ).toMatchObject({ fill: "#0000ff", locked: true });
      await fill.focus();
      await page.keyboard.press("Escape");
      await page.evaluate(
        (id) => window.__rivtoDemo.editor.elements.updateElement(id, { props: { locked: false } }),
        id,
      );
    }
    console.log(JSON.stringify({ repeat, samples }));
    await fill.fill("#00ff00");
    await page.locator(".edgeless-viewport").click({ position: { x: 24, y: 24 } });
    expect(
      await page.evaluate(
        (id) => window.__rivtoDemo.editor.elements.getElementNode(id)?.props.fill,
        id,
      ),
    ).toBe("#00ff00");
    expect(errors).toEqual([]);
  });
}
