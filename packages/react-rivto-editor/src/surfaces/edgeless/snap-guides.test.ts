/** @jest-environment ./jest-browser-environment.mjs */
import { showSnapGuides } from "./snap-guides";

test("updates only the receiving world layer and preserves nested surface guides", () => {
  const plane = document.createElement("div");
  const nested = document.createElement("div");
  nested.innerHTML = '<div data-edgeless-snap-guide="align"></div>';
  plane.append(nested);
  showSnapGuides(plane, [{ axis: "x", position: 20, from: 3, to: 30, kind: "spacing" }]);
  const guide = plane.querySelector<HTMLElement>(":scope > [data-edgeless-snap-guide]");
  expect(guide?.style.left).toBe("20px");
  expect(guide?.style.height).toBe("27px");
  showSnapGuides(plane, []);
  expect(plane.querySelector(":scope > [data-edgeless-snap-guide]")).toBeNull();
  expect(nested.querySelector("[data-edgeless-snap-guide]")).not.toBeNull();
});
