import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockDragPreview } from "../block-drag-preview";

it("cleans the original document marker when the preview moves with its occurrence", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const preview = new BlockDragPreview(new BrowserInputRoot(root));
  const other = document.implementation.createHTMLDocument("other");
  try {
    preview.create(1, []);
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
    other.body.append(root);
    preview.remove();
    preview.releaseDocumentMarker();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(false);
  } finally {
    preview.remove();
    preview.releaseDocumentMarker();
    root.remove();
    document.documentElement.removeAttribute("data-block-drag-active");
  }
});

it("does not mark the document when overlay attachment becomes temporarily inactive", () => {
  const root = document.createElement("div");
  document.body.append(root);
  let checks = 0;
  const occurrence = new BrowserInputRoot(root, () => ++checks !== 2);
  const preview = new BlockDragPreview(occurrence);
  try {
    preview.create(1, []);
    expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(false);
    preview.create(1, []);
    expect(root.querySelector(".rivto-block-drag-preview")).not.toBeNull();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
  } finally {
    preview.clear();
    root.remove();
    document.documentElement.removeAttribute("data-block-drag-active");
  }
});

it("removes the overlay when its document marker can no longer be set", () => {
  const root = document.createElement("div");
  document.body.append(root);
  let checks = 0;
  const occurrence = new BrowserInputRoot(root, () => ++checks !== 4);
  const preview = new BlockDragPreview(occurrence);
  try {
    preview.create(1, []);
    expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(false);
    preview.create(1, []);
    expect(root.querySelector(".rivto-block-drag-preview")).not.toBeNull();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
  } finally {
    preview.clear();
    root.remove();
    document.documentElement.removeAttribute("data-block-drag-active");
  }
});
