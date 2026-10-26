import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import { BlockDragExtension } from "./block-drag-extension";

/**
 * Delivers pointer-shaped native input in jsdom, which has no PointerEvent constructor.
 *
 * @param target - Native dispatch target inside the mounted editor or its window.
 * @param type - Pointer lifecycle event name.
 * @param x - Viewport coordinate, away from scroll boundaries.
 * @param buttons - Native pressed-button mask; defaults to primary held for down/move.
 * @returns Event delivery and all synchronous handlers have completed.
 */
function pointer(
  target: EventTarget,
  type: string,
  x: number,
  buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 100,
    buttons,
  });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  target.dispatchEvent(event);
}

it("withholds forbidden feedback and rechecks permission at pointer release", () => {
  const data = new TestBlockEditorAdapter();
  const editor = new BlockEditorController({ adapter: data });
  const canMove = jest.fn(() => true);
  const moveBlocks = jest.fn(() => true);
  editor.extensions.register("drag", new BlockDragExtension({ canMove, moveBlocks }));
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="source"><button data-block-drag-handle></button></div><div id="target"></div>';
  document.body.append(root);
  editor.attach(root);
  const handle = root.querySelector("button")!;
  const target = root.querySelector<HTMLElement>("#target")!;
  const destination = {
    kind: "between" as const,
    parentId: "parent",
    previousId: null,
    nextId: null,
  };
  const indicator = { left: 10, top: 20, width: 100, height: 2 };
  const previewAtRead: boolean[] = [];
  jest.spyOn(editor.dropTargets, "resolve").mockImplementation(() => {
    previewAtRead.push(!!root.querySelector(".rivto-block-drag-preview"));
    return { element: target, destination, indicator };
  });
  try {
    pointer(handle, "pointerdown", 100);
    pointer(window, "pointermove", 110);
    expect(target.hasAttribute("data-block-drop-active")).toBe(true);
    expect(handle.parentElement!.getAttribute("data-dragging")).toBe("true");
    expect(previewAtRead[0]).toBe(false);
    const line = root.querySelector<HTMLElement>(".rivto-block-drop-line")!;
    expect(line.hidden).toBe(false);
    expect(line.style.transform).toBe("translate(10px, 20px)");
    expect(line.style.width).toBe("100px");
    expect(canMove).toHaveBeenLastCalledWith(["source"], destination, undefined);
    canMove.mockReturnValue(false);
    pointer(window, "pointermove", 120);
    expect(target.hasAttribute("data-block-drop-active")).toBe(false);
    expect(line.hidden).toBe(true);
    canMove.mockReturnValue(true);
    pointer(window, "pointermove", 130);
    expect(target.hasAttribute("data-block-drop-active")).toBe(true);
    canMove.mockReturnValue(false);
    pointer(window, "pointerup", 130);
    expect(moveBlocks).not.toHaveBeenCalled();
    expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
    expect(handle.parentElement!.hasAttribute("data-dragging")).toBe(false);
    expect(root.querySelector(".rivto-block-drop-line")).toBeNull();
    const release = editor.pointer.acquire();
    expect(release).toBeDefined();
    release?.();
    const failure = new Error("permission read failed");
    const onError = jest.fn((event: ErrorEvent) => event.preventDefault());
    window.addEventListener("error", onError);
    try {
      canMove.mockImplementation(() => {
        throw failure;
      });
      pointer(handle, "pointerdown", 100);
      pointer(window, "pointermove", 110);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![0].error).toBe(failure);
      expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
      const releaseAfterFailure = editor.pointer.acquire();
      expect(releaseAfterFailure).toBeDefined();
      releaseAfterFailure?.();
    } finally {
      window.removeEventListener("error", onError);
    }
  } finally {
    editor.destroy();
    root.remove();
  }
});

it.each([false, true])(
  "borrows movement targets and refreshes release geometry for capture=%s",
  (capturedRelease) => {
    const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
    const resolve = jest.fn<undefined, [number, number, ReadonlySet<string>, Element?]>(
      () => undefined,
    );
    editor.extensions.register(
      "drag",
      new BlockDragExtension({ canMove: () => true, moveBlocks: () => true }, { resolve }),
    );
    const root = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    root.innerHTML =
      '<div data-block-id="source"><button data-block-drag-handle></button></div><div id="hit"></div>';
    document.body.append(root);
    editor.attach(root);
    const target = root.querySelector<HTMLElement>("#hit")!;
    const capture = jest.fn(() => false);
    Object.defineProperty(target, "hasPointerCapture", { value: capture });
    try {
      pointer(root.querySelector("button")!, "pointerdown", 100);
      pointer(target, "pointermove", 110);
      expect(resolve.mock.calls.at(-1)?.[3]).toBe(target);
      capture.mockReturnValue(true);
      pointer(target, "pointermove", 120);
      expect(resolve.mock.calls.at(-1)?.[3]).toBeUndefined();
      capture.mockReturnValue(capturedRelease);
      pointer(target, "pointerup", 120);
      expect(resolve.mock.calls.at(-1)?.[3]).toBeUndefined();
    } finally {
      editor.destroy();
      root.remove();
    }
  },
);

it("releases pointer ownership when activation cannot read selection", () => {
  const data = new TestBlockEditorAdapter();
  const editor = new BlockEditorController({ adapter: data });
  editor.extensions.register(
    "drag",
    new BlockDragExtension({ canMove: () => true, moveBlocks: () => true }),
  );
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
  document.body.append(root);
  editor.attach(root);
  const failure = new Error("selection read failed");
  const onError = jest.fn((event: ErrorEvent) => event.preventDefault());
  window.addEventListener("error", onError);
  try {
    jest.spyOn(data.selection, "get").mockImplementation(() => {
      throw failure;
    });
    pointer(root.querySelector("button")!, "pointerdown", 100);
    pointer(window, "pointermove", 110);
    expect(onError.mock.calls[0]?.[0].error).toBe(failure);
    const release = editor.pointer.acquire();
    expect(release).toBeDefined();
    release?.();
  } finally {
    window.removeEventListener("error", onError);
    editor.destroy();
    root.remove();
  }
});

it("commits the pointed destination when capture was released before window pointerup", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="source"><button data-block-drag-handle></button></div><div id="receiving"></div>';
  document.body.append(root);
  editor.attach(root);
  const handle = root.querySelector("button")!;
  const receiving = root.querySelector<HTMLElement>("#receiving")!;
  const destination = { kind: "inside" as const, parentId: "receiving" };
  const moveBlocks = jest.fn(() => true);
  editor.extensions.register(
    "drag",
    new BlockDragExtension(
      { canMove: () => true, moveBlocks },
      {
        /**
         * Models fresh geometry pointing at the receiver while a retargeted event names the source.
         *
         * @param x - Unused viewport horizontal coordinate.
         * @param y - Unused viewport vertical coordinate.
         * @param excluded - Unused captured source group.
         * @param hit - Native hint, absent when fresh geometry is requested.
         * @returns Receiver for fresh geometry or a receiver hit; source hints cannot receive themselves.
         */
        resolve: (x, y, excluded, hit) =>
          hit === handle ? undefined : { element: receiving, destination },
      },
    ),
  );
  const captured = jest.fn(() => true);
  Object.defineProperty(handle, "hasPointerCapture", { value: captured });
  handle.addEventListener("pointerup", () => captured.mockReturnValue(false));
  try {
    pointer(handle, "pointerdown", 100);
    pointer(handle, "pointermove", 130);
    expect(receiving.hasAttribute("data-block-drop-active")).toBe(true);
    pointer(handle, "pointerup", 130);
    expect(moveBlocks).toHaveBeenCalledWith(["source"], destination, undefined);
    expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
  } finally {
    editor.destroy();
    root.remove();
  }
});

it("removes remaining feedback and preserves commit errors when target cleanup fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="source"><button data-block-drag-handle></button></div><div id="target"></div>';
  document.body.append(root);
  editor.attach(root);
  const target = root.querySelector<HTMLElement>("#target")!;
  const commitFailure = new Error("commit failed");
  const cleanupFailure = new Error("target cleanup failed");
  editor.extensions.register(
    "drag",
    new BlockDragExtension(
      {
        canMove: () => true,
        moveBlocks: () => {
          throw commitFailure;
        },
      },
      { resolve: () => ({ element: target, destination: { kind: "inside", parentId: null } }) },
    ),
  );
  const onError = jest.fn((event: ErrorEvent) => event.preventDefault());
  window.addEventListener("error", onError);
  try {
    pointer(root.querySelector("button")!, "pointerdown", 100);
    pointer(window, "pointermove", 110);
    jest.spyOn(target, "removeAttribute").mockImplementation(() => {
      throw cleanupFailure;
    });
    pointer(window, "pointerup", 110);
    expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
    const failure = onError.mock.calls[0]?.[0].error;
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors[0]).toBe(commitFailure);
    expect(failure.errors[1].errors).toContain(cleanupFailure);
    const release = editor.pointer.acquire();
    expect(release).toBeDefined();
    release?.();
  } finally {
    window.removeEventListener("error", onError);
    editor.destroy();
    root.remove();
  }
});

it("captures bounded inert preview rows once and releases them on Escape", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const getPreview = jest.fn(() =>
    Array.from({ length: 20 }, () => ({
      text: "<button>unsafe</button>" + "x".repeat(1000),
      depth: 100,
    })),
  );
  editor.extensions.register(
    "drag",
    new BlockDragExtension(
      {
        canMove: () => true,
        moveBlocks: () => true,
        getPreview,
      },
      { resolve: () => undefined },
    ),
  );
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
  document.body.append(root);
  editor.attach(root);
  try {
    pointer(root.querySelector("button")!, "pointerdown", 100);
    pointer(window, "pointermove", 110);
    pointer(window, "pointermove", 120);
    expect(getPreview).toHaveBeenCalledTimes(1);
    expect(getPreview).toHaveBeenCalledWith(["source"], 4);
    const preview = root.querySelector<HTMLElement>(".rivto-block-drag-preview")!;
    expect(preview.children).toHaveLength(4);
    expect(preview.querySelector("button, [contenteditable]")).toBeNull();
    expect(preview.firstElementChild?.textContent).toHaveLength(240);
    expect((preview.firstElementChild as HTMLElement).style.marginInlineStart).toBe("36px");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
  } finally {
    editor.destroy();
    root.remove();
  }
});

it.each([false, true])(
  "delegates foreign scope identity and releases its detach subscription, cancel=%s",
  (cancel) => {
    const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
    const source = document.createElement("div");
    source.dataset.rivtoBlockEditor = "true";
    source.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
    const receiver = document.createElement("div");
    receiver.tabIndex = -1;
    const target = document.createElement("div");
    receiver.append(target);
    document.body.append(source, receiver);
    editor.attach(source);
    let detach = () => {};
    const unsubscribe = jest.fn();
    const scope = {
      root: receiver,
      /**
       * Captures cancellation for this fixture's foreign attachment.
       *
       * @param listener - Source cancellation callback.
       * @returns Fixture disposer observed after every gesture exit.
       */
      onDetach(listener: () => void) {
        detach = listener;
        return unsubscribe;
      },
    };
    const destination = { kind: "inside" as const, parentId: "source" };
    const canMove = jest.fn(() => true);
    const moveBlocks = jest.fn(() => true);
    editor.extensions.register(
      "drag",
      new BlockDragExtension(
        { canMove, moveBlocks },
        {
          resolve: () => ({ element: target, destination, scope }),
        },
      ),
    );
    try {
      pointer(source.querySelector("button")!, "pointerdown", 100);
      pointer(window, "pointermove", 110);
      expect(canMove).toHaveBeenLastCalledWith(["source"], destination, scope);
      expect(target.hasAttribute("data-block-drop-active")).toBe(true);
      if (cancel) {
        detach();
      }
      pointer(window, "pointerup", 110);
      expect(moveBlocks).toHaveBeenCalledTimes(cancel ? 0 : 1);
      if (!cancel) {
        expect(document.activeElement).toBe(receiver);
      }
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(target.hasAttribute("data-block-drop-active")).toBe(false);
      expect(source.querySelector(".rivto-block-drag-preview")).toBeNull();
      const release = editor.pointer.acquire();
      expect(release).toBeDefined();
      release?.();
    } finally {
      editor.destroy();
      source.remove();
      receiver.remove();
    }
  },
);

it.each(["Escape", "blur", "pointercancel", "detach", "released-button"])(
  "restores source appearance and pointer ownership on %s",
  (exit) => {
    const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
    editor.extensions.register(
      "drag",
      new BlockDragExtension(
        { canMove: () => true, moveBlocks: () => true },
        { resolve: () => undefined },
      ),
    );
    const root = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    root.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
    document.body.append(root);
    const detach = editor.attach(root);
    try {
      const handle = root.querySelector("button")!;
      pointer(handle, "pointerdown", 100);
      pointer(window, "pointermove", 110);
      expect(handle.parentElement!.getAttribute("data-dragging")).toBe("true");
      expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
      if (exit === "detach") {
        detach();
      } else if (exit === "Escape") {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else if (exit === "pointercancel") {
        pointer(window, "pointercancel", 110);
      } else if (exit === "released-button") {
        pointer(window, "pointermove", 110, 0);
      } else {
        window.dispatchEvent(new Event("blur"));
      }
      expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(false);
      expect(root.querySelector("[data-dragging]")).toBeNull();
      expect(root.querySelector(".rivto-block-drag-preview")).toBeNull();
      const release = editor.pointer.acquire();
      expect(release).toBeDefined();
      release?.();
    } finally {
      editor.destroy();
      root.remove();
    }
  },
);

it.each(["pointerup", "pointercancel"])(
  "does not consume new control activation after %s without a source click",
  (ending) => {
    const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
    editor.extensions.register(
      "drag",
      new BlockDragExtension(
        { canMove: () => true, moveBlocks: () => true },
        { resolve: () => undefined },
      ),
    );
    const root = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    root.innerHTML =
      '<div data-block-id="source"><button data-block-drag-handle></button><input type="checkbox"></div>';
    document.body.append(root);
    editor.attach(root);
    const handle = root.querySelector("button")!;
    const control = root.querySelector("input")!;
    try {
      pointer(handle, "pointerdown", 100);
      pointer(window, "pointermove", 110);
      pointer(window, ending, 110);
      control.click();
      expect(control.checked).toBe(true);
      control.checked = false;
      control.addEventListener("pointerdown", (event) => event.stopPropagation());
      pointer(control, "pointerdown", 110);
      pointer(control, "pointerup", 110);
      control.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
      expect(control.checked).toBe(true);
      pointer(handle, "pointerdown", 100);
      pointer(window, "pointermove", 110);
      expect(handle.parentElement!.getAttribute("data-dragging")).toBe("true");
      expect(document.documentElement.hasAttribute("data-block-drag-active")).toBe(true);
      pointer(window, "pointerup", 110);
      const trailingClick = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
      handle.dispatchEvent(trailingClick);
      expect(trailingClick.defaultPrevented).toBe(false);
    } finally {
      editor.destroy();
      root.remove();
    }
  },
);

it("commits release coordinates before a control stops bubbling and the pointer moves away", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const moveBlocks = jest.fn(() => true);
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="source"><button data-block-drag-handle></button></div><button id="target"></button>';
  document.body.append(root);
  editor.attach(root);
  const target = root.querySelector<HTMLElement>("#target")!;
  const destination = { kind: "inside" as const, parentId: "receiver" };
  const resolve = jest.fn(() => ({ element: target, destination }));
  editor.extensions.register(
    "drag",
    new BlockDragExtension({ canMove: () => true, moveBlocks }, { resolve }),
  );
  target.addEventListener("pointerup", (event) => event.stopPropagation());
  try {
    pointer(root.querySelector("[data-block-drag-handle]")!, "pointerdown", 100);
    pointer(target, "pointermove", 120);
    pointer(target, "pointerup", 120);
    pointer(window, "pointermove", 500, 0);
    pointer(window, "pointerup", 500);
    expect(moveBlocks).toHaveBeenCalledTimes(1);
    expect(moveBlocks).toHaveBeenCalledWith(["source"], destination, undefined);
    expect(resolve).toHaveBeenLastCalledWith(120, 100, new Set(["source"]), undefined);
    expect(root.querySelector("[data-dragging], .rivto-block-drag-preview")).toBeNull();
  } finally {
    editor.destroy();
    root.remove();
  }
});

it.each([false, true])("finishes the displayed target on a lost release, revoked=%s", (revoked) => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="source"><button data-block-drag-handle></button></div><div id="target"></div>';
  document.body.append(root);
  editor.attach(root);
  const target = root.querySelector<HTMLElement>("#target")!;
  const destination = { kind: "inside" as const, parentId: "receiver" };
  const resolve = jest.fn(() => ({ element: target, destination }));
  const canMove = jest.fn(() => true);
  const moveBlocks = jest.fn(() => true);
  editor.extensions.register("drag", new BlockDragExtension({ canMove, moveBlocks }, { resolve }));
  try {
    pointer(root.querySelector("button")!, "pointerdown", 100);
    pointer(target, "pointermove", 120);
    canMove.mockReturnValue(!revoked);
    pointer(window, "pointermove", 500, 0);
    pointer(window, "pointerup", 500);
    if (revoked) {
      expect(moveBlocks).not.toHaveBeenCalled();
    } else {
      expect(moveBlocks).toHaveBeenCalledTimes(1);
      expect(moveBlocks).toHaveBeenCalledWith(["source"], destination, undefined);
    }
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(root.querySelector("[data-dragging], .rivto-block-drag-preview")).toBeNull();
    const release = editor.pointer.acquire();
    expect(release).toBeDefined();
    release?.();
  } finally {
    editor.destroy();
    root.remove();
  }
});

it("refreshes held-pointer geometry on window and nested scroll without retaining the native hit", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const resolve = jest.fn(() => undefined);
  editor.extensions.register(
    "drag",
    new BlockDragExtension({ canMove: () => true, moveBlocks: () => true }, { resolve }),
  );
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="source"><button data-block-drag-handle></button></div>';
  document.body.append(root);
  editor.attach(root);
  try {
    pointer(root.querySelector("button")!, "pointerdown", 100);
    pointer(root.querySelector("button")!, "pointermove", 110);
    resolve.mockClear();
    window.dispatchEvent(new Event("scroll"));
    expect(resolve).toHaveBeenLastCalledWith(110, 100, new Set(["source"]), undefined);
    resolve.mockClear();
    root.dispatchEvent(new Event("scroll"));
    expect(resolve).toHaveBeenCalledTimes(1);
    pointer(window, "pointerup", 110);
    resolve.mockClear();
    window.dispatchEvent(new Event("scroll"));
    expect(resolve).not.toHaveBeenCalled();
  } finally {
    editor.destroy();
    root.remove();
  }
});
