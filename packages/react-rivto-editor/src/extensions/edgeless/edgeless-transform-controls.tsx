import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Moveable, {
  type OnResizeStart,
  type OnRotateStart,
  type OnResize,
  type OnRotate,
} from "react-moveable";
import type { EditorElementFrame } from "@chulane/rivto";
import { normalizeRotation } from "../../elements/visuals/utils/geometry";
import { useEditorRoot, useReactPanel, useElements } from "../../hooks";
import { SurfaceContext } from "../../surfaces/surface";
import { useEdgelessSelection } from "../built-ins/selection/edgeless-runtime";
import type { EdgelessTransformController } from "./edgeless-transform";

/**
 * Mounts Moveable controls for dragging selected HTML elements, resizing, and rotation.
 * The editor owns selection, persisted geometry, connector previews, and undo;
 * Moveable computes gesture geometry and keeps its controls outside the target.
 * @param props - Panel-local transform controller installed by the edgeless extension.
 * @returns Controls in the canvas plane, or nothing outside an eligible selection.
 */
export function EdgelessTransformControls({
  controller,
}: {
  controller: EdgelessTransformController;
}) {
  const reactPanel = useReactPanel();
  const { element: editorRoot } = useEditorRoot();
  const mode = useContext(SurfaceContext);
  const selection = useEdgelessSelection();
  const elements = useElements();
  const moveable = useRef<Moveable>(null);
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const target = targets.length === 1 ? targets[0] : targets;
  const id = selection.items.length === 1 ? selection.items[0] : undefined;
  const element = id ? reactPanel.elements.getElementNode(id) : undefined;
  const eligible =
    mode === "edgeless" &&
    element &&
    !reactPanel.editor.elementTypes.get(element.type)?.behavior?.absoluteGeometry;
  const plane = editorRoot?.querySelector<HTMLElement>("[data-edgeless-plane]") ?? null;
  const viewport = plane?.parentElement ?? null;
  const [settings, setSettings] = useState({ zoom: 1, grid: 20, snap: true, align: true });
  const [alt, setAlt] = useState(false);
  const [shift, setShift] = useState(false);
  const isGroup = element?.type === "group";
  const groupAngle =
    typeof element?.props.rotation === "number" ? normalizeRotation(element.props.rotation) : 0;
  // Persisted group identity must survive having just one remaining target.
  const groupData = useMemo(
    () => (isGroup ? { rotation: groupAngle, children: [] } : undefined),
    [isGroup, groupAngle],
  );
  const initial = useRef(new Map<string, { frame: EditorElementFrame; rotation: number }>());

  useEffect(() => {
    if (!viewport) {
      return;
    }
    const refresh = () => {
      const next = {
        zoom: Number(viewport.dataset.edgelessZoom) || 1,
        grid: Number(viewport.dataset.edgelessGrid) || 20,
        snap: viewport.dataset.edgelessSnap !== "false",
        align: viewport.dataset.edgelessAlign !== "false",
      };
      setSettings((previous) =>
        Object.keys(next).every(
          (key) => previous[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? previous
          : next,
      );
      moveable.current?.updateRect();
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(viewport, {
      attributes: true,
      attributeFilter: [
        "data-edgeless-zoom",
        "data-edgeless-pan-x",
        "data-edgeless-pan-y",
        "data-edgeless-grid",
        "data-edgeless-snap",
        "data-edgeless-align",
      ],
    });
    const key = (event: KeyboardEvent) => {
      setAlt(event.altKey);
      setShift(event.shiftKey);
    };
    const reset = () => {
      setAlt(false);
      setShift(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", reset);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", reset);
    };
  }, [viewport]);

  useLayoutEffect(() => {
    const next = plane ? controller.getMoveTargets(reactPanel, plane, selection.items) : [];
    setTargets((previous) =>
      previous.length === next.length && previous.every((host, index) => host === next[index])
        ? previous
        : next,
    );
    if (!moveable.current?.isDragging()) {
      moveable.current?.updateRect();
    }
  }, [controller, reactPanel, plane, selection.items, elements]);

  useLayoutEffect(
    () =>
      controller.registerControls(reactPanel, {
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
    [controller, reactPanel],
  );

  useLayoutEffect(() => {
    // Keep editor interaction markers and accessible names on library-owned controls.
    const box = moveable.current?.getControlBoxElement();
    if (!box) {
      return;
    }
    box.setAttribute("data-editor-control", "");
    if (id) {
      box.setAttribute("data-edgeless-controls-for", id);
    }
    box.setAttribute("data-edgeless-ui", "true");
    box.querySelectorAll<HTMLElement>(".moveable-control[data-direction]").forEach((handle) => {
      const direction = handle.dataset.direction!;
      handle.setAttribute("data-edgeless-resize-handle", direction);
      handle.setAttribute("aria-label", `Resize ${direction}`);
      handle.setAttribute("role", "button");
      handle.tabIndex = 0;
    });
    const rotate = box.querySelector<HTMLElement>(".moveable-rotation-control");
    rotate?.setAttribute("data-edgeless-rotation-handle", "true");
    rotate?.setAttribute("aria-label", "Rotate element");
    rotate?.setAttribute("role", "button");
    if (rotate) {
      rotate.tabIndex = 0;
    }
    const key = (event: KeyboardEvent) => {
      if (!event.key.startsWith("Arrow") || !(event.target instanceof HTMLElement)) {
        return;
      }
      const handle = event.target;
      const direction = handle.dataset.direction;
      const amount = event.shiftKey ? 10 : 1;
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -amount : amount;
      if (handle.hasAttribute("data-edgeless-rotation-handle")) {
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
    box.addEventListener("keydown", key);
    return () => box.removeEventListener("keydown", key);
  }, [targets, id]);

  const guidelines = useMemo(() => {
    if (!settings.align || !plane) {
      return [];
    }
    return [
      ...plane.querySelectorAll<HTMLElement>(
        "[data-edgeless-object-kind][data-edgeless-object-id]",
      ),
    ].filter(
      (host) =>
        !targets.includes(host) &&
        host.dataset.edgelessObjectKind !== "group" &&
        !reactPanel.editor.elementTypes.get(
          reactPanel.elements.getElementNode(host.dataset.edgelessObjectId!)?.type ?? "",
        )?.behavior?.absoluteGeometry,
    );
  }, [settings.align, plane, targets, elements, reactPanel]);

  if (mode !== "edgeless" || !plane || !viewport) {
    return null;
  }
  const start = (kind: "move" | "resize" | "rotate") => {
    const current = id ? reactPanel.elements.getElementNode(id) : undefined;
    if (!current) {
      return false;
    }
    initial.current = new Map(
      targets.map((host) => {
        const node = reactPanel.elements.getElementNode(host.dataset.edgelessObjectId!)!;
        return [
          node.id,
          {
            frame: { ...node.frame },
            rotation:
              !reactPanel.editor.elementTypes.get(node.type)?.behavior?.absoluteGeometry &&
              typeof node.props.rotation === "number"
                ? node.props.rotation
                : 0,
          },
        ];
      }),
    );
    return controller.beginControls(reactPanel, viewport, current.id, kind, () => {
      moveable.current?.stopDrag();
      // Cancellation restores DOM geometry without a document update to refresh the handles.
      moveable.current?.updateRect();
    });
  };
  const end = (inputEvent: MouseEvent | undefined) =>
    controller.finishControls(
      reactPanel,
      inputEvent?.type !== "pointercancel" && inputEvent?.type !== "touchcancel",
      inputEvent?.detail,
    );

  const startEdgeDrag = (event: MouseEvent | TouchEvent | undefined) => {
    const origin = event?.target;
    return (
      origin instanceof Element &&
      Boolean(origin.closest(".moveable-edgeDraggable")) &&
      start("move")
    );
  };

  const targetId = (target: HTMLElement | SVGElement) => target.dataset.edgelessObjectId!;
  const resizeStart = (event: OnResizeStart) => {
    const node = reactPanel.elements.getElementNode(targetId(event.target));
    event.setMin(node?.type === "block" ? [180, 100] : [1, 1]);
    event.setOrigin(["50%", "50%"]);
    const base = initial.current.get(targetId(event.target))!.frame;
    if (event.dragStart) {
      event.dragStart.set([
        base.x - parseFloat(event.target.style.left),
        base.y - parseFloat(event.target.style.top),
      ]);
    }
  };
  const rotateStart = (event: OnRotateStart) => {
    event.set(initial.current.get(targetId(event.target))!.rotation);
    const base = initial.current.get(targetId(event.target))!.frame;
    if (event.dragStart) {
      event.dragStart.set([
        base.x - parseFloat(event.target.style.left),
        base.y - parseFloat(event.target.style.top),
      ]);
    }
  };
  const resizePreview = ({ target, width, height, drag }: OnResize) => {
    const id = targetId(target);
    const base = initial.current.get(id)!;
    return {
      id,
      frame: {
        x: parseFloat(target.style.left) + drag.beforeTranslate[0]!,
        y: parseFloat(target.style.top) + drag.beforeTranslate[1]!,
        width,
        height,
      },
      rotation: base.rotation,
      transform: drag.transform,
    };
  };
  const rotatePreview = ({ target, beforeRotate, drag }: OnRotate) => {
    const id = targetId(target);
    const base = initial.current.get(id)!;
    return {
      id,
      frame: {
        ...base.frame,
        x: parseFloat(target.style.left) + drag.beforeTranslate[0]!,
        y: parseFloat(target.style.top) + drag.beforeTranslate[1]!,
      },
      rotation: beforeRotate,
      transform: drag.transform,
    };
  };

  return createPortal(
    <Moveable
      ref={moveable}
      flushSync={flushSync}
      persistData={targets.length ? groupData : undefined}
      defaultGroupRotate={groupAngle}
      useDefaultGroupRotate={isGroup}
      target={target}
      container={plane}
      origin={false}
      draggable
      edgeDraggable={Boolean(eligible)}
      linePadding={6}
      resizable={Boolean(eligible)}
      keepRatio={isGroup || shift}
      rotatable={Boolean(eligible)}
      hideDefaultLines={targets.length === 0}
      hideChildMoveableDefaultLines
      passDragArea
      renderDirections={["n", "e", "s", "w", "nw", "ne", "sw", "se"]}
      useResizeObserver
      zoom={1 / settings.zoom}
      snappable={shift || (!alt && (settings.snap || settings.align))}
      snapRotationDegrees={shift ? Array.from({ length: 25 }, (_, index) => index * 15 - 180) : []}
      snapRotationThreshold={shift ? 7.5 : 0}
      snapDirections={{
        left: true,
        right: true,
        top: true,
        bottom: true,
        center: true,
        middle: true,
      }}
      elementSnapDirections={{
        left: true,
        right: true,
        top: true,
        bottom: true,
        center: true,
        middle: true,
      }}
      snapHorizontalThreshold={8 / settings.zoom}
      snapVerticalThreshold={8 / settings.zoom}
      snapGap={false}
      snapGridWidth={!alt && settings.snap ? settings.grid : 0}
      snapGridHeight={!alt && settings.snap ? settings.grid : 0}
      elementGuidelines={alt ? [] : guidelines}
      onDragStart={(event) => {
        if (!controller.isMoving(reactPanel) && !startEdgeDrag(event.inputEvent)) {
          event.stopDrag();
          return;
        }
        event.set([0, 0]);
      }}
      onDrag={({ beforeTranslate }) =>
        controller.previewMove(beforeTranslate[0]!, beforeTranslate[1]!)
      }
      onDragEnd={({ inputEvent }) => end(inputEvent)}
      onDragGroupStart={(event) => {
        if (!controller.isMoving(reactPanel) && !startEdgeDrag(event.inputEvent)) {
          event.stopDrag();
          return;
        }
        event.events.forEach((child) => child.set([0, 0]));
      }}
      onDragGroup={({ events }) => {
        const delta = events[0]?.beforeTranslate;
        if (delta) {
          controller.previewMove(delta[0]!, delta[1]!);
        }
      }}
      onDragGroupEnd={({ inputEvent }) => end(inputEvent)}
      onResizeStart={(event) => {
        if (!start("resize")) {
          event.stopDrag();
          return;
        }
        resizeStart(event);
      }}
      onResize={(event) => controller.previewControls([resizePreview(event)])}
      onResizeEnd={({ inputEvent }) => end(inputEvent)}
      onResizeGroupStart={(event) => {
        if (!start("resize")) {
          event.stopDrag();
          return;
        }
        event.events.forEach(resizeStart);
      }}
      onResizeGroup={({ events }) => controller.previewControls(events.map(resizePreview))}
      onResizeGroupEnd={({ inputEvent }) => end(inputEvent)}
      onRotateStart={(event) => {
        if (!start("rotate")) {
          event.stopDrag();
          return;
        }
        rotateStart(event);
      }}
      onRotate={(event) => controller.previewControls([rotatePreview(event)])}
      onRotateGroupStart={(event) => {
        if (!start("rotate")) {
          event.stopDrag();
          return;
        }
        event.set(groupAngle);
        event.events.forEach(rotateStart);
      }}
      // Keep left/top fixed: Moveable derives child translations from the gesture
      // start. Feeding preview positions back into layout would move that origin.
      onRotateGroup={({ events, beforeDist }) =>
        controller.previewControls(events.map(rotatePreview), beforeDist)
      }
      onRotateGroupEnd={({ inputEvent }) => end(inputEvent)}
      onRotateEnd={({ inputEvent }) => end(inputEvent)}
    />,
    plane,
  );
}
