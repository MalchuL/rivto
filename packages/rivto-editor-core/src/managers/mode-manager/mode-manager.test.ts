import { ModeManager } from "./mode-manager";

describe("ModeManager", () => {
  it("notifies once per effective change and supports independent subscriptions", () => {
    const mode = new ModeManager();
    const first = jest.fn(() => expect(mode.get()).toBe("edgeless"));
    const second = jest.fn();
    const unsubscribe = mode.subscribe(first);
    mode.subscribe(second);
    expect(mode.get()).toBe("block");
    mode.set("block");
    expect(second).not.toHaveBeenCalled();
    mode.set("edgeless");
    mode.set("edgeless");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribe();
    mode.set("block");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
