import { captureTestInputRegion } from "../../../test-utils/capture-test-input-region";
import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockDragExtension } from "../block-drag-extension";

/**
 * Sends pointer-shaped input through the editor's browser listeners.
 *
 * @param target - Element or window receiving the input.
 * @param type - Pointer phase to dispatch.
 * @param x - Viewport X coordinate in CSS pixels.
 * @returns Registered listeners have run synchronously.
 */
function pointer(target: EventTarget, type: string, x: number): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 100,
    buttons: type === "pointerup" ? 0 : 1,
  });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  target.dispatchEvent(event);
}

it("does not focus a replacement occurrence after a drop detaches its original root", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  root.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
  document.body.append(root);
  const focus = jest.spyOn(root, "focus");
  let detach = () => {};
  const moveBlocks = jest.fn(() => {
    detach();
    detach = attachTestRoot(editor, root);
    return true;
  });
  editor.extensions.register(
    "drag",
    new BlockDragExtension(
      { canMove: () => true, moveBlocks },
      {
        resolve: () => ({
          anchor: captureTestInputRegion(root, root, () => true),
          destination: { kind: "inside", parentId: null },
        }),
      },
    ),
  );
  detach = attachTestRoot(editor, root);
  try {
    pointer(root.querySelector("button")!, "pointerdown", 100);
    pointer(window, "pointermove", 110);
    pointer(window, "pointerup", 110);
    expect(moveBlocks).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    detach();
    editor.destroy();
    root.remove();
  }
});

/**
 * Creates a receiving scope whose detachment can be triggered during a drop.
 *
 * @param root - Connected element representing the receiving occurrence.
 * @returns Scope and a function that notifies its current detach subscriber.
 */
function receiverScope(root: HTMLElement) {
  let listener = () => {};
  return {
    scope: {
      region: captureTestInputRegion(root, root, () => root.isConnected),
      focus: jest.fn(() => root.focus({ preventScroll: true })),
      /**
       * Retains the active gesture's receiving-occurrence cleanup callback.
       *
       * @param callback - Callback notified when the receiver detaches.
       * @returns Disposer clearing the retained callback.
       */
      onDetach(callback: () => void) {
        listener = callback;
        return () => {
          listener = () => {};
        };
      },
    },
    /**
     * Delivers the retained detachment notification.
     *
     * @returns The active callback has run, if one remains registered.
     */
    notifyDetach() {
      listener();
    },
  };
}

it("does not focus a receiver that detaches while the drop is committed", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
  const receiver = document.createElement("div");
  receiver.tabIndex = 0;
  document.body.append(root, receiver);
  const focus = jest.spyOn(receiver, "focus");
  const { scope, notifyDetach } = receiverScope(receiver);
  const moveBlocks = jest.fn(() => {
    notifyDetach();
    return true;
  });
  editor.extensions.register(
    "drag",
    new BlockDragExtension(
      { canMove: () => true, moveBlocks },
      {
        resolve: () => ({
          anchor: captureTestInputRegion(receiver, receiver, () => true),
          destination: { kind: "inside", parentId: null },
          scope,
        }),
      },
    ),
  );
  const detach = attachTestRoot(editor, root);
  try {
    pointer(root.querySelector("button")!, "pointerdown", 100);
    pointer(window, "pointermove", 110);
    pointer(window, "pointerup", 110);
    expect(moveBlocks).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    detach();
    editor.destroy();
    root.remove();
    receiver.remove();
  }
});

it("focuses the still-attached source after a successful local drop", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  root.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
  document.body.append(root);
  const moveBlocks = jest.fn(() => true);
  editor.extensions.register(
    "drag",
    new BlockDragExtension(
      { canMove: () => true, moveBlocks },
      {
        resolve: () => ({
          anchor: captureTestInputRegion(root, root, () => true),
          destination: { kind: "inside", parentId: null },
        }),
      },
    ),
  );
  const detach = attachTestRoot(editor, root);
  try {
    pointer(root.querySelector("button")!, "pointerdown", 100);
    pointer(window, "pointermove", 110);
    pointer(window, "pointerup", 110);
    expect(moveBlocks).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(root);
  } finally {
    detach();
    editor.destroy();
    root.remove();
  }
});
