import type { EditorElementFrame } from "@chulane/rivto";
import type { ConnectorPreviewTarget } from "./edgeless-transform-connectors";
import type { ElementGeometry } from "../../elements/element-geometry";

/** Geometry computed by Moveable for one leaf, in canvas units and clockwise degrees. */
export interface ElementTransformPreview {
  readonly id: string;
  readonly frame: EditorElementFrame;
  readonly rotation: number;
  /** CSS transform supplied by Moveable while persisted left/top remain fixed. */
  readonly transform?: string;
}

export interface TransformStart {
  /** Mounted occurrence that owns this gesture and its preview. */
  readonly root: HTMLElement;
  /** Moveable tracks all three gestures; the editor stores their initial geometry. */
  readonly kind: "move" | "resize" | "rotate";
  previews?: ReadonlyMap<string, ElementTransformPreview>;
  groupRotations?: Map<string, number>;
  previewGeometry?: ElementGeometry;
  stopMoveable?: () => void;
  dx: number;
  dy: number;
  readonly ids: string[];
  readonly frames: Map<string, EditorElementFrame>;
  /** Leaf IDs in this gesture, including group children. */
  readonly moving: ReadonlySet<string>;
  /** Connectors that must live-preview; empty means pointermove skips overlay work. */
  readonly attachedConnectors: readonly ConnectorPreviewTarget[];
  /**
   * AFFiNE progressive groups: after drilling into a child, a click-without-drag
   * should re-select this parent group (exit drill-in) instead of leaving the child selected.
   */
  readonly returnToGroup?: string;
  moved: boolean;
}

/** Reused SVG path and optional label for one path-rebuild connector. */
export interface ConnectorOverlayNode {
  readonly path: SVGPathElement;
  label: HTMLElement | null;
}
