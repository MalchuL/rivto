/**
 * Window-scrolled page projection of the complete collaborative document.
 *
 * Long pages mount nearby root BlockViews while retaining root IDs and full
 * document state. Root refs measure variable heights without changing the
 * DOM structure that block controls, CSS, and drag targets depend on.
 *
 * @module
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { defaultRangeExtractor, useWindowVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useEditorRoot, useReactEditor, useRootBlockIds } from "../../hooks";
import { BlockTree } from "../../blocks";
import { BlockElementRefProvider } from "../../blocks/block-wrapper/block-wrapper";
import { usePageVirtualization } from "../../page-virtualization-context";
import { registerPageWindow } from "./page-window";

const PAGE_SURFACE_CLASS = "page-surface";
const PAGE_VIRTUAL_SPACER_CLASS = "page-virtual-spacer";
const PAGE_VIRTUAL_THRESHOLD = 1_000;
const ESTIMATED_ROOT_HEIGHT = 40;

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
function VirtualPageRoots({ blockIds, surface }: {
  readonly blockIds: readonly string[];
  readonly surface: HTMLElement | null;
}) {
  const reactEditor = useReactEditor();
  const [pageTop, setPageTop] = useState(0);
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
    overscan: 8,
    rangeExtractor,
    measureElement: (element) => element.getBoundingClientRect().height + 8,
  });
  useEffect(() => {
    if (!surface) return;
    const rootId = (blockId: string) => {
      let id = blockId;
      for (let parent = reactEditor.blocks.getParentId(id); parent; parent = reactEditor.blocks.getParentId(id)) id = parent;
      return id;
    };
    const ensure = (ids: readonly string[]) => {
      const roots = ids.map(rootId).filter((id) => blockIds.includes(id));
      if (!roots.length) return;
      flushSync(() => setPinnedIds(roots));
      virtualizer.scrollToIndex(blockIds.indexOf(roots.at(-1)!), { align: "auto" });
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
    });
    return () => {
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
  const virtualizePage = usePageVirtualization();
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const surfaceRef = useCallback((element: HTMLElement | null) => {
    ref(element);
    setSurface(element);
  }, [ref]);

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
      {virtualizePage && rootIds.length >= PAGE_VIRTUAL_THRESHOLD
        ? <VirtualPageRoots blockIds={rootIds} surface={surface} />
        : <BlockTree blockIds={rootIds} />}
      {/* PAGE_END_SLOT_ATTRIBUTE in constants.ts marks the TrailingBlock portal target. 
      * Uses to add "Add block" buttons at the end of the page.
      */}
      <div data-page-end-slot="true" />
    </main>
  );
}
