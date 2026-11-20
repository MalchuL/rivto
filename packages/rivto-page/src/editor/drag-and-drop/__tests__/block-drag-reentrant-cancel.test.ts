import { captureTestInputRegion } from "../../../test-utils/capture-test-input-region";
import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockEditorController } from "../../block-editor-controller";
import { BlockDragExtension } from "../block-drag-extension";

/**
 * Starts a handle gesture and moves it past the activation threshold.
 *
 * @param root - Mounted source containing the drag handle.
 * @returns Both pointer deliveries have completed synchronously.
 */
function startDrag(root: HTMLElement): void {
  for (const [receiver, type, x] of [
    [root.querySelector("button")!, "pointerdown", 100],
    [window, "pointermove", 110],
  ] as const) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: 100,
      buttons: 1,
    });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    receiver.dispatchEvent(event);
  }
}

/**
 * Resolves the fixture target and optionally detaches during resolution.
 *
 * @param target - Mounted target element used by the fixture.
 * @param stage - Callback selected to detach the source.
 * @param detach - Disposer for the source attachment.
 * @returns A candidate inside destination for the drag gesture.
 */
function resolveTarget(target: HTMLElement, stage: string, detach: () => void) {
  if (stage === "target") {
    detach();
  }
  return {
    anchor: captureTestInputRegion(target, target, () => true),
    destination: { kind: "inside" as const, parentId: null },
  };
}

/**
 * Detaches the fixture during the selected presentation attribute write.
 *
 * @param root - Source occurrence containing the dragged block.
 * @param target - Candidate receiving the drop marker.
 * @param stage - Presentation write to interrupt, or a non-presentation stage.
 * @param detach - Current source attachment disposer.
 * @returns Restores the observed DOM method when the test ends.
 */
function detachDuringMarker(
  root: HTMLElement,
  target: HTMLElement,
  stage: string,
  detach: () => void,
): () => void {
  if (stage === "overlay") {
    const append = root.append.bind(root);
    const spy = jest.spyOn(root, "append").mockImplementation((...nodes) => {
      detach();
      append(...nodes);
    });
    return () => spy.mockRestore();
  }
  let element: HTMLElement | undefined;
  let attribute: string | undefined;
  if (stage === "feedback") {
    element = target;
    attribute = "data-block-drop-active";
  } else if (stage === "source") {
    element = root.querySelector<HTMLElement>("[data-block-id]")!;
    attribute = "data-dragging";
  } else if (stage === "marker") {
    element = document.documentElement;
    attribute = "data-block-drag-active";
  }
  if (!element) {
    return () => {};
  }
  const write = element.setAttribute.bind(element);
  const spy = jest.spyOn(element, "setAttribute").mockImplementation((name, value) => {
    if (name === attribute) {
      detach();
    }
    write(name, value);
  });
  return () => spy.mockRestore();
}

it.each(["target", "permission", "preview", "feedback", "source", "overlay", "marker"])(
  "does not recreate drag feedback after %s detaches the source",
  (stage) => {
    const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
    const root = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    root.innerHTML =
      '<div data-block-id="source"><button data-block-drag-handle></button></div><div id="target"></div>';
    document.body.append(root);
    const target = root.querySelector<HTMLElement>("#target")!;
    let detach = () => {};
    const restoreMarker = detachDuringMarker(root, target, stage, () => detach());
    const canMove = jest.fn(() => {
      if (stage === "permission") {
        detach();
      }
      return true;
    });
    editor.extensions.register(
      "drag",
      new BlockDragExtension(
        {
          canMove,
          getPreview: () => {
            if (stage === "preview") {
              detach();
            }
            return [];
          },
          moveBlocks: () => true,
        },
        {
          resolve: () => resolveTarget(target, stage, detach),
        },
      ),
    );
    detach = attachTestRoot(editor, root);
    try {
      startDrag(root);
      expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
      expect(target.hasAttribute("data-block-drop-active")).toBe(false);
      expect(root.querySelector("[data-dragging]")).toBeNull();
      expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(false);
      expect(canMove).toHaveBeenCalledTimes(stage === "target" ? 0 : 1);
    } finally {
      restoreMarker();
      editor.destroy();
      root.remove();
      document.documentElement.removeAttribute("data-block-drag-active");
    }
  },
);
