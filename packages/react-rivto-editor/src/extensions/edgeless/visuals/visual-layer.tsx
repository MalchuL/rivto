import {
  CanvasWorldPortal,
  useCanvasViewport,
  useCanvasViewportCoordinates,
} from "@chulane/rivto-edgeless/react";
import { useCanvasCamera, useCanvasVisible } from "@chulane/rivto-edgeless/react";
import { useEdgelessCanvas } from "../../../surfaces/edgeless/edgeless-tools-context";
import { canRunEdgelessKeyboardAction } from "../edgeless-keyboard-scope";
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
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useReactPanel } from "../../../hooks";
import { useEditorRootIdentity } from "../../../hooks/editor/use-editor-root-identity";
import { EditorSurfacePortal } from "../../../components/editor-panel/editor-surface-portal";
import { useReactPanelContext } from "../../../hooks/editor/use-react-panel-context";
import { markVisualTool } from "./visual-tool-markers";
import { useEdgelessSelection } from "../../built-ins/selection/edgeless-runtime";
import { BlockProperties } from "./components/block-properties";
import { DrawingCapture } from "./components/drawing-capture";
import { SelectionToolbar } from "./components/selection-toolbar";
import { ToolBar } from "./components/tool-bar";
import { VisualElement } from "../../../elements/visuals/visual-element";
import { VisualFontContext } from "../../../elements/visuals/properties";
import type { EdgelessOperations } from "../../../managers/elements/edgeless-operations";
import { useToolGesture } from "./hooks/use-tool-gesture";
import { ConnectorTargets, type ConnectorHover } from "./tools/connector-targets";
import { ConnectorGesturePreview } from "./tools/connector-preview";
import { useEdgelessTools } from "../../../surfaces/edgeless/edgeless-tools-context";
import type { EdgelessTool } from "../../../managers/edgeless-tools/edgeless-tool";
import { usePresetDrag } from "./hooks/use-preset-drag";
import { useVisualTool } from "../../../hooks/elements/use-visual-tool";
import { DEFAULT_FONTS } from "../../../elements/visuals/presets";
import type { ConnectorEndpoint } from "../../../elements/visuals/types";
import type { Point } from "@chulane/rivto-edgeless";

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

/**
 * Connects surface-owned tools, previews and document subscriptions while edgeless is displayed.
 *
 * @param props - Installed visual chrome and font options.
 * @param props.options - Host presentation options; tool state belongs to the surface context.
 * @returns Canvas content and interaction chrome portaled into the receiving surface.
 */
function EdgelessCanvasVisuals({ options }: { readonly options: EdgelessVisualsOptions }) {
  const tools = useEdgelessTools();
  const canvas = useEdgelessCanvas()!;
  const camera = useCanvasCamera(canvas);
  const visible = useCanvasVisible(canvas);
  const edgelessOperation = useEdgelessOperations();
  const { reactPanel } = useReactPanelContext();
  const inputRoot = useSyncExternalStore(
    reactPanel.subscribeAvailability,
    () => reactPanel.inputRoot,
    () => undefined,
  );
  useEffect(
    () =>
      reactPanel.keyboard.register(
        {
          id: KEYBOARD_BINDING_IDS.edgelessToolSelect,
          keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessToolSelect],
          mode: "edgeless",
          priority: 20,
          when: ({ inputRoot }) =>
            canRunEdgelessKeyboardAction(reactPanel, inputRoot) && tools.canReset,
        },
        () => {
          tools.reset();
          return true;
        },
      ),
    [tools, reactPanel],
  );

  const rootIdentity = useEditorRootIdentity();
  const tool = useVisualTool(tools);
  const revision = useSyncExternalStore(
    (listener) => edgelessOperation.subscribe(listener),
    () => edgelessOperation.getRevision(),
    () => edgelessOperation.getRevision(),
  );
  const viewport = useCanvasViewport();
  const coordinates = useCanvasViewportCoordinates();
  const zoom = camera.zoom;
  const elements = useMemo(
    () =>
      visible.flatMap((id) => {
        const element = edgelessOperation.getRenderedElement(id);
        return element && element.type !== "block" && element.type !== "group" ? [element] : [];
      }),
    [visible, revision, edgelessOperation],
  );
  const fontOptions = useMemo(
    () => [
      ...new Map(
        [...DEFAULT_FONTS, ...(options.fonts ?? [])].map((font) => [font.fontFamily, font]),
      ).values(),
    ],
    [options.fonts],
  );
  const presetDrag = usePresetDrag({ tools, viewport, coordinates, inputRoot, rootIdentity, zoom });
  useToolGesture({ tools, viewport, coordinates, zoom, tool });
  const targets = useMemo(
    () => new ConnectorTargets(edgelessOperation, zoom),
    [edgelessOperation, zoom],
  );
  const [reconnectHover, setReconnectHover] = useState<ConnectorHover | null>(null);

  /**
   * Resolves a reconnect pointer to an eligible attachment or a free canvas endpoint.
   *
   * @param clientPoint - Pointer position in client CSS pixels.
   * @returns Current attachment geometry, a free endpoint when no target is hit,
   * or undefined when the captured canvas attachment is unavailable.
   */
  const resolveEndpoint = useCallback(
    (clientPoint: Point): ConnectorEndpoint | undefined => {
      const point = coordinates?.clientToWorld(clientPoint);
      if (!point) {
        return undefined;
      }
      const targetId = targets.objectAt(point);
      return targetId
        ? targets.endpoint(targetId, point)
        : { elementId: undefined, anchor: { x: 0.5, y: 0.5 }, position: point };
    },
    [coordinates, targets],
  );

  /**
   * Shows the eligible reconnect target's bounds and anchors, or clears feedback on completion.
   *
   * @param clientPoint - Pointer position in client CSS pixels; null clears feedback.
   * @returns Updates panel-local attachment feedback without document writes.
   */
  const onReconnectHover = useCallback(
    (clientPoint: Point | null) => {
      if (!clientPoint) {
        setReconnectHover(null);
        return;
      }
      const point = coordinates?.clientToWorld(clientPoint);
      if (!point) {
        setReconnectHover(null);
        return;
      }
      setReconnectHover(targets.hoverFor(point));
    },
    [coordinates, targets],
  );

  useEffect(() => {
    if (
      !rootIdentity ||
      !inputRoot?.isAttached() ||
      inputRoot.getElementIdentity?.() !== rootIdentity ||
      reactPanel.inputRoot !== inputRoot
    ) {
      return;
    }
    return markVisualTool(inputRoot, tool);
  }, [rootIdentity, inputRoot, reactPanel, tool]);

  useEffect(() => {
    if (!rootIdentity) {
      return;
    }
    const releaseContextMenu = reactPanel.events.register(
      { id: "edgeless.tool.context-menu", type: "contextmenu" },
      ({ mouseInput }) => {
        const target = mouseInput?.target;
        if (
          !mouseInput ||
          !tools.active?.capturesPointer ||
          !target?.isElement?.() ||
          target.hasAncestor("[data-edgeless-ui]")
        ) {
          return false;
        }
        mouseInput.preventDefault();
        tools.reset();
        return false;
      },
    );
    let releasePointer: (() => void) | undefined;
    try {
      releasePointer = reactPanel.events.register(
        { id: "edgeless.tool.secondary-pointer", type: "pointerdown", capture: true },
        ({ pointerInput }) => {
          const target = pointerInput?.target;
          if (
            pointerInput?.button !== 2 ||
            !tools.active?.capturesPointer ||
            !target?.isElement?.() ||
            target.hasAncestor("[data-edgeless-ui]")
          ) {
            return false;
          }
          pointerInput.preventDefault();
          tools.reset();
          return false;
        },
      );
    } catch (error) {
      try {
        releaseContextMenu();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Tool input setup failed");
      }
      throw error;
    }
    return () => {
      const errors: unknown[] = [];
      for (const release of [releasePointer, releaseContextMenu]) {
        try {
          release?.();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Tool input cleanup failed");
      }
    };
  }, [tools, rootIdentity, reactPanel.events]);

  if (!rootIdentity) {
    return null;
  }

  return (
    <CanvasWorldPortal>
      <div className={VISUAL_LAYER_CLASS}>
        <ConnectorInteractionContext.Provider
          value={{ inputRoot, resolveEndpoint, onReconnectHover }}
        >
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
      </div>
      <DrawingCapture active={tool?.capturesPointer} />
      {tool && <ToolPreview tool={tool} zoom={zoom} />}
      {reconnectHover && <ConnectorGesturePreview zoom={zoom} connectorHover={reconnectHover} />}
      {presetDrag.preview}
      {options.toolbar !== false && (
        <EditorSurfacePortal>
          <ToolBar
            edgelessOperation={edgelessOperation}
            tools={tools}
            startPresetDrag={presetDrag.startPresetDrag}
          />
        </EditorSurfacePortal>
      )}
      <EditorSurfacePortal>
        <VisualFontContext.Provider value={fontOptions}>
          <EdgelessSelectionChrome edgelessOperation={edgelessOperation} />
        </VisualFontContext.Provider>
      </EditorSurfacePortal>
    </CanvasWorldPortal>
  );
}

/**
 * Subscribes only the active preview to pointer samples.
 *
 * @param props - Active instance and canvas scale.
 * @returns Registered preview override or the instance's own preview component.
 */
function ToolPreview({ tool, zoom }: { readonly tool: EdgelessTool; readonly zoom: number }) {
  useSyncExternalStore(
    (listener) => tool.subscribe(listener),
    () => tool.revision,
    () => tool.revision,
  );
  const panel = useReactPanel();
  const Preview = panel.editor.edgelessToolbar.getTool(tool.id)?.preview;
  return Preview ? <Preview tool={tool} zoom={zoom} /> : tool.renderPreview(zoom);
}
