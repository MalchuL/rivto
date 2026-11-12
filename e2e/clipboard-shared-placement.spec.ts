import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface ClipboardPlacementWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

for (const mode of ["block", "edgeless"] as const) {
  for (const collapsed of [false, true]) {
    test(`pastes beside or into ${collapsed ? "a collapsed" : "an expanded"} parent in ${mode} mode`, async ({
      page,
    }) => {
      await page.goto("/?test_features=1");
      const parentId = await page.evaluate((isCollapsed) => {
        const { editor } = (window as unknown as ClipboardPlacementWindow).__rivtoDemo;
        const parent = editor.blocks
          .getBlocks()
          .find((block) => block.content && block.children.length);
        if (!parent) {
          throw new Error("Expected a writing block with children");
        }
        editor.blocks.updateBlock(parent.id, { listProps: { collapsed: isCollapsed } });
        return parent.id;
      }, collapsed);
      await page.locator(`[data-editor-mode="${mode}"]`).click();
      const parent = page
        .locator(`[data-journal-document="today"] [data-block-id="${parentId}"]`)
        .last();
      const content = parent.locator("[data-block-content]").first();
      await content.click();
      await content.evaluate((element) => {
        const data = new DataTransfer();
        data.setData(
          "application/x-rivto+json",
          JSON.stringify({
            version: 4,
            fromTextSelection: false,
            blocks: [
              {
                id: "copied-placement",
                type: "paragraph",
                listProps: { collapsed: false, type: "list", checked: false },
                content: "Shared placement marker",
                props: {},
                pluginData: {},
                children: [],
              },
            ],
          }),
        );
        const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: data });
        element.dispatchEvent(event);
      });
      await expect
        .poll(async () =>
          page.evaluate(
            ({ parentId: expectedParent, collapsed: isCollapsed }) => {
              const { editor } = (window as unknown as ClipboardPlacementWindow).__rivtoDemo;
              const visit = (
                blocks: ReturnType<typeof editor.blocks.getBlocks>,
              ): string | undefined => {
                for (const block of blocks) {
                  if (block.content === "Shared placement marker") {
                    return editor.blocks.getParentId(block.id) ?? "root";
                  }
                  const found = visit(block.children);
                  if (found) {
                    return found;
                  }
                }
                return undefined;
              };
              const destination = isCollapsed
                ? (editor.blocks.getParentId(expectedParent) ?? "root")
                : expectedParent;
              return visit(editor.blocks.getBlocks()) === destination;
            },
            { parentId, collapsed },
          ),
        )
        .toBe(true);
    });
  }
}
