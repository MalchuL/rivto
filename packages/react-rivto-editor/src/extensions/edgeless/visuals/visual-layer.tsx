import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useEditorMode, useEditorRoot } from "../../../hooks";
import { useEdgelessSelection } from "../edgeless-runtime";
import { ElementSlots } from "../../../blocks";
import { DrawingCapture } from "./components/drawing-capture";
import { BlockProperties } from "./components/block-properties";
import { SelectionToolbar } from "./components/selection-toolbar";
import { ToolBar } from "./components/tool-bar";
import { VisualElement } from "./components/visual-element";
import { VisualProperties } from "./components/visual-properties";
import type { EdgelessVisualController } from "./controller";
import { useDrawingGesture, type ConnectorHover } from "./hooks/use-drawing-gesture";
import { usePresetDrag } from "./hooks/use-preset-drag";
import { useVisualTool } from "./hooks/use-visual-tool";
import { DEFAULT_FONTS, DEFAULT_STICKERS } from "./presets";
import type { ConnectorEndpoint, EdgelessVisual, EdgelessVisualsOptions } from "./types";
import { canvasPoint } from "./utils/canvas-point";

/** Renders first-class visual elements, the bottom tool bar, and gesture previews. */
export function EdgelessVisualLayer({
  controller,
  options,
}: {
  readonly controller: EdgelessVisualController;
  readonly options: EdgelessVisualsOptions;
}) {
  const { mode } = useEditorMode();
  const { element: root } = useEditorRoot();
  const selection = useEdgelessSelection();
  const tool = useVisualTool(controller);
  useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getRevision(),
    () => controller.getRevision(),
  );
  const plane = root?.querySelector<HTMLElement>("[data-edgeless-plane]") ?? null;
  const zoom = Number(root?.dataset.edgelessZoom) || 1;
  const visuals = controller.getVisuals();
  const groups = controller.getGroups();
  const fontOptions = useMemo(
    () => [...new Map([...DEFAULT_FONTS, ...(options.fonts ?? [])].map((font) => [font.fontFamily, font])).values()],
    [options.fonts],
  );
  const stickerOptions = useMemo(
    () => [...new Map([...DEFAULT_STICKERS, ...(options.stickers ?? [])].map((sticker) => [sticker.id, sticker])).values()],
    [options.stickers],
  );
  const presetDrag = usePresetDrag({ controller, root, plane, zoom });
  const drawing = useDrawingGesture({ controller, root, zoom, tool });
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const [reconnectHover, setReconnectHover] = useState<ConnectorHover | null>(null);

  const resolveEndpoint = useCallback((event: Pick<PointerEvent, "clientX" | "clientY">): ConnectorEndpoint => {
    const point = canvasPoint(event, root, zoom);
    const targetId = drawingRef.current.objectAt(point);
    return targetId
      ? drawingRef.current.endpoint(targetId, point)
      : { elementId: undefined, anchor: { x: .5, y: .5 }, position: point };
  }, [root, zoom]);

  const onReconnectHover = useCallback((event: Pick<PointerEvent, "clientX" | "clientY"> | null) => {
    if (!event) {
      setReconnectHover(null);
      return;
    }
    const point = canvasPoint(event, root, zoom);
    setReconnectHover(drawingRef.current.hoverFor(point));
  }, [root, zoom]);

  useEffect(() => {
    if (!root) return;
    root.dataset.edgelessTool = tool.tool;
  }, [root, tool.tool]);

  useEffect(() => {
    if (!root) return;
    const creationTools = new Set(["place", "drawing", "eraser", "connector"]);
    const onContextMenu = (event: MouseEvent) => {
      if (!creationTools.has(controller.getTool().tool)) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-edgeless-ui]")) return;
      event.preventDefault();
      controller.reactEditor.editor.execute("edgeless.tool.set", "select");
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      if (!creationTools.has(controller.getTool().tool)) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-edgeless-ui]")) return;
      event.preventDefault();
      controller.reactEditor.editor.execute("edgeless.tool.set", "select");
    };
    root.addEventListener("contextmenu", onContextMenu);
    root.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      root.removeEventListener("contextmenu", onContextMenu);
      root.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [controller, root]);

  if (mode !== "edgeless" || !root || !plane) return null;

  const sameType = selection.items.length
    ? selection.items.map((id) => visuals.find((visual) => visual.id === id)).filter(Boolean) as EdgelessVisual[]
    : [];
  const propertyVisuals = sameType.length
    && sameType.length === selection.items.length
    && sameType.every((visual) => visual.kind === sameType[0]!.kind)
    ? sameType
    : [];
  const propertyBlocks = selection.items.length
    ? selection.items.flatMap((id) => {
      const element = controller.reactEditor.editor.elements.getElement(id);
      return element?.type === "block" ? [element] : [];
    })
    : [];
  const defaults = controller.getDefaults();
  const connectorHover = drawing.connectorHover ?? reconnectHover;

  return <>
    {createPortal(
      <div className="edgeless-visual-layer">
        {visuals.map((visual) => (
          <VisualElement
            key={visual.id}
            visual={visual}
            controller={controller}
            selected={selection.items.includes(visual.id)}
            zoom={zoom}
            resolveEndpoint={resolveEndpoint}
            onReconnectHover={onReconnectHover}
            onReconnect={(key, endpoint) => {
              if (visual.kind !== "connector") return;
              controller.update({ id: visual.id, patch: { [key]: endpoint } as never });
            }}
          />
        ))}
        {groups.map((group) => {
          const bounds = controller.getBounds(group.id);
          const selected = selection.active && selection.items.includes(group.id);
          const element = controller.reactEditor.editor.elements.getElement(group.id);
          return bounds && selected ? (
            <Fragment key={group.id}>
              {/*
                Hit plate under children: empty bbox / gaps select & drag the group.
                Outline stays on top with pointer-events: none so child drill-in still works.
              */}
              <div
                className="edgeless-group-hit"
                data-edgeless-group-hit={group.id}
                data-edgeless-group-bound-id={group.id}
                data-edgeless-object-kind="group"
                data-edgeless-object-id={group.id}
                style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, zIndex: controller.getGroupHitZIndex(group.id) }}
              />
              <div
                className="edgeless-group-bound"
                data-edgeless-group-bound-id={group.id}
                data-edgeless-object-kind="group"
                data-edgeless-object-id={group.id}
                style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
              >
                {element && <ElementSlots element={element} selected={selected} />}
              </div>
            </Fragment>
          ) : null;
        })}
      </div>,
      plane,
    )}
    {createPortal(
      <DrawingCapture
        tool={tool}
        zoom={zoom}
        preview={drawing.preview}
        placePreview={drawing.placePreview}
        placeStyle={{
          shape: {
            fill: defaults.shape.fill,
            stroke: defaults.shape.stroke,
            strokeWidth: defaults.shape.strokeWidth,
            filled: defaults.shape.filled,
            stroked: defaults.shape.stroked,
          },
          text: {
            color: defaults.text.color,
            fontFamily: defaults.text.fontFamily,
            fontSize: defaults.text.fontSize,
          },
          sticker: {
            fill: defaults.sticker.fill,
            color: defaults.sticker.color,
            fontFamily: defaults.sticker.fontFamily,
            fontSize: defaults.sticker.fontSize,
          },
        }}
        connectorPreview={drawing.connectorPreview}
        connectorHover={connectorHover}
        drawingStroke={defaults.drawing.stroke}
        drawingStrokeWidth={defaults.drawing.strokeWidth}
        drawingOpacity={defaults.drawing.opacity}
        connectorStroke={defaults.connector.stroke}
        connectorStrokeWidth={defaults.connector.strokeWidth}
        connectorLineStyle={defaults.connector.lineStyle}
        connectorStartStyle={defaults.connector.startStyle}
        connectorEndStyle={defaults.connector.endStyle}
        onPointerDown={drawing.pointerDown}
        onPointerMove={drawing.pointerMove}
        onPointerUp={drawing.pointerEnd}
      />,
      plane,
    )}
    {options.toolbar !== false && createPortal(
      <>
        <ToolBar
          controller={controller}
          tool={tool}
          fonts={fontOptions}
          stickers={stickerOptions}
          startPresetDrag={presetDrag.startPresetDrag}
          movePresetDrag={presetDrag.movePresetDrag}
          endPresetDrag={presetDrag.endPresetDrag}
        />
        {selection.items.length > 0 && <SelectionToolbar controller={controller} items={selection.items} />}
        {propertyVisuals.length > 0 && (
          <VisualProperties
            visuals={propertyVisuals}
            fonts={fontOptions}
            controller={controller}
          />
        )}
        {propertyBlocks.length === selection.items.length && propertyBlocks.length > 0 && (
          <BlockProperties elements={propertyBlocks} controller={controller} />
        )}
      </>,
      root,
    )}
  </>;
}
