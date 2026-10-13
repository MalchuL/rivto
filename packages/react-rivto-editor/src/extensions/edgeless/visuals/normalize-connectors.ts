import { createEdgelessDefaults } from './tool-state';
import type { ReactEditorApi } from '../../../editor/types';
import { ElementGeometry } from '../element-geometry';
import type { ConnectorEndpoint, ConnectorVisual, EdgelessVisualsOptions } from './types';
import { connectorFrame, endpointPoint } from './utils/geometry';

/**
 * Installs one document-wide connector reconciliation subscription, independent
 * of panel mounting.
 *
 * Subsequent document notifications recompute attached endpoint positions and
 * connector frames. Missing targets are detached at their stored positions unless
 * orphan deletion is requested. Only changed records are written; a reentrancy
 * guard prevents these writes from recursively reconciling the document.
 * Registration does not perform an initial reconciliation.
 *
 * @param editor - React editor whose complete document supplies connector targets.
 * @param options - Visual options; orphanConnectors selects deletion or detachment
 * when an attached target no longer has usable geometry.
 * @returns Unsubscribe callback that stops automatic connector reconciliation.
 */
export function registerConnectorNormalization(editor: ReactEditorApi, options: EdgelessVisualsOptions): () => void {
  const geometry = new ElementGeometry(id => editor.elements.getElementNode(id));
  const defaults = createEdgelessDefaults().connector;
  const rotation = (id: string): number => { const value = editor.elements.getElementNode(id)?.props.rotation; return typeof value === 'number' ? value : 0; };
  const resolveEndpoint = (endpoint: ConnectorEndpoint) => endpointPoint(endpoint, endpoint.elementId ? geometry.frame(endpoint.elementId) : undefined, endpoint.elementId ? rotation(endpoint.elementId) : 0);
  let reconciling = false;
  return editor.subscribe(() => {
    if (reconciling) return;
    reconciling = true;
    try { normalizeConnectors(); } finally { reconciling = false; }
  });

  /**
   * Reconciles every connector against current target geometry and orphan policy.
   *
   * Attached endpoints receive current canvas positions, including target rotation.
   * If a target has no bounds, its endpoint loses the element reference but retains
   * its stored position. The delete policy instead removes the connector when
   * either target is missing. Frames include route and target bounds, and unchanged
   * endpoint/frame values do not cause storage writes.
   */
  function normalizeConnectors(): void {
    editor.elements.getElementNodes().filter(element => element.type === "connector").map(element => ({ ...defaults, ...element.props, id: element.id, frame: element.frame } as ConnectorVisual)).forEach((connector) => {
      let missing = false;
      const resolve = (endpoint: ConnectorEndpoint): ConnectorEndpoint => {
        if (!endpoint.elementId) return endpoint;
        const inSubtree = editor.elements.getElementNode(endpoint.elementId) !== undefined;
        const frame = inSubtree ? geometry.bounds(endpoint.elementId) : undefined;
        if (!frame) {
          missing = true;
          const detached = { ...endpoint };
          delete detached.elementId;
          return detached;
        }
        return { ...endpoint, position: endpointPoint(endpoint, geometry.frame(endpoint.elementId), rotation(endpoint.elementId)) };
      };
      const source = resolve(connector.source);
      const target = resolve(connector.target);
      if (missing && options.orphanConnectors === "delete") { editor.elements.removeElement(connector.id); return; }
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
      if (JSON.stringify(source) !== JSON.stringify(connector.source) || JSON.stringify(target) !== JSON.stringify(connector.target) || JSON.stringify(frame) !== JSON.stringify(connector.frame)) {
        editor.elements.updateElement(connector.id, { frame, props: { source, target } });
      }
    });
  }

}
