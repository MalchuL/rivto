/** Browser coverage for image file paste and page/canvas drop routing. */
import { expect, test, type Locator } from "@playwright/test";
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

/** Dispatches one tiny valid PNG through a clipboard or drop event. */
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
      const payload = itemOnlyPayload
        ? {
            files: [],
            items: [{ kind: "file", getAsFile: () => file }],
            types: ["Files"],
            getData: () => "",
          }
        : data;
      const event =
        type === "paste"
          ? new ClipboardEvent("paste", { bubbles: true, cancelable: true })
          : new DragEvent("drop", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
      Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {
        value: payload,
      });
      element.dispatchEvent(event);
    },
    { type: eventType, itemOnlyPayload: itemOnly, fileName: name },
  );
}

/** Dispatches one ordinary file through the shared ingestion path. */
async function sendFile(
  target: Locator,
  eventType: "paste" | "drop",
  name = "notes.txt",
): Promise<void> {
  await target.evaluate(
    (element, { type, fileName }) => {
      const data = new DataTransfer();
      data.items.add(new File(["hello"], fileName, { type: "text/plain" }));
      const event =
        type === "paste"
          ? new ClipboardEvent("paste", { bubbles: true, cancelable: true })
          : new DragEvent("drop", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
      Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {
        value: data,
      });
      element.dispatchEvent(event);
    },
    { type: eventType, fileName: name },
  );
}

/** Dispatches the plain absolute path produced by desktop file-manager copy. */
async function sendLocalImagePath(target: Locator, path: string): Promise<void> {
  await target.evaluate((element, localPath) => {
    Object.defineProperty(navigator.clipboard, "readText", {
      configurable: true,
      value: async () => localPath,
    });
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [],
        types: ["text/uri-list"],
        getData: () => "",
      },
    });
    element.dispatchEvent(event);
  }, path);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
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

for (const repeat of [false, true]) {
  test(`image alt controls use shared styling and update text${repeat ? " in a large document" : ""}`, async ({
    page,
  }) => {
    if (repeat) {
      await page.goto("/?repeat=200");
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
        return demo.__rivtoDemo?.editor.blocks.getBlocks().find(({ type }) => type === "image")
          ?.props.uri;
      }),
    )
    .toContain("data:image/png;base64,");
  if (browserName === "chromium") {
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
        const props = demo.__rivtoDemo?.editor.blocks
          .getBlocks()
          .find(({ type }) => type === "image")?.props;
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
        const props = demo.__rivtoDemo?.editor.blocks
          .getBlocks()
          .find(({ type }) => type === "image")?.props;
        return [props?.width, props?.height];
      }),
    )
    .toEqual([undefined, undefined]);

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
    await page.locator('[data-editor-mode="edgeless"]').click();
    await sendImage(page.locator(".edgeless-viewport").first(), "paste", true);
    const host = page.locator(IMAGE_ELEMENT_SELECTOR);
    await expect(host).toHaveCount(1);
    await host.click();
    const image = host.locator(".rivto-image");
    const id = (await host.getAttribute("data-edgeless-object-id"))!;
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
    test(`mixed file ${eventType} routes each attachment to its own provider, repeat=${repeat}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      if (repeat) {
        await page.goto(`/?repeat=${repeat}`);
      }
      await page.evaluate(() => {
        const demo = window as unknown as {
          __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
          attachmentWrites: string[];
        };
        demo.attachmentWrites = [];
        for (const id of ["image", "file"]) {
          const handler = demo.__rivtoDemo.reactEditor.clipboard.getFileHandler(id)!;
          const provider = handler.provider;
          Object.defineProperty(handler, "provider", {
            value: {
              ...provider,
              write: async (
                blob: Blob,
                context: import("@chulane/rivto-react").BinaryWriteContext,
              ) => {
                demo.attachmentWrites.push(`${id}:${context.name}`);
                return provider.write(blob, context);
              },
            },
          });
        }
      });
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
          const event =
            eventType === "paste"
              ? new ClipboardEvent("paste", { bubbles: true, cancelable: true })
              : new DragEvent("drop", {
                  bubbles: true,
                  cancelable: true,
                  clientX: 300,
                  clientY: 300,
                });
          Object.defineProperty(event, eventType === "paste" ? "clipboardData" : "dataTransfer", {
            value: data,
          });
          element.dispatchEvent(event);
        }, eventType);
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
        return editor.blocks
          .getBlocks()
          .filter((block) => block.type === "image" || block.type === "file")
          .map((block) => block.type);
      });
      expect(types).toEqual(["image", "file"]);
    });
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
  await page.evaluate(() => {
    const demo = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
      releaseFileReference?: () => void;
    };
    const handler = demo.__rivtoDemo.reactEditor.clipboard.getFileHandler("file")!;
    const prepare = handler.prepare;
    Object.defineProperty(handler, "prepare", {
      value: async (...args: Parameters<typeof prepare>) => {
        await new Promise<void>((resolve) => {
          demo.releaseFileReference = resolve;
        });
        return prepare(...args);
      },
    });
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
  });
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
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as unknown as { releaseFileReference?: () => void }).releaseFileReference),
      ),
    )
    .toBe(true);
  await page.keyboard.type(" edited");
  const changed = await content.textContent();
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
