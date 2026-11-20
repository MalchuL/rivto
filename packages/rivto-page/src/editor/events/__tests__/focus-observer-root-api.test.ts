import { BlockFocusObserver } from "../block-focus-observer";

it("borrows focus subscriptions from a non-browser Root and releases both on detach", () => {
  const observer = new BlockFocusObserver({
    assertActive: () => {},
    registerCleanup: (release) => release,
  });
  const releaseFocus = jest.fn();
  const releaseBlur = jest.fn();
  const focus = jest.fn();
  const blur = jest.fn();
  observer.on("focus", focus);
  observer.on("blur", blur);
  const root = {
    isAttached: () => true,
    hasFocusWithin: () => false,
    observeInput: jest.fn().mockReturnValueOnce(releaseFocus).mockReturnValueOnce(releaseBlur),
  };
  const detach = observer.attach(root);
  expect(root.observeInput.mock.calls.map(([type]) => type)).toEqual(["focusin", "focusout"]);
  const input = {
    type: "focusin" as const,
    target: null,
    relatedTarget: null,
    hasRelatedTarget: false,
    preventDefault: () => {},
    stopPropagation: () => {},
    captureRelatedTargetWithinAncestor: () => () => false,
  };
  root.observeInput.mock.calls[0]![1](input);
  root.observeInput.mock.calls[1]![1]({ ...input, type: "focusout" });
  expect(focus).toHaveBeenCalledTimes(1);
  expect(blur).toHaveBeenCalledTimes(1);
  const staleFocus = root.observeInput.mock.calls[0]![1];
  detach();
  root.observeInput.mockReturnValue(() => {});
  const detachReplacement = observer.attach(root);
  staleFocus(input);
  expect(focus).toHaveBeenCalledTimes(1);
  detachReplacement();
  detach();
  expect(releaseFocus).toHaveBeenCalledTimes(1);
  expect(releaseBlur).toHaveBeenCalledTimes(1);
});

it("rolls back the first Root subscription if the second cannot be installed", () => {
  const observer = new BlockFocusObserver({
    assertActive: () => {},
    registerCleanup: (release) => release,
  });
  const release = jest.fn();
  const root = {
    isAttached: () => true,
    hasFocusWithin: () => false,
    observeInput: jest
      .fn()
      .mockReturnValueOnce(release)
      .mockImplementationOnce(() => {
        throw new Error("focusout failed");
      }),
  };
  expect(() => observer.attach(root)).toThrow("focusout failed");
  expect(release).toHaveBeenCalledTimes(1);
  root.observeInput.mockReturnValue(() => {});
  observer.attach(root)();
});

it("attempts both Root subscription cleanups when one fails", () => {
  const observer = new BlockFocusObserver({
    assertActive: () => {},
    registerCleanup: (release) => release,
  });
  const other = jest.fn();
  const root = {
    isAttached: () => true,
    hasFocusWithin: () => false,
    observeInput: jest
      .fn()
      .mockReturnValueOnce(() => {
        throw new Error("focus cleanup failed");
      })
      .mockReturnValueOnce(other),
  };
  const detach = observer.attach(root);
  expect(detach).toThrow("focus cleanup failed");
  expect(other).toHaveBeenCalledTimes(1);
  detach();
});

it("releases a subscription when its Root detaches during installation", () => {
  const observer = new BlockFocusObserver({
    assertActive: () => {},
    registerCleanup: (release) => release,
  });
  let attached = true;
  const release = jest.fn();
  const root = {
    isAttached: () => attached,
    hasFocusWithin: () => false,
    observeInput: jest.fn(() => {
      attached = false;
      return release;
    }),
  };
  expect(() => observer.attach(root)).toThrow("Focus observer requires an active Root");
  expect(root.observeInput).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
});
