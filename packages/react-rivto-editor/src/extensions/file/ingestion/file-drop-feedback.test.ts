/** @jest-environment ./jest-browser-environment.mjs */
import type { EditorEvent } from "../../../managers/events/editor-event";
import { FileDropFeedback } from "../../../attachments/ingestion/file-drop-feedback";
import { fileDropDestination, pageFileDropTarget } from "../../../attachments/ingestion/file-destination";

test("resolves editable content with the same block target as other regions", () => {
  const root = document.createElement("div");
  const content = document.createElement("div");
  root.append(content);
  const target = { element: content, destination: { kind: "inside", parentId: "block" } };
  const calls: unknown[][] = [];
  const resolve = (...args: unknown[]) => {
    calls.push(args);
    return target;
  };
  const event = {
    root,
    mode: "block",
    contentElement: content,
    reactPanel: { page: { dropTargets: { resolve } } },
    raw: { target: content },
  } as unknown as EditorEvent<"surface", "drop">;
  expect(pageFileDropTarget(event, { x: 10, y: 20 })).toBe(target);
  expect(fileDropDestination(event, { x: 10, y: 20 })).toEqual({
    kind: "block",
    placement: target.destination,
  });
  expect(calls).toEqual([
    [10, 20, undefined, content],
    [10, 20, undefined, content],
  ]);
});

test("does not insert a Page file when no block target resolves", () => {
  const root = document.createElement("div");
  const event = {
    root,
    mode: "block",
    reactPanel: { page: { dropTargets: { resolve: () => undefined } } },
    raw: { target: root },
  } as unknown as EditorEvent<"surface", "drop">;
  expect(fileDropDestination(event, { x: 10, y: 20 })).toBeUndefined();
});

test.each(["panel", "extension", "drop"] as const)(
  "clears active feedback when the %s ends",
  (reason) => {
    const root = document.createElement("div");
    const block = document.createElement("div");
    root.append(block);
    document.body.append(root);
    const controller = new AbortController();
    let releasePanel = () => {};
    const panel = {
      page: {
        dropTargets: {
          resolve: () => ({ element: block, destination: { kind: "inside", parentId: "block" } }),
        },
      },
      registerCleanup: (cleanup: () => void) => {
        let active = true;
        releasePanel = () => {
          if (active) {
            active = false;
            cleanup();
          }
        };
        return releasePanel;
      },
    };
    const feedback = new FileDropFeedback(controller.signal);
    const event = {
      root,
      reactPanel: panel,
      mode: "block",
      contentElement: null,
      raw: { clientX: 10, clientY: 10 },
    } as unknown as EditorEvent<"surface", "dragover">;
    try {
      feedback.update(event);
      expect(block.getAttribute("data-block-drop-active")).toBe("true");
      if (reason === "panel") {
        releasePanel();
      } else if (reason === "extension") {
        controller.abort();
      } else {
        document.dispatchEvent(new Event("drop"));
      }
      expect(block.hasAttribute("data-block-drop-active")).toBe(false);
      expect(root.querySelector(".rivto-block-drop-line")).toBeNull();
    } finally {
      feedback.clear();
      controller.abort();
      root.remove();
    }
  },
);

test("clears the outer panel feedback when the pointer enters an embedded panel", () => {
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "outer";
  const block = document.createElement("div");
  const embedded = document.createElement("div");
  embedded.dataset.rivtoPanel = "inner";
  root.append(block, embedded);
  document.body.append(root);
  const controller = new AbortController();
  const feedback = new FileDropFeedback(controller.signal);
  const event = {
    root,
    reactPanel: {
      page: {
        dropTargets: {
          resolve: () => ({ element: block, destination: { kind: "inside", parentId: "block" } }),
        },
      },
      registerCleanup: (cleanup: () => void) => {
        let active = true;
        return () => {
          if (active) {
            active = false;
            cleanup();
          }
        };
      },
    },
    mode: "block",
    contentElement: null,
    raw: { clientX: 10, clientY: 10 },
  } as unknown as EditorEvent<"surface", "dragover">;
  try {
    feedback.update(event);
    expect(block.getAttribute("data-block-drop-active")).toBe("true");
    block.dispatchEvent(new MouseEvent("dragleave", { bubbles: true, relatedTarget: embedded }));
    expect(block.hasAttribute("data-block-drop-active")).toBe(false);
  } finally {
    feedback.clear();
    controller.abort();
    root.remove();
  }
});
