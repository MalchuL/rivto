/** Core-backed edgeless selection notification and membership tests. */
import { createReactEditor } from "../../react-editor";
import { createTestCoreEditor } from "../../test-utils";
import { EdgelessSelectionRuntime } from "./edgeless-runtime";

/**
 * Creates one valid visual element for selection tests.
 * @param runtime - Core runtime receiving the element.
 * @returns Stable element ID.
 */
function element(runtime: ReturnType<typeof createTestCoreEditor>): string {
  return runtime.elements.insertElement({
    type: "rectangle",
    frame: { x: 0, y: 0, width: 10, height: 10 },
    zIndex: runtime.elements.getElements().length,
    props: {},
  });
}

describe("EdgelessSelectionRuntime", () => {
  /**
   * Captures every observable canvas selection change.
   * @param runtime - Adapter to observe.
   * @returns Mutable list populated by notifications.
   */
  const listen = (runtime: EdgelessSelectionRuntime) => {
    const calls: Array<{ active: boolean; items: readonly string[] }> = [];
    runtime.subscribe(() => calls.push(runtime.get()));
    return calls;
  };

  test("set does not notify when ordered membership is unchanged", () => {
    const editor = createTestCoreEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({ editor });
    const runtime = new EdgelessSelectionRuntime(reactEditor);
    const first = element(editor);
    const second = element(editor);
    const calls = listen(runtime);
    runtime.set([first, second]);
    runtime.set([first, second]);
    runtime.set(["", first, second, first]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ active: true, items: [first, second] });
    reactEditor.destroy();
    editor.destroy();
  });

  test("set notifies when membership or order changes", () => {
    const editor = createTestCoreEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({ editor });
    const runtime = new EdgelessSelectionRuntime(reactEditor);
    const first = element(editor);
    const second = element(editor);
    const calls = listen(runtime);
    runtime.set([first]);
    runtime.set([first, second]);
    runtime.set([second, first]);
    expect(calls.map((call) => call.items)).toEqual([[first], [first, second], [second, first]]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("reactivates retained items and exposes active membership", () => {
    const editor = createTestCoreEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({ editor });
    const runtime = new EdgelessSelectionRuntime(reactEditor);
    const first = element(editor);
    const calls = listen(runtime);
    runtime.set([first]);
    runtime.deactivate();
    expect(runtime.isSelected(first)).toBe(false);
    runtime.set([first]);
    expect(runtime.isSelected(first)).toBe(true);
    expect(calls).toHaveLength(3);
    reactEditor.destroy();
    editor.destroy();
  });

  test("clear is a no-op when selection is already active and empty", () => {
    const editor = createTestCoreEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({ editor });
    const runtime = new EdgelessSelectionRuntime(reactEditor);
    const calls = listen(runtime);
    runtime.clear();
    runtime.clear();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ active: true, items: [] });
    reactEditor.destroy();
    editor.destroy();
  });
});
