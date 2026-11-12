import { expect, test } from "@playwright/test";
import type { YjsDoc } from "@chulane/crdt-doc";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Demo access used to exercise block properties and document history. */
interface HistoryMapWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
}

test("evicts old block property values while retaining recent undo", async ({ page }) => {
  test.fixme(
    true,
    "Yjs keeps content for evicted entries; safe shared-history collection is unresolved",
  );
  await page.goto("/?test_features=1");
  await page.locator("[data-block-content]").first().waitFor();
  const result = await page.evaluate(async () => {
    const editor = (window as unknown as HistoryMapWindow).__rivtoDemo.editor;
    const id = editor.blocks.getRootIds()[0]!;
    const doc = editor.getDocument();
    const crdt = Reflect.get(doc, "crdt") as YjsDoc;
    const before = crdt.getSnapshot().byteLength;
    const payload = "abcdefgh01234567".repeat(32);
    for (let index = 0; index < 250; index++) {
      editor.blocks.setBlockProp(id, "memoryProbe", `${index}-${payload}`);
      editor.history.stopCapturing();
      if (index % 20 === 19) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1_200));
    const after = crdt.getSnapshot().byteLength;
    editor.history.undo();
    return { before, after, value: editor.blocks.getBlock(id)?.props.memoryProbe, payload };
  });
  await test.step("evicted map values remain bounded", async () => {
    expect(result.after - result.before).toBeLessThan(result.payload.length * 150);
  });
  expect(result.value).toBe(`248-${result.payload}`);
});
