import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";

it("installs only groups supplied by its owner", () => {
  const root = document.createElement("div");
  const add = jest.spyOn(root, "addEventListener");
  const listeners = new BrowserEventListeners(() => {}, []);
  try {
    listeners.connect([], testInputRoots(new Set([root])));
    expect(add).not.toHaveBeenCalled();
    listeners.connect(
      [{ target: "surface", type: "click", capture: false, passive: true }],
      testInputRoots(new Set([root])),
    );
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("click", expect.any(Function), {
      capture: false,
      passive: true,
    });
  } finally {
    listeners.disconnect();
    add.mockRestore();
  }
});
