import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditor } from "@chulane/rivto-react";

/** Existing demo runtime and test-owned extension disposers. */
interface RegistrationInspection {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI; readonly reactEditor: ReactEditor };
  __liveRegistrations: Record<string, () => void>;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const inspection = window as unknown as RegistrationInspection;
    const editor = inspection.__rivtoDemo.editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "live-parent",
      type: "paragraph",
      content: "Parent",
      children: [{ id: "live-child", type: "paragraph", content: "Child" }],
    });
    inspection.__liveRegistrations = {};
  });
});

test("production Page mirrors live slot priority and wrapper removal through surface remount", async ({
  page,
}) => {
  const today = page.locator('[data-journal-document="today"]');
  const surface = today.locator(":scope > .page-surface");
  const parent = surface.locator('[data-block-id="live-parent"]');
  await page.evaluate(() => {
    const inspection = window as unknown as RegistrationInspection;
    const editor = inspection.__rivtoDemo.reactEditor;
    for (const [id, priority] of [
      ["LOW", 1],
      ["HIGH", 10],
    ] as const) {
      inspection.__liveRegistrations[id] = editor.extensions.install({
        id: `live-${id}`,
        /**
         * Registers one priority-bearing slot and one ordered wrapper in the extension scope.
         *
         * @param runtime - Borrowed live host runtime; its extension scope owns the registrations.
         * @returns Contributions are registered until this extension is disposed.
         */
        setup(runtime) {
          runtime.surfaces.registerBlockSlot({
            position: "end",
            mode: "block",
            priority,
            when: ({ block }) => block.id === "live-parent",
            component: () => id,
          });
          runtime.surfaces.registerBlockWrapper("block", ({ block, children }) =>
            block.id === "live-parent" ? [`${id}(`, children, `)${id}`] : children,
          );
        },
      });
    }
  });
  await expect(parent.locator(':scope > .rivto-block-row > [data-slot-position="end"]')).toHaveText(
    "HIGHLOW",
  );
  await expect(surface).toContainText("LOW(HIGH(");
  await expect(surface.locator('[data-block-id="live-child"]')).toHaveCount(1);
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  await expect(surface).toHaveCount(0);
  await today.getByRole("button", { name: "Page", exact: true }).click();
  await expect(parent.locator(':scope > .rivto-block-row > [data-slot-position="end"]')).toHaveText(
    "HIGHLOW",
  );
  await page.evaluate(() =>
    (window as unknown as RegistrationInspection).__liveRegistrations.HIGH!(),
  );
  await expect(parent.locator(':scope > .rivto-block-row > [data-slot-position="end"]')).toHaveText(
    "LOW",
  );
  await expect(surface).not.toContainText("HIGH(");
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  await expect(surface).toHaveCount(0);
  await page.evaluate(() => {
    const releases = (window as unknown as RegistrationInspection).__liveRegistrations;
    releases.HIGH!();
    releases.LOW!();
  });
  await today.getByRole("button", { name: "Page", exact: true }).click();
  await expect(surface).not.toContainText("LOW");
  await expect(surface.locator('[data-block-id="live-child"]')).toHaveCount(1);
  await expect(parent.locator(":scope > .rivto-block-row [data-block-content]")).toHaveText(
    "Parent",
  );
});

test("production Page replaces renderer and layout contributions without duplicating descendants", async ({
  page,
}) => {
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const inspection = window as unknown as RegistrationInspection;
    const editor = inspection.__rivtoDemo.editor;
    const snapshot = editor.dump();
    editor.load({
      ...snapshot,
      blocks: snapshot.blocks.map((block) => ({ ...block, type: "live-renderer" })),
    });
    inspection.__liveRegistrations.renderer = inspection.__rivtoDemo.reactEditor.extensions.install(
      {
        id: "live-renderer",
        /**
         * Installs content into the already-mounted unknown-type block.
         *
         * @param runtime - Borrowed live host runtime; its extension scope owns the registrations.
         * @returns Contributions are registered until this extension is disposed.
         */
        setup(runtime) {
          runtime.renderers.register("live-renderer", () => "Live renderer");
        },
      },
    );
  });
  const parent = surface.locator('[data-block-id="live-parent"]');
  await expect(parent.locator(":scope > .rivto-block-row")).toContainText("Live renderer");
  await expect(surface.locator('[data-block-id="live-child"]')).toHaveCount(1);
  await page.evaluate(() => {
    const inspection = window as unknown as RegistrationInspection;
    inspection.__liveRegistrations.renderer!();
    inspection.__liveRegistrations.layout = inspection.__rivtoDemo.reactEditor.extensions.install({
      id: "live-layout",
      /**
       * Replaces default composition with an explicitly childless layout.
       *
       * @param runtime - Borrowed live host runtime; its extension scope owns the registrations.
       * @returns Contributions are registered until this extension is disposed.
       */
      setup(runtime) {
        runtime.renderers.register(
          "live-renderer",
          () => "Unused content",
          () => "Live layout",
        );
      },
    });
  });
  await expect(parent).toHaveText("Live layout");
  await expect(surface.locator('[data-block-id="live-child"]')).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as RegistrationInspection).__liveRegistrations.layout!(),
  );
  await expect(parent).not.toContainText("Live layout");
  await expect(surface.locator('[data-block-id="live-child"]')).toHaveCount(1);
  await expect(surface).not.toContainText("Live renderer");
});
