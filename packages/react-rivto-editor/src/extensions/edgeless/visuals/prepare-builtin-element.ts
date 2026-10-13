import type { EditorElementInput, PanelAPI } from '@chulane/rivto';
import type { CreateVisualPayload, VisualFrame, ConnectorEndpoint } from './types';
import { drawingDefaults, createEdgelessDefaults } from './tool-state';
import { ElementGeometry } from '../element-geometry';
import { connectorFrame, endpointPoint, normalizeRotation } from './utils/geometry';
const copy = <Value>(value: Value): Value => structuredClone(value);

/** Prepares built-in property defaults and connector geometry for a registered creation command. */
export function prepareBuiltinElement(input: EditorElementInput, panel: PanelAPI): EditorElementInput {
  const payload = { ...input.props, kind: input.type, frame: input.frame } as CreateVisualPayload;
  const defaults = createEdgelessDefaults();
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
    let frame = { ...input.frame } as VisualFrame;
    let props: Record<string, unknown>;
    if (payload.kind === "sticker") {
      props = { ...defaults.sticker, rotation: normalizeRotation(payload.rotation ?? 0), text: payload.text ?? "Sticky note", fill: payload.fill ?? defaults.sticker.fill, color: payload.color ?? defaults.sticker.color, fontFamily: payload.fontFamily ?? defaults.sticker.fontFamily, fontSize: payload.fontSize ?? defaults.sticker.fontSize, align: payload.align ?? defaults.sticker.align, verticalAlign: payload.verticalAlign ?? defaults.sticker.verticalAlign };
    } else if (payload.kind === "drawing") {
      if (!Array.isArray(payload.points) || payload.points.length < 2) throw new Error("Drawing requires at least two points");
      const brush = payload.brush ?? defaults.drawing.brush;
      const preset = brush === defaults.drawing.brush ? defaults.drawing : drawingDefaults[brush];
      props = { rotation: normalizeRotation(payload.rotation ?? 0), points: copy(payload.points), brush, stroke: payload.stroke ?? preset.stroke, strokeWidth: payload.strokeWidth ?? preset.strokeWidth, opacity: payload.opacity ?? preset.opacity };
    } else if (payload.kind === "connector") {
      const source = endpoint(payload.source);
      const target = endpoint(payload.target);
      const sourcePoint = resolveEndpoint(source);
      const targetPoint = resolveEndpoint(target);
      const route = payload.route ?? defaults.connector.route;
      frame = connectorFrame(
        sourcePoint,
        targetPoint,
        source.anchor,
        target.anchor,
        route,
        source.elementId ? geometry.bounds(source.elementId) : undefined,
        target.elementId ? geometry.bounds(target.elementId) : undefined,
      );
      props = {
        ...defaults.connector,
        source,
        target,
        route,
        stroke: payload.stroke ?? defaults.connector.stroke,
        strokeWidth: payload.strokeWidth ?? defaults.connector.strokeWidth,
        opacity: payload.opacity ?? defaults.connector.opacity,
        lineStyle: payload.lineStyle ?? defaults.connector.lineStyle,
        startStyle: payload.startStyle ?? defaults.connector.startStyle,
        endStyle: payload.endStyle ?? defaults.connector.endStyle,
        text: payload.text ?? defaults.connector.text,
        textRotation: payload.textRotation ?? defaults.connector.textRotation,
        color: payload.color ?? defaults.connector.color,
        fontFamily: payload.fontFamily ?? defaults.connector.fontFamily,
        fontSize: payload.fontSize ?? defaults.connector.fontSize,
        align: payload.align ?? defaults.connector.align,
        verticalAlign: payload.verticalAlign ?? defaults.connector.verticalAlign,
      };
    } else if (payload.kind === "text") {
      props = { ...defaults.text, rotation: normalizeRotation(payload.rotation ?? 0), text: payload.text ?? "Text", color: payload.color ?? defaults.text.color, fontFamily: payload.fontFamily ?? defaults.text.fontFamily, fontSize: payload.fontSize ?? defaults.text.fontSize, align: payload.align ?? defaults.text.align, verticalAlign: payload.verticalAlign ?? defaults.text.verticalAlign };
    } else {
      props = {
        rotation: normalizeRotation(payload.rotation ?? 0),
        fill: payload.fill ?? defaults.shape.fill,
        stroke: payload.stroke ?? defaults.shape.stroke,
        strokeWidth: payload.strokeWidth ?? defaults.shape.strokeWidth,
        filled: payload.filled ?? defaults.shape.filled,
        stroked: payload.stroked ?? defaults.shape.stroked,
        text: payload.text ?? defaults.shape.text,
        color: payload.color ?? defaults.shape.color,
        fontFamily: payload.fontFamily ?? defaults.shape.fontFamily,
        fontSize: payload.fontSize ?? defaults.shape.fontSize,
        align: payload.align ?? defaults.shape.align,
        verticalAlign: payload.verticalAlign ?? defaults.shape.verticalAlign,
      };
    }
    return { ...input, frame, props };
}
