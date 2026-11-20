/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { SelectionViewport } from "../selection-viewport";
import { PageNavigationController } from "../../../surfaces/page/page-navigation-controller";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { RegionIdentity } from "@chulane/rivto-root";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not schedule deferred selection work while a mounted panel is disabled", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  let frame: FrameRequestCallback | undefined;
  const request = jestApi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const callback = jestApi.fn();
  const onCancel = jestApi.fn();
  try {
    panel.setRoot(root);
    panel.setEnabled(false);
    expect(panel.inputRoot).toBeUndefined();
    panel.selection.scheduleIfSelectionUnchanged(callback, onCancel);
    expect(frame).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  } finally {
    request.mockRestore();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("cancels an old occurrence's deferred work when the same surface is remounted", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const callback = jestApi.fn();
  const onCancel = jestApi.fn();
  let frame: (() => void) | undefined;
  try {
    panel.setRoot(root);
    const original = panel.mountedRoot!;
    jestApi.spyOn(original, "captureFrameClock").mockReturnValue({
      now: () => 0,
      requestFrame: (next) => {
        frame = () => next();
        return () => {};
      },
    });
    panel.selection.scheduleIfSelectionUnchanged(callback, onCancel);
    original.detach();
    panel.mountedRoot = new BrowserInputRoot(root);
    expect(panel.selection.hasPendingSelectionCallback).toBe(false);
    frame!();
    expect(callback).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(panel.selection.hasPendingSelectionCallback).toBe(false);
  } finally {
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("keeps a new request scheduled while the completed request releases its listeners", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const frames: Array<() => void> = [];
  const first = jestApi.fn();
  const next = jestApi.fn();
  let scheduled = false;
  try {
    panel.setRoot(root);
    const mountedRoot = panel.mountedRoot!;
    jestApi.spyOn(mountedRoot, "captureFrameClock").mockReturnValue({
      now: () => 0,
      requestFrame: (callback) => {
        frames.push(callback);
        return () => {};
      },
    });
    const observeInput = mountedRoot.observeInput.bind(mountedRoot);
    jestApi.spyOn(mountedRoot, "observeInput").mockImplementation((type, observer) => {
      const release = observeInput(type, observer);
      if (type !== "beforeinput" || !release) {
        return release;
      }
      return () => {
        release();
        if (!scheduled) {
          scheduled = true;
          panel.selection.scheduleIfSelectionUnchanged(next);
        }
      };
    });
    panel.selection.scheduleIfSelectionUnchanged(first);
    frames[0]();
    expect(first).toHaveBeenCalledTimes(1);
    expect(panel.selection.hasPendingSelectionCallback).toBe(true);
    frames[1]();
    expect(next).toHaveBeenCalledTimes(1);
    expect(panel.selection.hasPendingSelectionCallback).toBe(false);
  } finally {
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("cleans up deferred selection work when its Root rejects the frame", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const remove = jestApi.spyOn(root, "removeEventListener");
  const callback = jestApi.fn();
  const onCancel = jestApi.fn();
  try {
    panel.setRoot(root);
    const clock = jestApi.spyOn(panel.mountedRoot!, "captureFrameClock").mockReturnValue({
      now: () => 0,
      requestFrame: () => undefined,
    });
    try {
      const cancel = panel.selection.scheduleIfSelectionUnchanged(callback, onCancel);
      expect(callback).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(panel.selection.hasPendingSelectionCallback).toBe(false);
      expect(remove).toHaveBeenCalledWith("beforeinput", expect.any(Function), false);
      cancel();
      expect(onCancel).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  } finally {
    remove.mockRestore();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("releases earlier input subscriptions when a later subscription fails", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const remove = jestApi.spyOn(root, "removeEventListener");
  const onCancel = jestApi.fn();
  try {
    panel.setRoot(root);
    const mountedRoot = panel.mountedRoot!;
    const observeInput = mountedRoot.observeInput.bind(mountedRoot);
    jestApi.spyOn(mountedRoot, "observeInput").mockImplementation((type, observer) => {
      if (type === "pointerdown") {
        throw new Error("input subscription failed");
      }
      return observeInput(type, observer);
    });
    expect(() => panel.selection.scheduleIfSelectionUnchanged(() => {}, onCancel)).toThrow(
      "input subscription failed",
    );
    expect(remove).toHaveBeenCalledWith("beforeinput", expect.any(Function), false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(panel.selection.hasPendingSelectionCallback).toBe(false);
  } finally {
    remove.mockRestore();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("releases selection listeners when requesting a frame throws", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const remove = jestApi.spyOn(root, "removeEventListener");
  const onCancel = jestApi.fn();
  try {
    panel.setRoot(root);
    jestApi.spyOn(panel.mountedRoot!, "captureFrameClock").mockReturnValue({
      now: () => 0,
      requestFrame: () => {
        throw new Error("frame request failed");
      },
    });
    expect(() => panel.selection.scheduleIfSelectionUnchanged(() => {}, onCancel)).toThrow(
      "frame request failed",
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("beforeinput", expect.any(Function), false);
    expect(panel.selection.hasPendingSelectionCallback).toBe(false);
  } finally {
    remove.mockRestore();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("releases selection listeners and caller resources when frame cancellation fails", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const remove = jestApi.spyOn(root, "removeEventListener");
  const onCancel = jestApi.fn();
  try {
    panel.setRoot(root);
    const clock = jestApi.spyOn(panel.mountedRoot!, "captureFrameClock").mockReturnValue({
      now: () => 0,
      requestFrame: () => () => {
        throw new Error("frame cancellation failed");
      },
    });
    try {
      const cancel = panel.selection.scheduleIfSelectionUnchanged(() => {}, onCancel);
      expect(() => cancel()).toThrow("frame cancellation failed");
      expect(remove).toHaveBeenCalledWith("beforeinput", expect.any(Function), false);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(panel.selection.hasPendingSelectionCallback).toBe(false);
      expect(() => cancel()).not.toThrow();
    } finally {
      clock.mockRestore();
    }
  } finally {
    remove.mockRestore();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("offers every viewport resource cleanup even when frame cancellation fails", () => {
  const surface = new RegionIdentity();
  const releaseFrame = jestApi.fn(() => {
    throw new Error("frame cancellation failed");
  });
  const releaseWheel = jestApi.fn();
  const releaseAdjustments = jestApi.fn();
  let frame: (() => void) | undefined;
  let restore: (() => void) | undefined;
  let cancel: (() => void) | undefined;
  const inputRoot = {
    getElementIdentity: () => surface,
    readRegionViewportTop: () => 10,
    readRegionValues: () => ["one"],
    measureRegionViewportBounds: () => ({
      viewportHeight: 100,
      regions: [{ value: "one", top: 10, bottom: 20, height: 10 }],
    }),
    captureDocumentScroll: () => ({ adjustBy: jestApi.fn() }),
    observeWindowWheel: () => releaseWheel,
    captureFrameClock: () => ({
      now: () => 0,
      requestFrame: (callback: () => void) => {
        frame = callback;
        return releaseFrame;
      },
    }),
  };
  const navigation = {
    isAttached: () => true,
    mountBlocks: jestApi.fn(),
    suspendScrollAdjustments: () => releaseAdjustments,
  };
  const selectionManager = {
    set: jestApi.fn(),
    restoreDOM: jestApi.fn(() => true),
    scheduleIfSelectionUnchanged: (callback: () => void, onCancel?: () => void) => {
      restore = callback;
      cancel = onCancel;
      return () => {};
    },
  };
  SelectionViewport.run(
    inputRoot,
    navigation,
    selectionManager,
    { type: "selection", blocks: [] },
    ["one"],
    () => true,
    () => true,
  );
  restore!();
  expect(frame).toBeDefined();
  expect(() => cancel!()).toThrow(AggregateError);
  expect(releaseFrame).toHaveBeenCalledTimes(1);
  expect(releaseWheel).toHaveBeenCalledTimes(1);
  expect(releaseAdjustments).toHaveBeenCalledTimes(1);
  frame!();
  expect(releaseFrame).toHaveBeenCalledTimes(1);
});

it("does not start a settlement if Root detaches while resolving its identity", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.dataset.rivtoBlockEditor = "true";
  const occurrence = new BrowserInputRoot(surface);
  const action = jestApi.fn(() => true);
  const identity = jestApi.spyOn(occurrence, "getElementIdentity").mockImplementation(() => {
    occurrence.detach();
    return new RegionIdentity();
  });
  const selectionManager = {
    set: jestApi.fn(),
    restoreDOM: jestApi.fn(() => true),
    scheduleIfSelectionUnchanged: () => () => {},
  };
  try {
    expect(
      SelectionViewport.run(
        occurrence,
        panel.pageNavigation,
        selectionManager,
        { type: "selection", blocks: [] },
        [],
        () => occurrence.isAttached(),
        action,
      ),
    ).toBe(false);
    expect(action).not.toHaveBeenCalled();
  } finally {
    identity.mockRestore();
    occurrence.detach();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("replaces the earlier settlement when separate Roots share a surface", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const secondRoot = new BrowserInputRoot(root);
  const release = jestApi.fn();
  const cancellations: Array<() => void> = [];
  const selectionManager = {
    set: jestApi.fn(),
    restoreDOM: jestApi.fn(() => true),
    scheduleIfSelectionUnchanged: (_callback: () => void, cancel?: () => void) => {
      if (cancel) {
        cancellations.push(cancel);
      }
      return () => {};
    },
  };
  try {
    panel.setRoot(root);
    const firstRoot = panel.inputRoot!;
    const observe = jestApi.spyOn(firstRoot, "observeWindowWheel").mockReturnValue(release);
    try {
      for (const occurrence of [firstRoot, secondRoot]) {
        SelectionViewport.run(
          occurrence,
          panel.pageNavigation,
          selectionManager,
          { type: "selection", blocks: [] },
          [],
          () => true,
          () => true,
        );
      }
      expect(release).toHaveBeenCalledTimes(1);
      cancellations[0]?.();
      cancellations[1]?.();
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      observe.mockRestore();
    }
  } finally {
    secondRoot.detach();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("releases viewport resources when the frame clock rejects a new request", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="one"></div>';
  const scrolling = Object.getOwnPropertyDescriptor(document, "scrollingElement");
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  Object.defineProperty(document, "scrollingElement", {
    configurable: true,
    value: document.documentElement,
  });
  const bounds = jestApi.spyOn(root.firstElementChild!, "getBoundingClientRect").mockReturnValue({
    top: 10,
    bottom: 20,
    height: 10,
  } as DOMRect);
  let restore: (() => void) | undefined;
  const selectionManager = {
    set: jestApi.fn(),
    restoreDOM: jestApi.fn(() => true),
    scheduleIfSelectionUnchanged: (callback: () => void) => {
      restore = callback;
      return () => {};
    },
  };
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    const clock = jestApi.spyOn(inputRoot, "captureFrameClock").mockReturnValue({
      now: () => 0,
      requestFrame: () => undefined,
    });
    try {
      SelectionViewport.run(
        inputRoot,
        panel.pageNavigation,
        selectionManager,
        { type: "selection", blocks: [] },
        ["one"],
        () => true,
        () => true,
      );
      expect(root.style.overflowAnchor).toBe("none");
      restore!();
      expect(root.style.overflowAnchor).not.toBe("none");
    } finally {
      clock.mockRestore();
    }
  } finally {
    bounds.mockRestore();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
    if (scrolling) {
      Object.defineProperty(document, "scrollingElement", scrolling);
    } else {
      Reflect.deleteProperty(document, "scrollingElement");
    }
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("releases a wheel observation acquired after synchronous cancellation", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const release = jestApi.fn();
  const action = jestApi.fn(() => true);
  const selectionManager = {
    set: jestApi.fn(),
    restoreDOM: jestApi.fn(() => true),
    scheduleIfSelectionUnchanged: () => () => {},
  };
  let current = true;
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    const observe = jestApi
      .spyOn(inputRoot, "observeWindowWheel")
      .mockImplementation((listener) => {
        current = false;
        listener(1);
        return release;
      });
    try {
      expect(
        SelectionViewport.run(
          inputRoot,
          panel.pageNavigation,
          selectionManager,
          { type: "selection", blocks: [] },
          [],
          () => current,
          action,
        ),
      ).toBe(false);
      expect(action).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      observe.mockRestore();
    }
  } finally {
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not mount through a replacement navigation controller during restoration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const replacementRoot = new BrowserInputRoot(root);
  const replacement = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const mount = jestApi.spyOn(replacement, "mountBlocks");
  let restore: (() => void) | undefined;
  const selectionManager = {
    set: jestApi.fn(),
    restoreDOM: jestApi.fn(() => true),
    scheduleIfSelectionUnchanged: (callback: () => void) => {
      restore = callback;
      return () => {};
    },
  };
  try {
    panel.setRoot(root);
    SelectionViewport.run(
      panel.inputRoot!,
      panel.pageNavigation,
      selectionManager,
      { type: "selection", blocks: [] },
      [],
      () => true,
      () => {
        replacement.setRoot(replacementRoot);
        return true;
      },
    );
    restore!();
    expect(mount).not.toHaveBeenCalled();
  } finally {
    replacement.setRoot(null);
    replacementRoot.detach();
    mount.mockRestore();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("releases viewport resources when a structural edit disables its originating registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const originalOverflowAnchor = root.style.overflowAnchor;
  document.body.append(root);
  const schedule = jestApi.spyOn(panel.selection, "scheduleIfSelectionUnchanged");
  const add = jestApi.spyOn(window, "addEventListener");
  const remove = jestApi.spyOn(window, "removeEventListener");
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    const selection = { type: "selection" as const, blocks: [] };
    const claimed = panel.selection.runWithViewportPreserved(
      [],
      selection,
      inputRoot,
      { isCurrent: () => panel.inputRoot === inputRoot && inputRoot.isAttached() },
      () => {
        panel.setEnabled(false);
        return true;
      },
    );
    const wheel = add.mock.calls.find(([type]) => type === "wheel")?.[1];
    expect(claimed).toBe(true);
    expect(wheel).toBeDefined();
    expect(remove).toHaveBeenCalledWith("wheel", wheel);
    expect(schedule).not.toHaveBeenCalled();
    expect(root.style.overflowAnchor).toBe(originalOverflowAnchor);
  } finally {
    add.mockRestore();
    remove.mockRestore();
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("stops pending viewport corrections after the captured registration changes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="block"></div>';
  document.body.append(root);
  const block = root.querySelector<HTMLElement>("[data-block-id]")!;
  let top = 10;
  const bounds = jestApi.spyOn(block, "getBoundingClientRect").mockImplementation(() => ({
    x: 0,
    y: top,
    left: 0,
    right: 100,
    top,
    bottom: top + 20,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  }));
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const scrolling = Object.getOwnPropertyDescriptor(document, "scrollingElement");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  Object.defineProperty(document, "scrollingElement", {
    configurable: true,
    value: document.documentElement,
  });
  let frame: FrameRequestCallback | undefined;
  const request = jestApi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  let restore: (() => void) | undefined;
  const selectionManager = {
    set: jestApi.fn(),
    restoreDOM: jestApi.fn(() => true),
    scheduleIfSelectionUnchanged: (callback: () => void) => {
      restore = callback;
      return () => {};
    },
  };
  let current = true;
  try {
    panel.setRoot(root);
    const originalOverflowAnchor = root.style.overflowAnchor;
    SelectionViewport.run(
      panel.inputRoot!,
      panel.pageNavigation,
      selectionManager,
      { type: "selection", blocks: [] },
      ["block"],
      () => current,
      () => true,
    );
    restore!();
    expect(frame).toBeDefined();
    current = false;
    top = 100;
    document.documentElement.scrollTop = 0;
    frame!(0);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(root.style.overflowAnchor).toBe(originalOverflowAnchor);
  } finally {
    request.mockRestore();
    bounds.mockRestore();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
    if (scrolling) {
      Object.defineProperty(document, "scrollingElement", scrolling);
    } else {
      Reflect.deleteProperty(document, "scrollingElement");
    }
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("cleans up the viewport when the structural operation throws", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const originalOverflowAnchor = root.style.overflowAnchor;
  document.body.append(root);
  const add = jestApi.spyOn(window, "addEventListener");
  const remove = jestApi.spyOn(window, "removeEventListener");
  const failure = new Error("structural operation failed");
  try {
    panel.setRoot(root);
    expect(() =>
      panel.selection.runWithViewportPreserved(
        [],
        { type: "selection", blocks: [] },
        panel.inputRoot!,
        { isCurrent: () => panel.inputRoot?.isAttached() ?? false },
        () => {
          throw failure;
        },
      ),
    ).toThrow(failure);
    const wheel = add.mock.calls.find(([type]) => type === "wheel")?.[1];
    expect(wheel).toBeDefined();
    expect(remove).toHaveBeenCalledWith("wheel", wheel);
    expect(root.style.overflowAnchor).toBe(originalOverflowAnchor);
  } finally {
    add.mockRestore();
    remove.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not restore browser selection if publishing the captured selection replaces the occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  let current = true;
  let restore: (() => void) | undefined;
  const restoreDOM = jestApi.fn(() => true);
  const selectionManager = {
    set: () => {
      current = false;
    },
    restoreDOM,
    scheduleIfSelectionUnchanged: (callback: () => void) => {
      restore = callback;
      return () => {};
    },
  };
  try {
    panel.setRoot(root);
    SelectionViewport.run(
      panel.inputRoot!,
      panel.pageNavigation,
      selectionManager,
      { type: "selection", blocks: [] },
      [],
      () => current,
      () => true,
    );
    restore!();
    expect(restoreDOM).not.toHaveBeenCalled();
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not run the structural edit if viewport setup invalidates its registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  let current = true;
  const release = jestApi.fn();
  const action = jestApi.fn(() => true);
  const suspend = jestApi
    .spyOn(panel.pageNavigation, "suspendScrollAdjustments")
    .mockImplementation(() => {
      current = false;
      return release;
    });
  const selectionManager = {
    set: jestApi.fn(),
    restoreDOM: jestApi.fn(() => true),
    scheduleIfSelectionUnchanged: () => () => {},
  };
  try {
    panel.setRoot(root);
    expect(
      SelectionViewport.run(
        panel.inputRoot!,
        panel.pageNavigation,
        selectionManager,
        { type: "selection", blocks: [] },
        [],
        () => current,
        action,
      ),
    ).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  } finally {
    suspend.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
