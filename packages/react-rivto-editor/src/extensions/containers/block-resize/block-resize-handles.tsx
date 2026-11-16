import { useLayoutEffect, useRef, useState } from "react";
import { editorControlProps } from "../../../constants";
import { useReactPanel } from "../../../hooks";
import {
  BlockResizeController,
  type BlockResizeEdge,
  MIN_RESIZE_HEIGHT,
  MAX_RESIZE_HEIGHT,
} from "./block-resize-controller";
import {
  MAX_RESIZE_WIDTH,
  MIN_RESIZE_WIDTH,
  RESIZE_EDGE_ATTRIBUTE,
} from "./block-resize-constants";

/** Block and mounted placement borrowed by the width resize controls. */
export interface BlockResizeHandlesProps {
  /** Block receiving the committed width. */
  readonly blockId: string;
  /** Current persisted style, observed by the owning layout when using style width. */
  readonly style: unknown;
  /** Optional block plugin-data key holding the layout-owned pixel width. */
  readonly pluginId?: string;
  /** Optional plugin-data key for the width captured before entering a layout. */
  readonly originalWidthPluginId?: string;
  /** Optional block plugin-data key holding the layout-owned height. */
  readonly heightPluginId?: string;
  /** Optional key retaining the previous style height and policy. */
  readonly originalHeightPluginId?: string;
  /** Edges and corners to render; defaults to left and right. */
  readonly edges?: readonly BlockResizeEdge[];
  /** Current value at the plugin-data key, if supplied. */
  readonly pluginWidth?: unknown;
  /** Accessible name for the resized placement. */
  readonly label: string;
  /** Explicit placement; absent when the handles are direct children of the shell. */
  readonly placement?: HTMLElement;
  /** Block shell receiving height previews; defaults to the placement. */
  readonly heightTarget?: HTMLElement;
  /** Required class of the placement's parent, when the shell must belong to a specific layout. */
  readonly parentClassName?: string;
}

/**
 * Renders accessible separators and owns their resize controller until detachment.
 *
 * @param props - Addressed block, current style, placement and accessible label.
 * @param props.blockId - Block receiving committed width changes.
 * @param props.style - Persisted style used for the current accessible value when no plugin ID is supplied.
 * @param props.pluginId - Optional block plugin-data key receiving a layout-owned width.
 * @param props.originalWidthPluginId - Optional key retaining the previous style width.
 * @param props.heightPluginId - Optional plugin-data key receiving the layout-owned height.
 * @param props.originalHeightPluginId - Optional key retaining the previous style height and policy.
 * @param props.edges - Edges and corners to offer; defaults to left and right.
 * @param props.pluginWidth - Current pixel width stored under that key.
 * @param props.label - Placement name included in the separator labels.
 * @param props.placement - Explicit placement, or the handles' direct parent when omitted.
 * @param props.heightTarget - Shell receiving height previews, or the placement when omitted.
 * @param props.parentClassName - Required class on the placement's parent; outside it controls stay hidden.
 * @returns The selected resize handles with pointer and keyboard interactions.
 */
export function BlockResizeHandles({
  blockId,
  style,
  pluginId,
  originalWidthPluginId,
  heightPluginId,
  originalHeightPluginId,
  edges = ["left", "right"],
  pluginWidth,
  label,
  placement: suppliedPlacement,
  heightTarget: suppliedHeightTarget,
  parentClassName,
}: BlockResizeHandlesProps) {
  const panel = useReactPanel();
  const controller = useRef<BlockResizeController | null>(null);
  const [handle, setHandle] = useState<HTMLDivElement | null>(null);
  const placement = suppliedPlacement ?? handle?.parentElement;
  const active =
    !!placement &&
    (!parentClassName || placement.parentElement?.classList.contains(parentClassName));
  const width = pluginId
    ? BlockResizeController.getPluginWidth(pluginWidth, placement ?? undefined)
    : BlockResizeController.getStyleWidth(style, placement ?? undefined);
  useLayoutEffect(() => {
    if (!placement || !active) {
      return;
    }
    const resize = new BlockResizeController(
      panel.blocks,
      blockId,
      placement,
      pluginId,
      originalWidthPluginId,
      heightPluginId,
      originalHeightPluginId,
      suppliedHeightTarget,
    );
    controller.current = resize;
    return () => {
      controller.current = null;
      resize.cancel();
    };
  }, [
    panel.blocks,
    blockId,
    placement,
    active,
    pluginId,
    originalWidthPluginId,
    heightPluginId,
    originalHeightPluginId,
    suppliedHeightTarget,
  ]);

  return (
    <>
      {edges.map((edge, index) => {
        const corner = edge.includes("-");
        const vertical = edge === "top" || edge === "bottom";
        let orientation: "horizontal" | "vertical" | undefined;
        let minimum: number | undefined;
        let maximum: number | undefined;
        let value: number | undefined;
        if (!corner) {
          orientation = vertical ? "horizontal" : "vertical";
          minimum = vertical ? MIN_RESIZE_HEIGHT : MIN_RESIZE_WIDTH;
          maximum = vertical ? MAX_RESIZE_HEIGHT : MAX_RESIZE_WIDTH;
          if (vertical) {
            const heightTarget = suppliedHeightTarget ?? placement;
            value = heightTarget?.offsetHeight;
          } else {
            value = width;
          }
        }
        return (
          <div
            key={edge}
            ref={!suppliedPlacement && index === 0 ? setHandle : undefined}
            {...editorControlProps}
            className="rivto-container-width-resize"
            hidden={!active}
            role={corner ? "button" : "separator"}
            tabIndex={0}
            aria-label={`Resize ${label} from the ${edge}`}
            aria-orientation={orientation}
            aria-valuemin={minimum}
            aria-valuemax={maximum}
            aria-valuenow={value}
            {...{ [RESIZE_EDGE_ATTRIBUTE]: edge }}
            onPointerDown={(event) =>
              controller.current?.start(edge, event.nativeEvent, event.currentTarget)
            }
            onPointerMove={(event) => controller.current?.move(event.nativeEvent)}
            onPointerUp={(event) => controller.current?.finish(event.nativeEvent, true)}
            onPointerCancel={(event) => controller.current?.finish(event.nativeEvent, false)}
            onLostPointerCapture={(event) => controller.current?.finish(event.nativeEvent, false)}
            onKeyDown={(event) => controller.current?.resizeWithKeyboard(edge, event.nativeEvent)}
          />
        );
      })}
    </>
  );
}
