/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { capturePresetPreview } from "../preset-preview";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("binds preview creation to the exact panel Root and surface identity", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const first = new BrowserInputRoot(host);
  const second = new BrowserInputRoot(host);
  const panel = { inputRoot: first };
  const identity = getBrowserElementIdentity(host);
  try {
    const create = capturePresetPreview(panel, host, identity, "fixture")!;
    const preview = create()!;
    expect(document.querySelector('[data-kind="fixture"]')).not.toBeNull();
    preview.remove();
    panel.inputRoot = second;
    expect(create()).toBeUndefined();
    expect(document.querySelector('[data-kind="fixture"]')).toBeNull();
    expect(capturePresetPreview(panel, host, {}, "fixture")).toBeUndefined();
  } finally {
    first.detach();
    second.detach();
    host.remove();
  }
});

it("removes a preview when the panel Root changes during its mounting", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const first = new BrowserInputRoot(host);
  const second = new BrowserInputRoot(host);
  const panel = { inputRoot: first };
  const create = capturePresetPreview(panel, host, getBrowserElementIdentity(host), "fixture")!;
  const append = document.body.append.bind(document.body);
  const spy = jestApi.spyOn(document.body, "append").mockImplementation((...nodes) => {
    append(...nodes);
    panel.inputRoot = second;
  });
  try {
    expect(create()).toBeUndefined();
    expect(document.querySelector('[data-kind="fixture"]')).toBeNull();
  } finally {
    spy.mockRestore();
    first.detach();
    second.detach();
    host.remove();
  }
});

it("removes a mounted preview when its Root ownership check throws", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = new BrowserInputRoot(host);
  const panel = { inputRoot: root };
  const create = capturePresetPreview(panel, host, getBrowserElementIdentity(host), "fixture")!;
  let fail = false;
  const isAttached = root.isAttached.bind(root);
  const check = jestApi.spyOn(root, "isAttached").mockImplementation(() => {
    if (fail) {
      throw new Error("ownership failed");
    }
    return isAttached();
  });
  const append = document.body.append.bind(document.body);
  const spy = jestApi.spyOn(document.body, "append").mockImplementation((...nodes) => {
    append(...nodes);
    fail = true;
  });
  try {
    expect(create).toThrow("ownership failed");
    expect(document.querySelector('[data-kind="fixture"]')).toBeNull();
  } finally {
    spy.mockRestore();
    check.mockRestore();
    root.detach();
    host.remove();
  }
});
