import { BlockDragPreview } from "../block-drag-preview";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("keeps the cursor marker until every occurrence removes its preview", () => {
  const firstRoot = document.createElement("div");
  const secondRoot = document.createElement("div");
  document.body.append(firstRoot, secondRoot);
  const first = new BlockDragPreview(new BrowserInputRoot(firstRoot));
  const second = new BlockDragPreview(new BrowserInputRoot(secondRoot));
  try {
    first.create(2, [{ text: "<b>inert</b>", depth: 8 }]);
    second.create(1, []);
    first.move(10, 20);
    const element = firstRoot.firstElementChild as HTMLElement;
    expect(element.style.transform).toBe("translate3d(22px, 32px, 0)");
    expect(element.querySelector("b")).toBeNull();
    expect(element.firstElementChild?.textContent).toBe("<b>inert</b>");
    expect((element.firstElementChild as HTMLElement).style.marginInlineStart).toBe("36px");
    first.remove();
    first.releaseDocumentMarker();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
    second.remove();
    second.releaseDocumentMarker();
    expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(false);
  } finally {
    firstRoot.remove();
    secondRoot.remove();
    document.documentElement.removeAttribute("data-block-drag-active");
  }
});

it("retains partial setup for cleanup when attaching the preview fails", () => {
  const root = document.createElement("div");
  const preview = new BlockDragPreview(new BrowserInputRoot(root));
  jest.spyOn(root, "append").mockImplementation(() => {
    throw new Error("attachment failed");
  });
  expect(() => preview.create(1, [])).toThrow("attachment failed");
  expect(preview.isCreated()).toBe(true);
  expect(() => preview.remove()).not.toThrow();
  expect(() => preview.releaseDocumentMarker()).not.toThrow();
});
