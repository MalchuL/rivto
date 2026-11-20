import { BlockDragPreview } from "../block-drag-preview";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("keeps the document drag marker until the last occurrence removes its preview", () => {
  const firstRoot = document.createElement("div");
  const secondRoot = document.createElement("div");
  document.body.append(firstRoot, secondRoot);
  const first = new BlockDragPreview(new BrowserInputRoot(firstRoot));
  const second = new BlockDragPreview(new BrowserInputRoot(secondRoot));
  try {
    first.create(1, [{ text: "first", depth: 0 }]);
    second.create(1, [{ text: "second", depth: 0 }]);
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
    first.remove();
    first.releaseDocumentMarker();
    expect(firstRoot.querySelector(".rivto-block-drag-preview")).toBeNull();
    expect(secondRoot.querySelector(".rivto-block-drag-preview")).not.toBeNull();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
    second.remove();
    second.releaseDocumentMarker();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(false);
  } finally {
    first.remove();
    second.remove();
    first.releaseDocumentMarker();
    firstRoot.remove();
    secondRoot.remove();
  }
});

it("keeps the document drag marker when preview removal fails", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const preview = new BlockDragPreview(new BrowserInputRoot(root));
  try {
    preview.create(1, []);
    const element = root.querySelector<HTMLElement>(".rivto-block-drag-preview")!;
    const remove = jest.spyOn(element, "remove").mockImplementation(() => {
      throw new Error("removal failed");
    });
    expect(() => preview.remove()).toThrow("removal failed");
    preview.releaseDocumentMarker();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
    remove.mockRestore();
  } finally {
    preview.remove();
    preview.releaseDocumentMarker();
    root.remove();
  }
});
