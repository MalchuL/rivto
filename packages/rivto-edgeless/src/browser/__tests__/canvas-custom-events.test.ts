/** @jest-environment jsdom */
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";

interface CustomEvents {
  "document-saved": { documentId: string };
}

it("delivers typed custom events through the viewport across remounts", () => {
  const viewport = new CanvasViewport<CustomEvents>(new Canvas());
  const received: string[] = [];
  const stopObserver = viewport.events.observe(
    { kind: "custom", id: "observe-save", type: "document-saved" },
    (event) => received.push(`observer:${event.documentId}`),
  );
  const stopHandler = viewport.events.register({
    kind: "custom",
    id: "handle-save",
    type: "document-saved",
    handle: (event) => {
      received.push(`handler:${event.documentId}`);
      return "handled";
    },
  });
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const detach = viewport.attach(root, plane);
  expect(viewport.events.publish("document-saved", { documentId: "first" })).toBe("handled");
  detach();
  const detachAgain = viewport.attach(root, plane);
  stopHandler();
  expect(viewport.events.publish("document-saved", { documentId: "second" })).toBe("continue");
  expect(received).toEqual(["observer:first", "handler:first", "observer:second"]);
  stopObserver();
  detachAgain();
});

it("uses one identity namespace and respects removals during custom delivery", () => {
  const viewport = new CanvasViewport<CustomEvents>(new Canvas());
  const received: string[] = [];
  let releaseLater = () => {};
  const releaseFirst = viewport.events.register({
    kind: "custom",
    id: "first",
    type: "document-saved",
    priority: 10,
    handle: () => {
      received.push("first");
      releaseLater();
    },
  });
  releaseLater = viewport.events.register({
    kind: "custom",
    id: "later",
    type: "document-saved",
    handle: () => {
      received.push("later");
    },
  });
  expect(() => viewport.events.register({ id: "first", type: "click", handle: () => {} })).toThrow();
  expect(viewport.events.publish("document-saved", { documentId: "doc" })).toBe("continue");
  expect(received).toEqual(["first"]);
  releaseFirst();
  releaseLater();
  // @ts-expect-error Custom event payload must match its declared event name.
  expect(viewport.events.publish("document-saved", { documentId: 1 })).toBe("continue");
  // @ts-expect-error Undeclared custom events are rejected at the editor boundary.
  expect(viewport.events.publish("unknown", { documentId: "doc" })).toBe("continue");
});
