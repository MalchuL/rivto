import { captureTestInputRegion } from "../../../test-utils/capture-test-input-region";
import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockEditorController } from "../../block-editor-controller";
import { BlockDragExtension } from "../block-drag-extension";

/**
 * Delivers a primary pointer input to the test occurrence.
 *
 * @param target - Handle or window receiving the input.
 * @param type - Pointer event name.
 * @param x - Viewport X coordinate.
 * @returns Synchronous input delivery has completed.
 */
function pointer(target: EventTarget, type: string, x: number): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 100,
    buttons: 1,
  });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  target.dispatchEvent(event);
}

it("does not cancel a replacement gesture when the old permission callback throws", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
  document.body.append(root);
  const handle = root.querySelector("button")!;
  let detach = () => {};
  const failure = new Error("old gesture failed");
  editor.extensions.register(
    "drag",
    new BlockDragExtension(
      {
        canMove: () => {
          detach();
          detach = attachTestRoot(editor, root);
          pointer(handle, "pointerdown", 100);
          throw failure;
        },
        moveBlocks: () => true,
      },
      {
        resolve: () => ({
          anchor: captureTestInputRegion(root, root, () => root.isConnected),
          destination: { kind: "inside", parentId: null },
        }),
      },
    ),
  );
  const onError = jest.fn((event: ErrorEvent) => event.preventDefault());
  window.addEventListener("error", onError);
  detach = attachTestRoot(editor, root);
  try {
    pointer(handle, "pointerdown", 100);
    pointer(window, "pointermove", 110);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].error).toBe(failure);
    expect(editor.pointer.acquire()).toBeUndefined();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const release = editor.pointer.acquire();
    expect(release).toBeDefined();
    release?.();
  } finally {
    window.removeEventListener("error", onError);
    detach();
    editor.destroy();
    root.remove();
  }
});
