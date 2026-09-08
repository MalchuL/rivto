/**
 * Regression tests for canvas selection no-op notify and per-id membership.
 *
 * Marquee pointermoves call `set` with the same IDs many times; listeners must
 * stay quiet unless membership or `active` actually changes.
 */
import { EdgelessSelectionRuntime } from "./edgeless-runtime";

describe("EdgelessSelectionRuntime", () => {
  const listen = (runtime: EdgelessSelectionRuntime) => {
    const calls: Array<{ active: boolean; items: readonly string[] }> = [];
    runtime.subscribe(() => calls.push(runtime.get()));
    return calls;
  };

  test("set does not notify when the ordered membership is unchanged", () => {
    const runtime = new EdgelessSelectionRuntime();
    const calls = listen(runtime);
    runtime.set(["a", "b"]);
    runtime.set(["a", "b"]);
    runtime.set(["", "a", "b", "a"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ active: true, items: ["a", "b"] });
    runtime.destroy();
  });

  test("set notifies when membership or order changes", () => {
    const runtime = new EdgelessSelectionRuntime();
    const calls = listen(runtime);
    runtime.set(["a"]);
    runtime.set(["a", "b"]);
    runtime.set(["b", "a"]);
    expect(calls.map((call) => call.items)).toEqual([["a"], ["a", "b"], ["b", "a"]]);
    runtime.destroy();
  });

  test("set notifies when reactivating the same retained items", () => {
    const runtime = new EdgelessSelectionRuntime();
    const calls = listen(runtime);
    runtime.set(["a"]);
    runtime.deactivate();
    runtime.set(["a"]);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toMatchObject({ active: false, items: ["a"] });
    expect(calls[2]).toEqual({ active: true, items: ["a"] });
    runtime.destroy();
  });

  test("clear does not notify when already an active empty selection", () => {
    const runtime = new EdgelessSelectionRuntime();
    const calls = listen(runtime);
    runtime.clear();
    runtime.clear();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ active: true, items: [] });
    runtime.destroy();
  });

  test("isSelected follows active membership", () => {
    const runtime = new EdgelessSelectionRuntime();
    runtime.set(["a", "b"]);
    expect(runtime.isSelected("a")).toBe(true);
    expect(runtime.isSelected("c")).toBe(false);
    runtime.deactivate();
    expect(runtime.isSelected("a")).toBe(false);
    runtime.set(["a", "b"]);
    expect(runtime.isSelected("a")).toBe(true);
    runtime.clear();
    expect(runtime.isSelected("a")).toBe(false);
    runtime.destroy();
  });
});
