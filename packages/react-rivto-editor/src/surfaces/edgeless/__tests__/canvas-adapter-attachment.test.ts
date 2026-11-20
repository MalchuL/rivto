/** @jest-environment ./jest-browser-environment.mjs */
import { Canvas } from "@chulane/rivto-edgeless";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessCanvasAdapter } from "../canvas-adapter";

it("ignores card-mount requests before connection and after disconnection", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const source = new EdgelessCanvasAdapter(panel);
  const canvas = new Canvas();
  const root = new BrowserInputRoot(document.createElement("div"));
  try {
    expect(() => source.mountBlocks(["missing"], root)).not.toThrow();
    const disconnect = source.connect(canvas);
    disconnect();
    expect(() => source.mountBlocks(["missing"], root)).not.toThrow();
  } finally {
    root.detach();
    canvas.dispose();
    await panel.editor.destroy();
    await core.destroy();
  }
});

it("releases a temporary navigation pin when its canvas source disconnects", async () => {
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ id: "offscreen", type: "paragraph" });
  core.elements.insertElement({
    id: "offscreen-card",
    type: "block",
    frame: { x: 10000, y: 10000, width: 200, height: 100 },
    zIndex: 0,
    props: { startBlockId: block.id, endBlockId: block.id },
  });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  panel.setRoot(root);
  const canvas = new Canvas();
  const source = new EdgelessCanvasAdapter(panel);
  const disconnect = source.connect(canvas);
  let disconnectCurrent = disconnect;
  let pending: FrameRequestCallback | undefined;
  const frame = jestApi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending = callback;
    return 1;
  });
  try {
    source.mountBlocks([block.id], panel.mountedRoot!);
    expect(canvas.visible.get()).toContain("offscreen-card");
    expect(pending).toBeDefined();
    const staleFrame = pending;
    disconnect();
    expect(canvas.visible.get()).not.toContain("offscreen-card");
    const disconnectReplacement = source.connect(canvas);
    disconnectCurrent = disconnectReplacement;
    source.mountBlocks([block.id], panel.mountedRoot!);
    expect(canvas.visible.get()).toContain("offscreen-card");
    staleFrame?.(0);
    expect(canvas.visible.get()).toContain("offscreen-card");
    disconnectReplacement();
    expect(canvas.visible.get()).not.toContain("offscreen-card");
    const disconnectDuringSchedule = source.connect(canvas);
    disconnectCurrent = disconnectDuringSchedule;
    const occurrence = panel.mountedRoot!;
    const cancelFrame = jestApi.fn();
    occurrence.captureFrameClock = () => ({
      now: () => 0,
      requestFrame: () => {
        disconnectDuringSchedule();
        return cancelFrame;
      },
    });
    source.mountBlocks([block.id], occurrence);
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(canvas.visible.get()).not.toContain("offscreen-card");
    disconnectCurrent = source.connect(canvas);
    occurrence.captureFrameClock = () => ({
      now: () => 0,
      requestFrame: () => {
        throw new Error("frame scheduling failed");
      },
    });
    expect(() => source.mountBlocks([block.id], occurrence)).toThrow("frame scheduling failed");
    expect(canvas.visible.get()).not.toContain("offscreen-card");
  } finally {
    pending?.(0);
    frame.mockRestore();
    disconnectCurrent();
    canvas.dispose();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
