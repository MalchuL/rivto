import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  test(`renders and clears a persisted block theme in ${mode}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] [data-block-id]').first().waitFor();
    const id = await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      return editor.blocks.insertBlock({
        type: "paragraph",
        content: "Themed block",
        listProps: {
          style: {
            text: { color: "#18436c" },
            background: { color: "#d2dce6" },
            border: { radius: "23" },
          },
        },
      }).id;
    });
    if (mode === "edgeless") {
      await page.getByRole("button", { name: "Edgeless", exact: true }).first().click();
    }
    const block = page.locator(`[data-block-id="${id}"]`).first();
    await expect(block.locator(".rivto-block-content").first()).toHaveCSS(
      "color",
      "rgb(24, 67, 108)",
    );
    await expect(block).toHaveCSS("border-radius", "23px");
    await expect(block).toHaveCSS("background-color", "rgb(210, 220, 230)");
    await expect(block).toHaveAttribute("data-block-background", "#d2dce6");
    await page.evaluate((blockId) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.deleteListProps(blockId, ["style"]);
    }, id);
    await expect(block.locator(".rivto-block-content").first()).not.toHaveCSS(
      "color",
      "rgb(24, 67, 108)",
    );
    await expect(block).not.toHaveCSS("border-radius", "23px");
  });
}

for (const mode of ["block", "edgeless"] as const) {
  test(`block style does not leak to descendants in ${mode}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] [data-block-id]').first().waitFor();
    const ids = await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const parent = editor.blocks.insertBlock({
        type: "paragraph",
        content: "Plain **bold** [Styled link](https://example.com)",
        listProps: {
          style: {
            background: { color: "#ff000080" },
            text: { color: "#ff0000", fontSize: "24", fontWeight: 400 },
          },
        },
        children: [
          { type: "paragraph", content: "Child without own style" },
          {
            type: "paragraph",
            content: "Child with own style",
            listProps: { style: { text: { color: "#0000ff" } } },
          },
        ],
      });
      return { parent: parent.id, first: parent.children[0]!.id, second: parent.children[1]!.id };
    });
    if (mode === "edgeless") {
      await page.getByRole("button", { name: "Edgeless", exact: true }).first().click();
    }
    const parent = page.locator(`[data-block-id="${ids.parent}"]`).first();
    const first = page.locator(`[data-block-id="${ids.first}"]`).first();
    const second = page.locator(`[data-block-id="${ids.second}"]`).first();
    await expect(parent.locator(".rivto-block-content").first()).toHaveCSS(
      "color",
      "rgb(255, 0, 0)",
    );
    await expect(parent.getByRole("link", { name: "Styled link" })).toHaveCSS(
      "color",
      "rgb(80, 56, 179)",
    );
    await expect(parent.locator(".markdown-preview strong")).toHaveCSS("font-weight", "700");
    await expect(parent.locator(".markdown-preview p").first()).toHaveCSS(
      "color",
      "rgb(255, 0, 0)",
    );
    await expect(parent.locator(".markdown-preview p").first()).toHaveCSS("font-size", "24px");
    await expect(first.locator(".markdown-preview p").first()).not.toHaveCSS(
      "color",
      "rgb(255, 0, 0)",
    );
    await expect(first.locator(".markdown-preview p").first()).not.toHaveCSS("font-size", "24px");
    await expect(first).not.toHaveCSS("color", "rgb(255, 0, 0)");
    await expect(first).not.toHaveCSS("font-size", "24px");
    await expect(first).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(second.locator(".rivto-block-content").first()).toHaveCSS(
      "color",
      "rgb(0, 0, 255)",
    );
  });
}

test("block text color preserves Markdown code editing overlays", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] [data-block-id]').first().waitFor();
  const id = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const root = editor.blocks.getRootIds()[0]!;
    editor.blocks.updateBlock(root, {
      content: "```javascript\nconst answer = 42;\n```",
      listProps: { style: { text: { color: "#ff0000" } } },
    });
    return root;
  });
  const block = page.locator(`[data-block-id="${id}"]`).first();
  const code = block.locator(".markdown-code-editor");
  await expect(code).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(block.locator(".markdown-preview .hljs-keyword").first()).toHaveCSS(
    "color",
    "rgb(166, 38, 164)",
  );
  await code.click();
  await expect(code).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.insertText("x");
  await expect
    .poll(() =>
      page.evaluate((blockId) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.blocks.getBlockNode(blockId)?.content;
      }, id),
    )
    .toContain("x");
});

for (const mode of ["block", "edgeless"] as const) {
  test(`keeps valid styles and background editing when another field has a wrong type in ${mode}`, async ({
    page,
  }) => {
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] [data-block-id]').first().waitFor();
    const id = await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const id = editor.blocks.getRootIds()[0]!;
      editor.blocks.updateBlock(id, {
        type: "paragraph",
        content: "Partially valid style",
        listProps: {
          style: {
            background: { color: "#ff0000" },
            text: { color: "#0000ff", fontSize: 123 },
            future: { value: 42 },
          },
        },
      });
      return id;
    });
    if (mode === "edgeless") {
      await page.getByRole("button", { name: "Edgeless", exact: true }).first().click();
    }
    const block = page.locator(`[data-block-id="${id}"]`).first();
    await expect(block).toHaveCSS("background-color", "rgb(255, 0, 0)");
    await expect(block.locator(".rivto-block-content").first()).toHaveCSS(
      "color",
      "rgb(0, 0, 255)",
    );
    const row = block.locator(":scope > .rivto-block-row");
    await row.hover();
    await row
      .locator(":scope > :is(.rivto-slot, .rivto-block-slot) > .block-handle")
      .click({ button: "right" });
    await page.getByRole("button", { name: "No color", exact: true }).click();
    await expect(block).toHaveAttribute("data-block-background", "#00000000");
    await expect(block.locator(".rivto-block-content").first()).toHaveCSS(
      "color",
      "rgb(0, 0, 255)",
    );
    const style = await page.evaluate((blockId) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      return editor.blocks.getBlockNode(blockId)?.listProps.style;
    }, id);
    expect(style).toEqual({
      background: { color: "#00000000" },
      text: { color: "#0000ff", fontSize: 123 },
      future: { value: 42 },
    });
  });
}
