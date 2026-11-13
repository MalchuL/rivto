/** @jest-environment ../../../jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { EmbeddedContentContext } from "../../components/embedded-content-context";
import { SurfaceContext } from "../../surfaces/surface";
import { useEmbeddedContentContext } from "./use-embedded-content-context";

/** State supplied to the test renderer by its owner. */
interface ProbeProps {
  /** Whether the complete item is selected. */
  readonly selected: boolean;
  /** Whether the occurrence is a detached preview. */
  readonly preview: boolean;
}

test("embedded content context follows its surface and keeps stable identity", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const snapshots: EmbeddedContentContext[] = [];
  /**
   * Records the context supplied to an embedded renderer.
   *
   * @param props - Selection and preview state supplied by the owner.
   * @param props.selected - Whole-item selection state.
   * @param props.preview - Whether the occurrence is a detached preview.
   * @returns No visible DOM.
   */
  function Probe({ selected, preview }: ProbeProps) {
    snapshots.push(useEmbeddedContentContext(selected, preview));
    return null;
  }
  try {
    act(() => root.render(<Probe selected={false} preview={false} />));
    expect(snapshots.at(-1)).toEqual({ mode: "block", selected: false, preview: false });
    const first = snapshots.at(-1);
    act(() => root.render(<Probe selected={false} preview={false} />));
    expect(snapshots.at(-1)).toBe(first);
    act(() =>
      root.render(
        <SurfaceContext.Provider value="edgeless">
          <Probe selected preview={false} />
        </SurfaceContext.Provider>,
      ),
    );
    expect(snapshots.at(-1)).toEqual({ mode: "edgeless", selected: true, preview: false });
    act(() =>
      root.render(
        <SurfaceContext.Provider value="edgeless">
          <Probe selected={false} preview />
        </SurfaceContext.Provider>,
      ),
    );
    expect(snapshots.at(-1)).toEqual({ mode: "edgeless", selected: false, preview: true });
  } finally {
    act(() => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
