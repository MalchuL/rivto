import { RegionIdentity } from "@chulane/rivto-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { getDropTargetIdentity } from "../browser/drop-target-identity";

it("preserves a forwarded identity and converts ordinary DOM targets", () => {
  const element = document.createElement("div");
  const identity = getBrowserElementIdentity(element);
  expect(getDropTargetIdentity(element)).toBe(identity);
  expect(getDropTargetIdentity(identity)).toBe(identity);
});

it("converts a DOM target from its owning window", () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  try {
    const element = frame.contentDocument!.createElement("div");
    expect(getDropTargetIdentity(element)).toBe(getBrowserElementIdentity(element));
  } finally {
    frame.remove();
  }
});

it("converts an element in a detached document without a window", () => {
  const detachedDocument = document.implementation.createHTMLDocument("detached");
  const element = detachedDocument.createElement("div");
  expect(detachedDocument.defaultView).toBeNull();
  expect(getDropTargetIdentity(element)).toBe(getBrowserElementIdentity(element));
});

it("converts an element from a removed window without treating a lookalike as an element", () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const element = frame.contentDocument!.createElement("div");
  frame.remove();
  expect(getDropTargetIdentity(element)).toBe(getBrowserElementIdentity(element));
  const identity = Object.assign(new RegionIdentity(), { nodeType: 1 });
  expect(getDropTargetIdentity(identity)).toBe(identity);
});

it("rejects a ref value that is neither a browser element nor a region identity", () => {
  expect(() => getDropTargetIdentity({ nodeType: 1 })).toThrow(
    "Drop targets require an element or region identity",
  );
});
