import { CanvasDemoEditor } from "./canvas-demo-editor";
import type { CanvasElement } from "@chulane/rivto-edgeless";
import {
  CanvasView,
  CanvasToolbar,
  CanvasEditorProvider,
  useCanvasViewportLayers,
} from "@chulane/rivto-edgeless/react";
import { useMemo, useState } from "react";

/**
 * Renders a plain geometry host without importing any editor package.
 * @param element - Independent canvas projection, including transient geometry.
 * @returns A positioned accessible rectangle.
 */
function renderElement(element: CanvasElement) {
  const { frame, rotation, id } = element;
  return (
    <div
      data-canvas-element={id}
      tabIndex={0}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: frame.width,
        height: frame.height,
        transform: `translate(${frame.x}px, ${frame.y}px) rotate(${rotation}deg)`,
        background: "#dceaff",
        border: "2px solid #3874bf",
        boxSizing: "border-box",
        padding: 12,
      }}
    >
      {id}
    </div>
  );
}

/**
 * Demonstrates virtualization and source-owned commits without a Rivto adapter.
 * @returns An independent canvas with 10,000 rectangles and a commit counter.
 */
export function CanvasDemo() {
  const [visible, setVisible] = useState(true);
  const [commits, setCommits] = useState(0);
  const session = useMemo(() => new CanvasDemoEditor(() => setCommits((value) => value + 1)), []);
  return (
    <CanvasEditorProvider editor={session}>
      <section>
        <p>
          Independent canvas · <output aria-label="Committed gestures">{commits}</output> commits ·
          Space/middle drag to pan, Ctrl+wheel to zoom
        </p>
        <CanvasDemoOptions session={session} />
        <button onClick={() => setVisible((value) => !value)}>
          {visible ? "Hide canvas" : "Show canvas"}
        </button>
        <ViewportStatus />
        {visible && (
          <CanvasView
            canvas={session.canvas}
            aria-label="Independent canvas"
            renderElement={renderElement}
            overlay={
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 1000,
                  background: "white",
                  padding: 8,
                }}
              >
                <CanvasToolbar registry={session.registry} tools={session.tools} />
              </div>
            }
            style={{ width: "100%", height: "85vh", background: "#f7f9fc" }}
          />
        )}
      </section>
    </CanvasEditorProvider>
  );
}

/**
 * Displays attachment state from a sibling extension outside CanvasView.
 *
 * @returns Mount status that follows view detach and remount without rebuilding the editor.
 */
function ViewportStatus() {
  const layers = useCanvasViewportLayers();
  return <output aria-label="Canvas attachment">{layers ? "mounted" : "detached"}</output>;
}

/** Source owner used by the capability controls. */
interface CanvasDemoOptionsProps {
  readonly session: CanvasDemoEditor;
}

/**
 * Demonstrates independent transform capabilities on the first source rectangle.
 *
 * @param props - Application editor whose source owns the capability values.
 * @param props.session - Demo editor retaining source content while the view is hidden.
 * @returns Checkboxes updating source policy rather than presentation-only flags.
 */
function CanvasDemoOptions({ session }: CanvasDemoOptionsProps) {
  const [capabilities, setCapabilities] = useState({
    movable: true,
    resizable: true,
    rotatable: true,
  });
  return (
    <fieldset>
      <legend>First rectangle</legend>
      {(["movable", "resizable", "rotatable"] as const).map((key) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={capabilities[key]}
            onChange={(event) => {
              const next = { ...capabilities, [key]: event.target.checked };
              session.source.setCapabilities("0", next);
              setCapabilities(next);
            }}
          />
          {key}
        </label>
      ))}
    </fieldset>
  );
}
