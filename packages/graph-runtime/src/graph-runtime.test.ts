/** Tests the public graph runtime across value, slot, lifecycle, and snapshot behavior. */
import {
  GRAPH_SNAPSHOT_VERSION,
  GraphRuntime,
  type PropagationContext,
  type ValueBinding,
} from "./index";

/** Creates a live value binding whose writes synchronously notify subscribers. */
function memoryValue(initial: unknown): ValueBinding & { value: unknown; notify(value: unknown, context?: PropagationContext): void } {
  const listeners = new Set<(value: unknown, context?: PropagationContext) => void>();
  return {
    value: initial,
    get() { return this.value; },
    set(value, context) {
      this.value = value;
      listeners.forEach((listener) => listener(value, context));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify(value, context) {
      this.value = value;
      listeners.forEach((listener) => listener(value, context));
    },
  };
}

/** Registers a memory value using its endpoint ID as the node ID by default. */
function addValue(runtime: GraphRuntime, id: string, value: ReturnType<typeof memoryValue>, nodeId = id): void {
  runtime.registerValue({ id, nodeId }, value);
}

describe("GraphRuntime values", () => {
  test("runs directed chains and terminates a directed loop", async () => {
    const runtime = new GraphRuntime();
    const a = memoryValue(0);
    const b = memoryValue(0);
    const c = memoryValue(0);
    addValue(runtime, "a", a);
    addValue(runtime, "b", b);
    addValue(runtime, "c", c);
    runtime.connect({ id: "ab", kind: "directed-value", from: "a", to: "b" });
    runtime.connect({ id: "bc", kind: "directed-value", from: "b", to: "c" });
    runtime.connect({ id: "ca", kind: "directed-value", from: "c", to: "a" });
    runtime.enable();

    a.value = 7;
    await runtime.publishValue("a", 7);

    expect([a.value, b.value, c.value]).toEqual([7, 7, 7]);
  });

  test("synchronizes transitive undirected groups and splits after disconnect", async () => {
    const runtime = new GraphRuntime();
    const a = memoryValue("a");
    const b = memoryValue("b");
    const c = memoryValue("c");
    addValue(runtime, "a", a);
    addValue(runtime, "b", b);
    addValue(runtime, "c", c);
    runtime.connect({ id: "ab", kind: "undirected-value", endpoints: ["a", "b"] });
    runtime.connect({ id: "bc", kind: "undirected-value", endpoints: ["b", "c"] });
    runtime.enable();

    a.value = "first";
    await runtime.publishValue("a", "first");
    expect([a.value, b.value, c.value]).toEqual(["first", "first", "first"]);

    runtime.disconnect("bc");
    c.value = "last";
    await runtime.publishValue("c", "last");
    expect([a.value, b.value, c.value]).toEqual(["first", "first", "last"]);
  });

  test("explicit synchronization chooses the source and feeds directed descendants", async () => {
    const runtime = new GraphRuntime();
    const a = memoryValue({ count: 1 });
    const b = memoryValue({ count: 0 });
    const c = memoryValue(undefined);
    addValue(runtime, "a", a);
    b.equals = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    addValue(runtime, "b", b);
    addValue(runtime, "c", c);
    runtime.connect({ id: "sync", kind: "undirected-value", endpoints: ["a", "b"] });
    runtime.connect({ id: "next", kind: "directed-value", from: "b", to: "c" });
    runtime.enable();

    await runtime.synchronizeValue("a");

    expect(b.value).toEqual({ count: 1 });
    expect(c.value).toEqual({ count: 1 });
  });

  test("uses FIFO connection order and latest processed assignment wins", async () => {
    const runtime = new GraphRuntime();
    const source = memoryValue(0);
    const first = memoryValue(0);
    const second = memoryValue(0);
    const target = memoryValue(0);
    [source, first, second, target].forEach((binding, index) => addValue(runtime, ["source", "first", "second", "target"][index]!, binding));
    runtime.connect({ id: "1", kind: "directed-value", from: "source", to: "first" });
    runtime.connect({ id: "2", kind: "directed-value", from: "source", to: "second" });
    runtime.connect({ id: "3", kind: "directed-value", from: "first", to: "target" });
    runtime.connect({ id: "4", kind: "directed-value", from: "second", to: "target" });
    runtime.enable();

    await runtime.publishValue("source", 9);

    expect(target.value).toBe(9);

    first.value = 10;
    second.value = 11;
    await Promise.all([runtime.publishValue("first", 10), runtime.publishValue("second", 11)]);
    expect(target.value).toBe(11);
  });

  test("reports rejected writes and leaves independent branches running", async () => {
    const runtime = new GraphRuntime();
    const source = memoryValue(0);
    const good = memoryValue(0);
    const errors: string[] = [];
    addValue(runtime, "source", source);
    runtime.registerValue({ id: "bad", nodeId: "bad" }, { get: () => 0, set: () => false });
    addValue(runtime, "good", good);
    runtime.connect({ id: "1-bad", kind: "directed-value", from: "source", to: "bad" });
    runtime.connect({ id: "2-good", kind: "directed-value", from: "source", to: "good" });
    runtime.subscribeErrors((error) => errors.push(error.message));
    runtime.enable();

    await runtime.publishValue("source", 3);

    expect(errors).toHaveLength(1);
    expect(good.value).toBe(3);
  });

  test("suppresses host publications equal to the last observed value", async () => {
    const runtime = new GraphRuntime();
    const source = memoryValue(1);
    let writes = 0;
    addValue(runtime, "source", source);
    runtime.registerValue({ id: "target", nodeId: "target" }, {
      get: () => 1,
      set: () => { writes += 1; },
    });
    runtime.connect({ id: "flow", kind: "directed-value", from: "source", to: "target" });
    runtime.enable();

    await runtime.publishValue("source", 1);

    expect(writes).toBe(0);
  });

  test("keeps topology inactive after a live endpoint is unregistered", () => {
    const runtime = new GraphRuntime();
    const unregister = runtime.registerValue({ id: "a", nodeId: "a" }, memoryValue(0));
    addValue(runtime, "b", memoryValue(0));
    runtime.connect({ id: "ab", kind: "directed-value", from: "a", to: "b" });
    expect(runtime.isConnectionActive("ab")).toBe(true);

    unregister();

    expect(runtime.isConnectionActive("ab")).toBe(false);
    expect(runtime.getSnapshot().connections).toHaveLength(1);
  });
});

describe("GraphRuntime slots", () => {
  test("routes named emissions before results and invokes on identical arrivals", async () => {
    const runtime = new GraphRuntime();
    const calls: string[] = [];
    runtime.registerSlot({ id: "start", nodeId: "start" }, async (payload, context) => {
      await Promise.resolve();
      context.emit("named", `${payload}:named`);
      return `${payload}:result`;
    });
    runtime.registerSlot({ id: "named", nodeId: "named" }, (payload) => calls.push(String(payload)));
    runtime.registerSlot({ id: "result", nodeId: "result" }, (payload) => calls.push(String(payload)));
    runtime.connect({ id: "1", kind: "slot-flow", from: { slotId: "start", output: "named" }, to: "named" });
    runtime.connect({ id: "2", kind: "slot-flow", from: { slotId: "start", output: "result" }, to: "result" });
    runtime.enable();

    await runtime.invokeSlot("start", "x");
    await runtime.invokeSlot("start", "x");

    expect(calls).toEqual(["x:named", "x:result", "x:named", "x:result"]);
  });

  test("allows slot property writes but never invokes slots from property changes", async () => {
    const runtime = new GraphRuntime();
    const value = memoryValue(0);
    const calls: unknown[] = [];
    addValue(runtime, "value", value, "value-block");
    runtime.registerSlot({ id: "writer", nodeId: "writer-block" }, async (payload, context) => context.writeValue("value", payload));
    runtime.registerSlot({ id: "unused", nodeId: "unused-block" }, (payload) => calls.push(payload));
    expect(() => runtime.connect({ id: "bad", kind: "directed-value", from: "value", to: "unused" })).toThrow("value endpoint");
    runtime.enable();

    await runtime.invokeSlot("writer", 4);
    value.value = 5;
    await runtime.publishValue("value", 5);

    expect(value.value).toBe(5);
    expect(calls).toEqual([]);
  });

  test("terminates slot loops per branch and continues after handler failure", async () => {
    const runtime = new GraphRuntime();
    const calls: string[] = [];
    const errors: string[] = [];
    runtime.registerSlot({ id: "a", nodeId: "a" }, () => "a");
    runtime.registerSlot({ id: "b", nodeId: "b" }, () => { calls.push("b"); return "b"; });
    runtime.registerSlot({ id: "bad", nodeId: "bad" }, () => { throw new Error("boom"); });
    runtime.connect({ id: "ab", kind: "slot-flow", from: { slotId: "a", output: "result" }, to: "b" });
    runtime.connect({ id: "ba", kind: "slot-flow", from: { slotId: "b", output: "result" }, to: "a" });
    runtime.subscribeErrors((error) => errors.push(error.message));
    runtime.enable();

    await runtime.invokeSlot("a", null);
    await runtime.invokeSlot("bad", null);
    await runtime.invokeSlot("a", null);

    expect(calls).toEqual(["b", "b"]);
    expect(errors).toEqual(["Slot bad failed"]);
  });

  test("aborts async execution on disable and ignores late output", async () => {
    const runtime = new GraphRuntime();
    const calls: unknown[] = [];
    let release!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    runtime.registerSlot({ id: "slow", nodeId: "slow" }, () => new Promise((resolve) => {
      release = () => resolve("late");
      markStarted();
    }));
    runtime.registerSlot({ id: "next", nodeId: "next" }, (payload) => calls.push(payload));
    runtime.connect({ id: "flow", kind: "slot-flow", from: { slotId: "slow", output: "result" }, to: "next" });
    runtime.enable();
    const running = runtime.invokeSlot("slow", null);
    await started;
    runtime.dispose();
    release();
    await running;

    expect(calls).toEqual([]);
  });
});

describe("GraphRuntime snapshots", () => {
  test("round trips unresolved topology and activates after registration", () => {
    const snapshot = {
      version: GRAPH_SNAPSHOT_VERSION,
      endpoints: [
        { id: "a", nodeId: "a", kind: "value" as const },
        { id: "b", nodeId: "b", kind: "value" as const },
      ],
      connections: [{ id: "ab", kind: "directed-value" as const, from: "a", to: "b" }],
    };
    const runtime = new GraphRuntime();
    runtime.loadSnapshot(snapshot);
    expect(runtime.getSnapshot()).toEqual(snapshot);
    expect(runtime.isConnectionActive("ab")).toBe(false);
    addValue(runtime, "a", memoryValue(0));
    addValue(runtime, "b", memoryValue(0));
    expect(runtime.isConnectionActive("ab")).toBe(true);
  });

  test("rejects duplicate IDs and incompatible connections without replacement", () => {
    const runtime = new GraphRuntime();
    addValue(runtime, "value", memoryValue(0));
    const before = runtime.getSnapshot();
    expect(() => runtime.loadSnapshot({
      version: 1,
      endpoints: [
        { id: "same", nodeId: "a", kind: "value" },
        { id: "same", nodeId: "b", kind: "slot" },
      ],
      connections: [],
    })).toThrow("Duplicate endpoint");
    expect(() => runtime.loadSnapshot({
      version: 1,
      endpoints: [
        { id: "value", nodeId: "a", kind: "value" },
        { id: "slot", nodeId: "b", kind: "slot" },
      ],
      connections: [{ id: "bad", kind: "directed-value", from: "value", to: "slot" }],
    })).toThrow("value endpoint");
    expect(runtime.getSnapshot()).toEqual(before);
  });
});
