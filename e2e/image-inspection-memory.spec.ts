import { expect, test } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Browser state used to observe a stalled image decode. */
interface ImageInspectionWindow extends Window {
  readonly __rivtoDemo: { readonly reactEditor: ReactEditorApi };
  readonly createdUrls: string[];
  readonly revokedUrls: string[];
  pendingInput: HTMLInputElement;
}

/** Pending image-provider read observed through the mounted demo. */
interface ImageReadWindow extends Window {
  readonly __rivtoDemo: {
    readonly editor: DocumentEditorAPI;
    readonly reactEditor: ReactEditorApi;
  };
  readSignal?: AbortSignal;
  readCancelled?: boolean;
  /**
   * Resolves the provider read retained by the test.
   *
   * @param blob - Content returned to the pending image read.
   * @returns The pending provider read is resolved.
   */
  finishRead: (blob: Blob) => void;
}

/**
 * Stalls image decoding and records temporary object URL creation and release.
 *
 * @returns Browser constructors and URL operations are instrumented for this page.
 */
function observePendingImage(): void {
  const host = window as unknown as ImageInspectionWindow;
  Object.assign(host, { createdUrls: [], revokedUrls: [] });
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    host.createdUrls.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    host.revokedUrls.push(url);
    revoke(url);
  };
  Object.defineProperty(window, "Image", {
    configurable: true,
    value: function () {
      const image = document.createElement("img");
      Object.defineProperty(image, "src", { configurable: true, set: () => {} });
      return image;
    },
  });
  HTMLInputElement.prototype.click = function () {
    host.pendingInput = this;
  };
}

test("destroying an editor releases a pending image decode", async ({ page }) => {
  await page.addInitScript(observePendingImage);
  await page.goto("/?test_features=1");
  await expect(page.locator(".page-surface").first()).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = window as unknown as ImageInspectionWindow;
    const editor = host.__rivtoDemo.reactEditor;
    const panel = editor.panels.getDefault()!;
    panel.slashCommands.execute("image.insert", { blockId: panel.blocks.getRootIds()[0]! });
    const data = new DataTransfer();
    data.items.add(new File(["image"], "pending.png", { type: "image/png" }));
    Object.defineProperty(host.pendingInput, "files", { configurable: true, value: data.files });
    host.pendingInput.dispatchEvent(new Event("change"));
    await Promise.resolve();
    await Promise.resolve();
    const created = [...host.createdUrls];
    const before = [...host.revokedUrls];
    await editor.destroy();
    return { created, before, after: host.revokedUrls };
  });
  expect(result.created).toHaveLength(1);
  expect(result.before).toEqual([]);
  expect(result.after).toEqual(result.created);
});

/**
 * Starts a mounted image read that stays pending until the test releases it.
 *
 * @returns The new image block ID.
 */
function startPendingImageRead(): string {
  const host = window as unknown as ImageReadWindow;
  const { editor, reactEditor } = host.__rivtoDemo;
  const provider = reactEditor.clipboard.getFileHandler("image")!.provider;
  const read = provider.read.bind(provider);
  provider.read = (uri, context) => {
    if (uri === "test:pending-image") {
      host.readSignal = context.signal;
      return new Promise((resolve) => {
        host.finishRead = resolve;
      });
    }
    return read(uri, context);
  };
  const attachments = reactEditor.attachments;
  const resolveBinary = attachments.resolveBinary.bind(attachments);
  Object.defineProperty(attachments, "resolveBinary", {
    configurable: true,
    value: (...args: Parameters<typeof resolveBinary>) => {
      const pending = resolveBinary(...args);
      if (args[1] === "test:pending-image") {
        void pending.catch(() => {
          host.readCancelled = true;
        });
      }
      return pending;
    },
  });
  return editor.blocks.insertBlock({
    type: "image",
    props: {
      uri: "test:pending-image",
      name: "pending.png",
      mimeType: "image/png",
      alt: "pending",
    },
  }).id;
}

test("unmounting an image stops waiting for its pending provider read", async ({ page }) => {
  await page.goto("/?test_features=1");
  await expect(page.locator(".page-surface").first()).toBeVisible();
  const id = await page.evaluate(startPendingImageRead);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as ImageReadWindow).readSignal)))
    .toBe(true);
  await page.evaluate(
    (blockId) =>
      (window as unknown as ImageReadWindow).__rivtoDemo.editor.blocks.removeBlock(blockId),
    id,
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ImageReadWindow).readCancelled))
    .toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as ImageReadWindow).readSignal?.aborted),
  ).toBe(true);
  await page.evaluate(() => (window as unknown as ImageReadWindow).finishRead(new Blob(["late"])));
  await expect(page.locator(`[data-block-id="${id}"]`)).toHaveCount(0);
});
