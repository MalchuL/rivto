/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { focusBlockModalToggle } from "../block-modal-focus";

it("focuses the toggle owned by the parent occurrence and skips nested panels", () => {
  const element = document.createElement("div");
  element.dataset.rivtoPanel = "";
  element.innerHTML =
    '<div><div data-rivto-panel><button class="toggle">nested</button></div><button class="toggle">parent</button></div>';
  document.body.append(element);
  const inline = element.firstElementChild!;
  const toggle = element.querySelectorAll<HTMLButtonElement>(".toggle")[1]!;
  const root = new BrowserInputRoot(element);
  const panel = { mountedRoot: root };
  const nativeFocus = toggle.focus.bind(toggle);
  let focusCount = 0;
  let focusOptions: FocusOptions | undefined;
  toggle.focus = (options) => {
    focusCount += 1;
    focusOptions = options;
    nativeFocus(options);
  };
  try {
    focusBlockModalToggle(panel, getBrowserElementIdentity(inline), ".toggle");
    expect(document.activeElement).toBe(toggle);
    expect(focusOptions).toEqual({ preventScroll: false });
    root.detach();
    focusCount = 0;
    focusBlockModalToggle(panel, getBrowserElementIdentity(inline), ".toggle");
    expect(focusCount).toBe(0);
  } finally {
    root.detach();
    element.remove();
  }
});

it("does not focus a toggle if its parent Root is replaced during lookup", () => {
  const element = document.createElement("div");
  element.innerHTML = '<div><button class="toggle">parent</button></div>';
  document.body.append(element);
  const inline = element.firstElementChild!;
  const toggle = element.querySelector("button")!;
  const root = new BrowserInputRoot(element);
  const replacement = new BrowserInputRoot(element);
  const panel = { mountedRoot: root };
  const capture = root.captureRegionByIdentity.bind(root);
  root.captureRegionByIdentity = (identity, isCurrent) => {
    const region = capture(identity, isCurrent);
    panel.mountedRoot = replacement;
    return region;
  };
  let focusCount = 0;
  toggle.focus = () => {
    focusCount += 1;
  };
  try {
    focusBlockModalToggle(panel, getBrowserElementIdentity(inline), ".toggle");
    expect(focusCount).toBe(0);
  } finally {
    root.detach();
    replacement.detach();
    element.remove();
  }
});
