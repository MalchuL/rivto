import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("creates nested groups without child IDs and preserves their children when ungrouping", async ({
  page,
}) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  await today.locator("[data-block-content]").first().waitFor();
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  const initial = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const group = editor.elements.insertElement({
      id: "tree-outer",
      type: "group",
      zIndex: 100,
      children: [
        {
          id: "tree-inner",
          type: "group",
          zIndex: 100,
          children: [
            {
              id: "tree-shape",
              type: "shape",
              zIndex: 101,
              frame: { x: 40, y: 40, width: 60, height: 60 },
              props: { shape: "rectangle" },
            },
          ],
        },
        {
          id: "tree-sibling",
          type: "shape",
          zIndex: 102,
          frame: { x: 180, y: 40, width: 60, height: 60 },
          props: { shape: "ellipse" },
        },
      ],
    });
    editor.commands.execute("edgeless.selection.set", [group.id]);
    return group;
  });
  expect(initial.frame).toEqual({ x: 40, y: 40, width: 200, height: 60 });
  expect(initial.children[0]!.children[0]!.id).toBe("tree-shape");
  await expect(today.locator('[data-edgeless-group-hit="tree-outer"]')).toBeVisible();
  await expect(today.locator('[data-edgeless-group-hit="tree-inner"]')).toHaveCount(0);
  const toolbar = today.getByRole("toolbar", { name: "Selected objects" });
  await toolbar.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Group", exact: true })).toBeVisible();
  const after = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    return {
      outer: editor.elements.getElement("tree-outer"),
      inner: editor.elements.getElement("tree-inner"),
      sibling: editor.elements.getElement("tree-sibling"),
    };
  });
  expect(after.outer).toBeUndefined();
  expect(after.inner).toEqual(initial.children[0]);
  expect(after.sibling).toEqual(initial.children[1]);
  await expect(today.locator('[data-edgeless-group-hit="tree-inner"]')).toBeVisible();
});
