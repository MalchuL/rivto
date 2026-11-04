/** @jest-environment jsdom */
import { browserClipboardType } from "./utils";

test("chooses a supported clipboard MIME type and falls back to generic bytes", () => {
  const originalItem = Object.getOwnPropertyDescriptor(window, "ClipboardItem");
  const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
  try {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { write: () => {} },
    });
    Object.defineProperty(window, "ClipboardItem", {
      configurable: true,
      value: {
        supports: (type: string) => type === "image/png" || type === "application/octet-stream",
      },
    });
    expect(browserClipboardType(window, "image/png")).toBe("image/png");
    expect(browserClipboardType(window, "application/pdf")).toBe("application/octet-stream");
    Object.defineProperty(window, "ClipboardItem", {
      configurable: true,
      value: { supports: () => false },
    });
    expect(browserClipboardType(window, "image/png")).toBeUndefined();
  } finally {
    if (originalItem) {
      Object.defineProperty(window, "ClipboardItem", originalItem);
    } else {
      Reflect.deleteProperty(window, "ClipboardItem");
    }
    if (originalClipboard) {
      Object.defineProperty(window.navigator, "clipboard", originalClipboard);
    } else {
      Reflect.deleteProperty(window.navigator, "clipboard");
    }
  }
});
