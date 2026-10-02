import { createCaretSelection, createTextSelection, createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor as createEditor } from "../../test-utils";
import { createReactEditor, type ReactEditorImpl } from "../../react-editor";

describe("ReactSelectionManager", () => {
  test.each(["block", "edgeless"] as const)("keeps only the newest callback when cancellation schedules work in %s", (mode) => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    reactEditor.mode.set(mode);
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const root = { ownerDocument: { defaultView: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (frame: number) => { frames.delete(frame); },
    } } } as unknown as HTMLElement;
    reactEditor.events.getRoot = () => root;
    const calls: string[] = [];
    const oldCancel = reactEditor.selection.scheduleIfSelectionUnchanged(() => { calls.push("old"); }, () => {
      reactEditor.selection.scheduleIfSelectionUnchanged(() => { calls.push("newest"); });
    });
    const outerCancel = reactEditor.selection.scheduleIfSelectionUnchanged(() => { calls.push("outer"); }, () => {
      calls.push("outer cancelled");
    });
    // Cleanup may schedule newer work; stale handles must leave that work intact.
    expect(frames.size).toBe(1);
    expect(calls).toEqual(["outer cancelled"]);
    oldCancel();
    outerCancel();
    expect(reactEditor.selection.hasPendingSelectionCallback).toBe(true);
    for (const callback of frames.values()) callback(0);
    expect(calls).toEqual(["outer cancelled", "newest"]);
    expect(reactEditor.selection.hasPendingSelectionCallback).toBe(false);
    reactEditor.destroy();
    editor.destroy();
  });

  test.each(["replace", "clear", "away-and-back", "empty-away-and-back", "cancel", "destroy", "equivalent"] as const)(
    "guards deferred restoration after %s",
    (change) => {
      const editor = createEditor();
      const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
      const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }).id;
      const reactEditor = createReactEditor({ editor });
      let frame: FrameRequestCallback | undefined;
      const root = { ownerDocument: { defaultView: {
        requestAnimationFrame: (callback: FrameRequestCallback) => { frame = callback; return 1; },
        cancelAnimationFrame: () => { frame = undefined; },
      } } } as unknown as HTMLElement;
      reactEditor.events.getRoot = () => root;
      editor.selection.set(createCaretSelection(first, 1));
      if (change === "empty-away-and-back") editor.selection.clear();
      let restorationCount = 0;
      let cancellationCount = 0;
      const callback = () => { restorationCount++; };
      const onCancel = () => {
        cancellationCount++;
        // Manager cleanup must run while extension-owned dependencies are usable.
        (reactEditor as ReactEditorImpl).extensions.assertActive();
      };
      // The counter stands in for caret/selection work to verify invocation and cancellation.
      const cancel = reactEditor.selection.scheduleIfSelectionUnchanged(callback, onCancel);
      expect(reactEditor.selection.hasPendingSelectionCallback).toBe(true);
      if (change === "replace" || change === "away-and-back") editor.selection.set(createCaretSelection(second, 0));
      if (change === "clear") editor.selection.clear();
      if (change === "empty-away-and-back") {
        editor.selection.set(createCaretSelection(second, 0));
        editor.selection.clear();
      }
      if (change === "equivalent" || change === "away-and-back") editor.selection.set(createCaretSelection(first, 1));
      if (change === "cancel") cancel();
      if (change === "destroy") reactEditor.destroy();
      frame?.(0);
      expect(restorationCount).toBe(change === "equivalent" ? 1 : 0);
      expect(cancellationCount).toBe(change === "equivalent" ? 0 : 1);
      expect(reactEditor.selection.hasPendingSelectionCallback).toBe(false);
      cancel();
      reactEditor.destroy();
      editor.destroy();
      expect(cancellationCount).toBe(change === "equivalent" ? 0 : 1);
    },
  );

  test("delegates text deletion and whole-block selection to core", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "BeforeAfter" }).id;
    const reactEditor = createReactEditor({ editor });
    const text = createTextSelection(
      [{ id, length: 11 }],
      { blockId: id, offset: 6 },
      { blockId: id, offset: 0 },
    )!;
    reactEditor.selection.set(text);
    expect(reactEditor.selection.get()).toEqual(editor.selection.get());
    reactEditor.selection.delete();
    expect(editor.blocks.getBlockNode(id)?.content).toBe("After");
    expect(reactEditor.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 0, end: 0 }],
    });
    editor.history.undo();
    expect(editor.blocks.getBlockNode(id)?.content).toBe("BeforeAfter");
    const block = createStructuralSelection([id]);
    reactEditor.selection.set(block);
    expect(editor.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 0, end: -1 }],
      anchorBlockId: id,
      focusBlockId: id,
    });
    editor.selection.clear();
    expect(reactEditor.selection.get()).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("shares text editing with core and tolerates a missing active surface", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "text" }).id;
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.selection;
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
    reactEditor.destroy();
    editor.destroy();
  });
});
