/** @jest-environment jsdom */
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";

it("exposes attachment state without returning its mounted elements", () => {
  const viewport = new CanvasViewport(new Canvas());
  const checkType = () => {
    // @ts-expect-error Native layers are private to the browser integration.
    return viewport.layers;
  };
  void checkType;
  const checkLookup = () => {
    // @ts-expect-error Native element lookup is internal to browser input routing.
    return CanvasViewport.forElement(null);
  };
  void checkLookup;
  expect(viewport).not.toHaveProperty("layers");
  expect(CanvasViewport).not.toHaveProperty("forElement");
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const states: boolean[] = [];
  const unsubscribe = viewport.subscribeAttachment(() => states.push(viewport.isAttached()));
  const detach = viewport.attach(root, plane);
  detach();
  unsubscribe();
  const detachAgain = viewport.attach(root, plane);
  detachAgain();
  expect(states).toEqual([true, false]);
});
