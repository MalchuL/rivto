import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import Moveable from "react-moveable";
import { CanvasControlEvents } from "./canvas-control-events";
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { CanvasApi } from "../core/canvas";
import { CanvasControlGeometry } from "./canvas-control-geometry";
import type { CanvasControlsAdapter } from "../types/controls";
import { useCanvasCamera, useCanvasVisible } from "../hooks/use-canvas";

/**
 * Renders shared move, resize, rotation and snapping controls over consumer-owned targets.
 *
 * Moveable supplies geometry; the adapter owns participant expansion, dependent
 * decorations and source commits. World coordinates remain independent of zoom.
 * Each target in a multiple selection keeps its own outline inside the shared controls.
 *
 * @param props - Canvas state, DOM layers, transform policies and snapping settings.
 * @returns Controls portaled into the world layer.
 */
export function CanvasTransformControls(props: CanvasTransformControlsProps) {
  const { moveable, options } = useTransformControls(props);
  return createPortal(
    <Moveable
      ref={moveable}
      flushSync={flushSync}
      container={props.plane}
      origin={false}
      draggable
      linePadding={6}
      passDragArea
      renderDirections={options.resizable ? ["n", "e", "s", "w", "nw", "ne", "sw", "se"] : false}
      useResizeObserver
      {...options}
    />,
    props.plane,
  );
}

/** Scene and consumer boundary of the shared DOM transform controls. */
export interface CanvasTransformControlsProps {
  readonly canvas: CanvasApi;
  readonly plane: HTMLElement;
  readonly adapter: CanvasControlsAdapter;
}

/**
 * Composes target measurement, consumer events and library display options.
 *
 * @param props - Scene, world layer and consumer transform policies.
 * @returns Mounted library reference and options for this selection.
 */
function useTransformControls({ canvas, plane, adapter }: CanvasTransformControlsProps) {
  const selection = useSyncExternalStore(
    canvas.selection.subscribe,
    canvas.selection.get,
    canvas.selection.get,
  );
  const measurements = useRef(new Map<string, HTMLElement>());
  const measurementIds = useRef(new WeakMap<Element, string>());
  const moveable = useRef<Moveable>(null);
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const selectedId = selection.length === 1 ? selection[0] : undefined;
  const capabilities = getControlCapabilities(canvas);
  const interactive =
    capabilities.resizable || capabilities.rotatable || capabilities.edgeDraggable;
  const modifiers = useControlModifiers();
  const isGroup = adapter.groupRotation !== undefined;
  const groupAngle =
    adapter.groupRotation ?? (selectedId ? canvas.getElement(selectedId)?.rotation : 0) ?? 0;
  // Persisted group identity must survive having just one remaining target.
  const groupData = useMemo(
    () => (isGroup ? { rotation: groupAngle, children: [] } : undefined),
    [isGroup, groupAngle],
  );
  const geometry = useMemo(
    () => new CanvasControlGeometry(canvas, adapter, measurementIds.current),
    [canvas, adapter],
  );
  useControlTargets(canvas, plane, adapter, moveable, measurements, measurementIds, setTargets);
  useControlHandle(adapter, moveable, setTargets, modifiers.setAlt, modifiers.setShift);
  useControlAccessibility(moveable, targets, selectedId, capabilities, adapter);
  const snapping = useControlSnapping(canvas, adapter, plane, moveable, groupAngle, modifiers);
  const events = new CanvasControlEvents(canvas, adapter, targets, moveable, geometry, groupAngle);
  return {
    moveable,
    options: {
      ...snapping,
      ...events.getBindings(),
      persistData: targets.length ? groupData : undefined,
      defaultGroupRotate: groupAngle,
      useDefaultGroupRotate: isGroup,
      target: targets.length === 1 ? targets[0] : targets,
      ...capabilities,
      keepRatio: isGroup || modifiers.shift,
      hideDefaultLines: targets.length === 0 || Boolean(selectedId && !interactive),
      hideChildMoveableDefaultLines: selection.length < 2,
    },
  };
}

/**
 * Maps world snapping and keyboard modifiers to library thresholds at the current zoom.
 *
 * @param canvas - Scene owning camera and alignment settings.
 * @param adapter - Participants excluded from alignment candidates.
 * @param plane - World layer containing mounted alignment hosts.
 * @param moveable - Controller remeasured after a camera change.
 * @param groupAngle - Initial selection angle in degrees.
 * @param modifiers - Current Alt and Shift state.
 * @returns Grid, angle and alignment options in the library's expected units.
 */
function useControlSnapping(
  canvas: CanvasApi,
  adapter: CanvasControlsAdapter,
  plane: HTMLElement,
  moveable: RefObject<Moveable | null>,
  groupAngle: number,
  modifiers: { alt: boolean; shift: boolean },
) {
  const camera = useCanvasCamera(canvas);
  const settings = useSyncExternalStore(
    canvas.snapping.subscribe,
    canvas.snapping.get,
    canvas.snapping.get,
  );
  const { alt, shift } = modifiers;
  // Disable grid snapping for rotated elements because it breaks drag and resize interactions.
  const grid = !alt && settings.snap && groupAngle === 0 ? settings.grid : 0;
  const { horizontal, vertical, elements } = CanvasControlGeometry.getAlignmentGuidelines(
    canvas,
    adapter,
    plane,
  );
  useLayoutEffect(() => {
    moveable.current?.updateRect();
  }, [camera]);
  const directions = {
    left: true,
    right: true,
    top: true,
    bottom: true,
    center: true,
    middle: true,
  };
  return {
    zoom: 1 / camera.zoom,
    snappable: shift || (!alt && (settings.snap || settings.align)),
    snapRotationDegrees: shift ? Array.from({ length: 25 }, (_, index) => index * 15 - 180) : [],
    snapRotationThreshold: shift ? 7.5 : 0,
    snapDirections: directions,
    elementSnapDirections: directions,
    snapHorizontalThreshold: 8 / camera.zoom,
    snapVerticalThreshold: 8 / camera.zoom,
    snapGap: false,
    snapGridWidth: grid,
    snapGridHeight: grid,
    elementGuidelines: alt || !settings.align ? [] : elements,
    horizontalGuidelines: alt || !settings.align ? [] : horizontal,
    verticalGuidelines: alt || !settings.align ? [] : vertical,
  };
}

/**
 * Observes keyboard modifiers and clears their state when browser focus is lost.
 *
 * @returns Current snapping modifiers and setters for admitted native gestures.
 */
function useControlModifiers() {
  const [alt, setAlt] = useState(false);
  const [shift, setShift] = useState(false);
  useEffect(() => {
    /**
     * Tracks modifier state for aspect constraints and snapping.
     *
     * @param event - Native keyboard input.
     * @returns Modifier state matches this sample.
     */
    const key = (event: KeyboardEvent) => {
      setAlt(event.altKey);
      setShift(event.shiftKey);
    };
    /**
     * Clears modifiers when the window loses focus.
     *
     * @returns Snapping no longer retains a stale modifier.
     */
    const reset = () => {
      setAlt(false);
      setShift(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", reset);
    };
  }, []);

  return { alt, shift, setAlt, setShift };
}

/**
 * Marks library controls for host interaction and installs accessible keyboard transforms.
 *
 * @param moveable - Mounted library controller.
 * @param targets - Target identities that invalidate the library-owned DOM.
 * @param id - Single selection identity, absent for a multiple selection.
 * @param capabilities - Current independent move, resize and rotation affordances.
 * @param adapter - Consumer decoration policy.
 * @returns Control markers and listeners follow the current target selection.
 */
function useControlAccessibility(
  moveable: RefObject<Moveable | null>,
  targets: HTMLElement[],
  id: string | undefined,
  capabilities: ReturnType<typeof getControlCapabilities>,
  adapter: CanvasControlsAdapter,
) {
  const { edgeDraggable, resizable, rotatable } = capabilities;
  useLayoutEffect(() => {
    // Keep editor interaction markers and accessible names on library-owned controls.
    const box = moveable.current?.getControlBoxElement();
    if (!box) {
      return;
    }
    box.setAttribute("data-canvas-control", "");
    box.style.pointerEvents = id && !(edgeDraggable || resizable || rotatable) ? "none" : "";
    if (id) {
      box.setAttribute("data-canvas-controls-for", id);
    }
    if (!id) {
      box.removeAttribute("data-canvas-controls-for");
    }
    box.querySelectorAll<HTMLElement>(".moveable-control[data-direction]").forEach((handle) => {
      const direction = handle.dataset.direction!;
      handle.setAttribute("data-canvas-resize-handle", direction);
      handle.setAttribute("aria-label", `Resize ${direction}`);
      handle.setAttribute("role", "button");
      handle.tabIndex = 0;
    });
    const rotate = box.querySelector<HTMLElement>(".moveable-rotation-control");
    rotate?.setAttribute("data-canvas-rotation-handle", "true");
    rotate?.setAttribute("aria-label", "Rotate element");
    rotate?.setAttribute("role", "button");
    if (rotate) {
      rotate.tabIndex = 0;
    }
    adapter.decorateControls?.(box, id);
    const resizeWithKeyboard = createControlKeyboardHandler(moveable);
    box.addEventListener("keydown", resizeWithKeyboard);
    return () => box.removeEventListener("keydown", resizeWithKeyboard);
  }, [targets, id, edgeDraggable, resizable, rotatable, adapter]);
}

/**
 * Creates the arrow-key dispatcher for focused resize and rotation handles.
 *
 * @param moveable - Live library controller receiving immediate requests.
 * @returns A listener applying one world unit or degree, or ten while Shift is held.
 */
function createControlKeyboardHandler(moveable: RefObject<Moveable | null>) {
  /**
   * Resizes or rotates the focused handle using arrow-key increments.
   *
   * @param event - Native keyboard input.
   * @returns The requested transform completes while keyboard focus stays on the handle.
   */
  const resizeWithKeyboard = (event: KeyboardEvent) => {
    if (!event.key.startsWith("Arrow") || !(event.target instanceof HTMLElement)) {
      return;
    }
    const handle = event.target;
    const direction = handle.dataset.direction;
    const amount = event.shiftKey ? 10 : 1;
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -amount : amount;
    if (handle.hasAttribute("data-canvas-rotation-handle")) {
      moveable.current?.request("rotatable", { deltaRotate: delta }, true);
    } else if (direction) {
      const x = Number(direction.includes("e")) - Number(direction.includes("w"));
      const y = Number(direction.includes("s")) - Number(direction.includes("n"));
      moveable.current?.request(
        "resizable",
        {
          direction: [x, y],
          deltaWidth: horizontal ? delta * x : 0,
          deltaHeight: horizontal ? 0 : delta * y,
        },
        true,
      );
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handle.focus({ preventScroll: true });
  };
  return resizeWithKeyboard;
}

/**
 * Connects host-admitted drags to the mounted library controller.
 *
 * @param adapter - Consumer owning gesture admission and cancellation.
 * @param moveable - Live library controller.
 * @param setTargets - Paints concrete targets before synchronous measurement.
 * @param setAlt - Updates snapping bypass for the admitted input sample.
 * @param setShift - Updates aspect and angle constraints for the admitted input sample.
 * @returns The adapter retains the imperative handle until effect cleanup.
 */
function useControlHandle(
  adapter: CanvasControlsAdapter,
  moveable: RefObject<Moveable | null>,
  setTargets: Dispatch<SetStateAction<HTMLElement[]>>,
  setAlt: Dispatch<SetStateAction<boolean>>,
  setShift: Dispatch<SetStateAction<boolean>>,
) {
  useLayoutEffect(
    () =>
      adapter.registerControls({
        /**
         * Commits transform targets before Moveable measures the next native drag event.
         *
         * @param next - DOM targets that transform controls should measure.
         */
        prepareDrag(next) {
          // Commit selection before the following native mouse/touch event starts Moveable.
          flushSync(() => setTargets(next));
          moveable.current?.updateRect();
        },
        /**
         * Synchronizes modifier state and forwards the native event to Moveable.
         *
         * @param event - Native or React event supplying the current input.
         */
        dragStart(event) {
          flushSync(() => {
            setAlt(event.altKey);
            setShift(event.shiftKey);
          });
          moveable.current?.dragStart(event);
        },
        /**
         * Stops the active Moveable drag and refreshes its measured rectangle.
         */
        stop() {
          moveable.current?.stopDrag();
          moveable.current?.updateRect();
        },
      }),
    [adapter],
  );
}

/**
 * Keeps mounted and offscreen measurement targets synchronized outside active gestures.
 *
 * @param canvas - Scene supplying selection and world geometry.
 * @param plane - Owner of temporary measurement hosts.
 * @param adapter - Consumer target identity and participant policy.
 * @param moveable - Library controller whose active origin must remain fixed.
 * @param measurements - Owned temporary hosts keyed by element identity.
 * @param measurementIds - Reverse identity lookup used by geometry conversion.
 * @param setTargets - Publishes changed target identities before layout measurement.
 * @returns Temporary hosts follow selection and are removed on unmount.
 */
function useControlTargets(
  canvas: CanvasApi,
  plane: HTMLElement,
  adapter: CanvasControlsAdapter,
  moveable: RefObject<Moveable | null>,
  measurements: RefObject<Map<string, HTMLElement>>,
  measurementIds: RefObject<WeakMap<Element, string>>,
  setTargets: Dispatch<SetStateAction<HTMLElement[]>>,
) {
  const selection = useSyncExternalStore(
    canvas.selection.subscribe,
    canvas.selection.get,
    canvas.selection.get,
  );
  const visible = useCanvasVisible(canvas);
  const geometry = useSyncExternalStore(
    canvas.elements.subscribe,
    canvas.elements.get,
    canvas.elements.get,
  );
  useLayoutEffect(() => {
    if (moveable.current?.isDragging()) {
      return;
    }
    const next = resolveControlTargets(
      canvas,
      plane,
      adapter,
      measurements.current,
      measurementIds.current,
    );
    setTargets((previous) =>
      previous.length === next.length && previous.every((host, index) => host === next[index])
        ? previous
        : next,
    );
    moveable.current?.updateRect();
  }, [adapter, canvas, plane, selection, visible, geometry]);

  useLayoutEffect(() => {
    const hosts = measurements.current;
    return () => {
      for (const host of hosts.values()) {
        host.remove();
      }
      hosts.clear();
    };
  }, []);
}

/**
 * Resolves all participants, allocating invisible geometry hosts for unmounted elements.
 *
 * @param canvas - Scene supplying offscreen world geometry.
 * @param plane - DOM owner of temporary measurement hosts.
 * @param adapter - Consumer identity policy and selected participants.
 * @param measurements - Owned hosts retained across layout passes.
 * @param measurementIds - Reverse identity lookup for temporary hosts.
 * @returns Targets in consumer participant order, omitting deleted elements.
 */
function resolveControlTargets(
  canvas: CanvasApi,
  plane: HTMLElement,
  adapter: CanvasControlsAdapter,
  measurements: Map<string, HTMLElement>,
  measurementIds: WeakMap<Element, string>,
): HTMLElement[] {
  const mounted = new Map(adapter.getTargets().map((host) => [adapter.targetId(host), host]));
  const wanted = new Set(adapter.getTargetIds());
  for (const [id, host] of measurements) {
    if (!wanted.has(id) || mounted.has(id)) {
      host.remove();
      measurements.delete(id);
    }
  }
  const next = [...wanted].flatMap((id) => {
    const actual = mounted.get(id);
    if (actual) {
      return [actual];
    }
    const element = canvas.getElement(id);
    if (!element) {
      return [];
    }
    let host = measurements.get(id);
    if (!host) {
      host = plane.ownerDocument.createElement("div");
      host.setAttribute("aria-hidden", "true");
      measurements.set(id, host);
      measurementIds.set(host, id);
      plane.append(host);
    }
    const { frame, rotation } = element;
    Object.assign(host.style, {
      position: "absolute",
      pointerEvents: "none",
      visibility: "hidden",
      left: "0px",
      top: "0px",
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      transform: `translate(${frame.x}px, ${frame.y}px) rotate(${rotation}deg)`,
    });
    return [host];
  });
  return next;
}

/**
 * Maps independent scene capabilities to control-library affordances.
 *
 * @param canvas - Scene supplying the current selection and its live capability policy.
 * @returns Separate move-edge, resize and rotation availability for the entire selection.
 */
function getControlCapabilities(canvas: CanvasApi) {
  return {
    edgeDraggable: canvas.canTransform("move"),
    resizable: canvas.canTransform("resize"),
    rotatable: canvas.canTransform("rotate"),
  };
}
