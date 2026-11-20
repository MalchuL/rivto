/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { captureLabelText } from "../capture-label-text";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("captures only a label owned by the current mounted Root", () => {
  const surface = document.createElement("div");
  const label = document.createElement("div");
  const foreign = document.createElement("div");
  label.textContent = "owned";
  surface.append(label);
  document.body.append(surface, foreign);
  const root = new BrowserInputRoot(surface);
  const panel = { mountedRoot: root };
  try {
    expect(captureLabelText(panel, getBrowserElementIdentity(label))?.isCurrent()).toBe(true);
    expect(captureLabelText(panel, getBrowserElementIdentity(foreign))).toBeUndefined();
    root.detach();
    expect(captureLabelText(panel, getBrowserElementIdentity(label))).toBeUndefined();
  } finally {
    root.detach();
    surface.remove();
    foreign.remove();
  }
});

it("discards a text capability when Root changes during capture", () => {
  const surface = document.createElement("div");
  const label = document.createElement("div");
  surface.append(label);
  document.body.append(surface);
  const first = new BrowserInputRoot(surface);
  const second = new BrowserInputRoot(surface);
  const panel = { mountedRoot: first };
  const capture = first.captureEditableTextByIdentity.bind(first);
  const spy = jestApi
    .spyOn(first, "captureEditableTextByIdentity")
    .mockImplementation((...args) => {
      const target = capture(...args);
      panel.mountedRoot = second;
      return target;
    });
  try {
    expect(captureLabelText(panel, getBrowserElementIdentity(label))).toBeUndefined();
    expect(captureLabelText(panel, getBrowserElementIdentity(label))).toBeDefined();
  } finally {
    spy.mockRestore();
    first.detach();
    second.detach();
    surface.remove();
  }
});
