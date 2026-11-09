import { expect, test } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";

test("renders menu presentation supplied by an extension", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi } })
      .__rivtoDemo.reactEditor;
    const icon = editor.blockContextMenu.get("block.delete")!.icon;
    editor.extensions.install({
      id: "test.menu-presentation",
      setup: (runtime) => {
        runtime.blockContextMenu.register({
          id: "test.custom-action",
          title: "Custom action",
          icon,
          destructive: true,
          execute: () => {},
        });
        runtime.blockContextMenu.register({
          id: "test.custom-submenu",
          title: "Custom submenu",
          icon,
          kind: "submenu",
        });
        runtime.blockContextMenu.register({
          id: "test.custom-checkbox",
          title: "Custom checkbox",
          icon,
          isChecked: () => true,
          execute: () => {},
        });
      },
    });
  });
  const row = page.locator('[data-journal-document="today"] .rivto-block-row').first();
  await row.hover();
  await row.locator(":scope > .rivto-block-slot > .block-handle").click({ button: "right" });
  const menu = page.getByRole("menu").first();
  const action = menu.getByRole("menuitem", { name: "Custom action" });
  await expect(action).toHaveAttribute("data-variant", "destructive");
  await expect(action.locator("svg.lucide-trash-2[aria-hidden='true']")).toHaveCount(1);
  await expect(
    menu.getByRole("menuitemcheckbox", { name: "Custom checkbox" }).locator("svg.lucide-trash-2"),
  ).toHaveCount(1);
  await expect(
    menu.getByRole("menuitem", { name: "Custom submenu" }).locator("svg.lucide-trash-2"),
  ).toHaveCount(1);
});
