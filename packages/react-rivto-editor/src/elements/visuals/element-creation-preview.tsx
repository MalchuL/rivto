import { useId, useRef, type CSSProperties } from "react";
import type { EditableLabelFocusPoint } from "../../components";
import type { CreateElementInput } from "../../managers/elements/types";
import type { EdgelessOperations } from "../../managers/elements/edgeless-operations";
import type { VisualFrame } from "./types";
import { useEdgelessElementStyle } from "../../hooks/elements/use-edgeless-element-style";

const ignoreEditing = () => {};

/**
 * Renders the registered element content from detached creation data without document insertion.
 * The host has no persisted selection/slot markers and is inert, hidden from accessibility,
 * and excluded from pointer hit testing. Renderer effects must honor preview=true.
 * The temporary React ID is stable for this mount and never enters the document. Geometry
 * preparation runs during rendering; registration callbacks must be pure.
 * @param props - Draft input, live canvas frame in canvas units, receiving operations,
 * viewport scale factor (1 is 100%), and optional host class/style overrides.
 * @returns Positioned preview using the normal content renderer, or null if its type was removed or operations have no receiving React panel.
 * @throws If registered creation preparation or validation rejects the draft.
 */
export function ElementCreationPreview({
  input,
  frame,
  operations,
  zoom,
  className = "",
  style: hostStyle,
}: {
  readonly input: CreateElementInput;
  readonly frame: VisualFrame;
  readonly operations: EdgelessOperations;
  readonly zoom: number;
  readonly className?: string;
  /** Preset drag shells own screen position and scale; the renderer still receives a canvas-space draft. */
  readonly style?: CSSProperties;
}) {
  const id = useId();
  const focusPointRef = useRef<EditableLabelFocusPoint | null>(null);
  const registration = operations.runtime.elementTypes.get(input.type);
  const prepared = registration
    ? operations.prepareElementCreation({ ...input, frame })
    : undefined;
  const element = prepared && { ...prepared, id, childIds: [...(prepared.childIds ?? [])] };
  const { ref, style } = useEdgelessElementStyle<HTMLDivElement>(
    element,
    registration?.behavior?.absoluteGeometry,
  );
  if (!registration || !element || !operations.reactPanel) {
    return null;
  }
  const Renderer = registration.render;
  return (
    <div
      ref={(host) => {
        ref.current = host;
        // Set the native attribute directly: React 18 does not support the boolean inert prop.
        host?.setAttribute("inert", "");
      }}
      className={`edgeless-visual ${className}`}
      data-edgeless-creation-preview={element.type}
      aria-hidden="true"
      style={{ ...style, zIndex: 2147483640, opacity: 0.7, ...hostStyle }}
    >
      <Renderer
        element={element}
        preview
        reactPanel={operations.reactPanel}
        operations={operations}
        zoom={zoom}
        selected={false}
        editing={false}
        setEditing={ignoreEditing}
        focusPointRef={focusPointRef}
      />
    </div>
  );
}
