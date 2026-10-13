import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../managers/keyboard";
import { useEdgelessOperations } from "./hooks/use-edgeless-operations";
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
import { useEditorRoot, useReactPanel } from "../../../hooks";
import { useEdgelessSelection } from "../../built-ins/selection/edgeless-runtime";
import { BlockProperties } from "./components/block-properties";
import { DrawingCapture } from "./components/drawing-capture";
import { SelectionToolbar } from "./components/selection-toolbar";
import { ToolBar } from "./components/tool-bar";
import { VisualElement } from "./components/visual-element";
import { VisualProperties } from "./components/visual-properties";
import type { EdgelessOperations } from "../edgeless-operations";
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
 * @param props - Group ID and the edgeless operations that supply derived bounds.
 * @returns Hit area, or null when the group has no visible bounds.
 */
function GroupHitArea({ groupId, edgelessOperation }: {
  readonly groupId: string;
  readonly edgelessOperation: EdgelessOperations;
}) {
  const bounds = edgelessOperation.getFrame(groupId);
  const element = edgelessOperation.elements.getElementNode(groupId);
  const preview = element && bounds ? { ...element, frame: bounds } : undefined;
  const hit = useEdgelessElementStyle<HTMLDivElement>(preview);
  if (!bounds) return null;
  return <div
    ref={hit.ref}
    className={GROUP_HIT_CLASS}
    data-edgeless-group-hit={groupId}
    data-edgeless-object-kind="group"
    data-edgeless-object-id={groupId}
    style={{ ...hit.style, zIndex: edgelessOperation.getGroupHitZIndex(groupId) }}
  />;
}

/**
 * Mounts hit areas only for selected groups, without subscribing the visual
 * plane to selection changes or walking every unselected group's descendants.
 * @param props - Controller used to read the selected group nodes and bounds.
 * @returns Invisible hit areas between the currently selected groups' children.
 */
function SelectedGroups({ edgelessOperation }: { edgelessOperation: EdgelessOperations }) {
  const selection = useEdgelessSelection();
  return selection.items.map((id) => edgelessOperation.elements.getElementNode(id)?.type === "group"
    ? <GroupHitArea key={id} groupId={id} edgelessOperation={edgelessOperation} />
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
  edgelessOperation,
  visuals,
  fonts,
}: {
  readonly edgelessOperation: EdgelessOperations;
  readonly visuals: readonly EdgelessVisual[];
  readonly fonts: readonly EdgelessFontOption[];
}) {
  const selection = useEdgelessSelection();
  const reactPanel = useReactPanel();
  const selected = selection.items.flatMap(id => reactPanel.elements.getElementNode(id) ?? []);
  const sameType = selected.length > 0 && selected.every(element => element.type === selected[0]!.type);
  const Properties = sameType ? reactPanel.editor.elementTypes.get(selected[0]!.type)?.properties : undefined;
  if (!selection.items.length) return null;
  const selectedVisuals = selection.items
    .map((id) => visuals.find((visual) => visual.id === id))
    .filter(Boolean) as EdgelessVisual[];
  const propertyVisuals = selectedVisuals.length
    && selectedVisuals.length === selection.items.length
    && selectedVisuals.every((visual) => visual.kind === selectedVisuals[0]!.kind)
    ? selectedVisuals
    : [];
  const propertyBlocks = selection.items.flatMap((id) => {
    const element = edgelessOperation.elements.getElementNode(id);
    return element?.type === "block" ? [element] : [];
  });
  return (
    <>
      <SelectionToolbar edgelessOperation={edgelessOperation} items={selection.items} />
      {Properties && <Properties elements={selected} reactPanel={reactPanel} />}
      {!Properties && propertyVisuals.length > 0 && (
        <VisualProperties
          visuals={propertyVisuals}
          fonts={fonts}
          edgelessOperation={edgelessOperation}
        />
      )}
      {propertyBlocks.length === selection.items.length && propertyBlocks.length > 0 && (
        <BlockProperties elements={propertyBlocks} edgelessOperation={edgelessOperation} />
      )}
    </>
  );
}

/**
 * Renders first-class visual elements, the bottom tool bar, and gesture previews.
 *
 * @param props - Installed edgeless operations and host options.
 * @returns Portaled visual plane and tool chrome, or null outside edgeless mode.
 */
export function EdgelessVisualLayer({
  options,
}: {
  readonly options: EdgelessVisualsOptions;
}) {
  const mode = useContext(SurfaceContext);
  return mode === "edgeless" ? <EdgelessCanvasVisuals options={options} /> : null;
}

/** Owns canvas tools, previews, and subscriptions only while the edgeless surface is displayed. */
function EdgelessCanvasVisuals({ options }: { readonly options: EdgelessVisualsOptions }) {
  const edgelessOperation = useEdgelessOperations();
  const reactPanel = useReactPanel();
  useEffect(() => reactPanel.keyboard.register({
    id: KEYBOARD_BINDING_IDS.edgelessToolSelect,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessToolSelect],
    mode: "edgeless",
    priority: 20,
    when: ({ root }) => !root.dataset.transforming && edgelessOperation.getTool().tool !== "select",
  }, () => {
    edgelessOperation.setTool("select");
    return true;
  }), [edgelessOperation, reactPanel]);

  const { element: root } = useEditorRoot();
  const tool = useVisualTool(edgelessOperation);
  useSyncExternalStore(
    (listener) => edgelessOperation.subscribe(listener),
    () => edgelessOperation.getRevision(),
    () => edgelessOperation.getRevision(),
  );
  const plane = root?.querySelector<HTMLElement>("[data-edgeless-plane]") ?? null;
  const zoom = Number(root?.dataset.edgelessZoom) || 1;
  const visuals = edgelessOperation.getVisuals();
  const fontOptions = useMemo(
    () => [...new Map([...DEFAULT_FONTS, ...(options.fonts ?? [])].map((font) => [font.fontFamily, font])).values()],
    [options.fonts],
  );
  const stickerOptions = useMemo(
    () => [...new Map([...DEFAULT_STICKERS, ...(options.stickers ?? [])].map((sticker) => [sticker.id, sticker])).values()],
    [options.stickers],
  );
  const presetDrag = usePresetDrag({ edgelessOperation, root, plane, zoom });
  const drawing = useDrawingGesture({ edgelessOperation, root, zoom, tool });
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
    const creationTools = new Set(["place", "element", "drawing", "eraser", "connector"]);
    const onContextMenu = (event: MouseEvent) => {
      if (!creationTools.has(edgelessOperation.getTool().tool)) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-edgeless-ui]")) return;
      event.preventDefault();
      edgelessOperation.setTool("select");
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      if (!creationTools.has(edgelessOperation.getTool().tool)) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-edgeless-ui]")) return;
      event.preventDefault();
      edgelessOperation.setTool("select");
    };
    root.addEventListener("contextmenu", onContextMenu);
    root.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      root.removeEventListener("contextmenu", onContextMenu);
      root.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [edgelessOperation, root]);

  if (!root || !plane) return null;

  const defaults = edgelessOperation.getDefaults();
  const connectorHover = drawing.connectorHover ?? reconnectHover;

  return <>
    {createPortal(
      <div className={VISUAL_LAYER_CLASS}>
        {visuals.map((visual) => (
          <VisualElement
            key={visual.id}
            visual={visual}
            edgelessOperation={edgelessOperation}
            zoom={zoom}
            resolveEndpoint={resolveEndpoint}
            onReconnectHover={onReconnectHover}
            onReconnect={(key, endpoint) => {
              if (visual.kind !== "connector") return;
              edgelessOperation.update({ id: visual.id, patch: { [key]: endpoint } as never });
            }}
          />
        ))}
        <SelectedGroups edgelessOperation={edgelessOperation} />
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
          edgelessOperation={edgelessOperation}
          tool={tool}
          fonts={fontOptions}
          stickers={stickerOptions}
          startPresetDrag={presetDrag.startPresetDrag}
          movePresetDrag={presetDrag.movePresetDrag}
          endPresetDrag={presetDrag.endPresetDrag}
        />
        <EdgelessSelectionChrome
          edgelessOperation={edgelessOperation}
          visuals={visuals}
          fonts={fontOptions}
        />
      </>,
      root,
    )}
  </>;
}
