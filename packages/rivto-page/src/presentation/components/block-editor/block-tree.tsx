import {
  BlockDropBoundaryContext,
  BlockDropLayoutContext,
  useBlockDropLayout,
} from "../../drag-and-drop/block-drop-layout";
import type { BlockDropLayoutRegistration } from "../../../editor/drag-and-drop/types";
import { BlockRootNode } from "../../drag-and-drop/block-root-node";
import { BlockDropExclude } from "../../drag-and-drop/block-drop-exclude";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { BlockItemIdentityContext } from "../block-layout/block-item-context";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useContext,
  type RefObject,
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
 * @returns Measured roots and inert space for unmounted subtrees. No ending
 * layout is added; an empty list renders no block nodes or insertion spacer.
 * @throws If called outside BlockEditor, settings are invalid, or host reads/renderers fail.
 */
export function BlockTree({ virtualization }: BlockTreeProps) {
  const { blocks } = useBlockEditorController().adapter;
  const subscribe = useCallback(
    (listener: () => void) => blocks.subscribeBlockIds(listener),
    [blocks],
  );
  const getSnapshot = useCallback(() => blocks.getBlockIds(), [blocks]);
  const blockIds = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <BlockTreeContent blockIds={blockIds} virtualization={virtualization} />;
}

/** Complete host display order passed across the local windowing render boundary. */
interface BlockTreeContentProps extends BlockTreeProps {
  readonly blockIds: readonly string[];
}

/**
 * Maintains window measurements, native endpoint pins and list counters for supplied roots.
 *
 * Local focus and geometry updates stay below the display-list subscription so
 * they do not reread host order. The parent observes actual display-list changes;
 * this view owns and releases its controller attachment and metadata subscriptions.
 *
 * @param props - Current complete display order and optional windowing settings.
 * @param props.blockIds - Stable host snapshot, including roots outside the viewport.
 * @param props.virtualization - Same optional windowing settings supplied to BlockTree.
 * @returns Mounted root wrappers and inert space for the current window.
 * @throws If window settings are invalid or host reads and renderers fail.
 */
function BlockTreeContent({ blockIds, virtualization }: BlockTreeContentProps) {
  const { blocks, selection } = useBlockEditorController().adapter;
  const host = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [revision, invalidate] = useReducer((value: number) => value + 1, 0);
  const controller = useMemo(
    () => new BlockVirtualizationController(blocks, selection, invalidate),
    [blocks, selection],
  );
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
  useBlockTreeRootLayout(host, dropLayout.items.read);
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
    enabled,
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
                ref={enabled ? virtualizer.measureElement : undefined}
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

/**
 * Shares a tree's registered anchors with its existing containing editor root.
 *
 * The tree still owns mounted-item order and virtual-gap exclusion. The outer
 * layout only exposes existing space before/after its complete display list;
 * it adds neither DOM nor a model subscription. React releases this borrowed
 * root registration on replacement or unmount. Other tree hosts retain their
 * own layout; only a direct editor-root parent is attached here.
 *
 * @param host - Measured tree whose direct parent may be the editor root.
 * @param getItems - Committed mounted anchors, or undefined during publication.
 * @returns Registers the outer layout until the effect cleans it up.
 * @throws If outside an editor or delegated registration fails.
 */
function useBlockTreeRootLayout(
  host: RefObject<HTMLDivElement | null>,
  getItems: BlockDropLayoutRegistration["getItems"],
): void {
  const editor = useBlockEditorController();
  const boundaries = useContext(BlockDropBoundaryContext);
  useLayoutEffect(() => {
    const element = host.current?.parentElement;
    if (!element?.hasAttribute("data-rivto-block-editor")) {
      return;
    }
    return editor.dropTargets.registerLayout({
      element,
      axis: "vertical",
      gaps: true,
      virtual: true,
      boundaries,
      getItems,
    });
  }, [editor, host, getItems, boundaries]);
}
