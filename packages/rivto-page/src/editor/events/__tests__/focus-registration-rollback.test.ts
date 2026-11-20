import { BlockFocusObserver } from "../block-focus-observer";

it("does not retain a focus observer when cleanup ownership fails", () => {
  const failure = new Error("focus cleanup ownership failed");
  const listener = jest.fn();
  const observer = new BlockFocusObserver({
    assertActive: () => {},
    registerCleanup: () => {
      throw failure;
    },
  });
  expect(() => observer.on("focus", listener)).toThrow(failure);
  const root = {
    isAttached: () => true,
    hasFocusWithin: () => true,
    observeInput: jest.fn(() => () => {}),
  };
  const detach = observer.attach(root);
  try {
    observer.notifyInitialFocus(root);
    expect(listener).not.toHaveBeenCalled();
  } finally {
    detach();
  }
});
