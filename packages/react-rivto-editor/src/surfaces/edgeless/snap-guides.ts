import type { SnapGuide } from "../../elements/visuals/utils/geometry";

/**
 * Renders the current snap guides into an edgeless plane, removing stale guides.
 *
 * @param plane - Mounted receiving world layer; missing attachments are ignored.
 * @param values - Current alignment guides in world coordinates.
 * @returns The owning plane contains exactly these guides without a document mutation.
 */
export function showSnapGuides(plane: HTMLElement | null, values: readonly SnapGuide[]): void {
  if (!plane) {
    return;
  }
  const existing = [...plane.querySelectorAll<HTMLElement>(":scope > [data-edgeless-snap-guide]")];
  values.forEach((guide, index) => {
    const element = existing[index] ?? plane.ownerDocument.createElement("div");
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
    if (!existing[index]) {
      plane.append(element);
    }
  });
  existing.slice(values.length).forEach((guide) => guide.remove());
}
