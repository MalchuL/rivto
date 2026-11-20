import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockRegionInputSubscriptions } from "../block-region-input-subscriptions";

it("retains region observations across attachment replacement without stale cleanup", () => {
  const surface = document.createElement("div");
  const button = document.createElement("button");
  surface.append(button);
  document.body.append(surface);
  const first = new BrowserInputRoot(surface);
  const second = new BrowserInputRoot(surface);
  const owner = {
    assertActive: jest.fn(),
    registerCleanup: jest.fn((release: () => void) => release),
  };
  const registrations = new BlockRegionInputSubscriptions(owner);
  const seen = jest.fn();
  const release = registrations.observe(getBrowserElementIdentity(button), "click", "bubble", seen);
  try {
    const detachFirst = registrations.attach(first);
    button.click();
    expect(seen).toHaveBeenCalledTimes(1);
    detachFirst();
    button.click();
    expect(seen).toHaveBeenCalledTimes(1);
    const detachSecond = registrations.attach(second);
    detachFirst();
    button.click();
    expect(seen).toHaveBeenCalledTimes(2);
    release();
    release();
    button.click();
    expect(seen).toHaveBeenCalledTimes(2);
    detachSecond();
  } finally {
    release();
    first.detach();
    second.detach();
    surface.remove();
  }
});

it("rolls back earlier region listeners when a later installation fails", () => {
  const surface = document.createElement("div");
  const first = document.createElement("button");
  const second = document.createElement("button");
  surface.append(first, second);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const owner = {
    assertActive: jest.fn(),
    registerCleanup: jest.fn((release: () => void) => release),
  };
  const registrations = new BlockRegionInputSubscriptions(owner);
  const seen = jest.fn();
  const releaseFirst = registrations.observe(
    getBrowserElementIdentity(first),
    "click",
    "bubble",
    seen,
  );
  const releaseSecond = registrations.observe(
    getBrowserElementIdentity(second),
    "click",
    "bubble",
    seen,
  );
  const add = jest.spyOn(second, "addEventListener").mockImplementation(() => {
    throw new Error("listener setup failed");
  });
  try {
    expect(() => registrations.attach(root)).toThrow("listener setup failed");
    first.click();
    expect(seen).not.toHaveBeenCalled();
    add.mockRestore();
    const detach = registrations.attach(root);
    first.click();
    second.click();
    expect(seen).toHaveBeenCalledTimes(2);
    detach();
  } finally {
    add.mockRestore();
    releaseFirst();
    releaseSecond();
    root.detach();
    surface.remove();
  }
});

it("releases every old listener when cleanup reattaches another Root", () => {
  const surface = document.createElement("div");
  const first = document.createElement("button");
  const second = document.createElement("button");
  surface.append(first, second);
  document.body.append(surface);
  const oldRoot = new BrowserInputRoot(surface);
  const newRoot = new BrowserInputRoot(surface);
  const owner = {
    assertActive: jest.fn(),
    registerCleanup: jest.fn((release: () => void) => release),
  };
  const registrations = new BlockRegionInputSubscriptions(owner);
  const seen = jest.fn();
  const releaseFirst = registrations.observe(
    getBrowserElementIdentity(first),
    "click",
    "bubble",
    seen,
  );
  const releaseSecond = registrations.observe(
    getBrowserElementIdentity(second),
    "click",
    "bubble",
    seen,
  );
  const detachOld = registrations.attach(oldRoot);
  const remove = first.removeEventListener.bind(first);
  let detachNew: (() => void) | undefined;
  const secondRemove = jest.spyOn(second, "removeEventListener");
  const spy = jest
    .spyOn(first, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      remove(type, listener, options);
      detachNew ??= registrations.attach(newRoot);
    });
  try {
    detachOld();
    second.click();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(detachNew).toBeDefined();
    expect(secondRemove).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
    secondRemove.mockRestore();
    detachNew?.();
    releaseFirst();
    releaseSecond();
    oldRoot.detach();
    newRoot.detach();
    surface.remove();
  }
});

it("rolls back a listener when the editor rejects cleanup ownership", () => {
  const surface = document.createElement("div");
  const button = document.createElement("button");
  surface.append(button);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const failure = new Error("cleanup ownership failed");
  const owner = {
    assertActive: jest.fn(),
    registerCleanup: jest.fn((release: () => void) => release),
  };
  const registrations = new BlockRegionInputSubscriptions(owner);
  const detach = registrations.attach(root);
  const seen = jest.fn();
  owner.registerCleanup.mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(() =>
      registrations.observe(getBrowserElementIdentity(button), "click", "bubble", seen),
    ).toThrow(failure);
    button.click();
    expect(seen).not.toHaveBeenCalled();
    const release = registrations.observe(
      getBrowserElementIdentity(button),
      "click",
      "bubble",
      seen,
    );
    button.click();
    expect(seen).toHaveBeenCalledTimes(1);
    release();
  } finally {
    detach();
    root.detach();
    surface.remove();
  }
});
