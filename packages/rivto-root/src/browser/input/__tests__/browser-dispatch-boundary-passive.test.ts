import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";

it("installs identity boundaries as passive observers", () => {
  const root = document.createElement("div");
  const addWindow = jest.spyOn(window, "addEventListener");
  const addRoot = jest.spyOn(root, "addEventListener");
  const listeners = new BrowserEventListeners(() => {}, [], true);
  try {
    listeners.connect(
      [{ type: "wheel", target: "surface", capture: false, passive: false }],
      testInputRoots(new Set([root])),
    );
    expect(addWindow).toHaveBeenCalledWith("wheel", expect.any(Function), {
      capture: true,
      passive: true,
    });
    expect(addRoot).toHaveBeenCalledWith("wheel", expect.any(Function), {
      capture: true,
      passive: true,
    });
  } finally {
    listeners.disconnect();
    addWindow.mockRestore();
    addRoot.mockRestore();
  }
});
