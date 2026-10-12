import { useContext } from "react";
import { useEdgelessElementStyle } from "../use-edgeless-element-style";
import { SurfaceContext } from "../../../surfaces/surface";
/**
 * Edgeless visual plane: persisted visuals, group hit areas, tools, and previews.
 *
 *
 * The layer itself does not subscribe to canvas selection. Each visual and
 * group hit area follows the current selection, and toolbar/properties live in
 * a child that is the only full-list subscriber so marquee growth cannot
 * re-render every shape.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useEditorRoot, usePanel } from "../../../hooks";
import { useEdgelessSelection } from "../../built-ins/selection/edgeless-runtime";
import { BlockProperties } from "./components/block-properties";
import { DrawingCapture } from "./components/drawing-capture";
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

/**
 * Provides an invisible hit area between the children of a selected group.
 *
 * It stays behind the children so clicks can still select or edit them. Moveable
 * renders the visible boundary and controls; this area has no outline or drag
 * handle of its own. Preview geometry survives React updates during a gesture.
 *
 * @param props - Group ID and the controller that supplies derived bounds.
 * @returns Hit area, or null when the group has no visible bounds.
 */
function GroupHitArea({ groupId, controller }: {
  readonly groupId: string;
  readonly controller: EdgelessVisualController;
}) {
  const bounds = controller.getFrame(groupId);
  const element = controller.elements.getElementNode(groupId);
  const preview = element && bounds ? { ...element, frame: bounds } : undefined;
  const hit = useEdgelessElementStyle<HTMLDivElement>(preview);
  if (!bounds) return null;
  return <div
    ref={hit.ref}
    className={GROUP_HIT_CLASS}
    data-edgeless-group-hit={groupId}
    data-edgeless-object-kind="group"
    data-edgeless-object-id={groupId}
    style={{ ...hit.style, zIndex: controller.getGroupHitZIndex(groupId) }}
  />;
}

/**
 * Mounts hit areas only for selected groups, without subscribing the visual
 * plane to selection changes or walking every unselected group's descendants.
 * @param props - Controller used to read the selected group nodes and bounds.
 * @returns Invisible hit areas between the currently selected groups' children.
 */
function SelectedGroups({ controller }: { controller: EdgelessVisualController }) {
  const selection = useEdgelessSelection();
  return selection.items.map((id) => controller.elements.getElementNode(id)?.type === "group"
    ? <GroupHitArea key={id} groupId={id} controller={controller} />
    : null);
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
    const element = controller.elements.getElementNode(id);
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
  controller: sharedController,
  options,
}: {
  readonly controller: EdgelessVisualController;
  readonly options: EdgelessVisualsOptions;
}) {
  const panel = usePanel();
  const controller = useMemo(() => sharedController.forPanel(panel), [sharedController, panel]);
  const mode = useContext(SurfaceContext);
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
      controller.execute("edgeless.tool.set", "select");
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      if (!creationTools.has(controller.getTool().tool)) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-edgeless-ui]")) return;
      event.preventDefault();
      controller.execute("edgeless.tool.set", "select");
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
        <SelectedGroups controller={controller} />
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
