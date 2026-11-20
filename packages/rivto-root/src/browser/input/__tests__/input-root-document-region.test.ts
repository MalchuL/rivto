import { BrowserInputRoot } from "../browser-input-root";
import { createBrowserInputRegion } from "../input-region";

it("compares connected occurrences and rejects disconnected or replaced attachments", () => {
  const source = document.createElement("div");
  const receiver = document.createElement("div");
  document.body.append(source, receiver);
  let current = true;
  const root = new BrowserInputRoot(source, () => current);
  const region = createBrowserInputRegion(receiver, receiver, () => true);
  try {
    expect(root.isInSameDocument(region)).toBe(true);
    receiver.remove();
    expect(root.isInSameDocument(region)).toBe(false);
    document.body.append(receiver);
    current = false;
    expect(root.isInSameDocument(region)).toBe(false);
  } finally {
    source.remove();
    receiver.remove();
  }
});

it("rejects another document and a source invalidated while checking the receiver", () => {
  const source = document.createElement("div");
  const receiver = document.createElement("div");
  const other = document.implementation.createHTMLDocument("other");
  document.body.append(source);
  other.body.append(receiver);
  let current = true;
  const root = new BrowserInputRoot(source, () => current);
  let invalidate = false;
  const region = createBrowserInputRegion(receiver, receiver, () => {
    if (invalidate) {
      current = false;
    }
    return true;
  });
  try {
    expect(root.isInSameDocument(region)).toBe(false);
    document.body.append(receiver);
    invalidate = true;
    expect(root.isInSameDocument(region)).toBe(false);
  } finally {
    source.remove();
    receiver.remove();
  }
});
