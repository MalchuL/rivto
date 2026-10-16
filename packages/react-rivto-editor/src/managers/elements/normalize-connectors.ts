import { createEdgelessDefaults } from "./tool-state";
import type { ReactEditorApi } from "../../editor/types";
import { ElementGeometry } from "../../elements/element-geometry";
import type {
  ConnectorEndpoint,
  ConnectorVisual,
  OrphanConnectorBehavior,
} from "../../elements/visuals/types";
import { connectorFrame, endpointPoint } from "../../elements/visuals/utils/geometry";

/**
 * Installs one document-wide connector reconciliation subscription, independent
 * of panel mounting.
 *
 * Subsequent document notifications recompute attached endpoint positions and
 * connector frames. Missing targets are detached at their stored positions unless
 * orphan deletion is requested. Only changed records are written; a reentrancy
 * guard prevents these writes from recursively reconciling the document.
 * References to the connector itself or its ancestors are detached at their stored
 * positions so attachment geometry cannot depend on the connector's own frame.
 * Registration does not perform an initial reconciliation.
 *
 * @param editor - React editor whose complete document supplies connector targets.
 * @param options - Connector maintenance options; orphanConnectors selects deletion or detachment
 * when an attached target no longer has usable geometry.
 * @returns Unsubscribe callback that stops automatic connector reconciliation.
 */
export function registerConnectorNormalization(
  editor: ReactEditorApi,
  options: { readonly orphanConnectors?: OrphanConnectorBehavior },
): () => void {
  const geometry = new ElementGeometry(
    (id) => editor.elements.getElementNode(id),
    (id) => {
      const element = editor.elements.getElementNode(id);
      return editor.elementTypes.get(element?.type ?? "")?.behavior?.absoluteGeometry
        ? 0
        : undefined;
    },
  );
  const defaults = createEdgelessDefaults().connector;
  const rotation = (id: string): number => geometry.rotation(id);
  const resolveEndpoint = (endpoint: ConnectorEndpoint) =>
    endpointPoint(
      endpoint,
      endpoint.elementId ? geometry.frame(endpoint.elementId) : undefined,
      endpoint.elementId ? rotation(endpoint.elementId) : 0,
    );
  let reconciling = false;
  return editor.subscribe(() => {
    if (reconciling) {
      return;
    }
    reconciling = true;
    try {
      normalizeConnectors();
    } finally {
      reconciling = false;
    }
  });

  /**
   * Reconciles every connector against current target geometry and orphan policy.
   *
   * Attached endpoints receive current canvas positions, including target rotation.
   * If a target has no bounds, its endpoint loses the element reference but retains
   * its stored position. The delete policy instead removes the connector when
   * either target is missing. Frames include route and target bounds, and unchanged
   * endpoint/frame values do not cause storage writes.
   * Self and ancestor attachments are detached independently of the orphan policy.
   */
  function normalizeConnectors(): void {
    editor.elements
      .getElementNodes()
      .filter((element) => element.type === "connector")
      .map(
        (element) =>
          ({
            ...defaults,
            ...element.props,
            id: element.id,
            frame: element.frame,
          }) as ConnectorVisual,
      )
      .forEach((connector) => {
        let missing = false;
        const ancestors = new Set([connector.id]);
        let parent = editor.elements.getParentId(connector.id);
        while (parent) {
          ancestors.add(parent);
          parent = editor.elements.getParentId(parent);
        }
        const resolve = (endpoint: ConnectorEndpoint): ConnectorEndpoint => {
          if (!endpoint.elementId) {
            return endpoint;
          }
          const inSubtree = editor.elements.getElementNode(endpoint.elementId) !== undefined;
          const circular = ancestors.has(endpoint.elementId);
          const frame = inSubtree && !circular ? geometry.bounds(endpoint.elementId) : undefined;
          if (!frame) {
            missing ||= !circular;
            const detached = { ...endpoint };
            delete detached.elementId;
            return detached;
          }
          return {
            ...endpoint,
            position: endpointPoint(
              endpoint,
              geometry.frame(endpoint.elementId),
              rotation(endpoint.elementId),
            ),
          };
        };
        const source = resolve(connector.source);
        const target = resolve(connector.target);
        if (missing && options.orphanConnectors === "delete") {
          editor.elements.removeElement(connector.id);
          return;
        }
        const sourcePoint = resolveEndpoint(source);
        const targetPoint = resolveEndpoint(target);
        const frame = connectorFrame(
          sourcePoint,
          targetPoint,
          source.anchor,
          target.anchor,
          connector.route,
          source.elementId ? geometry.bounds(source.elementId) : undefined,
          target.elementId ? geometry.bounds(target.elementId) : undefined,
        );
        if (
          JSON.stringify(source) !== JSON.stringify(connector.source) ||
          JSON.stringify(target) !== JSON.stringify(connector.target) ||
          JSON.stringify(frame) !== JSON.stringify(connector.frame)
        ) {
          editor.elements.updateElement(connector.id, { frame, props: { source, target } });
        }
      });
  }
}
