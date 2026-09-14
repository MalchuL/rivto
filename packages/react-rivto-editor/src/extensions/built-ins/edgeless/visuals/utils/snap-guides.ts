import type { SnapGuide } from "./geometry";

/** Renders the current snap guides into an edgeless plane, removing stale guides. */
export function showSnapGuides(root: HTMLElement, values: readonly SnapGuide[]): void {
  const plane = root.querySelector("[data-edgeless-plane]");
  if (!plane) return;
  const existing = [...root.querySelectorAll<HTMLElement>("[data-edgeless-snap-guide]")];
  values.forEach((guide, index) => {
    const element = existing[index] ?? root.ownerDocument.createElement("div");
    element.dataset.edgelessSnapGuide = guide.kind;
    element.className = `edgeless-snap-guide edgeless-snap-guide-${guide.axis}`;
    if (guide.axis === "x") {
      Object.assign(element.style, {
        left: `${guide.position}px`,
        top: `${guide.from}px`,
        height: `${guide.to - guide.from}px`,
        width: "",
      });
    } else {
      Object.assign(element.style, {
        top: `${guide.position}px`,
        left: `${guide.from}px`,
        width: `${guide.to - guide.from}px`,
        height: "",
      });
    }
    if (!existing[index]) plane.append(element);
  });
  existing.slice(values.length).forEach((guide) => guide.remove());
}
