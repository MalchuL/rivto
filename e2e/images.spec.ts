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

/**
 * Drops a PNG at the caret after the first five characters of a text block.
 *
 * @param target - Editable block containing the text.
 * @param legacyCaret - Whether to force the browser's legacy hit-test API.
 * @returns Resolves after the drop event is dispatched.
 */
async function dropImageAtTextCaret(target: Locator, legacyCaret: boolean): Promise<void> {
  await target.evaluate((element, useLegacyCaret) => {
    const text = element.firstChild;
    if (!text) {
      throw new Error("Editable block has no text node");
    }
    const range = element.ownerDocument.createRange();
    range.setStart(text, 5);
    range.collapse(true);
    const bounds = range.getBoundingClientRect();
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (character) => character.charCodeAt(0),
    );
    const data = new DataTransfer();
    data.items.add(new File([bytes], "caret.png", { type: "image/png" }));
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.x,
      clientY: bounds.y + bounds.height / 2,
    });
    Object.defineProperty(event, "dataTransfer", { value: data });
    if (useLegacyCaret) {
      Object.defineProperty(document, "caretPositionFromPoint", {
        configurable: true,
        value: undefined,
      });
    }
    try {
      element.dispatchEvent(event);
    } finally {
      if (useLegacyCaret) {
        Reflect.deleteProperty(document, "caretPositionFromPoint");
      }
    }
  }, legacyCaret);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
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

for (const legacyCaret of [false, true]) {
  test(`drops an image at the text hit-test position, legacy=${legacyCaret}`, async ({ page }) => {
    if (legacyCaret) {
      const supportsLegacy = await page.evaluate(() => "caretRangeFromPoint" in document);
      test.skip(!supportsLegacy, "Browser does not provide the legacy caret API");
    }
    await page.evaluate(() => {
      const host = window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
      };
      host.__rivtoDemo.editor.blocks.insertBlock({
        id: "image-drop-caret",
        type: "paragraph",
        content: "alpha omega",
      });
    });
    const content = page.locator('[data-block-id="image-drop-caret"] [data-block-content]');
    await content.click();
    await dropImageAtTextCaret(content, legacyCaret);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const host = window as unknown as {
            __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
          };
          return host.__rivtoDemo.editor.blocks.getBlock("image-drop-caret")?.content;
        }),
      )
      .toMatch(/^alpha\{\{image .*\}\} omega$/);
  });
}

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
    .toMatch(/\.png$/);
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
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: 300,
        clientY: 300,
      });
      Object.defineProperty(event, "dataTransfer", { value: data });
      root.dispatchEvent(event);
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
            // Record which provider receives each file without changing its storage behavior.
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
  await sendFile(page.locator(".page-surface").first(), "paste", "file-only.txt");
  await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${FILE_BLOCK_SELECTOR} ${FILE_NAME_SELECTOR}`)).toHaveText(
    "file-only.txt",
  );
});

for (const stage of ["upload", "preparation"] as const) {
  test(`does not insert a file when its handler is removed during ${stage}`, async ({ page }) => {
    await page.evaluate((pendingStage) => {
      const host = window as unknown as {
        __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
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
      };
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
