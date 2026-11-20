import { CanvasViewport } from "../browser/canvas-viewport";
import { canvasViewportAttachment } from "../browser/canvas-viewport-attachment";
import { CanvasViewportContext } from "./canvas-viewport-context";
import { useCanvasEditor, useActiveCanvasTool } from "./canvas-editor-provider";
import { CanvasToolLayer, CanvasToolPreview } from "./canvas-tool-layer";
import { useCallback, useLayoutEffect, useState, useMemo, useContext } from "react";
import type { Camera } from "../types/canvas";
import type { CanvasApi } from "../core/canvas";
import type { CSSProperties } from "react";
import type { CanvasViewProps } from "../types/canvas-view";
import { useCanvasCamera } from "../hooks/use-canvas";
import { CanvasItems } from "./canvas-items";
import { useCanvasInput } from "../hooks/use-canvas-input";
import { DefaultControls } from "./default-controls";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { observeCanvasViewportSize } from "../browser/canvas-viewport-size";

/**
 * Connects a canvas to a DOM viewport, a transformed world layer and screen overlays.
 *
 * The consumer owns the class lifetime. Unmount releases browser handlers and
 * observers and cancels a live gesture, but does not dispose externally owned stores.
 *
 * @param props - Canvas, renderer, overlays and optional browser input policies.
 * @param props.canvas - Independent state owner retained by the consumer.
 * @param props.inputRoot - Host-owned occurrence, null while awaiting it, or omitted for a standalone view.
 * @param props.renderElement - Stable renderer of a positioned host for each visible element.
 * @param props.children - Additional content in world coordinates.
 * @param props.overlay - Screen-coordinate controls and decorations.
 * @param props.interactions - Enables default selection and transforms; true by default.
 * @param props.allowCamera - Optional host admission policy for native camera gestures.
 * @returns An accessible focusable viewport with virtualized content.
 */
export function CanvasView({
  canvas,
  viewportRef,
  inputRoot,
  renderElement,
  planeProps,
  children,
  overlay,
  interactions = true,
  allowCamera,
  panEnabled,
  onPanState,
  style,
  ...attributes
}: CanvasViewProps) {
  const { root, plane, setPlane, camera, tools, tool, ref, viewport } = useCanvasViewState(
    canvas,
    viewportRef,
    inputRoot,
  );
  useCanvasInput({
    canvas,
    rootIdentity: root ? getBrowserElementIdentity(root) : undefined,
    interactions,
    viewport,
    allowCamera,
    panEnabled: () => Boolean(tool?.pansViewport || panEnabled?.()),
    onPanState,
  });
  return (
    <CanvasViewportContext.Provider value={viewport}>
      <main
        {...attributes}
        ref={ref}
        tabIndex={attributes.tabIndex ?? -1}
        style={{ position: "relative", overflow: "hidden", touchAction: "none", ...style }}
      >
        <div {...planeProps} ref={setPlane} style={getWorldLayerStyle(camera, planeProps?.style)}>
          {renderElement && <CanvasItems canvas={canvas} renderElement={renderElement} />}
          {children}
          {interactions && tool && <CanvasToolPreview tool={tool} zoom={camera.zoom} />}
          {interactions && root && plane && <DefaultControls canvas={canvas} />}
        </div>
        {interactions && root && tools && tool?.capturesPointer && (
          <CanvasToolLayer
            canvas={canvas}
            rootIdentity={getBrowserElementIdentity(root)}
            viewport={viewport}
            attachment={canvasViewportAttachment(viewport)}
            tools={tools}
            tool={tool}
          />
        )}
        {overlay}
      </main>
    </CanvasViewportContext.Provider>
  );
}

/**
 * Observes viewport dimensions and forwards the mounted root to the host reference.
 *
 * @param canvas - Scene receiving CSS-pixel viewport dimensions.
 * @param root - Current viewport node, absent before mount.
 * @param setRoot - Updates the local viewport identity.
 * @param viewportRef - Optional consumer reference to the same node.
 * @param viewport - Owner publishing the current occurrence Root.
 * @returns Ref callback; cleanup disconnects observation and cancels active transforms.
 */
function useViewportSize(
  canvas: CanvasApi,
  root: HTMLElement | null,
  setRoot: (node: HTMLElement | null) => void,
  viewportRef: CanvasViewProps["viewportRef"],
  viewport: CanvasViewport,
) {
  const ref = useCallback(
    (node: HTMLElement | null) => {
      setRoot(node);
      if (typeof viewportRef === "function") {
        viewportRef(node);
      } else if (viewportRef) {
        viewportRef.current = node;
      }
    },
    [viewportRef],
  );
  useLayoutEffect(() => observeCanvasViewportSize(canvas, viewport), [canvas, viewport]);
  useLayoutEffect(() => {
    if (!root) {
      return;
    }
    return () => canvas.cancelTransform();
  }, [canvas, root]);
  return ref;
}

/**
 * Resolves the optional session and checks that its scene belongs to this view.
 *
 * @param canvas - Scene supplied to the mounted viewport.
 * @returns Optional session and subscribed active tool.
 * @throws If the provider belongs to another scene.
 */
function useViewTools(canvas: CanvasApi) {
  const editor = useCanvasEditor();
  const tools = editor?.tools ?? null;
  const tool = useActiveCanvasTool(tools);
  if (editor && editor.canvas !== canvas) {
    throw new Error("CanvasView must use its provider editor scene");
  }
  return { tools, tool };
}

/**
 * Positions the world layer with camera-owned translation and scale.
 *
 * @param camera - Current viewport translation in CSS pixels and world scale.
 * @param style - Consumer layout additions; camera transform takes precedence.
 * @returns Absolute world-layer styles with a fixed transform origin.
 */
function getWorldLayerStyle(camera: Camera, style?: CSSProperties): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: 0,
    transformOrigin: "0 0",
    ...style,
    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
  };
}

/**
 * Attaches DOM layers to the shared browser owner or a standalone view-local owner.
 *
 * @param canvas - Scene displayed by this view.
 * @param root - Mounted viewport, absent during the initial render.
 * @param plane - Mounted world layer, absent during the initial render.
 * @returns Browser owner shared with descendant presentation extensions.
 * @throws If the shared owner belongs to another scene or already has an attachment.
 */
function useViewportAttachment(
  canvas: CanvasApi,
  root: HTMLElement | null,
  plane: HTMLElement | null,
  inputRoot: CanvasViewProps["inputRoot"],
) {
  const shared = useContext(CanvasViewportContext);
  const viewport = useMemo(() => shared ?? new CanvasViewport(canvas), [shared, canvas]);
  if (viewport.canvas !== canvas) {
    throw new Error("Canvas viewport belongs to another scene");
  }
  useLayoutEffect(() => {
    if (root && plane && inputRoot !== null) {
      return viewport.attach(root, plane, inputRoot);
    }
  }, [viewport, root, plane, inputRoot]);
  return viewport;
}

/**
 * Connects view-local DOM references to the scene and optional editor session.
 *
 * @param canvas - Scene rendered by this viewport.
 * @param viewportRef - Consumer reference receiving the mounted viewport root.
 * @param inputRoot - Host-owned occurrence, null while awaiting it, or omitted for standalone mounting.
 * @returns Mounted layers, current presentation snapshots and React ref callbacks.
 */
function useCanvasViewState(
  canvas: CanvasApi,
  viewportRef: CanvasViewProps["viewportRef"],
  inputRoot: CanvasViewProps["inputRoot"],
) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [plane, setPlane] = useState<HTMLDivElement | null>(null);
  const camera = useCanvasCamera(canvas);
  const { tools, tool } = useViewTools(canvas);
  const viewport = useViewportAttachment(canvas, root, plane, inputRoot);
  const ref = useViewportSize(canvas, root, setRoot, viewportRef, viewport);
  return { root, plane, setPlane, camera, tools, tool, ref, viewport };
}
