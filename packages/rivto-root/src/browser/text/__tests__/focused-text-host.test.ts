import { BrowserInputRoot } from "../../input/browser-input-root";

it("restores the caret in the focused host even when another host has the same owner", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML =
    '<div data-block-id="same"><div tabindex="0" data-content>first</div></div><div data-block-id="same"><div tabindex="0" data-content>second</div></div>';
  document.body.append(root);
  const hosts = root.querySelectorAll<HTMLElement>("[data-content]");
  const occurrence = new BrowserInputRoot(root);
  try {
    hosts[1]!.focus();
    const host = occurrence.captureFocusedTextHost("[data-content]", "[data-panel]");
    expect(host?.readText()).toBe("second");
    host?.restoreCaret(3);
    expect(document.getSelection()?.focusNode).toBe(hosts[1]!.firstChild);
    expect(document.getSelection()?.focusOffset).toBe(3);
  } finally {
    occurrence.detach();
    document.getSelection()?.removeAllRanges();
    root.remove();
  }
});

it("rejects focused hosts in nested occurrences and after attachment is released", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML =
    '<div tabindex="0" data-content>outer</div><div data-panel><div tabindex="0" data-content>inner</div></div>';
  document.body.append(root);
  const hosts = root.querySelectorAll<HTMLElement>("[data-content]");
  const occurrence = new BrowserInputRoot(root);
  try {
    hosts[1]!.focus();
    expect(occurrence.captureFocusedTextHost("[data-content]", "[data-panel]")).toBeUndefined();
    hosts[0]!.focus();
    expect(occurrence.captureFocusedTextHost("[data-content]", "[data-panel]")).toBeDefined();
    occurrence.detach();
    expect(occurrence.captureFocusedTextHost("[data-content]", "[data-panel]")).toBeUndefined();
  } finally {
    occurrence.detach();
    root.remove();
  }
});

it("does not restore a caret after the captured host moves into a nested occurrence", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML = '<div tabindex="0" data-content>outer</div><div data-panel></div>';
  document.body.append(root);
  const content = root.querySelector<HTMLElement>("[data-content]")!;
  const nested = root.querySelector<HTMLElement>("[data-panel]")!;
  const occurrence = new BrowserInputRoot(root);
  try {
    content.focus();
    const host = occurrence.captureFocusedTextHost("[data-content]", "[data-panel]")!;
    nested.append(content);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    host.restoreCaret(2);
    expect(selection.rangeCount).toBe(0);
  } finally {
    occurrence.detach();
    root.remove();
  }
});

it("does not restore a caret after focus or the attachment changes", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML = '<div tabindex="0" data-content>first</div><div tabindex="0" data-content>second</div>';
  document.body.append(root);
  const hosts = root.querySelectorAll<HTMLElement>("[data-content]");
  const occurrence = new BrowserInputRoot(root);
  const selection = document.getSelection()!;
  try {
    hosts[0]!.focus();
    const first = occurrence.captureFocusedTextHost("[data-content]", "[data-panel]")!;
    hosts[1]!.focus();
    selection.removeAllRanges();
    first.restoreCaret(2);
    expect(selection.rangeCount).toBe(0);
    const second = occurrence.captureFocusedTextHost("[data-content]", "[data-panel]")!;
    occurrence.detach();
    second.restoreCaret(2);
    expect(selection.rangeCount).toBe(0);
  } finally {
    occurrence.detach();
    selection.removeAllRanges();
    root.remove();
  }
});
