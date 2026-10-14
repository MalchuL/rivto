import type { EditorElementInput, PanelAPI } from '@chulane/rivto';
import type { ConnectorEndpoint, ConnectorVisual } from './types';
import { ElementGeometry } from '../element-geometry';
import { connectorFrame, endpointPoint } from './utils/geometry';

/** Resolves attachment geometry for a connector creation command after defaults are merged.
 * @param input - Connector with merged creation defaults and endpoint properties.
 * @param panel - Receiving panel used to resolve attachment targets.
 * @returns Input with detached endpoints and recomputed bounds, preserving other properties.
 * @throws If endpoints are invalid or reference elements outside the receiving panel.
 */
export function prepareConnector(input: EditorElementInput, panel: PanelAPI): EditorElementInput {
  const props = input.props as unknown as ConnectorVisual;
  const geometry = new ElementGeometry(id => panel.elements.getElementNode(id));
  const endpoint = (value: ConnectorEndpoint): ConnectorEndpoint => {
    if (!value?.anchor || !value.position || ![value.anchor.x, value.anchor.y, value.position.x, value.position.y].every(Number.isFinite)) throw new Error('Connector endpoint requires finite coordinates');
    if (value.elementId && !panel.elements.hasElement(value.elementId)) throw new Error(`Connector endpoint ${value.elementId} not found in panel`);
    return structuredClone(value);
  };
  const resolveEndpoint = (value: ConnectorEndpoint) => {
    const element = value.elementId ? panel.elements.getElementNode(value.elementId) : undefined;
    return endpointPoint(value, value.elementId ? geometry.frame(value.elementId) : undefined, typeof element?.props.rotation === 'number' ? element.props.rotation : 0);
  };
  const source = endpoint(props.source);
  const target = endpoint(props.target);
  const sourcePoint = resolveEndpoint(source);
  const targetPoint = resolveEndpoint(target);
  const route = props.route ?? "straight";
  const frame = connectorFrame(
    sourcePoint,
    targetPoint,
    source.anchor,
    target.anchor,
    route,
    source.elementId ? geometry.bounds(source.elementId) : undefined,
    target.elementId ? geometry.bounds(target.elementId) : undefined,
  );
  return { ...input, frame, props: { ...input.props, source, target, route } };
}
