/** Browser coverage for embedding loading geometry and manual recovery. */
import { expect, test, type Page } from "@playwright/test";
import type { DocumentStorage } from "@chulane/document-model";
import type { EditorStorage } from "@chulane/rivto-react";

type Scenario = "loading" | "lookup-error" | "missing" | "failure";
interface LoadingInspection {
  lookups: number;
  acquisitions: number;
  loadedLookups: number;
  recover?: boolean;
  failLoadedLookup?: boolean;
  finish?: () => void;
}

/**
 * Inserts a reference to an unopened source and intercepts only that reference's requests.
 *
 * The source document uses the demo's real storage and renderers. Fault injection
 * controls lookup or acquisition completion without replacing the loaded editor.
 *
 * @param page - Browser page hosting the shared-document demo.
 * @param scenario - Pending lookup, unavailable target, or failed request to reproduce.
 * @returns Completion once the reference has been inserted.
 */
async function insertReference(page: Page, scenario: Scenario): Promise<void> {
  await page.goto(`/?embeddings=1&room=loading-${crypto.randomUUID()}`);
  await expect(page.locator('[data-document-pane="references"]')).toBeVisible();
  await page.evaluate(async (scenario) => {
    const { editor, storage } = (
      window as unknown as {
        __rivtoDocuments: { editor: EditorStorage; storage: DocumentStorage };
      }
    ).__rivtoDocuments;
    await storage.create("load-source", [
      { id: "load-target", type: "paragraph", content: "Loaded source" },
    ]);
    const state: LoadingInspection = { lookups: 0, acquisitions: 0, loadedLookups: 0 };
    (window as unknown as { __embeddingLoadTest: LoadingInspection }).__embeddingLoadTest = state;
    const resolve = editor.blockReferences.resolveBlock.bind(editor.blockReferences);
    editor.blockReferences.resolveBlock = async (reference, options) => {
      // Loaded-document refreshes use the real resolver rather than injected failures.
      if (reference.blockId !== "load-target") {
        return resolve(reference, options);
      }
      if (editor.getEditor("load-source")) {
        state.loadedLookups++;
        if (state.failLoadedLookup) {
          throw new Error("loaded source lookup failure");
        }
        return resolve(reference, options);
      }
      state.lookups++;
      if (scenario === "loading") {
        await new Promise<void>((finish) => {
          state.finish = finish;
        });
      }
      if (scenario === "lookup-error" && !state.recover) {
        throw new Error("temporary lookup failure");
      }
      if (scenario === "missing" && !state.recover) {
        return { ambiguous: false };
      }
      return { documentId: "load-source", ambiguous: false };
    };
    const acquire = editor.acquireEditor.bind(editor);
    editor.acquireEditor = async (id, options) => {
      if (id === "load-source") {
        state.acquisitions++;
        if (scenario === "failure" && !state.recover) {
          throw new Error("temporary document failure");
        }
      }
      return acquire(id, options);
    };
    editor.getEditor("references")!.blocks.insertBlock({
      id: "load-embedding",
      type: "embedding",
      props: { targetDocumentId: "load-source", targetBlockId: "load-target" },
    });
  }, scenario);
}

/**
 * Shows the test reference in a visible canvas card using the demo mode control.
 *
 * @param page - Browser page with the references document open.
 * @returns Completion after switching the reference pane to edgeless mode.
 */
async function showEdgelessReference(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (
      window as unknown as { __rivtoDocuments: { editor: EditorStorage } }
    ).__rivtoDocuments.editor.getEditor("references")!;
    editor.elements.insertElement({
      type: "block",
      zIndex: 10,
      frame: { x: 20, y: 20, width: 600, height: 300 },
      props: { startBlockId: "load-embedding", endBlockId: "load-embedding" },
    });
  });
  await page
    .locator('[data-document-pane="references"]')
    .getByRole("button", { name: "Toggle mode", exact: true })
    .click();
}

for (const mode of ["page", "edgeless"] as const) {
  for (const scenario of ["missing", "lookup-error", "failure"] as const) {
    test(`settings refresh recovers a ${scenario} reference without saving form edits in ${mode}`, async ({
      page,
    }) => {
      await insertReference(page, scenario);
      if (mode === "edgeless") {
        await showEdgelessReference(page);
      }
      const embedding = page.locator('[data-block-id="load-embedding"]');
      await expect(embedding.getByRole("status")).toHaveText(
        scenario === "missing"
          ? "Referenced block is unavailable."
          : "Unable to load referenced block.",
      );
      await expect(embedding.getByRole("status").locator(".lucide-triangle-alert")).toBeVisible();
      await embedding.hover();
      await embedding.getByRole("button", { name: "Edit embedding", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Embedding settings" });
      await settings.getByRole("textbox", { name: "Target document ID" }).fill("Unsaved document");
      await page.evaluate(() => {
        (
          window as unknown as { __embeddingLoadTest: LoadingInspection }
        ).__embeddingLoadTest.recover = true;
      });
      const refresh = settings.getByRole("button", { name: "Refresh embedding", exact: true });
      await expect(refresh).toHaveText("");
      await refresh.click();
      await expect(embedding.locator("[data-block-content]").first()).toHaveText("Loaded source");
      await expect(settings).toBeVisible();
      await expect(settings.getByRole("textbox", { name: "Target document ID" })).toHaveValue(
        "Unsaved document",
      );
      expect(
        await page.evaluate(
          () =>
            (
              window as unknown as {
                __rivtoDocuments: { editor: EditorStorage };
              }
            ).__rivtoDocuments.editor
              .getEditor("references")!
              .blocks.getBlockNode("load-embedding")!.props,
        ),
      ).toEqual({ targetDocumentId: "load-source", targetBlockId: "load-target" });
      await page.keyboard.press("Escape");
      const source = embedding.locator("[data-block-content]").first();
      await source.fill("Keep source history");
      const before = await page.evaluate(() => {
        const editor = (
          window as unknown as { __rivtoDocuments: { editor: EditorStorage } }
        ).__rivtoDocuments.editor.getEditor("load-source")!;
        (window as unknown as { __sourceBeforeRefresh: typeof editor }).__sourceBeforeRefresh =
          editor;
        return (window as unknown as { __embeddingLoadTest: LoadingInspection }).__embeddingLoadTest
          .loadedLookups;
      });
      await embedding.hover();
      await embedding.getByRole("button", { name: "Edit embedding", exact: true }).click();
      await refresh.click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __embeddingLoadTest: LoadingInspection;
                }
              ).__embeddingLoadTest.loadedLookups,
          ),
        )
        .toBeGreaterThan(before);
      await expect(source).toHaveText("Keep source history");
      expect(
        await page.evaluate(() => {
          const editor = (
            window as unknown as { __rivtoDocuments: { editor: EditorStorage } }
          ).__rivtoDocuments.editor.getEditor("load-source")!;
          const previous = (window as unknown as { __sourceBeforeRefresh: typeof editor })
            .__sourceBeforeRefresh;
          const same = editor === previous;
          editor.history.undo();
          return same;
        }),
      ).toBe(true);
      await expect(source).toHaveText("Loaded source");
      await page.evaluate(() => {
        (
          window as unknown as { __embeddingLoadTest: LoadingInspection }
        ).__embeddingLoadTest.failLoadedLookup = true;
      });
      await refresh.click();
      await expect(embedding.getByRole("status")).toHaveText("Unable to load referenced block.");
      await expect(embedding.getByRole("status").locator(".lucide-triangle-alert")).toBeVisible();
    });
  }
}

for (const mode of ["page", "edgeless"] as const) {
  test(`loading status has balanced padding in ${mode}`, async ({ page }) => {
    await insertReference(page, "loading");
    if (mode === "edgeless") {
      await showEdgelessReference(page);
    }
    const embedding = page.locator('[data-block-id="load-embedding"]');
    const status = embedding.getByRole("status");
    await expect(status).toHaveText("Loading embedded block…");
    await status.scrollIntoViewIfNeeded();
    const padding = await status.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const body = element.parentElement!.getBoundingClientRect();
      return { top: text.top - body.top, bottom: body.bottom - text.bottom };
    });
    expect(padding.top).toBeGreaterThanOrEqual(8);
    expect(Math.abs(padding.top - padding.bottom)).toBeLessThanOrEqual(1);
    await page.evaluate(() =>
      (window as unknown as { __embeddingLoadTest: LoadingInspection }).__embeddingLoadTest
        .finish!(),
    );
    await expect(embedding.locator("[data-block-content]").first()).toHaveText("Loaded source");
  });
}

for (const action of ["remove", "change"] as const) {
  test(`embedding ignores a pending lookup after ${action}`, async ({ page }) => {
    await insertReference(page, "loading");
    await expect(page.locator('[data-block-id="load-embedding"]').getByRole("status")).toHaveText(
      "Loading embedded block…",
    );
    await page.evaluate((action) => {
      const editor = (
        window as unknown as {
          __rivtoDocuments: { editor: EditorStorage };
        }
      ).__rivtoDocuments.editor;
      const host = editor.getEditor("references")!;
      if (action === "remove") {
        host.blocks.removeBlock("load-embedding");
      } else {
        host.blocks.updateBlock("load-embedding", {
          props: {
            targetDocumentId: "source",
            targetBlockId: editor.getEditor("source")!.blocks.getRootIds()[0],
          },
        });
      }
      (window as unknown as { __embeddingLoadTest: LoadingInspection }).__embeddingLoadTest
        .finish!();
    }, action);
    if (action === "change") {
      await expect(
        page.locator('[data-block-id="load-embedding"] [data-block-content]').first(),
      ).toHaveText("Source text");
    } else {
      await expect(page.locator('[data-block-id="load-embedding"]')).toHaveCount(0);
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as {
              __embeddingLoadTest: LoadingInspection;
            }
          ).__embeddingLoadTest.acquisitions,
      ),
    ).toBe(0);
  });
}

for (const scenario of ["lookup-error", "missing", "failure"] as const) {
  test(`embedding loading ${scenario} makes one attempt without automatic retries`, async ({
    page,
  }) => {
    await insertReference(page, scenario);
    const embedding = page.locator('[data-block-id="load-embedding"]');
    await expect(embedding.getByRole("status")).toHaveText(
      scenario === "missing"
        ? "Referenced block is unavailable."
        : "Unable to load referenced block.",
    );
    // Let the former retry deadlines pass to catch unintended extra acquisitions.
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const { lookups, acquisitions } = (
        window as unknown as { __embeddingLoadTest: LoadingInspection }
      ).__embeddingLoadTest;
      return { lookups, acquisitions };
    });
    expect(state.lookups).toBe(1);
    expect(state.acquisitions).toBe(scenario === "failure" ? 1 : 0);
  });
}
