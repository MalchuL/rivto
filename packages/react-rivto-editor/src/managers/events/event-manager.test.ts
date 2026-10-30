/** @jest-environment ./jest-browser-environment.mjs */
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import type { EditorEvent } from "./editor-event";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

let core: Awaited<ReturnType<typeof createTestCoreEditor>>;
let panel: ReturnType<typeof createTestReactEditor>;
let root: HTMLElement;

beforeEach(async () => {
  core = await createTestCoreEditor();
  panel = createTestReactEditor({ editor: core });
  root = document.createElement("div");
  root.dataset.rivtoPanel = "events-test";
  root.dataset.rivtoSurface = "block";
  document.body.append(root);
  panel.setRoot(root);
});

afterEach(async () => {
  jestApi.restoreAllMocks();
  panel.destroy();
  await panel.editor.destroy();
  await core.destroy();
  root.remove();
});

it("rolls back failed native attachment and permits the registration ID to be reused", () => {
  const failure = new Error("native attachment failed");
  const stale = jestApi.fn();
  const replacement = jestApi.fn();
  jestApi.spyOn(root, "addEventListener").mockImplementationOnce(() => {
    throw failure;
  });
  expect(() => panel.events.register({ id: "retry", type: "click" }, stale)).toThrow(failure);
  panel.events.register({ id: "retry", type: "click" }, replacement);
  clickRoot();
  expect(stale).not.toHaveBeenCalled();
  expect(replacement).toHaveBeenCalledTimes(1);
});

it("rolls back native delivery when retaining extension cleanup fails", () => {
  const failure = new Error("cleanup ownership failed");
  const stale = jestApi.fn();
  jestApi.spyOn(panel.editor.extensions, "registerCleanup").mockImplementationOnce(() => {
    throw failure;
  });
  expect(() => panel.events.register({ id: "retry", type: "click" }, stale)).toThrow(failure);
  clickRoot();
  expect(stale).not.toHaveBeenCalled();
  expect(() => panel.events.register({ id: "retry", type: "click" }, () => {})).not.toThrow();
});

it("retains setup and native rollback errors without reserving the failed ID", () => {
  const setupFailure = new Error("cleanup ownership failed");
  const cleanupFailure = new Error("native removal failed");
  const stale = jestApi.fn();
  jestApi.spyOn(panel.editor.extensions, "registerCleanup").mockImplementationOnce(() => {
    throw setupFailure;
  });
  jestApi.spyOn(root, "removeEventListener").mockImplementationOnce(() => {
    throw cleanupFailure;
  });
  let failure: unknown;
  try {
    panel.events.register({ id: "retry", type: "click" }, stale);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).toHaveProperty("errors", [
    setupFailure,
    expect.objectContaining({ errors: [cleanupFailure] }),
  ]);
  const replacement = jestApi.fn();
  panel.events.register({ id: "retry", type: "click" }, replacement);
  clickRoot();
  expect(stale).not.toHaveBeenCalled();
  expect(replacement).toHaveBeenCalledTimes(1);
});

/**
 * Dispatches one real bubbling native event through the mounted host listeners.
 *
 * @returns The event, allowing assertions on cancellation after all native phases.
 */
function clickRoot(): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  root.dispatchEvent(event);
  return event;
}

it("does not skip the next handler when the current handler removes itself", () => {
  const seen: string[] = [];
  const remove = panel.events.register({ id: "first", type: "click" }, () => {
    seen.push("first");
    remove();
  });
  panel.events.register({ id: "second", type: "click" }, () => {
    seen.push("second");
  });
  clickRoot();
  expect(seen).toEqual(["first", "second"]);
});

it("defers a newly added handler until the next native event", () => {
  const seen: string[] = [];
  let installed = false;
  panel.events.register({ id: "first", type: "click" }, () => {
    seen.push("first");
    if (!installed) {
      installed = true;
      panel.events.register({ id: "new", type: "click" }, () => {
        seen.push("new");
      });
    }
  });
  panel.events.register({ id: "second", type: "click" }, () => {
    seen.push("second");
  });
  clickRoot();
  expect(seen).toEqual(["first", "second"]);
  seen.length = 0;
  clickRoot();
  expect(seen).toEqual(["first", "second", "new"]);
});

it("skips a removed later handler and defers a replacement reusing its ID", () => {
  const seen: string[] = [];
  const removeFirst = panel.events.register({ id: "first", type: "click" }, () => {
    removeLater();
    removeFirst();
    panel.events.register({ id: "later", type: "click" }, () => {
      seen.push("replacement");
    });
  });
  const removeLater = panel.events.register({ id: "later", type: "click" }, () => {
    seen.push("old");
  });
  clickRoot();
  expect(seen).toEqual([]);
  removeLater();
  clickRoot();
  expect(seen).toEqual(["replacement"]);
});

it("skips a handler removed by its own availability predicate", () => {
  const seen: string[] = [];
  const remove = panel.events.register(
    {
      id: "predicate",
      type: "click",
      when: () => {
        remove();
        return true;
      },
    },
    () => {
      seen.push("removed");
    },
  );
  panel.events.register({ id: "next", type: "click" }, () => {
    seen.push("next");
  });
  clickRoot();
  expect(seen).toEqual(["next"]);
});

it("preserves pending listener groups when a handler changes registrations", () => {
  const seen: string[] = [];
  const remove = panel.events.register({ id: "active", type: "click" }, () => {
    seen.push("active");
    remove();
  });
  panel.events.register({ id: "passive", type: "click", passive: true }, () => {
    seen.push("passive");
  });
  clickRoot();
  expect(seen).toEqual(["active", "passive"]);
});

it("defers additions across capture, bubble and window delivery", () => {
  const seen: string[] = [];
  const remove = panel.events.register({ id: "capture", type: "click", capture: true }, () => {
    remove();
    panel.events.register({ id: "new-window", type: "click", target: "window" }, () => {
      seen.push("new-window");
    });
  });
  panel.events.register({ id: "bubble", type: "click" }, () => {
    seen.push("bubble");
  });
  panel.events.register({ id: "window", type: "click", target: "window" }, () => {
    seen.push("window");
  });
  clickRoot();
  expect(seen).toEqual(["bubble", "window"]);
  seen.length = 0;
  clickRoot();
  expect(seen).toEqual(["bubble", "window", "new-window"]);
});

it("gives reentrant native events their own registration snapshot", () => {
  const seen: string[] = [];
  let nested = false;
  panel.events.register({ id: "first", type: "click" }, () => {
    seen.push("first");
    if (!nested) {
      nested = true;
      panel.events.register({ id: "new", type: "click" }, () => {
        seen.push("new");
      });
      clickRoot();
    }
  });
  panel.events.register({ id: "second", type: "click" }, () => {
    seen.push("second");
  });
  clickRoot();
  expect(seen).toEqual(["first", "first", "second", "new", "second"]);
});

it.each([
  { passive: false, preventDefault: true, cancelled: true },
  { passive: false, preventDefault: false, cancelled: false },
  { passive: true, preventDefault: true, cancelled: false },
])("preserves claims and native propagation with %o", ({ passive, preventDefault, cancelled }) => {
  const seen: string[] = [];
  const remove = panel.events.register(
    { id: "claim", type: "click", passive, preventDefault },
    () => {
      seen.push("claim");
      remove();
      return true;
    },
  );
  panel.events.register({ id: "later", type: "click", passive }, () => {
    seen.push("later");
  });
  panel.events.register({ id: "window", type: "click", target: "window" }, () => {
    seen.push("window");
  });
  root.addEventListener("click", () => {
    seen.push("native");
  });
  expect(clickRoot().defaultPrevented).toBe(cancelled);
  expect(seen).toEqual(["claim", "native"]);
});

it("stops delivery when an earlier handler destroys the runtime", () => {
  const seen: string[] = [];
  panel.events.register({ id: "destroy", type: "click" }, () => {
    seen.push("destroy");
    panel.editor.destroy();
  });
  panel.events.register({ id: "later", type: "click" }, () => {
    seen.push("later");
  });
  clickRoot();
  expect(seen).toEqual(["destroy"]);
});

it("shares receiving-panel context across predicates and handlers", () => {
  const block = document.createElement("div");
  block.dataset.blockId = "event-block";
  const content = document.createElement("div");
  content.dataset.blockContent = "";
  block.append(content);
  root.append(block);
  const predicate = jestApi.fn<boolean, [EditorEvent<"surface", "click">]>(() => true);
  const handler = jestApi.fn<void, [EditorEvent<"surface", "click">]>();
  panel.events.register(
    { id: "context", type: "click", mode: "block", scope: "content", when: predicate },
    handler,
  );
  content.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(handler).toHaveBeenCalledTimes(1);
  const event = handler.mock.calls[0][0];
  expect(event).toBe(predicate.mock.calls[0][0]);
  expect(event.reactPanel.getRoot()).toBe(root);
  expect(event.root).toBe(root);
  expect(event.mode).toBe("block");
  expect(event.insideRoot).toBe(true);
  expect(event.blockElement).toBe(block);
  expect(event.blockId).toBe("event-block");
  expect(event.contentElement).toBe(content);
});

it("delivers outside window events without block context only to matching scopes and modes", () => {
  const unscoped = jestApi.fn<void, [EditorEvent<"window", "click">]>();
  const scoped = jestApi.fn();
  const wrongMode = jestApi.fn();
  panel.events.register({ id: "unscoped", type: "click", target: "window" }, unscoped);
  panel.events.register(
    { id: "scoped", type: "click", target: "window", scope: "surface" },
    scoped,
  );
  panel.events.register(
    { id: "mode", type: "click", target: "window", mode: ["edgeless"] },
    wrongMode,
  );
  // Clear the in-root delivery before checking input outside the default panel.
  clickRoot();
  unscoped.mockClear();
  scoped.mockClear();
  document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(unscoped).toHaveBeenCalledTimes(1);
  const event = unscoped.mock.calls[0][0];
  expect(event.root).toBe(root);
  expect(event.insideRoot).toBe(false);
  expect(event.blockElement).toBeNull();
  expect(event.blockId).toBeUndefined();
  expect(event.contentElement).toBeNull();
  expect(scoped).not.toHaveBeenCalled();
  expect(wrongMode).not.toHaveBeenCalled();
});
