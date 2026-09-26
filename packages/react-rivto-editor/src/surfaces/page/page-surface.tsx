/**
 * Window-scrolled page projection of the complete collaborative document.
 *
 * Long pages mount nearby root BlockViews while retaining root IDs and full
 * document state. Root refs measure variable heights without changing the
 * DOM structure that block controls, CSS, and drag targets depend on.
 *
 * @module
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { defaultRangeExtractor, useWindowVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useEditorRoot, useReactEditor, useRootBlockIds } from "../../hooks";
import { BlockTree } from "../../blocks";
import { BlockElementRefProvider } from "../../blocks/block-wrapper/block-wrapper";
import { ESTIMATED_ROOT_HEIGHT, usePageVirtualization } from "../../page-virtualization-context";
import { registerPageWindow } from "./page-window";

const PAGE_SURFACE_CLASS = "page-surface";
const PAGE_VIRTUAL_SPACER_CLASS = "page-virtual-spacer";

/**
 * Measures a root's existing BlockView without adding a layout wrapper.
 *
 * @param props - Root identity, index, counter seed, and virtualizer.
 * @returns The ordinary BlockTree root with a composed measurement ref.
 */
function MeasuredRoot({
  blockId,
  index,
  virtualizer,
  counterSeed,
}: {
  readonly blockId: string;
  readonly index: number;
  readonly virtualizer: Virtualizer<Window, Element>;
  readonly counterSeed?: number;
}) {
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      element.dataset.index = String(index);
      element.style.counterSet = counterSeed === undefined ? "" : `rivto-list-number ${counterSeed}`;
    }
    virtualizer.measureElement(element);
  }, [counterSeed, index, virtualizer]);
  return (
    <BlockElementRefProvider elementRef={measure}>
      <BlockTree blockIds={[blockId]} />
    </BlockElementRefProvider>
  );
}

/**
 * Keeps the browser's ordinary scrollbar while mounting nearby roots.
 *
 * @param props - Ordered roots and their owning page surface.
 * @returns Flow layout with space for roots outside the mounted range.
 */
function VirtualPageRoots({ blockIds, surface, overscan }: {
  readonly blockIds: readonly string[];
  readonly surface: HTMLElement | null;
  readonly overscan: number;
}) {
  const reactEditor = useReactEditor();
  const [pageTop, setPageTop] = useState(0);
  // Focused or explicitly requested roots stay mounted even when scrolling
  // moves them outside the ordinary viewport range.
  const [pinnedIds, setPinnedIds] = useState<readonly string[]>([]);
  useLayoutEffect(() => {
    if (!surface) return;
    const measure = () => setPageTop(surface.getBoundingClientRect().top + window.scrollY
      + parseFloat(getComputedStyle(surface).paddingTop));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [surface]);
  const getItemKey = useCallback((index: number) => blockIds[index]!, [blockIds]);
  // The virtualizer chooses visible indices; pins add blocks needed by DOM
  // focus and keyboard navigation without mounting the whole document.
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => (
    [...new Set([...defaultRangeExtractor(range), ...pinnedIds.map((id) => blockIds.indexOf(id))])]
      .filter((index) => index >= 0 && index < blockIds.length)
      .sort((left, right) => left - right)
  ), [blockIds, pinnedIds]);
  const virtualizer = useWindowVirtualizer({
    count: blockIds.length,
    estimateSize: () => ESTIMATED_ROOT_HEIGHT,
    getItemKey,
    scrollMargin: pageTop,
    overscan,
    rangeExtractor,
    measureElement: (element) => element.getBoundingClientRect().height + 8,
  });
  // Root measurements update virtual offsets, but moving the browser's
  // viewport for those estimates fights structural-command anchoring and can
  // jump by hundreds of rows when many roots are reparented at once.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;
  useEffect(() => {
    if (!surface) return;
    const view = surface.ownerDocument.defaultView;
    let pendingScrollFrame: number | undefined;
    let scrollAdjustmentSuspensions = 0;
    let previousOverflowAnchor = "";
    /**
     * Finds the top-level root containing a possibly nested block.
     * @param blockId - Requested block anywhere in the outline.
     * @returns Its top-level root ID.
     */
    const rootId = (blockId: string): string => {
      let id = blockId;
      for (let parent = reactEditor.blocks.getParentId(id); parent; parent = reactEditor.blocks.getParentId(id)) id = parent;
      return id;
    };
    /**
     * Mounts requested roots synchronously before a caller queries their DOM.
     * @param ids - Requested blocks, including nested blocks.
     * @returns No value.
     */
    const ensure = (ids: readonly string[], options?: { readonly scroll?: boolean }): void => {
      const roots = [...new Set(ids.map(rootId).filter((id) => blockIds.includes(id)))];
      if (!roots.length) return;
      flushSync(() => setPinnedIds(roots));
      if (pendingScrollFrame !== undefined) view?.cancelAnimationFrame(pendingScrollFrame);
      pendingScrollFrame = undefined;
      if (options?.scroll === false) return;
      const requestedId = ids.at(-1);
      const requestedElement = requestedId
        ? surface.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(requestedId)}"]`)
        : null;
      const requestedRect = requestedElement?.getBoundingClientRect();
      // Structural commands can change which virtual root owns a still-visible
      // block. Mount the new root, but preserve the position of a block partially
      // above the viewport instead of aligning it as if navigation moved offscreen.
      if (requestedRect && requestedRect.bottom > 0 && requestedRect.top < (view?.innerHeight ?? 0)) return;
      const targetIndex = blockIds.indexOf(roots.at(-1)!);
      virtualizer.scrollToIndex(targetIndex, { align: "auto" });
      // A newly pinned root is first positioned from its estimate. Retry after
      // measurement so caret navigation reaches the target without requiring
      // a manual scroll event to make the virtualizer reconcile its offset.
      pendingScrollFrame = view?.requestAnimationFrame(() => {
        pendingScrollFrame = undefined;
        virtualizer.scrollToIndex(targetIndex, { align: "auto" });
      });
    };
    const onFocus = (event: FocusEvent) => {
      const id = (event.target as Element)?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
      if (id) {
        const root = rootId(id);
        setPinnedIds((current) => current.length > 1 && current.includes(root) ? current : [root]);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const id = (event.target as Element)?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
      if (id) setPinnedIds([rootId(id)]);
    };
    surface.addEventListener("focusin", onFocus);
    surface.addEventListener("pointerdown", onPointerDown);
    const unregister = registerPageWindow(surface, {
      ensure,
      ensureAdjacent: (id, direction) => {
        const current = rootId(id);
        const index = blockIds.indexOf(current);
        const next = blockIds[index + direction];
        if (next) ensure([current, next]);
      },
      ensureEdge: (direction) => {
        const id = direction < 0 ? blockIds.at(-1) : blockIds[0];
        if (id) ensure([id]);
      },
      getSelectionBlocks: () => {
        const collapseActive = reactEditor.blockListProps.has("collapse");
        /**
         * Flattens the visible outline without depending on mounted BlockViews.
         * @param blocks - Current sibling forest in canonical order.
         * @returns Visible IDs and text lengths in depth-first page order.
         */
        const visit = (blocks: ReturnType<typeof reactEditor.blocks.getBlocks>): Array<{ id: string; length: number }> => (
          blocks.flatMap((block) => [
            { id: block.id, length: block.content.length },
            ...(collapseActive && block.listProps.collapsed === true ? [] : visit(block.children)),
          ])
        );
        return visit(reactEditor.blocks.getBlocks());
      },
      suspendScrollAdjustments: () => {
        if (scrollAdjustmentSuspensions === 0) {
          previousOverflowAnchor = surface.style.overflowAnchor;
          surface.style.overflowAnchor = "none";
        }
        scrollAdjustmentSuspensions += 1;
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          scrollAdjustmentSuspensions -= 1;
          if (scrollAdjustmentSuspensions === 0) {
            surface.style.overflowAnchor = previousOverflowAnchor;
          }
        };
      },
    });
    return () => {
      if (pendingScrollFrame !== undefined) view?.cancelAnimationFrame(pendingScrollFrame);
      surface.removeEventListener("focusin", onFocus);
      surface.removeEventListener("pointerdown", onPointerDown);
      unregister();
    };
  }, [blockIds, reactEditor, surface, virtualizer]);
  const items = virtualizer.getVirtualItems();
  let previousEnd = pageTop;
  let previousIndex = -2;
  /**
   * Recovers the CSS counter before a mounted numbered list run.
   *
   * @param index - First mounted root index after a virtual gap.
   * @returns Number of preceding list members, or undefined for other blocks.
   */
  const counterSeed = (index: number): number | undefined => {
    const type = reactEditor.blocks.getBlockNode(blockIds[index]!)?.listProps.type;
    if (type !== "numbered_list") return undefined;
    let count = 0;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previousType = reactEditor.blocks.getBlockNode(blockIds[cursor]!)?.listProps.type;
      if (previousType !== "numbered_list" && previousType !== "start_numbered_list") break;
      count += 1;
      if (previousType === "start_numbered_list") break;
    }
    return count;
  };
  return (
    <>
      {items.map((item) => {
        const gap = Math.max(0, item.start - previousEnd);
        const startsWindow = item.index !== previousIndex + 1;
        previousEnd = item.end;
        previousIndex = item.index;
        return <Fragment key={item.key}>
          {gap > 0 && <div className={PAGE_VIRTUAL_SPACER_CLASS} style={{ height: gap }} aria-hidden="true" />}
          <MeasuredRoot blockId={blockIds[item.index]!} index={item.index} virtualizer={virtualizer}
            counterSeed={startsWindow ? counterSeed(item.index) : undefined} />
        </Fragment>;
      })}
      <div className={PAGE_VIRTUAL_SPACER_CLASS} style={{ height: Math.max(0, pageTop + virtualizer.getTotalSize() - previousEnd) }} aria-hidden="true" />
    </>
  );
}

/**
 * Renders the collaborative document as a nested writing page.
 *
 * The surface owns only page geometry and supplies document roots to BlockTree.
 * BlockTree keeps renderer selection, controls, and traversal identical to
 * every other surface that displays blocks.
 */
export function PageSurface() {
  const rootIds = useRootBlockIds();
  const { ref } = useEditorRoot();
  const pageVirtualization = usePageVirtualization();
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const surfaceRef = useCallback((element: HTMLElement | null) => {
    ref(element);
    setSurface(element);
  }, [ref]);
  let pageRoots: ReactNode;
  if (pageVirtualization.threshold === true || (
    typeof pageVirtualization.threshold === "number" && rootIds.length >= pageVirtualization.threshold
  )) {
    pageRoots = <VirtualPageRoots blockIds={rootIds} surface={surface} overscan={pageVirtualization.overscan} />;
  } else {
    pageRoots = <BlockTree blockIds={rootIds} />;
  }

  /*
   * `ref` registers this element as the EditorView DOM/event root.
   * `className` is the public `.page-surface` styling hook in styles.css.
   * `data-rivto-page-editor-root` is PAGE_EDITOR_ROOT_ATTRIBUTE in constants.ts;
   * PAGE_EDITOR_ROOT_SELECTOR uses it for cross-journal caret navigation.
   * `data-empty` exposes document emptiness to styles and integration tests.
   * `aria-label` gives the <main> landmark an accessible editor name.
   * `tabIndex` lets structural selection focus the surface without tab-order noise.
   */
  return (
    <main
      ref={surfaceRef}
      className={PAGE_SURFACE_CLASS}
      data-rivto-page-editor-root
      data-empty={rootIds.length ? undefined : "true"}
      aria-label="Document editor"
      tabIndex={-1}
    >
      {pageRoots}
      {/* PAGE_END_SLOT_ATTRIBUTE in constants.ts marks the TrailingBlock portal target. 
      * Uses to add "Add block" buttons at the end of the page.
      */}
      <div data-page-end-slot="true" />
    </main>
  );
}
