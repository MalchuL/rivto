import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockDragPreview } from "../block-drag-preview";

it("attempts marker cleanup when preview removal fails and retains both failures", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const preview = new BlockDragPreview(new BrowserInputRoot(root));
  preview.create(1, []);
  const element = root.firstElementChild!;
  const remove = element.remove.bind(element);
  const removalFailure = new Error("preview removal failed");
  const markerFailure = new Error("marker cleanup failed");
  const removePreview = jest.spyOn(element, "remove").mockImplementation(() => {
    remove();
    throw removalFailure;
  });
  const removeAttribute = jest
    .spyOn(document.documentElement, "removeAttribute")
    .mockImplementation(() => {
      throw markerFailure;
    });
  try {
    let failure: unknown;
    try {
      preview.clear();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([removalFailure, markerFailure]);
    expect(removeAttribute).toHaveBeenCalledWith("data-block-drag-active");
  } finally {
    removePreview.mockRestore();
    removeAttribute.mockRestore();
    preview.clear();
    root.remove();
  }
});
