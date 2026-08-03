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
