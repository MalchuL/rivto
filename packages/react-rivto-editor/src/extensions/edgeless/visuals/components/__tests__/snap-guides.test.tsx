/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SnapGuides } from "../snap-guides";

it("clears only the guides owned by the updated canvas occurrence", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const first = document.createElement("div");
  const second = document.createElement("div");
  const firstRoot = createRoot(first);
  const secondRoot = createRoot(second);
  try {
    act(() => {
      firstRoot.render(
        <SnapGuides guides={[{ axis: "x", position: 12, from: 5, to: 25, kind: "align" }]} />,
      );
      secondRoot.render(
        <SnapGuides guides={[{ axis: "y", position: 20, from: 10, to: 40, kind: "spacing" }]} />,
      );
    });
    const vertical = first.querySelector<HTMLElement>('[data-edgeless-snap-guide="align"]')!;
    const horizontal = second.querySelector<HTMLElement>('[data-edgeless-snap-guide="spacing"]')!;
    expect([vertical.style.left, vertical.style.top, vertical.style.height]).toEqual([
      "12px",
      "5px",
      "20px",
    ]);
    expect([horizontal.style.left, horizontal.style.top, horizontal.style.width]).toEqual([
      "10px",
      "20px",
      "30px",
    ]);
    act(() => firstRoot.render(<SnapGuides guides={[]} />));
    expect(first.querySelector("[data-edgeless-snap-guide]")).toBeNull();
    expect(second.querySelector("[data-edgeless-snap-guide]")).toBe(horizontal);
  } finally {
    act(() => {
      firstRoot.unmount();
      secondRoot.unmount();
    });
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
