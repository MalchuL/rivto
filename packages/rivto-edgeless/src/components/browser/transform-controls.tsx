import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal, flushSync } from "react-dom";
import Moveable from "react-moveable";
import { CanvasControlEvents } from "../../browser/canvas-control-events";
import type { CanvasModifierObserver } from "../../browser/types";
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { CanvasApi } from "../../core/canvas";
import { CanvasControlGeometry } from "../../browser/canvas-control-geometry";
import { CanvasDragInput } from "../../browser/canvas-drag-input";
import { attachCanvasControlAccessibility } from "../../browser/canvas-control-accessibility";
import { findCanvasControlTargets } from "../../browser/canvas-control-targets";
import type {
  CanvasControlsAdapter,
  CanvasControlHandle,
  CanvasTransformControlsProps,
} from "../../types/controls";
import type { MountedCanvasTransformControlsProps } from "./types";
import { useCanvasCamera, useCanvasVisible } from "../../hooks/use-canvas";
import { useCanvasViewport } from "../canvas-viewport-context";
import { useCanvasViewportLayers } from "./use-canvas-viewport-layers";
import { subscribeCanvasControlModifiers } from "../../browser/canvas-control-modifiers";

/** Alignment edges and centers supported by the shared transform controls. */
const SNAP_DIRECTIONS = {
  left: true,
  right: true,
  top: true,
  bottom: true,
  center: true,
  middle: true,
};

/**
 * Renders shared move, resize, rotation and snapping controls over consumer-owned targets.
 *
 * Moveable supplies geometry; the adapter owns participant expansion, dependent
 * decorations and source commits. World coordinates remain independent of zoom.
 * Each target in a multiple selection keeps its own outline inside the shared controls.
 *
 * @param props - Canvas state, transform policies and snapping settings.
 * @returns Controls in the attached world layer, or null before attachment.
 */
export function CanvasTransformControls(props: CanvasTransformControlsProps) {
  const layers = useCanvasViewportLayers();
  if (!layers) {
    return null;
  }
  return <MountedCanvasTransformControls {...props} root={layers.root} plane={layers.plane} />;
}

/**
 * Mounts Moveable into the attached canvas world layer.
 *
 * @param props - Canvas state, browser-owned plane and host transform adapter.
 * @returns Controls portaled into the world layer.
 */
function MountedCanvasTransformControls(props: MountedCanvasTransformControlsProps) {
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

/**
 * Composes target measurement, consumer events and library display options.
 *
 * @param props - Scene, world layer and consumer transform policies.
 * @returns Mounted library reference and options for this selection.
 */
function useTransformControls({
  canvas,
  root,
  plane,
  adapter,
}: MountedCanvasTransformControlsProps) {
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
    () => new CanvasControlGeometry(canvas, measurementIds.current),
    [canvas],
  );
  useControlTargets(canvas, plane, adapter, moveable, measurements, measurementIds, setTargets);
  useControlHandle(adapter, root, plane, moveable, setTargets, modifiers.setModifiers);
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
 * Empty selections skip layout and candidate scans; registration remains mounted
 * so the next admitted gesture can prepare its targets synchronously.
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
    if (canvas.selection.get().length) {
      moveable.current?.updateRect();
    }
  }, [camera]);
  return {
    zoom: 1 / camera.zoom,
    snappable: shift || (!alt && (settings.snap || settings.align)),
    snapRotationDegrees: shift ? Array.from({ length: 25 }, (_, index) => index * 15 - 180) : [],
    snapRotationThreshold: shift ? 7.5 : 0,
    snapDirections: SNAP_DIRECTIONS,
    elementSnapDirections: SNAP_DIRECTIONS,
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
 * The mounted viewport owns input delivery; this hook releases its observations
 * when the viewport changes or the controls unmount.
 *
 * @returns Current snapping modifiers and their shared update callback for admitted native gestures.
 * @throws Propagates observation setup and cleanup failures.
 */
function useControlModifiers() {
  const [alt, setAlt] = useState(false);
  const [shift, setShift] = useState(false);
  const setModifiers = useCallback<CanvasModifierObserver>((alt, shift) => {
    setAlt(alt);
    setShift(shift);
  }, []);
  const viewport = useCanvasViewport();
  const observerId = useId();
  useEffect(() => {
    if (!viewport) {
      return;
    }
    return subscribeCanvasControlModifiers(
      viewport.events,
      `canvas.controls.${observerId}`,
      setModifiers,
    );
  }, [viewport, observerId, setModifiers]);

  return { alt, shift, setModifiers };
}

/**
 * Marks library controls for host interaction and installs accessible keyboard transforms.
 *
 * @param moveable - Mounted library controller.
 * @param targets - Target identities that invalidate the library-owned DOM.
 * @param id - Single selection identity, absent for a multiple selection.
 * @param capabilities - Current independent move, resize and rotation affordances.
 * @param adapter - Consumer interaction markers, when supplied.
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
  const layers = useCanvasViewportLayers();
  useLayoutEffect(() => {
    // Keep editor interaction markers and accessible names on library-owned controls.
    const box = moveable.current?.getControlBoxElement();
    if (!box || !layers) {
      return;
    }
    return attachCanvasControlAccessibility(
      box,
      id,
      Boolean(id && !(edgeDraggable || resizable || rotatable)),
      () => adapter.getControlMarkers?.(id),
      () => moveable.current,
      layers.inputRoot,
      layers.coordinates.isAttached,
    );
  }, [targets, id, edgeDraggable, resizable, rotatable, adapter, layers]);
}

/**
 * Connects host-admitted drags to the mounted library controller.
 *
 * @param adapter - Consumer owning gesture admission and cancellation.
 * @param root - Mounted occurrence receiving native drag starts.
 * @param plane - World layer containing mounted participant hosts.
 * @param moveable - Live library controller.
 * @param setTargets - Paints concrete targets before synchronous measurement.
 * @param setModifiers - Updates snapping bypass, aspect and angle constraints together for the admitted input sample.
 * @returns The adapter retains the imperative handle until effect cleanup.
 */
function useControlHandle(
  adapter: CanvasControlsAdapter,
  root: HTMLElement,
  plane: HTMLElement,
  moveable: RefObject<Moveable | null>,
  setTargets: Dispatch<SetStateAction<HTMLElement[]>>,
  setModifiers: CanvasModifierObserver,
) {
  useLayoutEffect(() => {
    const input = new CanvasDragInput(root);
    let release: () => void;
    try {
      release = adapter.registerControls(
        createControlHandle(input, plane, moveable, setTargets, setModifiers),
      );
    } catch (error) {
      try {
        input.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Control setup rollback failed");
      }
      throw error;
    }
    return () => {
      const errors: unknown[] = [];
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
      try {
        input.destroy();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) {
        throw new AggregateError(errors, "Control cleanup failed");
      }
    };
  }, [adapter, root, plane, moveable, setTargets, setModifiers]);
}

/**
 * Creates the controls used by the current host while its canvas is mounted.
 *
 * @param input - Private synchronous browser input for this occurrence.
 * @param plane - World layer containing mounted participant hosts.
 * @param moveable - Live transform library controller.
 * @param setTargets - Paints participants before measurement.
 * @param setModifiers - Updates snapping bypass, aspect and angle constraints together for the current input.
 * @returns Control operations borrowing the input and controller for this attachment.
 */
function createControlHandle(
  input: CanvasDragInput,
  plane: HTMLElement,
  moveable: RefObject<Moveable | null>,
  setTargets: Dispatch<SetStateAction<HTMLElement[]>>,
  setModifiers: CanvasModifierObserver,
): CanvasControlHandle {
  return {
    /**
     * Commits transform targets before Moveable measures the next native drag event.
     *
     * @param ids - Stable participant IDs whose mounted hosts should be measured.
     * @returns The mounted targets and control box are measured.
     */
    prepareDrag(ids) {
      // Commit selection before the following native mouse/touch event starts Moveable.
      flushSync(() => setTargets(findCanvasControlTargets(plane, ids)));
      moveable.current?.updateRect();
    },
    /**
     * Synchronizes modifiers and forwards current browser input to Moveable.
     *
     * @returns Pointer tracking starts only during matching input delivery.
     */
    dragStart() {
      input.start(moveable, (alt, shift) => {
        flushSync(() => setModifiers(alt, shift));
      });
    },
    /**
     * Stops the active Moveable drag and refreshes its measured rectangle.
     *
     * @returns Moveable has stopped tracking and refreshed its geometry.
     */
    stop() {
      moveable.current?.stopDrag();
      moveable.current?.updateRect();
    },
  };
}

/**
 * Keeps mounted and offscreen measurement targets synchronized outside active gestures.
 *
 * @param canvas - Scene supplying selection and world geometry.
 * @param plane - Owner of temporary measurement hosts.
 * @param adapter - Consumer participant policy.
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
    if (next.length) {
      moveable.current?.updateRect();
    }
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
 * @param adapter - Consumer-selected participants.
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
  const wanted = new Set(adapter.getTargetIds());
  const targets = findCanvasControlTargets(plane, [...wanted]);
  const mounted = new Map(targets.map((host) => [host.dataset.canvasElement!, host]));
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
