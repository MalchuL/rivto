import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type {
  EdgelessTool,
  EdgelessToolPointer,
} from "../../../../managers/edgeless-tools/edgeless-tool";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import { canvasPoint } from "../../../../elements/visuals/utils/canvas-point";

/**
 * Converts browser pointer input into the tool's canvas-space contract.
 *
 * @param event - Native viewport coordinates and pointer/modifier metadata.
 * @param root - Receiving canvas root, including its snapping preferences.
 * @param zoom - Canvas scale used for screen-constant snapping distance.
 * @returns Detached normalized input without a DOM event or target reference.
 */
export function toolPointer(
  event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId" | "button" | "shiftKey" | "altKey">,
  root: HTMLElement | null,
  zoom: number,
): EdgelessToolPointer {
  return {
    point: canvasPoint(event, root, zoom),
    pointerId: event.pointerId,
    button: event.button,
    shiftKey: event.shiftKey,
    zoom,
    snapping: {
      snapToGrid: root?.dataset.edgelessSnap !== "false",
      alignObjects: root?.dataset.edgelessAlign !== "false",
      grid: Number(root?.dataset.edgelessGrid) || undefined,
      threshold: 8 / Math.max(zoom, 0.01),
      disabled: event.altKey,
    },
  };
}

/**
 * Routes events to the active instance and owns browser capture and cancellation.
 *
 * Tool implementations own geometry and preview state. This adapter only normalizes
 * input, releases capture and routes Escape/deactivation; it never inspects tool IDs.
 *
 * @param props - Surface context, active instance, root and viewport scale.
 * @returns Pointer handlers for the common capture layer.
 */
export function useToolGesture({
  tools,
  tool,
  root,
  zoom,
}: {
  readonly tools: EdgelessToolContext;
  readonly tool?: EdgelessTool;
  readonly root: HTMLElement | null;
  readonly zoom: number;
}) {
  const captured = useRef<{ host: SVGSVGElement; id: number; tool: EdgelessTool } | null>(null);
  /**
   * Releases the browser pointer owned by this adapter.
   *
   * @returns Clears capture bookkeeping even when the browser already released capture.
   */
  const release = () => {
    const active = captured.current;
    captured.current = null;
    if (active?.host.hasPointerCapture(active.id)) {
      active.host.releasePointerCapture(active.id);
    }
  };
  /**
   * Discards captured gesture state or the active hover preview.
   *
   * @returns Whether the tool cancelled a gesture; browser capture is always released.
   */
  const cancel = () => {
    const active = captured.current;
    try {
      return (active?.tool ?? tool)?.cancel() ?? false;
    } finally {
      release();
    }
  };
  useEffect(() => {
    const stopKeyboard = tools.reactPanel.keyboard.register(
      {
        id: "edgeless.gesture-cancel",
        keys: ["Escape"],
        mode: "edgeless",
        priority: 40,
        when: () => Boolean(captured.current),
      },
      cancel,
    );
    const stopDeactivate = tools.reactPanel.subscribeDeactivation(cancel);
    return () => {
      stopKeyboard();
      stopDeactivate();
      tool?.cancel();
      release();
    };
  }, [tools, tool, root]);

  return {
    /**
     * Starts the registered tool and captures only accepted pointers.
     *
     * @param event - Browser pointer sample from the capture layer.
     * @returns Delivers the sample and updates browser capture when required.
     */
    pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
      if (!tool || captured.current || event.button !== 0) {
        return;
      }
      try {
        if (tool.pointerDown(toolPointer(event.nativeEvent, root, zoom))) {
          event.currentTarget.setPointerCapture(event.pointerId);
          captured.current = { host: event.currentTarget, id: event.pointerId, tool };
          event.preventDefault();
        }
      } catch (error) {
        cancel();
        throw error;
      }
    },
    /**
     * Routes hover and accepted pointer motion without document-specific behavior.
     *
     * @param event - Browser pointer sample from the capture layer.
     * @returns Delivers the sample and updates browser capture when required.
     */
    pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
      if (!captured.current || captured.current.id === event.pointerId) {
        try {
          tool?.pointerMove(toolPointer(event.nativeEvent, root, zoom));
        } catch (error) {
          cancel();
          throw error;
        }
      }
    },
    /**
     * Commits the accepted gesture and releases capture even if the tool rejects it.
     *
     * @param event - Browser pointer sample from the capture layer.
     * @returns Delivers the sample and updates browser capture when required.
     */
    pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
      const active = captured.current;
      if (active?.id !== event.pointerId) {
        return;
      }
      try {
        active.tool.pointerUp(toolPointer(event.nativeEvent, root, zoom));
      } catch (error) {
        active.tool.cancel();
        throw error;
      } finally {
        release();
      }
    },
    /**
     * Cancels only the pointer currently owned by this adapter.
     *
     * @param event - Browser pointer sample from the capture layer.
     * @returns Delivers the sample and updates browser capture when required.
     */
    pointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
      if (captured.current?.id === event.pointerId) {
        cancel();
      }
    },
    /**
     * Lets the active tool remove hover feedback without releasing a captured drag.
     *
     * @returns Delegates hover cleanup to the current tool.
     */
    pointerLeave() {
      tool?.pointerLeave();
    },
  };
}
