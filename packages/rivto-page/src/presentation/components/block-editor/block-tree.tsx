import { BlockDropLayoutContext, useBlockDropLayout } from "../../drag-and-drop/block-drop-layout";
import { BlockRootNode } from "../../drag-and-drop/block-root-node";
import { BlockDropExclude } from "../../drag-and-drop/block-drop-exclude";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { BlockItemIdentityContext } from "../block-layout/block-item-context";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";
import {
  BlockVirtualizationController,
  type BlockVirtualizationOptions,
} from "../../../editor/virtualization/block-virtualization-controller";

/** Display-list windowing; omitted settings retain ordinary complete rendering. */
export interface BlockTreeProps {
  readonly virtualization?: BlockVirtualizationOptions;
}

/**
 * Observes the host display list and renders stable keyed roots in either windowing mode.
 *
 * Root wrappers reserve measured flow space; container layouts and their canonical
 * child lists remain intact. Only canonical/native endpoints and focus are pinned, never the
 * complete structural selection. Settings are in CSS pixels and root counts.
 * Disabling windowing mounts every root through the same component hierarchy;
 * roots retained by a mode change keep their embedding and renderer state.
 * The view owns measurement and native-focus subscriptions and releases them on unmount.
 *
 * @param props - Optional windowing configuration for the displayed block forest.
 * @param props.virtualization - Omitted disables windowing; supplied settings default to enabled, a 240px estimate and three overscan roots.
 * @returns Measured roots and inert space for unmounted subtrees; an empty list renders no block nodes.
 * @throws If called outside BlockEditor, settings are invalid, or host reads/renderers fail.
 */
export function BlockTree({ virtualization }: BlockTreeProps) {
  const { blocks, selection } = useBlockEditorController().adapter;
  const host = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [revision, invalidate] = useReducer((value: number) => value + 1, 0);
  const controller = useMemo(
    () => new BlockVirtualizationController(blocks, selection, invalidate),
    [blocks, selection],
  );
  const subscribe = useCallback(
    (listener: () => void) => blocks.subscribeBlockIds(listener),
    [blocks],
  );
  const getSnapshot = useCallback(() => blocks.getBlockIds(), [blocks]);
  const blockIds = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setHost = useCallback((element: HTMLDivElement | null) => {
    host.current = element;
  }, []);
  const dropLayout = useBlockDropLayout(
    {
      axis: "vertical",
      virtual: true,
      order: blockIds,
    },
    setHost,
  );
  const enabled = virtualization !== undefined && virtualization.enabled !== false;
  const estimate = virtualization?.estimateSize ?? 240;
  const overscan = virtualization?.overscan ?? 3;
  if (!Number.isFinite(estimate) || estimate <= 0 || !Number.isInteger(overscan) || overscan < 0) {
    throw new Error(
      "Virtualization requires a positive estimateSize and non-negative integer overscan",
    );
  }
  const rangeExtractor = useCallback(
    (range: Parameters<typeof controller.getRangeIndices>[0]) => {
      if (!enabled) {
        return blockIds.map((_, index) => index);
      }
      return controller.getRangeIndices(range);
    },
    [controller, revision, blockIds, enabled],
  );
  const virtualizer = useWindowVirtualizer({
    count: blockIds.length,
    estimateSize: () => estimate,
    getItemKey: (index) => blockIds[index]!,
    scrollMargin: margin,
    overscan,
    rangeExtractor,
  });
  controller.setBlockIds(blockIds);
  useLayoutEffect(() => controller.attach(host.current!, setMargin), [controller]);
  useLayoutEffect(() => controller.reconcileListSubscriptions(), [controller, blockIds]);
  const items = enabled
    ? virtualizer.getVirtualItems()
    : blockIds.map((key, index) => ({ key, index, start: 0, end: 0 }));
  let end = margin;
  return (
    <div ref={dropLayout.ref} className={BLOCK_EDITOR_CLASSES.tree} data-virtualized={enabled}>
      <BlockDropLayoutContext.Provider value={dropLayout.items}>
        {items.map((item) => {
          const gap = enabled ? Math.max(0, item.start - end) : 0;
          end = item.end;
          return (
            <div key={item.key} style={{ paddingTop: gap }}>
              <div
                data-index={item.index}
                data-virtual-last={item.index === blockIds.length - 1 || undefined}
                data-virtual-block-id={blockIds[item.index]}
                style={{
                  counterReset: `rivto-list-number ${controller.getListNumber(blockIds[item.index]!)}`,
                }}
                className={BLOCK_EDITOR_CLASSES.virtualRoot}
                ref={virtualizer.measureElement}
              >
                <BlockItemIdentityContext.Provider value={blockIds[item.index]}>
                  <BlockRootNode blockId={blockIds[item.index]!} />
                </BlockItemIdentityContext.Provider>
              </div>
            </div>
          );
        })}
        <BlockDropExclude asChild>
          <div
            aria-hidden="true"
            style={{ height: enabled ? Math.max(0, margin + virtualizer.getTotalSize() - end) : 0 }}
          />
        </BlockDropExclude>
      </BlockDropLayoutContext.Provider>
    </div>
  );
}
