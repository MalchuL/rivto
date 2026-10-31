import { Listeners } from "./listeners";

describe("Listeners", () => {
  it("isolates named events and types their payloads", () => {
    const listeners = new Listeners<{
      changed: void;
      valueChanged: { value: number };
    }>();
    const changed = jest.fn();
    const valueChanged = jest.fn();
    const unsubscribe = listeners.subscribe("changed", changed);
    listeners.subscribe("valueChanged", valueChanged);

    listeners.emit("changed");
    listeners.emit("valueChanged", { value: 2 });

    expect(changed).toHaveBeenCalledTimes(1);
    expect(valueChanged).toHaveBeenCalledWith({ value: 2 });

    unsubscribe();
    listeners.emit("changed");
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe("listener delivery", () => {
  it("uses a snapshot and releases empty keyed channels safely", () => {
    const listeners = new Listeners<Record<string, void>>();
    const calls: string[] = [];
    let removeSecond = () => {};
    listeners.subscribe("a", () => {
      calls.push("first");
      removeSecond();
      listeners.subscribe("a", () => calls.push("later"));
    });
    removeSecond = listeners.subscribe("a", () => calls.push("second"));
    listeners.emit("a");
    expect(calls).toEqual(["first", "second"]);
    listeners.emit("a");
    expect(calls).toEqual(["first", "second", "first", "later"]);
    listeners.clear("a");
    const removeNew = listeners.subscribe("a", () => calls.push("new"));
    removeSecond();
    expect(listeners.size).toBe(1);
    removeNew();
    expect(listeners.size).toBe(0);
    const callback = () => calls.push("reused");
    const old = listeners.subscribe("b", callback);
    old();
    listeners.subscribe("b", callback);
    old();
    listeners.emit("b");
    expect(calls.at(-1)).toBe("reused");
    listeners.clear();
    expect(listeners.listenerCount).toBe(0);
  });

  it("propagates ordinary failures and aggregates all specialized failures", () => {
    const listeners = new Listeners<{ changed: void }>();
    const first = new Error("first");
    const second = new Error("second");
    const called = jest.fn();
    listeners.subscribe("changed", () => {
      throw first;
    });
    listeners.subscribe("changed", () => {
      called();
      throw second;
    });
    expect(() => listeners.emit("changed")).toThrow(first);
    expect(called).not.toHaveBeenCalled();
    try {
      listeners.emitAndCollectErrors("changed", "failed");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([first, second]);
    }
    expect(called).toHaveBeenCalledTimes(1);
  });
});
