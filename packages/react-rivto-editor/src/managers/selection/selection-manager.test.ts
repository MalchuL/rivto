import { createTestReactEditor as createReactEditor } from "../../test-utils";
import { createCaretSelection, createTextSelection, createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor as createEditor } from "../../test-utils";
import { type EditorRuntime } from "../../editor-runtime";

describe("ReactSelectionManager", () => {
  test("reports pending restoration only for the current DOM root", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    } } }) as unknown as HTMLElement;
    let currentRoot = root;
    editorView.events.getRoot = () => currentRoot;
    const cancel = editorView.selection.scheduleIfSelectionUnchanged(() => {});
    expect(editorView.selection.hasPendingSelectionCallback).toBe(true);
    currentRoot = {} as HTMLElement;
    expect(editorView.selection.hasPendingSelectionCallback).toBe(false);
    currentRoot = root;
    expect(editorView.selection.hasPendingSelectionCallback).toBe(true);
    cancel();
    expect(editorView.selection.hasPendingSelectionCallback).toBe(false);
    editorView.destroy();
    editor.destroy();
  });
  test.each(["block", "edgeless"] as const)("keeps only the newest callback when cancellation schedules work in %s", async (mode) => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    editorView.mode.set(mode);
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (frame: number) => { frames.delete(frame); },
    } } }) as unknown as HTMLElement;
    editorView.events.getRoot = () => root;
    const calls: string[] = [];
    const oldCancel = editorView.selection.scheduleIfSelectionUnchanged(() => { calls.push("old"); }, () => {
      editorView.selection.scheduleIfSelectionUnchanged(() => { calls.push("newest"); });
    });
    const outerCancel = editorView.selection.scheduleIfSelectionUnchanged(() => { calls.push("outer"); }, () => {
      calls.push("outer cancelled");
    });
    // Cleanup may schedule newer work; stale handles must leave that work intact.
    expect(frames.size).toBe(1);
    expect(calls).toEqual(["outer cancelled"]);
    oldCancel();
    outerCancel();
    expect(editorView.selection.hasPendingSelectionCallback).toBe(true);
    for (const callback of frames.values()) callback(0);
    expect(calls).toEqual(["outer cancelled", "newest"]);
    expect(editorView.selection.hasPendingSelectionCallback).toBe(false);
    editorView.destroy();
    editor.destroy();
  });

  test.each(["replace", "clear", "away-and-back", "empty-away-and-back", "cancel", "destroy", "native-input", "pointer", "key", "focus", "equivalent"] as const)(
    "guards deferred restoration after %s",
    async (change) => {
      const editor = await createEditor();
      const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
      const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }).id;
      const editorView = createReactEditor({ editor });
      let frame: FrameRequestCallback | undefined;
      const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: {
        requestAnimationFrame: (callback: FrameRequestCallback) => { frame = callback; return 1; },
        cancelAnimationFrame: () => { frame = undefined; },
      } } }) as unknown as HTMLElement;
      editorView.events.getRoot = () => root;
      editor.selection.set(createCaretSelection(first, 1));
      if (change === "empty-away-and-back") editor.selection.clear();
      let restorationCount = 0;
      let cancellationCount = 0;
      const callback = () => { restorationCount++; };
      const onCancel = () => {
        cancellationCount++;
        // Manager cleanup must run while extension-owned dependencies are usable.
        editorView.runtime.extensions.assertActive();
      };
      // The counter stands in for caret/selection work to verify invocation and cancellation.
      const cancel = editorView.selection.scheduleIfSelectionUnchanged(callback, onCancel);
      expect(editorView.selection.hasPendingSelectionCallback).toBe(true);
      if (change === "replace" || change === "away-and-back") editor.selection.set(createCaretSelection(second, 0));
      if (change === "clear") editor.selection.clear();
      if (change === "empty-away-and-back") {
        editor.selection.set(createCaretSelection(second, 0));
        editor.selection.clear();
      }
      if (change === "equivalent" || change === "away-and-back") editor.selection.set(createCaretSelection(first, 1));
      if (change === "cancel") cancel();
      if (change === "native-input") root.dispatchEvent(new Event("beforeinput"));
      if (change === "pointer") root.dispatchEvent(new Event("pointerdown"));
      if (change === "key") root.dispatchEvent(new Event("keydown"));
      if (change === "focus") {
        Object.assign(root, { contains: () => false });
        root.dispatchEvent(Object.assign(new Event("focusout"), { relatedTarget: new EventTarget() }));
      }
      if (change === "destroy") editorView.destroy();
      frame?.(0);
      expect(restorationCount).toBe(change === "equivalent" ? 1 : 0);
      expect(cancellationCount).toBe(change === "equivalent" ? 0 : 1);
      expect(editorView.selection.hasPendingSelectionCallback).toBe(false);
      cancel();
      editorView.destroy();
      editor.destroy();
      expect(cancellationCount).toBe(change === "equivalent" ? 0 : 1);
    },
  );

  test("delegates text deletion and whole-block selection to core", async () => {
    const editor = await createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "BeforeAfter" }).id;
    const editorView = createReactEditor({ editor });
    const text = createTextSelection(
      [{ id, length: 11 }],
      { blockId: id, offset: 6 },
      { blockId: id, offset: 0 },
    )!;
    editorView.selection.set(text);
    expect(editorView.selection.get()).toEqual(editor.selection.get());
    editorView.selection.delete();
    expect(editor.blocks.getBlockNode(id)?.content).toBe("After");
    expect(editorView.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 0, end: 0 }],
    });
    editor.history.undo();
    expect(editor.blocks.getBlockNode(id)?.content).toBe("BeforeAfter");
    const block = createStructuralSelection([id]);
    editorView.selection.set(block);
    expect(editor.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 0, end: -1 }],
      anchorBlockId: id,
      focusBlockId: id,
    });
    editor.selection.clear();
    expect(editorView.selection.get()).toBeUndefined();
    editorView.destroy();
    editor.destroy();
  });

  test("shares text editing with core and tolerates a missing active surface", async () => {
    const editor = await createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "text" }).id;
    const editorView = createReactEditor({ editor });
    const manager = editorView.selection;
    const selection = createCaretSelection(id, 1);

    manager.set(selection);
    expect(manager.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 1, end: 1 }],
      reversed: false,
    });
    expect(editor.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 1, end: 1 }],
    });
    expect(manager.readDOM()).toBeUndefined();
    expect(manager.restoreDOM()).toBe(false);
    manager.clear();
    expect(editor.selection.get()).toBeUndefined();
    editorView.destroy();
    editor.destroy();
  });
});
