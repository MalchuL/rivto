/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { isIndependentClipboardTarget } from "../clipboard-target";

/**
 * Checks a clipboard delivery with an optional separately focused host.
 *
 * The listener evaluates the normalized capability during delivery, including
 * the browser case where the event target differs from the focused editor.
 *
 * @param host - Event target inside the fixture surface.
 * @param active - Optional focused host when input is redirected to the surface.
 * @returns Whether the editor leaves the clipboard event to a text host.
 */
function isIndependent(host: HTMLElement, active?: HTMLElement): boolean {
  const root = document.createElement("div");
  root.append(host);
  if (active && active !== host) {
    root.append(active);
  }
  document.body.append(root);
  const occurrence = new BrowserInputRoot(root);
  let result: boolean | undefined;
  const detach = occurrence.observeInput("copy", (input) => {
    result = isIndependentClipboardTarget(input.clipboardTarget);
  });
  try {
    if (active) {
      active.focus();
    }
    host.dispatchEvent(new Event("copy", { bubbles: true }));
    if (result === undefined) {
      throw new Error("Clipboard input was not delivered");
    }
    return result;
  } finally {
    detach?.();
    occurrence.detach();
    root.remove();
  }
}

/**
 * Builds an editable host with optional structured block-content ownership.
 *
 * jsdom does not implement `isContentEditable`, so the fixture supplies its
 * browser value while using actual elements and selector matching.
 *
 * @param kind - Whether the host is a visual label or a page block editor.
 * @returns Focusable editable element for normalized clipboard delivery.
 */
function editableHost(kind: "label" | "block"): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");
  host.tabIndex = 0;
  Object.defineProperty(host, "isContentEditable", { value: true });
  if (kind === "block") {
    host.setAttribute("data-block-content", "");
  }
  return host;
}

describe("isIndependentClipboardTarget", () => {
  test("claims visual label editors and ignores page block editors", () => {
    expect(isIndependent(editableHost("label"))).toBe(true);
    expect(isIndependent(editableHost("block"))).toBe(false);
  });

  test("ignores non-editable canvas targets", () => {
    expect(isIndependent(document.createElement("div"))).toBe(false);
  });

  test("follows document focus when the event target is not the label", () => {
    expect(isIndependent(document.createElement("div"), editableHost("label"))).toBe(true);
  });
});

for (const redirected of [false, true]) {
  test(`leaves marked text inputs to native clipboard handling, redirected=${redirected}`, () => {
    const control = document.createElement("input");
    control.setAttribute("data-editor-control", "");
    const surface = document.createElement("div");
    expect(isIndependent(redirected ? surface : control, redirected ? control : undefined)).toBe(
      true,
    );
  });
}

test("keeps canvas clipboard commands available when a toolbar button holds focus", () => {
  const button = document.createElement("button");
  button.setAttribute("data-editor-control", "");
  expect(isIndependent(button, button)).toBe(false);
});
