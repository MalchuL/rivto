/**
 * Pure membership for live connector previews during a canvas transform.
 *
 * Pointermove must not scan every canvas element or rebuild SVG. Gesture start
 * snapshots which connectors need a CSS translate versus a path rebuild; later
 * frames only update those IDs. A connector is ignored when neither endpoint
 * object is moving and both ends stay attached — selecting the stroke alone
 * does not drag its anchors.
 */
import type { ConnectorEndpoint } from "./visuals/types";

/** How a live preview should follow a transforming selection. */
export type ConnectorPreviewKind = "translate" | "path";

/**
 * One connector that must track a transform, plus whether CSS translate is enough.
 *
 * `sourceMoves` / `targetMoves` are true when that endpoint's attached object is
 * in the moving leaf set. `connectorMoves` is true when the connector id itself
 * is moving or selected (free endpoints then translate with the stroke).
 */
export interface ConnectorPreviewTarget {
  readonly id: string;
  readonly kind: ConnectorPreviewKind;
  readonly sourceMoves: boolean;
  readonly targetMoves: boolean;
  readonly connectorMoves: boolean;
}

/** Minimal persisted record needed to classify connector preview membership. */
export interface ConnectorPreviewRecord {
  readonly id: string;
  readonly type: string;
  readonly props: {
    readonly source?: unknown;
    readonly target?: unknown;
  };
}

/**
 * Reports whether a value is a persisted connector endpoint.
 *
 * @param value - Untyped element prop.
 * @returns True when `anchor` and `position` are present.
 */
export function isConnectorEndpoint(value: unknown): value is ConnectorEndpoint {
  return Boolean(value && typeof value === "object" && "anchor" in value && "position" in value);
}

/**
 * Lists connectors that must live-preview a move, resize, or rotate.
 *
 * Translate-only membership requires a `move` gesture where both ends share the
 * same dx/dy (attached objects moving, or free endpoints on a moving connector).
 * Resize and rotate always rebuild the path because geometry is not a translation.
 *
 * @param elements - Current first-class canvas elements.
 * @param movingIds - Leaf object IDs included in the transform (groups expanded).
 * @param selectedIds - Gesture target IDs before leaf expansion.
 * @param transformKind - Active transform mode.
 * @returns Connectors that need a preview, in document order.
 */
export function attachedConnectorsForTransform(
  elements: readonly ConnectorPreviewRecord[],
  movingIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
  transformKind: "move" | "resize" | "rotate",
): ConnectorPreviewTarget[] {
  const attached: ConnectorPreviewTarget[] = [];
  for (const element of elements) {
    if (element.type !== "connector") continue;
    const source = element.props.source;
    const target = element.props.target;
    if (!isConnectorEndpoint(source) || !isConnectorEndpoint(target)) continue;
    const sourceMoves = Boolean(source.elementId && movingIds.has(source.elementId));
    const targetMoves = Boolean(target.elementId && movingIds.has(target.elementId));
    const connectorMoves = movingIds.has(element.id) || selectedIds.has(element.id);
    if (!sourceMoves && !targetMoves && !connectorMoves) continue;
    // Attached at both ends and neither anchor object is moving: the stroke
    // stays put even if the connector id is in the selection.
    if (!sourceMoves && !targetMoves && source.elementId && target.elementId) continue;
    const sourceTranslates = sourceMoves || Boolean(connectorMoves && !source.elementId);
    const targetTranslates = targetMoves || Boolean(connectorMoves && !target.elementId);
    const kind: ConnectorPreviewKind = transformKind === "move" && sourceTranslates && targetTranslates
      ? "translate"
      : "path";
    attached.push({
      id: element.id,
      kind,
      sourceMoves,
      targetMoves,
      connectorMoves,
    });
  }
  return attached;
}
