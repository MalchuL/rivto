/** Browser coverage for image file paste and page/canvas drop routing. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { resolve } from "node:path";

const BLOCK_CONTENT_SELECTOR = "[data-block-content]";
const IMAGE_BLOCK_SELECTOR = '[data-block-type="image"]';
const IMAGE_ELEMENT_SELECTOR = '[data-edgeless-visual-kind="image"]';
const IMAGE_RESIZE_SELECTOR = ".rivto-image-resize";
const EDGELESS_VISUAL_RESIZE_SELECTOR =
  '[data-edgeless-controls-for] [data-edgeless-resize-handle="se"]';
const FILE_BLOCK_SELECTOR = '[data-block-type="file"]';
const FILE_ELEMENT_SELECTOR = '[data-edgeless-visual-kind="file"]';
const FILE_NAME_SELECTOR = ".rivto-file-name";
const FILE_TEXT_ICON_SELECTOR = ".lucide-file-text";

/** Browser state exposed by the pending file-handler fixture. */
interface PendingHandlerWindow {
  /** Editor that owns the temporary file handler. */
  __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
  /** Pending handler controls used by the test. */
  pendingHandler: {
    /** Whether the requested asynchronous stage has begun. */
    started: boolean;
    /**
     * Releases the held upload or preparation stage.
     *
     * @returns Allows the pending handler operation to continue.
     */
    release: () => void;
    /**
     * Unregisters the handler while its operation is pending.
     *
     * @returns Removes the handler registration.
     */
    remove: () => void;
  };
}

/**
 * Pauses file preparation so the test can change its insertion destination.
 *
 * @param page - Demo page containing the file handler.
 * @returns Resolves after the handler has been replaced.
 */
async function pauseFileReferencePreparation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const demo = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      /**
       * Releases the file preparation paused by this fixture.
       *
       * @returns Allows preparation to continue after the destination changes.
       */
      releaseFileReference?: () => void;
    };
    const handler = demo.__rivtoDemo.reactEditor.clipboard.getFileHandler("file")!;
    const prepare = handler.prepare;
    Object.defineProperty(handler, "prepare", {
      // Pause preparation until the test has changed the destination.
      value: async (...args: Parameters<typeof prepare>) => {
        await new Promise<void>((resolve) => {
          demo.releaseFileReference = resolve;
        });
        return prepare(...args);
      },
    });
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
  });
}

/**
 * Copies an image through the context menu and checks its clipboard MIME type.
 *
 * @param page - Browser with clipboard permissions.
 * @param imageBlock - Rendered image block to copy.
 * @returns Resolves when the image appears on the clipboard.
 */
async function checkImageCopy(page: Page, imageBlock: Locator): Promise<void> {
  await imageBlock.locator(".rivto-image-frame").click({ button: "right" });
  const copyImage = page.getByRole("menuitem", { name: "Copy image" });
  await expect(copyImage).toBeVisible();
  await copyImage.click();
  await expect(copyImage).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        return items.some(({ types }) => types.includes("image/png"));
      }),
    )
    .toBe(true);
}

/**
 * Resizes the dropped image and verifies double-click restores its natural size.
 *
 * @param page - Browser displaying the image block.
 * @param imageBlock - Rendered image block with its resize control.
 * @returns Resolves after both resize and reset have updated the document.
 * @throws If the resize handle has no bounds.
 */
async function checkImageResizeAndReset(page: Page, imageBlock: Locator): Promise<void> {
  await imageBlock.locator(".rivto-image-frame").hover();
  const resize = imageBlock.locator(IMAGE_RESIZE_SELECTOR);
  await expect(resize).toBeVisible();
  const handle = await resize.boundingBox();
  if (!handle) {
    throw new Error("Image resize handle has no bounds");
  }
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 54, handle.y + 24);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        const id = document
          .querySelector('[data-block-type="image"]')
          ?.getAttribute("data-block-id");
        const props = id ? demo.__rivtoDemo?.editor.blocks.getBlockNode(id)?.props : undefined;
        return typeof props?.width === "number" && props.width > 24 && props.width === props.height;
      }),
    )
    .toBe(true);
  await imageBlock.locator(".rivto-image-frame").hover();
  await resize.dblclick();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        const id = document
          .querySelector('[data-block-type="image"]')
          ?.getAttribute("data-block-id");
        const props = id ? demo.__rivtoDemo?.editor.blocks.getBlockNode(id)?.props : undefined;
        return [props?.width, props?.height];
      }),
    )
    .toEqual([undefined, undefined]);
}

/**
 * Dispatches two image files, HTML images, or image addresses as clipboard data.
 *
 * @param target - Surface receiving the paste event.
 * @param uris - Image addresses used for text and HTML payloads.
 * @param payload - Clipboard representation to construct.
 * @returns Resolves after the paste event is dispatched.
 */
async function pasteMultipleImages(
  target: Locator,
  uris: string[],
  payload: "addresses" | "html" | "files",
): Promise<void> {
  await target.evaluate(
    (element, { values, payloadType }) => {
      const data = new DataTransfer();
      if (payloadType === "files") {
        const bytes = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          ),
          (character) => character.charCodeAt(0),
        );
        data.items.add(new File([bytes], "first.png", { type: "image/png" }));
        data.items.add(new File([bytes], "second.png", { type: "image/png" }));
      } else if (payloadType === "html") {
        data.setData("text/html", values.map((uri) => `<img src="${uri}">`).join(""));
      } else {
        data.setData("text/plain", values.join("\n"));
      }
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data });
      element.dispatchEvent(event);
    },
    { values: uris, payloadType: payload },
  );
}

/**
 * Records which binary provider receives each attachment without changing storage.
 *
 * @param page - Demo page whose attachment handlers will be observed.
 * @returns Resolves after both provider wrappers are installed.
 */
async function recordAttachmentWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const demo = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      attachmentWrites: string[];
    };
    demo.attachmentWrites = [];
    for (const id of ["image", "file"]) {
      const handler = demo.__rivtoDemo.reactEditor.clipboard.getFileHandler(id)!;
      const provider = handler.provider;
      // Record which provider receives each file without changing its storage behavior.
      Object.defineProperty(handler, "provider", {
        value: {
          ...provider,
          write: async (blob: Blob, context: import("@chulane/rivto-react").BinaryWriteContext) => {
            demo.attachmentWrites.push(`${id}:${context.name}`);
            return provider.write(blob, context);
          },
        },
      });
    }
  });
}

/**
 * Sends an image and a text file together through the page surface.
 *
 * @param page - Browser hosting the page surface.
 * @param eventType - Clipboard paste or pointer drop to dispatch.
 * @returns Resolves after the mixed attachment event is dispatched.
 */
async function sendMixedFiles(page: Page, eventType: "paste" | "drop"): Promise<void> {
  await page
    .locator(".page-surface")
    .first()
    .evaluate((element, eventType) => {
      const data = new DataTransfer();
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      data.items.add(new File([bytes], "picture.png", { type: "image/png" }));
      data.items.add(new File(["text"], "document.txt", { type: "text/plain" }));
      const bounds = element
        .querySelector<HTMLElement>(".rivto-block-row")!
        .getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.bottom - 2;
      const event =
        eventType === "paste"
          ? new ClipboardEvent("paste", { bubbles: true, cancelable: true })
          : new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
            });
      Object.defineProperty(event, eventType === "paste" ? "clipboardData" : "dataTransfer", {
        value: data,
      });
      const target = eventType === "drop" ? (document.elementFromPoint(x, y) ?? element) : element;
      target.dispatchEvent(event);
    }, eventType);
}

/**
 * Registers a file handler whose selected asynchronous stage can be paused.
 *
 * @param page - Demo page hosting the clipboard manager.
 * @param stage - Upload or preparation step to pause.
 * @returns Resolves after the temporary handler is registered.
 */
async function registerPendingFileHandler(
  page: Page,
  stage: "upload" | "preparation",
): Promise<void> {
  await page.evaluate((pendingStage) => {
    const host = window as unknown as PendingHandlerWindow;
    // Hold the selected stage until the test removes its handler.
    const state = { started: false, release: () => {}, remove: () => {} };
    const pending = new Promise<void>((resolve) => {
      state.release = resolve;
    });
    state.remove = host.__rivtoDemo.reactEditor.clipboard.registerFileHandler({
      id: "pending-handler",
      provider: {
        // Hold upload only when this test is exercising handler removal during storage.
        write: async () => {
          if (pendingStage === "upload") {
            state.started = true;
            await pending;
          }
          return "data:text/plain,content";
        },
        read: async () => undefined,
      },
      // Claim only the test file, leaving other files to existing handlers.
      matches: ({ reference }) => reference.name === "pending-handler.txt",
      // Hold preparation separately when that is the selected test stage.
      prepare: async ({ reference }) => {
        if (pendingStage === "preparation") {
          state.started = true;
          await pending;
        }
        return { kind: "block", type: "file", props: { ...reference } };
      },
    });
    host.pendingHandler = state;
  }, stage);
}

/**
 * Dispatches one tiny valid PNG through a clipboard or drop event.
 *
 * @param target - Element receiving the synthetic event.
 * @param eventType - Clipboard paste or pointer drop to dispatch.
 * @param itemOnly - Whether to expose the file through transfer items only.
 * @param name - Filename supplied with the generated image.
 * @returns Resolves after the event has been dispatched in the browser.
 */
async function sendImage(
  target: Locator,
  eventType: "paste" | "drop",
  itemOnly = false,
  name = "pixel.png",
): Promise<void> {
  await target.evaluate(
    (element, { type, itemOnlyPayload, fileName }) => {
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      const data = new DataTransfer();
      const file = new File([bytes], fileName, { type: "image/png" });
      data.items.add(file);
      // Simulate browsers that expose the image only through transfer items.
      const payload = itemOnlyPayload
        ? {
            files: [],
            items: [{ kind: "file", getAsFile: () => file }],
            types: ["Files"],
            getData: () => "",
          }
        : data;
      const row = element.matches(".page-surface")
        ? element.querySelector<HTMLElement>(".rivto-block-row")
        : null;
      const bounds = row?.getBoundingClientRect();
      const x = bounds ? bounds.left + bounds.width / 2 : 300;
      const y = bounds ? bounds.bottom - 2 : 300;
      const event =
        type === "paste"
          ? new ClipboardEvent("paste", { bubbles: true, cancelable: true })
          : new DragEvent("drop", { bubbles: true, cancelable: true, clientX: x, clientY: y });
      Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {
        value: payload,
      });
      const target =
        type === "drop" && bounds ? (document.elementFromPoint(x, y) ?? element) : element;
      target.dispatchEvent(event);
    },
    { type: eventType, itemOnlyPayload: itemOnly, fileName: name },
  );
}

/**
 * Dispatches one ordinary file through the shared ingestion path.
 *
 * @param target - Element receiving the synthetic event.
 * @param eventType - Clipboard paste or pointer drop to dispatch.
 * @param name - Filename supplied with the generated text file.
 * @returns Resolves after the event has been dispatched in the browser.
 */
async function sendFile(
  target: Locator,
  eventType: "paste" | "drop",
  name = "notes.txt",
): Promise<void> {
  await target.evaluate(
    (element, { type, fileName }) => {
      const data = new DataTransfer();
      data.items.add(new File(["hello"], fileName, { type: "text/plain" }));
      const row = element.matches(".page-surface")
        ? element.querySelector<HTMLElement>(".rivto-block-row")
        : null;
      const bounds = row?.getBoundingClientRect();
      const x = bounds ? bounds.left + bounds.width / 2 : 300;
      const y = bounds ? bounds.bottom - 2 : 300;
      const event =
        type === "paste"
          ? new ClipboardEvent("paste", { bubbles: true, cancelable: true })
          : new DragEvent("drop", { bubbles: true, cancelable: true, clientX: x, clientY: y });
      Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {
        value: data,
      });
      const target =
        type === "drop" && bounds ? (document.elementFromPoint(x, y) ?? element) : element;
      target.dispatchEvent(event);
    },
    { type: eventType, fileName: name },
  );
}

/**
 * Dispatches the plain absolute path produced by desktop file-manager copy.
 *
 * @param target - Element receiving the synthetic paste event.
 * @param path - Absolute path returned by the mocked clipboard reader.
 * @returns Resolves after the event has been dispatched in the browser.
 */
async function sendLocalImagePath(target: Locator, path: string): Promise<void> {
  await target.evaluate((element, localPath) => {
    Object.defineProperty(navigator.clipboard, "readText", {
      configurable: true,
      // Supply the redacted path through the asynchronous clipboard API.
      value: async () => localPath,
    });
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [],
        types: ["text/uri-list"],
        // The event hides the path, forcing the asynchronous clipboard read.
        getData: () => "",
      },
    });
    element.dispatchEvent(event);
  }, path);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => "__rivtoDemo" in window);
});

/**
 * Drops files at the registered gap immediately before a visible block.
 *
 * @param page - Browser page receiving the drop.
 * @param second - Block following the target gap.
 * @param names - Ordered filenames; PNG names receive valid image bytes.
 * @returns Resolves after the browser event is accepted and dispatched.
 */
async function dropFilesInGap(page: Page, second: Locator, names: string[]): Promise<void> {
  const bounds = await second.boundingBox();
  if (!bounds) {
    throw new Error("Block after the gap has no bounds");
  }
  const accepted = await page.evaluate(
    ({ x, y, filenames }) => {
      const target = document.elementFromPoint(x, y)!;
      const data = new DataTransfer();
      for (const name of filenames) {
        if (name.endsWith(".png")) {
          const bytes = Uint8Array.from(
            atob(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            ),
            (character) => character.charCodeAt(0),
          );
          data.items.add(new File([bytes], name, { type: "image/png" }));
        } else {
          data.items.add(new File([name], name, { type: "text/plain" }));
        }
      }
      const options = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      };
      const dragover = new DragEvent("dragover", options);
      Object.defineProperty(dragover, "dataTransfer", { value: data });
      target.dispatchEvent(dragover);
      const line = document.querySelector<HTMLElement>(".rivto-block-drop-line:not([hidden])");
      const lineBounds = line?.getBoundingClientRect();
      const lineVisible = Boolean(
        line &&
        lineBounds?.width &&
        lineBounds.height &&
        getComputedStyle(line).visibility === "visible",
      );
      const drop = new DragEvent("drop", options);
      Object.defineProperty(drop, "dataTransfer", { value: data });
      target.dispatchEvent(drop);
      return { accepted: dragover.defaultPrevented, lineVisible };
    },
    { x: bounds.x + 12, y: bounds.y - 2, filenames: names },
  );
  expect(accepted).toEqual({ accepted: true, lineVisible: true });
}

/**
 * Creates two consecutive top-level paragraphs for the file-drop checks.
 *
 * @param page - Demo page with the document already loaded.
 * @param large - Keeps the existing repeated document when true.
 * @returns IDs of the two consecutive paragraphs.
 */
async function createGapBlocks(page: Page, large: boolean): Promise<string[]> {
  return page.evaluate((keepDocument) => {
    const editor = (
      window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }
    ).__rivtoDemo.editor;
    const beforeId = keepDocument ? editor.blocks.getRootIds()[0] : undefined;
    const first = editor.blocks.insertBlock(
      { type: "paragraph", content: "Gap first" },
      { parentId: null, beforeId },
    ).id;
    const second = editor.blocks.insertBlock(
      { type: "paragraph", content: "Gap second" },
      { parentId: null, beforeId },
    ).id;
    if (!keepDocument) {
      editor.load({
        ...editor.dump(),
        rootElementIds: [],
        blocks: [editor.blocks.getBlock(first)!, editor.blocks.getBlock(second)!],
        elements: [],
      });
    }
    return [first, second];
  }, large);
}

/** Viewport point used for synthetic file-drag browser events. */
interface FileDropPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Sends one file drag event to the current browser hit at a viewport point.
 *
 * @param page - Page receiving the native event.
 * @param point - Viewport position used for hit testing.
 * @param type - Drag-over preview or final drop.
 * @param name - Filename carried by the event.
 * @returns Resolves after the browser dispatches the event.
 */
async function dispatchFileDrag(
  page: Page,
  point: FileDropPoint,
  type: "dragover" | "drop",
  name: string,
): Promise<void> {
  await page.evaluate(
    ({ x, y, eventType, filename }) => {
      const target = document.elementFromPoint(x, y);
      if (!target) {
        throw new Error("File drag has no target");
      }
      const data = new DataTransfer();
      if (filename.endsWith(".png")) {
        const bytes = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          ),
          (character) => character.charCodeAt(0),
        );
        data.items.add(new File([bytes], filename, { type: "image/png" }));
      } else {
        data.items.add(new File(["notes"], filename, { type: "text/plain" }));
      }
      const event = new DragEvent(eventType, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, "dataTransfer", { value: data });
      target.dispatchEvent(event);
    },
    { ...point, eventType: type, filename: name },
  );
}

/**
 * Finds a visible block-body point that resolves to the block's inside region.
 *
 * @param block - Rendered block to inspect.
 * @param blockId - Stable identity expected from the Page placement resolver.
 * @returns A viewport point outside editable text and inside the block body.
 * @throws If no matching visible registered region is found.
 */
async function insideBlockPoint(block: Locator, blockId: string): Promise<FileDropPoint> {
  return block.evaluate((element, id) => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    const panel = host.__rivtoDemo.reactEditor.panels.getDefault();
    const row = element.querySelector<HTMLElement>(":scope > .rivto-block-row")!;
    const box = row.getBoundingClientRect();
    for (let y = box.top + 1; y < box.bottom; y += 3) {
      for (let x = box.left + 1; x < box.right; x += 5) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit.closest("[data-block-content]")) {
          continue;
        }
        const target = panel?.page.dropTargets.resolve(x, y);
        if (
          target?.destination.kind === "inside" &&
          target.destination.parentId === id &&
          !target.indicator
        ) {
          return { x, y };
        }
      }
    }
    throw new Error("No visible block-body target found");
  }, blockId);
}

test("shows the block insertion line while dragging a file over a page gap", async ({ page }) => {
  const [, second] = await createGapBlocks(page, false);
  const following = page.locator(`[data-block-id="${second}"]`);
  await expect(following).toBeVisible();
  const bounds = await following.boundingBox();
  if (!bounds) {
    throw new Error("Block after the gap has no bounds");
  }
  await page.evaluate(
    ({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      if (!target) {
        throw new Error("Gap has no event target");
      }
      const data = new DataTransfer();
      data.items.add(new File(["notes"], "gap.txt", { type: "text/plain" }));
      const event = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, "dataTransfer", { value: data });
      target.dispatchEvent(event);
    },
    { x: bounds.x + 12, y: bounds.y - 2 },
  );
  await expect(page.locator(".rivto-block-drop-line:visible")).toBeVisible();
  await page.evaluate(() => {
    document.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
  });
  await expect(page.locator(".rivto-block-drop-line")).toHaveCount(0);
  await expect(page.locator("[data-block-drop-active]")).toHaveCount(0);
});

test("shows Page drop feedback with only image input installed", async ({ page }) => {
  const [first, second] = await createGapBlocks(page, false);
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.events.delete("file.dragover");
    host.__rivtoDemo.reactEditor.events.delete("file.drop");
  });
  const following = page.locator(`[data-block-id="${second}"]`);
  await expect(following).toBeVisible();
  const bounds = await following.boundingBox();
  if (!bounds) {
    throw new Error("Block after the gap has no bounds");
  }
  await dispatchFileDrag(page, { x: bounds.x + 12, y: bounds.y - 2 }, "dragover", "gap.png");
  await expect(page.locator(".rivto-block-drop-line:visible")).toBeVisible();
  await dropFilesInGap(page, following, ["gap.png"]);
  await expect(page.locator(".rivto-block-drop-line")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return host.__rivtoDemo.editor.blocks
          .getRootIds()
          .map((id) => ({ id, type: host.__rivtoDemo.editor.blocks.getBlockNode(id)?.type }));
      }),
    )
    .toEqual([
      { id: first, type: "paragraph" },
      { id: expect.any(String), type: "image" },
      { id: second, type: "paragraph" },
    ]);
});

test("keeps feedback while crossing child elements and clears it on leaving the page", async ({
  page,
}) => {
  const [, second] = await createGapBlocks(page, false);
  const following = page.locator(`[data-block-id="${second}"]`);
  await expect(following).toBeVisible();
  const bounds = await following.boundingBox();
  if (!bounds) {
    throw new Error("Block after the gap has no bounds");
  }
  const counts = await page.evaluate(
    ({ x, y }) => {
      const target = document.elementFromPoint(x, y)!;
      const root = target.closest("[data-rivto-panel]")!;
      const data = new DataTransfer();
      data.items.add(new File(["notes"], "gap.txt", { type: "text/plain" }));
      const over = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(over, "dataTransfer", { value: data });
      target.dispatchEvent(over);
      const before = document.querySelectorAll(".rivto-block-drop-line").length;
      target.dispatchEvent(
        new DragEvent("dragleave", {
          bubbles: true,
          relatedTarget: root.querySelector("[data-block-id]"),
        }),
      );
      const inside = document.querySelectorAll(".rivto-block-drop-line").length;
      target.dispatchEvent(
        new DragEvent("dragleave", { bubbles: true, relatedTarget: document.body }),
      );
      const outside = document.querySelectorAll(".rivto-block-drop-line").length;
      return { before, inside, outside };
    },
    { x: bounds.x + 12, y: bounds.y - 2 },
  );
  expect(counts).toEqual({ before: 1, inside: 1, outside: 0 });
  await expect(page.locator("[data-block-drop-active]")).toHaveCount(0);
});

test("does not show Page drop feedback on the edgeless canvas", async ({ page }) => {
  await page.locator('[data-editor-mode="edgeless"]').click();
  await page
    .locator(".edgeless-viewport")
    .first()
    .evaluate((root) => {
      const data = new DataTransfer();
      data.items.add(new File(["notes"], "canvas.txt", { type: "text/plain" }));
      const event = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: 300,
        clientY: 300,
      });
      Object.defineProperty(event, "dataTransfer", { value: data });
      root.dispatchEvent(event);
    });
  await expect(
    page.locator(".rivto-block-drop-line, .rivto-file-drop-caret, [data-block-drop-active]"),
  ).toHaveCount(0);
});

for (const filename of ["inside.txt", "inside.png"]) {
  test(`uses the block target over editable text for ${filename} without moving the selection`, async ({
    page,
  }) => {
    const [first] = await createGapBlocks(page, false);
    const block = page.locator(`[data-block-id="${first}"]`);
    const content = block.locator("[data-block-content]");
    await content.click();
    const point = await content.evaluate((element) => {
      const selection = element.ownerDocument.getSelection()!;
      selection.setBaseAndExtent(element.firstChild!, 0, element.firstChild!, 0);
      const bounds = element.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    });
    await dispatchFileDrag(page, point, "dragover", filename);
    await expect(page.locator(".rivto-file-drop-caret")).toHaveCount(0);
    await expect(block).toHaveAttribute("data-block-drop-active", "true");
    expect(
      await content.evaluate((element) => element.ownerDocument.getSelection()?.anchorOffset),
    ).toBe(0);
    await dispatchFileDrag(page, point, "drop", filename);
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const host = window as unknown as {
            __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
          };
          return host.__rivtoDemo.editor.blocks
            .getChildIds(id)
            .map((child) => host.__rivtoDemo.editor.blocks.getBlockNode(child)?.props.name);
        }, first!),
      )
      .toEqual([filename]);
  });
}

test("outlines a block-body destination and inserts the file inside it", async ({ page }) => {
  const [first] = await createGapBlocks(page, false);
  const block = page.locator(`[data-block-id="${first}"]`);
  const point = await insideBlockPoint(block, first!);
  await dispatchFileDrag(page, point, "dragover", "inside.txt");
  await expect(block).toHaveAttribute("data-block-drop-active", "true");
  await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(0);
  await dispatchFileDrag(page, point, "drop", "inside.txt");
  await expect(block).not.toHaveAttribute("data-block-drop-active");
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks
          .getChildIds(id)
          .map((childId) => editor.blocks.getBlockNode(childId)?.props.name);
      }, first!),
    )
    .toEqual(["inside.txt"]);
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
    };
    host.__rivtoDemo.editor.history.undo();
  });
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const host = window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return host.__rivtoDemo.editor.blocks.getChildIds(id);
      }, first!),
    )
    .toEqual([]);
});

for (const repeat of [0, 200]) {
  for (const kind of ["file", "image"] as const) {
    test(`drops a ${kind} into the gap between page blocks, repeat=${repeat}`, async ({ page }) => {
      if (repeat) {
        await page.goto(`/?repeat=${repeat}`);
        await page.waitForFunction(() => "__rivtoDemo" in window);
      }
      const [first, second] = await createGapBlocks(page, repeat > 0);
      const following = page.locator(`[data-block-id="${second}"]`);
      await expect(following).toBeVisible();
      const name = kind === "file" ? "gap.txt" : "gap.png";
      await dropFilesInGap(page, following, [name]);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const editor = (
              window as unknown as {
                __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
              }
            ).__rivtoDemo.editor;
            return editor.blocks
              .getRootIds()
              .slice(0, 3)
              .map((id) => ({
                id,
                type: editor.blocks.getBlockNode(id)?.type,
                name: editor.blocks.getBlockNode(id)?.props.name,
              }));
          }),
        )
        .toEqual([
          { id: first, type: "paragraph", name: undefined },
          { id: expect.any(String), type: kind, name },
          { id: second, type: "paragraph", name: undefined },
        ]);
    });
  }
}

test("drops multiple files into a nested gap in their original order", async ({ page }) => {
  const ids = await page.evaluate(() => {
    const editor = (
      window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }
    ).__rivtoDemo.editor;
    const parent = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Gap parent",
      children: [
        { type: "paragraph", content: "Nested first" },
        { type: "paragraph", content: "Nested second" },
      ],
    });
    editor.load({ ...editor.dump(), rootElementIds: [], blocks: [parent], elements: [] });
    return { parent: parent.id, children: editor.blocks.getChildIds(parent.id) };
  });
  const second = page.locator(`[data-block-id="${ids.children[1]}"]`);
  await expect(second).toBeVisible();
  await dropFilesInGap(page, second, ["first.txt", "second.txt"]);
  await expect
    .poll(() =>
      page.evaluate((parentId) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getChildIds(parentId).map((id) => {
          const block = editor.blocks.getBlockNode(id);
          return { id, type: block?.type, name: block?.props.name };
        });
      }, ids.parent),
    )
    .toEqual([
      { id: ids.children[0], type: "paragraph", name: undefined },
      { id: expect.any(String), type: "file", name: "first.txt" },
      { id: expect.any(String), type: "file", name: "second.txt" },
      { id: ids.children[1], type: "paragraph", name: undefined },
    ]);
});

test("drops an image into a gap without the generic file handler", async ({ page }) => {
  const [first, second] = await createGapBlocks(page, false);
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.events.delete("file.drop");
  });
  const following = page.locator(`[data-block-id="${second}"]`);
  await expect(following).toBeVisible();
  await dropFilesInGap(page, following, ["gap.png"]);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks
          .getRootIds()
          .map((id) => ({ id, type: editor.blocks.getBlockNode(id)?.type }));
      }),
    )
    .toEqual([
      { id: first, type: "paragraph" },
      { id: expect.any(String), type: "image" },
      { id: second, type: "paragraph" },
    ]);
});

test("shows copy feedback for image and URI drags without the file handler", async ({ page }) => {
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.events.delete("file.dragover");
  });
  const results = await page
    .locator(".page-surface")
    .first()
    .evaluate((root) => {
      const transfers = [
        { files: [{ type: "image/png" }], types: [] },
        { files: [], types: ["Files"] },
        { files: [], types: ["text/uri-list"] },
        { files: [], types: ["text/plain"] },
      ];
      const effects = transfers.map((transfer) => {
        const data = { ...transfer, dropEffect: "none" };
        const event = new DragEvent("dragover", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: data });
        root.dispatchEvent(event);
        return data.dropEffect;
      });
      root.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true }));
      return effects;
    });
  expect(results).toEqual(["copy", "copy", "copy", "none"]);
});

test("pastes an image file as an inline macro at a text caret", async ({ page }) => {
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await sendImage(content, "paste", false, "");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return demo.__rivtoDemo?.editor.blocks.getBlocks()[0]?.content ?? "";
      }),
    )
    .toContain("rivto-files");
  await page.locator("h1").first().click();
  await expect(page.locator(".markdown-preview .rivto-image").first()).toHaveAttribute(
    "alt",
    "Image",
  );
});

for (const repeat of [0, 200]) {
  test(`renders a pasted image address with query parameters in a text block, repeat=${repeat}`, async ({
    page,
  }) => {
    if (repeat) {
      await page.goto(`/?repeat=${repeat}`);
      await page.waitForFunction(() => "__rivtoDemo" in window);
    }
    const uri =
      "https://upload.wikimedia.org/wikipedia/commons/8/8c/Olga_alexandrovna_com_marida.jpg?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=thumbnail_unscaled";
    await page.route("https://upload.wikimedia.org/**", async (route) => {
      await route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    });
    const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
    await content.click();
    await page.keyboard.press("End");
    await content.evaluate((element, value) => {
      const data = new DataTransfer();
      data.setData("text/plain", value);
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data });
      element.dispatchEvent(event);
    }, uri);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const host = window as unknown as {
            __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
          };
          return host.__rivtoDemo.editor.blocks.getBlocks()[0]?.content ?? "";
        }),
      )
      .toContain(uri);
    await page.locator("h1").first().click();
    await expect(page.locator(".markdown-preview .rivto-image").first()).toBeVisible();
    await expect(page.locator(".markdown-preview .rivto-image").first()).toHaveAttribute(
      "src",
      uri,
    );
  });
}

for (const repeat of [false, true]) {
  test(`image alt controls use shared styling and update text${repeat ? " in a large document" : ""}`, async ({
    page,
  }) => {
    if (repeat) {
      await page.goto("/?repeat=200");
      await page.waitForFunction(() => "__rivtoDemo" in window);
    }
    await page.evaluate(() => {
      const demo = window as typeof window & {
        __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
      };
      const block = demo.__rivtoDemo?.editor.blocks.getBlocks()[0];
      if (!block) {
        throw new Error("Demo block is unavailable");
      }
      demo.__rivtoDemo!.editor.blocks.updateBlock(block.id, {
        content: "![Plain image](missing.png)",
      });
    });
    const frame = page.locator('.markdown-preview [data-image-kind="inline"]').first();
    await frame.hover();
    const input = frame.getByRole("textbox", { name: "Image alternative text" });
    await expect(input).toHaveAttribute("data-slot", "input");
    await expect(frame.getByRole("button", { name: "Reset size" })).toHaveAttribute(
      "data-slot",
      "button",
    );
    await expect(frame.getByRole("button", { name: "Reset size" })).toHaveAttribute(
      "title",
      "Reset size",
    );
    await input.fill("Updated image");
    await expect(input).toHaveValue("Updated image");
  });
}

test("converts a resized standard Markdown image to an adjustable image macro", async ({
  page,
}) => {
  await page.evaluate(() => {
    const demo = window as typeof window & {
      __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
    };
    const block = demo.__rivtoDemo?.editor.blocks.getBlocks()[0];
    if (!block) {
      throw new Error("Demo block is unavailable");
    }
    demo.__rivtoDemo!.editor.blocks.updateBlock(block.id, {
      content: "![Plain image](missing.png)",
    });
  });

  const frame = page.locator('.markdown-preview [data-image-kind="inline"]').first();
  await frame.hover();
  const resize = frame.locator(IMAGE_RESIZE_SELECTOR);
  const handle = await resize.boundingBox();
  if (!handle) {
    throw new Error("Markdown image resize handle has no bounds");
  }
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 48, handle.y + 48);
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return demo.__rivtoDemo?.editor.blocks.getBlocks()[0]?.content ?? "";
      }),
    )
    .toMatch(/^\{\{image path="missing\.png" alt="Plain image" width=\d+ height=\d+\}\}$/);
});

test("drops an image block and pastes an item-only clipboard image on canvas", async ({
  page,
  browserName,
}) => {
  if (browserName === "chromium") {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(page.url()).origin,
    });
  }
  await sendImage(page.locator(".page-surface").first(), "drop");
  const imageBlock = page.locator(IMAGE_BLOCK_SELECTOR);
  await expect(imageBlock).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        const id = document
          .querySelector('[data-block-type="image"]')
          ?.getAttribute("data-block-id");
        return id ? demo.__rivtoDemo?.editor.blocks.getBlockNode(id)?.props.uri : undefined;
      }),
    )
    .toMatch(/\.png$/);
  if (browserName === "chromium") {
    await checkImageCopy(page, imageBlock);
  }
  await checkImageResizeAndReset(page, imageBlock);

  await page.locator('[data-editor-mode="edgeless"]').click();
  await sendImage(page.locator(".edgeless-viewport").first(), "paste", true);
  await expect(page.locator(IMAGE_ELEMENT_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} .rivto-image`)).toHaveAttribute(
    "alt",
    "pixel.png",
  );
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} ${IMAGE_RESIZE_SELECTOR}`)).toHaveCount(0);
  await page.locator(IMAGE_ELEMENT_SELECTOR).click();
  await expect(page.locator(EDGELESS_VISUAL_RESIZE_SELECTOR)).toBeVisible();
});

test("pastes a desktop filesystem path in page and edgeless modes", async ({ page }) => {
  const localImage = resolve("docs/00-rivto/assets/pasted-1786747914356-844df263.png");
  await sendLocalImagePath(page.locator(".page-surface").first(), localImage);
  await expect(page.locator(IMAGE_BLOCK_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${IMAGE_BLOCK_SELECTOR} .rivto-image`)).toBeVisible();

  await page.locator('[data-editor-mode="edgeless"]').click();
  await sendLocalImagePath(page.locator(".edgeless-viewport").first(), localImage);
  await expect(page.locator(IMAGE_ELEMENT_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} .rivto-image`)).toBeVisible();
});

test("opening an image menu keeps the page and canvas still", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Image clipboard writing requires Chromium permissions");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  for (const mode of ["page", "canvas"] as const) {
    if (mode === "canvas") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    const surface = page.locator(mode === "page" ? ".page-surface" : ".edgeless-viewport").first();
    await sendImage(surface, mode === "page" ? "drop" : "paste");
    const image = page
      .locator(mode === "page" ? IMAGE_BLOCK_SELECTOR : IMAGE_ELEMENT_SELECTOR)
      .locator(".rivto-image-frame")
      .first();
    await image.scrollIntoViewIfNeeded();
    const before = await image.boundingBox();
    if (!before) {
      throw new Error("Image has no bounds");
    }
    const scroll = await page.evaluate(() => [window.scrollX, window.scrollY]);
    await page.mouse.click(before.x + 5, before.y + 5, { button: "right" });
    const menu = page.getByRole("menuitem", { name: "Copy image" });
    await expect(menu).toBeVisible();
    const after = await image.boundingBox();
    const menuBounds = await menu.boundingBox();
    expect(after?.x).toBeCloseTo(before.x, 0);
    expect(after?.y).toBeCloseTo(before.y, 0);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(scroll);
    expect(Math.abs(menuBounds!.x - (before.x + 5))).toBeLessThan(15);
    expect(Math.abs(menuBounds!.y - (before.y + 5))).toBeLessThan(15);
    await page.keyboard.press("Escape");
  }
});

test("pastes multiple selected desktop files in page and canvas modes", async ({ page }) => {
  const localImage = resolve("docs/00-rivto/assets/pasted-1786747914356-844df263.png");
  for (const mode of ["page", "canvas"] as const) {
    if (mode === "canvas") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    await sendLocalImagePath(
      page.locator(mode === "page" ? ".page-surface" : ".edgeless-viewport").first(),
      `${localImage}\n${localImage}`,
    );
    await expect(
      page.locator(mode === "page" ? IMAGE_BLOCK_SELECTOR : IMAGE_ELEMENT_SELECTOR),
    ).toHaveCount(2);
  }
});

for (const payload of ["addresses", "html", "files"] as const) {
  for (const repeat of [0, 200]) {
    test(`pastes multiple images in page and canvas modes, ${payload}, repeat=${repeat}`, async ({
      page,
    }) => {
      if (repeat) {
        await page.goto(`/?repeat=${repeat}`);
        await page.waitForFunction(() => "__rivtoDemo" in window);
      }
      const uris = ["first.png", "second.png"].map((name) => new URL(`/${name}`, page.url()).href);
      await page.route(/\/(first|second)\.png$/, async (route) => {
        await route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      });
      for (const mode of ["page", "canvas"] as const) {
        if (mode === "canvas") {
          await page.locator('[data-editor-mode="edgeless"]').click();
        }
        const target = page
          .locator(mode === "page" ? ".page-surface" : ".edgeless-viewport")
          .first();
        await pasteMultipleImages(target, uris, payload);
        const images = page
          .locator(mode === "page" ? IMAGE_BLOCK_SELECTOR : IMAGE_ELEMENT_SELECTOR)
          .locator(".rivto-image");
        await expect(images).toHaveCount(2);
        if (payload === "files") {
          await expect(images.nth(0)).toHaveAttribute("alt", "first.png");
          await expect(images.nth(1)).toHaveAttribute("alt", "second.png");
        } else {
          await expect(images.nth(0)).toHaveAttribute("src", uris[0]!);
          await expect(images.nth(1)).toHaveAttribute("src", uris[1]!);
        }
      }
    });
  }
}

for (const payload of ["uri-list", "plain", "html"] as const) {
  for (const repeat of [0, 200]) {
    test(`pastes a copied image address in page and canvas modes, ${payload}, repeat=${repeat}`, async ({
      page,
    }) => {
      if (repeat) {
        await page.goto(`/?repeat=${repeat}`);
        await page.waitForFunction(() => "__rivtoDemo" in window);
      }
      const imageUrl = new URL("/copied-image.png", page.url()).href;
      await page.route("**/copied-image.png", async (route) => {
        await route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      });
      for (const mode of ["page", "canvas"] as const) {
        if (mode === "canvas") {
          await page.locator('[data-editor-mode="edgeless"]').click();
        }
        const target = page
          .locator(mode === "page" ? ".page-surface" : ".edgeless-viewport")
          .first();
        await target.evaluate(
          (element, { uri, payloadType }) => {
            const data = new DataTransfer();
            if (payloadType === "uri-list") {
              data.setData("text/uri-list", uri);
            }
            data.setData("text/plain", uri);
            if (payloadType === "html") {
              data.setData("text/html", `<a href="${uri}">${uri}</a>`);
            }
            const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
            Object.defineProperty(event, "clipboardData", { value: data });
            element.dispatchEvent(event);
          },
          { uri: imageUrl, payloadType: payload },
        );
        const image = page.locator(mode === "page" ? IMAGE_BLOCK_SELECTOR : IMAGE_ELEMENT_SELECTOR);
        await expect(image.locator(".rivto-image")).toBeVisible();
        await expect(image.locator(".rivto-image")).toHaveAttribute("src", imageUrl);
      }
    });
  }
}

test("pastes a redacted desktop image path without the file handler", async ({ page }) => {
  await page.evaluate(() => {
    const demo = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    demo.__rivtoDemo.reactEditor.events.delete("file.paste");
  });
  const localImage = resolve("docs/00-rivto/assets/pasted-1786747914356-844df263.png");
  await sendLocalImagePath(page.locator(".page-surface").first(), localImage);
  await expect(page.locator(`${IMAGE_BLOCK_SELECTOR} .rivto-image`)).toBeVisible();
  await page.locator('[data-editor-mode="edgeless"]').click();
  await sendLocalImagePath(page.locator(".edgeless-viewport").first(), localImage);
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} .rivto-image`)).toBeVisible();
});

test("retries a failed clipboard image path read", async ({ page }) => {
  await expect(page.locator(".page-surface").first()).toBeVisible();
  const localImage = resolve("docs/00-rivto/assets/pasted-1786747914356-844df263.png");
  await page.evaluate((path) => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.events.delete("file.paste");
    let attempts = 0;
    Object.defineProperty(navigator.clipboard, "readText", {
      configurable: true,
      // Fail once so the retry action can resolve the same path.
      value: async () => {
        if (attempts++ === 0) {
          throw new Error("Clipboard read denied");
        }
        return path;
      },
    });
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    // Expose the URI-list type but redact its synchronous data.
    Object.defineProperty(event, "clipboardData", {
      value: { files: [], items: [], types: ["text/uri-list"], getData: () => "" },
    });
    document.querySelector(".page-surface")!.dispatchEvent(event);
  }, localImage);
  const error = page.getByRole("alert").filter({ hasText: "Clipboard read denied" });
  await expect(error).toBeVisible();
  await error.getByRole("button", { name: "Retry" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(`${IMAGE_BLOCK_SELECTOR} .rivto-image`)).toBeVisible();
  await expect(error).toBeHidden();
});

test("keeps upload error retry buttons clickable", async ({ page }) => {
  const path = resolve("docs/00-rivto/assets/pasted-1786747914356-844df263.png");
  await page
    .locator(".page-surface")
    .first()
    .evaluate((root, imagePath) => {
      const host = window as unknown as {
        __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      };
      host.__rivtoDemo.reactEditor.events.delete("file.paste");
      let attempts = 0;
      Object.defineProperty(navigator.clipboard, "readText", {
        configurable: true,
        value: async () => {
          if (attempts++ === 0) {
            throw new Error("Clipboard read denied");
          }
          return imagePath;
        },
      });
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], items: [], types: ["text/uri-list"], getData: () => "" },
      });
      root.dispatchEvent(event);
    }, path);
  const error = page.getByRole("alert").filter({ hasText: "Clipboard read denied" });
  await error.evaluate((element: HTMLElement) => {
    element.style.left = "100px";
    element.style.top = "100px";
  });
  await error.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(`${IMAGE_BLOCK_SELECTOR} .rivto-image`)).toBeVisible();
  await expect(error).toBeHidden();
});

for (const unavailable of [false, true]) {
  test(`reports an unusable clipboard image path, unavailable=${unavailable}`, async ({ page }) => {
    const root = page.locator(".page-surface").first();
    await expect(root).toBeVisible();
    await root.evaluate((element, missing) => {
      const host = window as unknown as {
        __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      };
      host.__rivtoDemo.reactEditor.events.delete("file.paste");
      if (missing) {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      } else {
        Object.defineProperty(navigator.clipboard, "readText", {
          configurable: true,
          // Return text that cannot be interpreted as an image path.
          value: async () => "not an image path",
        });
      }
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], items: [], types: ["text/uri-list"], getData: () => "" },
      });
      element.dispatchEvent(event);
    }, unavailable);
    const message = unavailable
      ? "This browser does not provide clipboard read access"
      : "Clipboard does not contain a readable image path";
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.locator(IMAGE_BLOCK_SELECTOR)).toHaveCount(0);
  });
}

test("drops image files without the file handler in page and canvas modes", async ({ page }) => {
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.events.delete("file.drop");
  });
  await sendImage(page.locator(".page-surface").first(), "drop");
  await expect(page.locator(`${IMAGE_BLOCK_SELECTOR} .rivto-image`)).toBeVisible();
  await page.locator('[data-editor-mode="edgeless"]').click();
  await sendImage(page.locator(".edgeless-viewport").first(), "drop");
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} .rivto-image`)).toBeVisible();
});

test("reports an undecodable image without inserting it", async ({ page }) => {
  await expect(page.locator(".page-surface").first()).toBeVisible();
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.events.delete("file.paste");
    const data = new DataTransfer();
    data.items.add(new File(["not an image"], "invalid.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    document.querySelector(".page-surface")!.dispatchEvent(event);
  });
  await expect(page.getByRole("alert").filter({ hasText: "not a decodable image" })).toBeVisible();
  await expect(page.locator(IMAGE_BLOCK_SELECTOR)).toHaveCount(0);
});

test("drops an HTML image without the file handler", async ({ page }) => {
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.events.delete("file.drop");
  });
  await page
    .locator(".page-surface")
    .first()
    .evaluate((root) => {
      const data = new DataTransfer();
      data.setData(
        "text/html",
        '<img alt="dropped" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=">',
      );
      const bounds = root.querySelector<HTMLElement>(".rivto-block-row")!.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.bottom - 2;
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, "dataTransfer", { value: data });
      (document.elementFromPoint(x, y) ?? root).dispatchEvent(event);
    });
  await expect(page.locator(`${IMAGE_BLOCK_SELECTOR} .rivto-image`)).toHaveAttribute(
    "alt",
    "dropped",
  );
});

test("falls back to file cards for non-image files", async ({ page }) => {
  let openRequests = 0;
  await page.route("**/__rivto_demo_open_file**", async (route) => {
    openRequests += 1;
    await route.fulfill({ status: 204 });
  });
  await sendFile(page.locator(".page-surface").first(), "drop");
  await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${FILE_BLOCK_SELECTOR} ${FILE_NAME_SELECTOR}`)).toHaveText(
    "notes.txt",
  );
  await expect(page.locator(`${FILE_BLOCK_SELECTOR} ${FILE_TEXT_ICON_SELECTOR}`)).toHaveCount(1);
  await page.locator(`${FILE_BLOCK_SELECTOR} .rivto-file`).dblclick();
  await expect.poll(() => openRequests).toBe(1);
  await page.locator(`${FILE_BLOCK_SELECTOR} .rivto-file`).click({ button: "right" });
  const openFile = page.getByRole("menuitem", { name: "Open file" });
  await expect(openFile).toBeVisible();
  await openFile.click();
  await expect.poll(() => openRequests).toBe(2);

  await page.locator('[data-editor-mode="edgeless"]').click();
  await sendFile(page.locator(".edgeless-viewport").first(), "paste");
  await expect(page.locator(FILE_ELEMENT_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${FILE_ELEMENT_SELECTOR} ${FILE_NAME_SELECTOR}`)).toHaveText(
    "notes.txt",
  );
});

for (const repeat of [0, 200]) {
  test(`canvas image resizes with a live preview, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.waitForFunction(() => "__rivtoDemo" in window);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await sendImage(page.locator(".edgeless-viewport").first(), "paste", true);
    const host = page.locator(IMAGE_ELEMENT_SELECTOR);
    await expect(host).toHaveCount(1);
    await host.click();
    const image = host.locator(".rivto-image");
    const id = (await host.getAttribute("data-edgeless-object-id"))!;
    // Compare the stored element before, during, and after the resize gesture.
    const stored = () =>
      page.evaluate((elementId) => {
        const demo = window as typeof window & {
          __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return demo.__rivtoDemo.editor.elements.getElementNode(elementId);
      }, id);
    const original = await stored();
    const before = (await image.boundingBox())!;
    const handle = page.locator(EDGELESS_VISUAL_RESIZE_SELECTOR);
    const rect = (await handle.boundingBox())!;
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const start = Date.now();
    await page.mouse.move(x + 60, y + 40, { steps: 3 });
    const preview = (await image.boundingBox())!;
    expect(preview.width).toBeGreaterThan(before.width + 20);
    expect(await stored()).toEqual(original);
    await page.mouse.up();
    await expect
      .poll(async () => (await stored())!.frame.width)
      .toBeGreaterThan(original!.frame.width);
    console.log(
      JSON.stringify({ interaction: "image-resize", repeat, elapsedMs: Date.now() - start }),
    );
    await page.locator(".edgeless-viewport").focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(stored).toEqual(original);
  });
}

for (const repeat of [0, 200]) {
  for (const eventType of ["paste", "drop"] as const) {
    for (const imageFirst of [false, true]) {
      test(`mixed file ${eventType} routes each attachment to its own provider, repeat=${repeat}, imageFirst=${imageFirst}`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        if (repeat || imageFirst) {
          const params = new URLSearchParams();
          if (repeat) {
            params.set("repeat", String(repeat));
          }
          if (imageFirst) {
            params.set("imageFirst", "1");
          }
          await page.goto(`/?${params}`);
          await page.waitForFunction(() => "__rivtoDemo" in window);
        }
        await recordAttachmentWrites(page);
        await sendMixedFiles(page, eventType);
        await expect(page.locator(IMAGE_BLOCK_SELECTOR)).toHaveCount(1);
        await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(1);
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as { attachmentWrites: string[] }).attachmentWrites,
            ),
          )
          .toEqual(["image:picture.png", "file:document.txt"]);
        const types = await page.evaluate(() => {
          const editor = (
            window as unknown as {
              __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
            }
          ).__rivtoDemo.editor;
          const imageId = document
            .querySelector('[data-block-type="image"]')!
            .getAttribute("data-block-id")!;
          const parentId = editor.blocks.getParentId(imageId);
          const ids = parentId ? editor.blocks.getChildIds(parentId) : editor.blocks.getRootIds();
          return ids
            .map((id) => editor.blocks.getBlockNode(id)?.type)
            .filter((type) => type === "image" || type === "file");
        });
        expect(types).toEqual(["image", "file"]);
      });
    }
  }
}

test("preserves text edited while a file upload is pending", async ({ page }) => {
  let releaseUpload: (() => void) | undefined;
  let uploadStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    uploadStarted = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/__rivto_demo_clipboard_file**", async (route) => {
    uploadStarted?.();
    await released;
    await route.continue();
  });
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await sendFile(content, "paste", "pending.txt");
  await started;
  await page.keyboard.type(" newly typed");
  const changed = await content.textContent();
  releaseUpload?.();
  const conflict = page.getByRole("alert").filter({ hasText: "changed" });
  await expect(conflict).toBeVisible();
  await expect(content).toHaveText(changed ?? "");
  await conflict.getByRole("button", { name: "Retry" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return demo.__rivtoDemo?.editor.blocks.getBlocks()[0]?.content ?? "";
      }),
    )
    .toContain("pending.txt");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return demo.__rivtoDemo?.editor.blocks.getBlocks()[0]?.content ?? "";
      }),
    )
    .toContain("newly typed");
});

test("inserts files when randomUUID is unavailable", async ({ page }) => {
  await page.locator(BLOCK_CONTENT_SELECTOR).first().waitFor();
  await page.evaluate(() =>
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined }),
  );
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await sendFile(content, "paste", "http-file.txt");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return demo.__rivtoDemo?.editor.blocks.getBlocks()[0]?.content ?? "";
      }),
    )
    .toContain("http-file.txt");
});

test("rejects cross-origin and unauthorized native file opening", async ({ request, baseURL }) => {
  const url = new URL("/__rivto_demo_open_file?uri=%2Fetc%2Fpasswd", baseURL);
  const crossOrigin = await request.post(url.href, {
    headers: { Origin: "https://attacker.example" },
  });
  expect(crossOrigin.status()).toBe(403);
  const crossOriginUpload = await request.post(
    new URL("/__rivto_demo_clipboard_file?name=test.txt", baseURL).href,
    { headers: { Origin: "https://attacker.example" }, data: "test" },
  );
  expect(crossOriginUpload.status()).toBe(403);
  const unauthorized = await request.post(url.href, { headers: { Origin: url.origin } });
  expect(unauthorized.status()).toBe(404);
});

test("preserves a changed destination while a file reference is prepared", async ({ page }) => {
  await page.locator(BLOCK_CONTENT_SELECTOR).first().waitFor();
  await pauseFileReferencePreparation(page);
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await content.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/uri-list", "file:///tmp/example.txt");
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    element.dispatchEvent(event);
  });
  // Wait until preparation exposes its release callback before changing the destination.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as unknown as { releaseFileReference?: () => void }).releaseFileReference),
      ),
    )
    .toBe(true);
  await page.keyboard.type(" edited");
  const changed = await content.textContent();
  // Let the paused preparation resume against the now-stale destination.
  await page.evaluate(() =>
    (window as unknown as { releaseFileReference: () => void }).releaseFileReference(),
  );
  await expect(page.getByRole("alert").filter({ hasText: "changed" })).toBeVisible();
  await expect(content).toHaveText(changed ?? "");
});

test("inserts image files when randomUUID is unavailable", async ({ page }) => {
  await page.locator(BLOCK_CONTENT_SELECTOR).first().waitFor();
  await page.evaluate(() =>
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined }),
  );
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await sendImage(content, "paste", false, "http-image.png");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return demo.__rivtoDemo?.editor.blocks.getBlocks()[0]?.content ?? "";
      }),
    )
    .toContain("http-image.png");
});

test("does not replace an empty block that was edited during upload", async ({ page }) => {
  let releaseUpload: (() => void) | undefined;
  let uploadStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    uploadStarted = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/__rivto_demo_clipboard_file**", async (route) => {
    uploadStarted?.();
    await released;
    await route.continue();
  });
  await page.evaluate(() => {
    const demo = window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
    };
    const block = demo.__rivtoDemo.editor.blocks.getBlocks()[0]!;
    demo.__rivtoDemo.editor.blocks.updateBlock(block.id, { content: "" });
  });
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await sendFile(content, "paste", "pending-empty.txt");
  await started;
  await page.keyboard.type("new text");
  releaseUpload?.();
  await expect(page.getByRole("alert").filter({ hasText: "changed" })).toBeVisible();
  await expect(content).toHaveText("new text");
});

test("standalone image insertion preserves edits made during upload", async ({ page }) => {
  let releaseUpload: (() => void) | undefined;
  let uploadStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    uploadStarted = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/__rivto_demo_clipboard_file**", async (route) => {
    uploadStarted?.();
    await released;
    await route.continue();
  });
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await page.evaluate(() => {
    const demo = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    demo.__rivtoDemo.reactEditor.events.delete("file.paste");
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
  });
  await sendImage(content, "paste", false, "pending-image.png");
  await started;
  await page.keyboard.type(" edited");
  const changed = await content.textContent();
  releaseUpload?.();
  await expect(page.getByRole("alert").filter({ hasText: "changed" })).toBeVisible();
  await expect(content).toHaveText(changed ?? "");
});

test("unsupported binary copy observes a failed data read", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const runtime = (
      window as unknown as {
        __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      }
    ).__rivtoDemo.reactEditor;
    const errors: string[] = [];
    // Record rejected clipboard reads that escape as unhandled browser promises.
    const onUnhandled = (event: PromiseRejectionEvent) => {
      errors.push(String(event.reason));
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: undefined });
    const data = new Promise<Blob>((_resolve, reject) =>
      setTimeout(() => reject(new Error("file read failed")), 0),
    );
    const copied = await runtime.clipboard.writeBinary({
      name: "file",
      mimeType: "application/example",
      data,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    window.removeEventListener("unhandledrejection", onUnhandled);
    return { copied, errors };
  });
  expect(result).toEqual({ copied: false, errors: [] });
});

test("pastes images with only the image extension installed", async ({ page }) => {
  await page.goto("/?imageOnly=1");
  await page.waitForFunction(() => "__rivtoDemo" in window);
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await sendImage(content, "paste", false, "image-only.png");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const demo = window as typeof window & {
          __rivtoDemo?: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return demo.__rivtoDemo?.editor.blocks.getBlocks()[0]?.content ?? "";
      }),
    )
    .toContain("image-only.png");
});

test("pastes generic files with only the file extension installed", async ({ page }) => {
  await page.goto("/?fileOnly=1");
  await page.waitForFunction(() => "__rivtoDemo" in window);
  await sendFile(page.locator(".page-surface").first(), "paste", "file-only.txt");
  await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${FILE_BLOCK_SELECTOR} ${FILE_NAME_SELECTOR}`)).toHaveText(
    "file-only.txt",
  );
});

for (const stage of ["upload", "preparation"] as const) {
  test(`does not insert a file when its handler is removed during ${stage}`, async ({ page }) => {
    await registerPendingFileHandler(page, stage);
    await sendFile(page.locator(".page-surface").first(), "paste", "pending-handler.txt");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { pendingHandler: { started: boolean } }).pendingHandler.started,
        ),
      )
      .toBe(true);
    // Unregister the handler before releasing its pending asynchronous operation.
    await page.evaluate(() => {
      const state = (
        window as unknown as { pendingHandler: { release: () => void; remove: () => void } }
      ).pendingHandler;
      state.remove();
      state.release();
    });
    await expect(
      page.getByRole("alert").filter({ hasText: `removed during ${stage}` }),
    ).toBeVisible();
    await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(0);
  });
}

test("updates a mounted inline file when its handler changes", async ({ page }) => {
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await sendFile(content, "paste", "dynamic-handler.txt");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return host.__rivtoDemo.editor.blocks.getBlocks()[0]?.content;
      }),
    )
    .toContain("dynamic-handler.txt");
  await page.locator("h1").first().click();
  const file = page
    .locator(".markdown-preview .rivto-file")
    .filter({ hasText: "dynamic-handler.txt" });
  await expect(file).toHaveCount(1);
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      /**
       * Removes the dynamically installed renderer handler.
       *
       * @returns Removes the registration so the default renderer can return.
       */
      removeDynamicHandler: () => void;
    };
    host.removeDynamicHandler = host.__rivtoDemo.reactEditor.clipboard.registerFileHandler({
      id: "dynamic-inline-test",
      provider: { write: async () => "data:text/plain,file", read: async () => undefined },
      // Replace the inline view only for the named fixture file.
      matches: ({ reference }) => reference.name === "dynamic-handler.txt",
      // The test renders an existing reference rather than inserting new content.
      prepare: () => ({ kind: "inline", content: "" }),
      // Suppress visible output while this handler is registered.
      InlineView: () => null,
    });
  });
  await expect(file).toHaveCount(0);
  // Removing the temporary handler restores the previously rendered fallback.
  await page.evaluate(() =>
    (window as unknown as { removeDynamicHandler: () => void }).removeDynamicHandler(),
  );
  await expect(file).toHaveCount(1);
});

test("an older file copy cannot close a newer copy menu", async ({ page }) => {
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      pendingCopies: Array<() => void>;
    };
    host.pendingCopies = [];
    host.__rivtoDemo.reactEditor.clipboard.registerWriter({
      id: "delayed-file-copy",
      // Accept the file type so both copy attempts reach the writer.
      supports: () => true,
      // Hold each write independently so the older copy can finish first.
      write: async ({ data }) => {
        await data;
        await new Promise<void>((resolve) => host.pendingCopies.push(resolve));
      },
    });
  });
  await sendFile(page.locator(".page-surface").first(), "drop");
  const file = page.locator(`${FILE_BLOCK_SELECTOR} .rivto-file`);
  await expect(file).toHaveCount(1);
  await file.click({ button: "right" });
  const copy = page.getByRole("menuitem", { name: "Copy file" });
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { pendingCopies: unknown[] }).pendingCopies.length),
    )
    .toBe(1);
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { pendingCopies: unknown[] }).pendingCopies.length),
    )
    .toBe(2);
  // Completing the superseded copy must not close the menu for the active copy.
  await page.evaluate(() =>
    (window as unknown as { pendingCopies: Array<() => void> }).pendingCopies[0]!(),
  );
  await expect(copy).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { pendingCopies: Array<() => void> }).pendingCopies[1]!(),
  );
  await expect(copy).toBeHidden();
});

test("copies an image through a host clipboard writer", async ({ page }) => {
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      copiedImageSize?: number;
    };
    host.__rivtoDemo.reactEditor.clipboard.registerWriter({
      id: "image-copy-test",
      // Accept the PNG representation used by this fixture.
      supports: (mimeType) => mimeType === "image/png",
      // Record the resolved binary size to prove the writer received image bytes.
      write: async ({ data }) => {
        host.copiedImageSize = (await data).size;
      },
    });
  });
  await sendImage(page.locator(".page-surface").first(), "drop");
  const frame = page.locator(`${IMAGE_BLOCK_SELECTOR} .rivto-image-frame`);
  await expect(frame).toHaveCount(1);
  await frame.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy image" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { copiedImageSize?: number }).copiedImageSize),
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("menuitem", { name: "Copy image" })).toBeHidden();
});

test("image picker replaces the selected empty block", async ({ page }) => {
  const id = await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
    };
    return host.__rivtoDemo.editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
  });
  const content = page.locator(`[data-block-id="${id}"] [data-block-content]`);
  await content.click();
  await page.keyboard.type("/image");
  const menu = page.locator("[data-slash-menu]");
  await expect(menu).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await menu.getByText("Image", { exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator(`[data-block-id="${id}"]`)).toHaveAttribute("data-block-type", "image");
});

test("file picker replaces the selected empty block", async ({ page }) => {
  const id = await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
    };
    return host.__rivtoDemo.editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
  });
  await page.locator(`[data-block-id="${id}"] [data-block-content]`).click();
  await page.keyboard.type("/file");
  const menu = page.locator("[data-slash-menu]");
  await expect(menu).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await menu.getByText("File", { exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("notes") });
  await expect(page.locator(`[data-block-id="${id}"]`)).toHaveAttribute("data-block-type", "file");
});

test("matches an unstored file before preparing its stored reference", async ({ page }) => {
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      fileCandidate: { matchedUri: boolean; preparedUri?: string };
    };
    host.fileCandidate = { matchedUri: true };
    host.__rivtoDemo.reactEditor.clipboard.registerFileHandler({
      id: "candidate-contract",
      // Assign a stable URI during storage and leave reads unclaimed.
      provider: { write: async () => "data:text/plain,stored", read: async () => undefined },
      // Observe whether matching happens before the provider assigns a URI.
      matches: ({ file, reference }) => {
        if (reference.name !== "candidate-contract.txt") {
          return false;
        }
        if (file) {
          host.fileCandidate.matchedUri = "uri" in reference;
        }
        return true;
      },
      // Capture the URI visible to preparation after storage completes.
      prepare: ({ reference }) => {
        host.fileCandidate.preparedUri = reference.uri;
        return { kind: "block", type: "file", props: { ...reference } };
      },
    });
  });
  await sendFile(page.locator(".page-surface").first(), "paste", "candidate-contract.txt");
  await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { fileCandidate: { matchedUri: boolean; preparedUri?: string } })
          .fileCandidate,
    ),
  ).toEqual({
    matchedUri: false,
    preparedUri: "data:text/plain,stored",
  });
});

test("undoes and redoes an inserted file block", async ({ page }) => {
  const surface = page.locator(".page-surface").first();
  await surface.click({ position: { x: 20, y: 20 } });
  await sendFile(surface, "paste", "undo-file.txt");
  await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${FILE_BLOCK_SELECTOR} ${FILE_NAME_SELECTOR}`)).toHaveText(
    "undo-file.txt",
  );
});

test("undoes and redoes an inserted canvas image", async ({ page }) => {
  await page.locator('[data-editor-mode="edgeless"]').click();
  const viewport = page.locator(".edgeless-viewport").first();
  await viewport.click({ position: { x: 40, y: 40 } });
  await sendImage(viewport, "paste", false, "undo-image.png");
  await expect(page.locator(IMAGE_ELEMENT_SELECTOR)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(IMAGE_ELEMENT_SELECTOR)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(IMAGE_ELEMENT_SELECTOR)).toHaveCount(1);
});
