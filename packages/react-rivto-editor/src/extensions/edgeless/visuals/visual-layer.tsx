import { ElementCreationPreview } from "../../../elements/visuals/element-creation-preview";
import { ElementProperties } from "./components/element-properties";
import { ConnectorInteractionContext } from "../../../elements/visuals/connector-endpoints";
import type { EdgelessVisualsOptions } from "./types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../managers/keyboard";
import { useEdgelessOperations } from "../../../hooks/elements/use-edgeless-operations";
import { useContext } from "react";
import { useEdgelessElementStyle } from "../../../hooks/elements/use-edgeless-element-style";
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
import { VisualElement } from "../../../elements/visuals/visual-element";
import { VisualFontContext } from "../../../elements/visuals/properties";
import type { EdgelessOperations } from "../../../managers/elements/edgeless-operations";
import { useDrawingGesture, type ConnectorHover } from "./hooks/use-drawing-gesture";
import { usePresetDrag } from "./hooks/use-preset-drag";
import { useVisualTool } from "../../../hooks/elements/use-visual-tool";
import { DEFAULT_FONTS } from "../../../elements/visuals/presets";
import type { ConnectorEndpoint } from "../../../elements/visuals/types";
import { canvasPoint } from "../../../elements/visuals/utils/canvas-point";

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
function GroupHitArea({
  groupId,
  edgelessOperation,
}: {
  readonly groupId: string;
  readonly edgelessOperation: EdgelessOperations;
}) {
  const bounds = edgelessOperation.getFrame(groupId);
  const element = edgelessOperation.elements.getElementNode(groupId);
  const preview = element && bounds ? { ...element, frame: bounds } : undefined;
  const hit = useEdgelessElementStyle<HTMLDivElement>(preview);
  if (!bounds) {
    return null;
  }
  return (
    <div
      ref={hit.ref}
      className={GROUP_HIT_CLASS}
      data-edgeless-group-hit={groupId}
      data-edgeless-object-kind="group"
      data-edgeless-object-id={groupId}
      style={{ ...hit.style, zIndex: edgelessOperation.getGroupHitZIndex(groupId) }}
    />
  );
}

/**
 * Mounts hit areas only for selected groups, without subscribing the visual
 * plane to selection changes or walking every unselected group's descendants.
 * @param props - Controller used to read the selected group nodes and bounds.
 * @returns Invisible hit areas between the currently selected groups' children.
 */
function SelectedGroups({ edgelessOperation }: { edgelessOperation: EdgelessOperations }) {
  const selection = useEdgelessSelection();
  return selection.items.map((id) =>
    edgelessOperation.elements.getElementNode(id)?.type === "group" ? (
      <GroupHitArea key={id} groupId={id} edgelessOperation={edgelessOperation} />
    ) : null,
  );
}

/**
 * Selection toolbar and property panels that need the ordered selected ID list.
 *
 * Isolated so marquee membership changes do not re-render the visual plane.
 *
 * @param props - Shared canvas operations; registered types supply property contents and titles.
 * @returns Toolbar and property editors for the current selection, or nothing.
 */
function EdgelessSelectionChrome({
  edgelessOperation,
}: {
  readonly edgelessOperation: EdgelessOperations;
}) {
  const selection = useEdgelessSelection();
  const reactPanel = useReactPanel();
  const selected = selection.items.flatMap((id) => reactPanel.elements.getElementNode(id) ?? []);
  const sameType =
    selected.length > 0 && selected.every((element) => element.type === selected[0]!.type);
  const Properties = sameType
    ? reactPanel.editor.elementTypes.get(selected[0]!.type)?.properties
    : undefined;
  if (!selection.items.length) {
    return null;
  }
  const propertyBlocks = selection.items.flatMap((id) => {
    const element = edgelessOperation.elements.getElementNode(id);
    return element?.type === "block" ? [element] : [];
  });
  return (
    <>
      <SelectionToolbar edgelessOperation={edgelessOperation} items={selection.items} />
      {Properties && (
        <ElementProperties
          ids={selection.items}
          title={reactPanel.editor.elementTypes.get(selected[0]!.type)?.title ?? selected[0]!.type}
          component={Properties}
          operations={edgelessOperation}
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
export function EdgelessVisualLayer({ options }: { readonly options: EdgelessVisualsOptions }) {
  const mode = useContext(SurfaceContext);
  return mode === "edgeless" ? <EdgelessCanvasVisuals options={options} /> : null;
}

/** Owns canvas tools, previews, and subscriptions only while the edgeless surface is displayed. */
function EdgelessCanvasVisuals({ options }: { readonly options: EdgelessVisualsOptions }) {
  const edgelessOperation = useEdgelessOperations();
  const reactPanel = useReactPanel();
  useEffect(
    () =>
      reactPanel.keyboard.register(
        {
          id: KEYBOARD_BINDING_IDS.edgelessToolSelect,
          keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessToolSelect],
          mode: "edgeless",
          priority: 20,
          when: ({ root }) =>
            !root.dataset.transforming && edgelessOperation.getTool().tool !== "select",
        },
        () => {
          edgelessOperation.setTool("select");
          return true;
        },
      ),
    [edgelessOperation, reactPanel],
  );

  const { element: root } = useEditorRoot();
  const tool = useVisualTool(edgelessOperation);
  useSyncExternalStore(
    (listener) => edgelessOperation.subscribe(listener),
    () => edgelessOperation.getRevision(),
    () => edgelessOperation.getRevision(),
  );
  const plane = root?.querySelector<HTMLElement>("[data-edgeless-plane]") ?? null;
  const zoom = Number(root?.dataset.edgelessZoom) || 1;
  const elements = edgelessOperation.getRenderedElements();
  const fontOptions = useMemo(
    () => [
      ...new Map(
        [...DEFAULT_FONTS, ...(options.fonts ?? [])].map((font) => [font.fontFamily, font]),
      ).values(),
    ],
    [options.fonts],
  );
  const presetDrag = usePresetDrag({ edgelessOperation, root, plane, zoom });
  const drawing = useDrawingGesture({ edgelessOperation, root, zoom, tool });
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const [reconnectHover, setReconnectHover] = useState<ConnectorHover | null>(null);

  /**
   * Resolves a reconnect pointer to an eligible attachment or a free canvas endpoint.
   *
   * @param event - Pointer position in viewport pixels.
   * @returns Current attachment geometry, or a free endpoint when no target is hit.
   */
  const resolveEndpoint = useCallback(
    (event: Pick<PointerEvent, "clientX" | "clientY">): ConnectorEndpoint => {
      const point = canvasPoint(event, root, zoom);
      const targetId = drawingRef.current.objectAt(point);
      return targetId
        ? drawingRef.current.endpoint(targetId, point)
        : { elementId: undefined, anchor: { x: 0.5, y: 0.5 }, position: point };
    },
    [root, zoom],
  );

  /**
   * Shows the eligible reconnect target's bounds and anchors, or clears feedback on completion.
   *
   * @param event - Pointer position in viewport pixels; null clears feedback.
   * @returns Updates panel-local attachment feedback without document writes.
   */
  const onReconnectHover = useCallback(
    (event: Pick<PointerEvent, "clientX" | "clientY"> | null) => {
      if (!event) {
        setReconnectHover(null);
        return;
      }
      const point = canvasPoint(event, root, zoom);
      setReconnectHover(drawingRef.current.hoverFor(point));
    },
    [root, zoom],
  );

  useEffect(() => {
    if (!root) {
      return;
    }
    root.dataset.edgelessTool = tool.tool;
  }, [root, tool.tool]);

  useEffect(() => {
    if (!root) {
      return;
    }
    const creationTools = new Set(["place", "element", "drawing", "eraser", "connector"]);
    const onContextMenu = (event: MouseEvent) => {
      if (!creationTools.has(edgelessOperation.getTool().tool)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-edgeless-ui]")) {
        return;
      }
      event.preventDefault();
      edgelessOperation.setTool("select");
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) {
        return;
      }
      if (!creationTools.has(edgelessOperation.getTool().tool)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-edgeless-ui]")) {
        return;
      }
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

  if (!root || !plane) {
    return null;
  }

  const defaults = edgelessOperation.getDefaults();
  const connectorHover = drawing.connectorHover ?? reconnectHover;

  return (
    <>
      {createPortal(
        <div className={VISUAL_LAYER_CLASS}>
          <ConnectorInteractionContext.Provider value={{ resolveEndpoint, onReconnectHover }}>
            {elements.map((element) => (
              <VisualElement
                key={element.id}
                element={element}
                edgelessOperation={edgelessOperation}
                zoom={zoom}
              />
            ))}
          </ConnectorInteractionContext.Provider>
          <SelectedGroups edgelessOperation={edgelessOperation} />
        </div>,
        plane,
      )}
      {createPortal(
        <DrawingCapture
          tool={tool}
          zoom={zoom}
          preview={drawing.preview}
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
          onPointerLeave={drawing.hidePlacePreview}
        />,
        plane,
      )}
      {presetDrag.preview}
      {drawing.placePreview &&
        drawing.placeInput &&
        createPortal(
          <ElementCreationPreview
            input={drawing.placeInput}
            frame={drawing.placePreview}
            operations={edgelessOperation}
            zoom={zoom}
          />,
          plane,
        )}
      {options.toolbar !== false &&
        createPortal(
          <>
            <ToolBar
              edgelessOperation={edgelessOperation}
              tool={tool}
              startPresetDrag={presetDrag.startPresetDrag}
              movePresetDrag={presetDrag.movePresetDrag}
              endPresetDrag={presetDrag.endPresetDrag}
            />
          </>,
          root,
        )}
      {createPortal(
        <VisualFontContext.Provider value={fontOptions}>
          <EdgelessSelectionChrome edgelessOperation={edgelessOperation} />
        </VisualFontContext.Provider>,
        root,
      )}
    </>
  );
}
