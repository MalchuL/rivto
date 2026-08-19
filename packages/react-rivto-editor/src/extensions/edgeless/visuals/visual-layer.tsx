/**
 * Edgeless visual plane: persisted visuals, group chrome, tools, and previews.
 *
 *
 * The layer itself does not subscribe to canvas selection. Each visual and
 * group outline observes its own selected bit, and toolbar/properties live in
 * a child that is the only full-list subscriber so marquee growth cannot
 * re-render every shape.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useEditorMode, useEditorRoot } from "../../../hooks";
import { useEdgelessSelected, useEdgelessSelection } from "../edgeless-runtime";
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
import type {
  ConnectorEndpoint,
  EdgelessFontOption,
  EdgelessVisual,
  EdgelessVisualsOptions,
} from "./types";
import { canvasPoint } from "./utils/canvas-point";

const VISUAL_LAYER_CLASS = "edgeless-visual-layer";
const GROUP_HIT_CLASS = "edgeless-group-hit";
const GROUP_BOUND_CLASS = "edgeless-group-bound";

/**
 * Hit plate and outline for one group, mounted only while that group is selected.
 * 
 * "Chrome" is UI jargon for overlay decoration (outlines, hit plates, toolbar),
 * not the Google Chrome browser.
 *
 * @param props - Group ID and the controller that supplies derived bounds.
 * @returns Group chrome, or null when the group is unselected or has no bounds.
 */
function GroupSelectionChrome({
  groupId,
  controller,
}: {
  readonly groupId: string;
  readonly controller: EdgelessVisualController;
}) {
  const selected = useEdgelessSelected(groupId);
  const bounds = controller.getBounds(groupId);
  if (!selected || !bounds) return null;
  const element = controller.reactEditor.editor.elements.getElement(groupId);
  const geometry = {
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  return (
    <>
      {/*
        Hit plate under children: empty bbox / gaps select & drag the group.
        Outline stays on top with pointer-events: none so child drill-in still works.
      */}
      <div
        className={GROUP_HIT_CLASS}
        data-edgeless-group-hit={groupId}
        data-edgeless-group-bound-id={groupId}
        data-edgeless-object-kind="group"
        data-edgeless-object-id={groupId}
        style={{ ...geometry, zIndex: controller.getGroupHitZIndex(groupId) }}
      />
      <div
        className={GROUP_BOUND_CLASS}
        data-edgeless-group-bound-id={groupId}
        data-edgeless-object-kind="group"
        data-edgeless-object-id={groupId}
        style={geometry}
      >
        {element && <ElementSlots element={element} selected />}
      </div>
    </>
  );
}

/**
 * Selection toolbar and property panels that need the ordered selected ID list.
 *
 * Isolated so marquee membership changes do not re-render the visual plane.
 *
 * @param props - Controller, current visuals, and font options for the panel.
 * @returns Toolbar and property editors for the current selection, or nothing.
 */
function EdgelessSelectionChrome({
  controller,
  visuals,
  fonts,
}: {
  readonly controller: EdgelessVisualController;
  readonly visuals: readonly EdgelessVisual[];
  readonly fonts: readonly EdgelessFontOption[];
}) {
  const selection = useEdgelessSelection();
  if (!selection.items.length) return null;
  const sameType = selection.items
    .map((id) => visuals.find((visual) => visual.id === id))
    .filter(Boolean) as EdgelessVisual[];
  const propertyVisuals = sameType.length
    && sameType.length === selection.items.length
    && sameType.every((visual) => visual.kind === sameType[0]!.kind)
    ? sameType
    : [];
  const propertyBlocks = selection.items.flatMap((id) => {
    const element = controller.reactEditor.editor.elements.getElement(id);
    return element?.type === "block" ? [element] : [];
  });
  return (
    <>
      <SelectionToolbar controller={controller} items={selection.items} />
      {propertyVisuals.length > 0 && (
        <VisualProperties
          visuals={propertyVisuals}
          fonts={fonts}
          controller={controller}
        />
      )}
      {propertyBlocks.length === selection.items.length && propertyBlocks.length > 0 && (
        <BlockProperties elements={propertyBlocks} controller={controller} />
      )}
    </>
  );
}

/**
 * Renders first-class visual elements, the bottom tool bar, and gesture previews.
 *
 * @param props - Installed visuals controller and host options.
 * @returns Portaled visual plane and tool chrome, or null outside edgeless mode.
 */
export function EdgelessVisualLayer({
  controller,
  options,
}: {
  readonly controller: EdgelessVisualController;
  readonly options: EdgelessVisualsOptions;
}) {
  const { mode } = useEditorMode();
  const { element: root } = useEditorRoot();
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

  const defaults = controller.getDefaults();
  const connectorHover = drawing.connectorHover ?? reconnectHover;

  return <>
    {createPortal(
      <div className={VISUAL_LAYER_CLASS}>
        {visuals.map((visual) => (
          <VisualElement
            key={visual.id}
            visual={visual}
            controller={controller}
            zoom={zoom}
            resolveEndpoint={resolveEndpoint}
            onReconnectHover={onReconnectHover}
            onReconnect={(key, endpoint) => {
              if (visual.kind !== "connector") return;
              controller.update({ id: visual.id, patch: { [key]: endpoint } as never });
            }}
          />
        ))}
        {groups.map((group) => (
          <GroupSelectionChrome
            key={group.id}
            groupId={group.id}
            controller={controller}
          />
        ))}
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
        <EdgelessSelectionChrome
          controller={controller}
          visuals={visuals}
          fonts={fontOptions}
        />
      </>,
      root,
    )}
  </>;
}
