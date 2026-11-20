/** @jest-environment ./jest-browser-environment.mjs */
import { Canvas, type Point } from "@chulane/rivto-edgeless";
import type { MouseInput } from "@chulane/rivto-root";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { defaultWritingBlockExtension } from "../../../extensions/built-ins/built-ins";
import { separatorBlockExtension } from "../../../extensions/built-ins/separator/separator-block";
import { EdgelessSurfaceController } from "../edgeless-surface-controller";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
const event: MouseInput<"dblclick"> = {
  type: "dblclick",
  target: {
    captureTargetHit: () => undefined,
    captureUncapturedPointerHit: () => undefined,
    isRoot: () => false,
    belongsToRoot: () => true,
    hasAncestor: () => false,
    closestAncestorMatches: () => undefined,
    closestAncestorsAreSame: () => false,
    closestAncestorIsEditable: () => undefined,
    ancestorAttribute: () => undefined,
    ancestorAttributeWithinRoot: () => undefined,
    hasAncestorWithinOwner: () => false,
  },
  button: 0,
  buttons: 0,
  detail: 2,
  clientX: 0,
  clientY: 0,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault: () => {},
  stopPropagation: () => {},
};
const viewport = { clientToWorld: ({ x, y }: Point) => ({ x, y }) };

it("cancels card focus after the occurrence changes and focuses a current card", async () => {
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({
    editor: core,
    extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
  });
  const canvas = new Canvas();
  const controller = new EdgelessSurfaceController(panel, canvas, false, 400);
  const oldRoot = document.createElement("div");
  const newRoot = document.createElement("div");
  oldRoot.dataset.rivtoBlockEditor = "true";
  newRoot.dataset.rivtoBlockEditor = "true";
  const originalFrame = globalThis.requestAnimationFrame;
  let scheduled: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = (callback) => {
    scheduled = callback;
    return 1;
  };
  const focus = jestApi.spyOn(panel.selection, "focusBlock").mockReturnValue(true);
  try {
    panel.setRoot(oldRoot);
    controller.createBlockAt(event, viewport);
    const stale = scheduled!;
    panel.setRoot(newRoot);
    stale(0);
    expect(focus).not.toHaveBeenCalled();

    controller.createBlockAt(event, viewport);
    const writingId = panel.selection.get()?.focusBlockId;
    expect(writingId).toBeTruthy();
    scheduled!(0);
    expect(focus).toHaveBeenCalledWith(writingId, 0);
  } finally {
    focus.mockRestore();
    globalThis.requestAnimationFrame = originalFrame;
    canvas.dispose();
    await panel.editor.destroy();
    await core.destroy();
  }
});
