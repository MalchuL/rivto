import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { BLOCK_EDITOR_CLASSES } from "@chulane/rivto-page";
import { useEditorRoot, useReactPanel } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import { isInPanel, PanelDOM } from "../../panels/panel-dom";
import {
  deleteSideBlock,
  updateSideBlockData,
  type SideBlock,
  type SideBlockStorage,
} from "./side-blocks-store";
import { useSideBlocks } from "./use-side-blocks";

/** Props received by a registered lightweight side-block component. */
export interface SideBlockRendererProps {
  /** Detached, current side-block record. */
  readonly block: SideBlock;
  /**
   * Replaces the block's portable renderer data through document history.
   *
   * @param data - New portable value for the renderer.
   * @returns Whether the side block still existed.
   * @throws If the data cannot be stored in the document.
   */
  readonly update: (data: unknown) => boolean;
  /**
   * Deletes this side block through document history.
   *
   * @returns Whether the record was removed.
   */
  readonly remove: () => boolean;
}

/** Registered renderer types for the side-block extension. */
export interface SideBlocksOptions {
  /** Components keyed by the persisted type; unknown types remain stored but are not rendered. */
  readonly renderers: Readonly<Record<string, ComponentType<SideBlockRendererProps>>>;
}

/** Absolute position of a mounted side block in its editor occurrence. */
interface SideBlockPosition {
  /** Top offset from the editor boundary in CSS pixels. */
  readonly top: number;
  /** Connector path in coordinates relative to the side item, when a handle is mounted. */
  readonly connector?: string;
}

/** Persisted fields used to place one side-block component. */
type SideBlockLayout = Pick<SideBlock, "id" | "anchorId" | "spacing" | "placement">;

/** Measurements required for one visible anchor and side-block component. */
interface SideBlockMeasurement {
  /** Layout settings for this mounted item. */
  readonly block: SideBlockLayout;
  /** Anchor's own row, excluding its descendants. */
  readonly row: HTMLElement;
  /** Side component whose height is measured. */
  readonly item: HTMLElement;
  /** Anchor row's top relative to the boundary, in CSS pixels. */
  readonly top: number;
  /** Anchor row's bottom relative to the boundary, in CSS pixels. */
  readonly bottom: number;
}

/** Original inline margin retained while the side layout owns extra space. */
interface OriginalMargin {
  /** Original inline margin value, or an empty string if unset. */
  readonly value: string;
  /** Original inline CSS priority. */
  readonly priority: string;
  /** Computed margin before the layout added reserved space, in CSS pixels. */
  readonly computed: number;
}

/**
 * Installs a shared side-content layout for page editor views.
 *
 * Components are selected by persisted type, and the extension registration owns
 * the surface wrapper. Embedded views do not read or render side-block data.
 *
 * @param options - Renderer components keyed by side-block type.
 * @returns Extension registering the editor-view layout.
 */
export function sideBlocksExtension(options: SideBlocksOptions): ReactEditorExtension {
  /**
   * Places the registered editor surface inside its side-content boundary.
   *
   * @param props - Surface and other extension content to retain unchanged.
   * @param props.children - The wrapped surface subtree.
   * @returns The surface and its side blocks, or only the surface in an embedding.
   */
  function SideBlocksBoundary({ children }: { readonly children?: ReactNode }) {
    const panel = useReactPanel();
    // A scoped panel is already inside its owning surface; wrapping it again
    // would recursively render the same anchored side content.
    if (panel.rootBlockId !== undefined) {
      return children;
    }
    return <SideBlocksView renderers={options.renderers}>{children}</SideBlocksView>;
  }

  return {
    id: "editor.side-blocks",
    setup: (editor) => editor.surfaces.registerEditorWrapper(SideBlocksBoundary, "block"),
  };
}

/** Props for one page occurrence's side-content boundary. */
interface SideBlocksViewProps extends SideBlocksOptions {
  /** Existing surface subtree, rendered once. */
  readonly children?: ReactNode;
}

/**
 * Subscribes to the current document and renders lightweight side components.
 *
 * @param props - Renderer registrations and existing page surface.
 * @param props.renderers - Renderer components keyed by persisted type.
 * @param props.children - Existing page surface and extensions.
 * @returns A surface and its independently interactive side-content layer.
 */
function SideBlocksView({ renderers, children }: SideBlocksViewProps) {
  const panel = useReactPanel();
  const { element: root } = useEditorRoot();
  const document = panel.editor.getDocument();
  const sideBlocks = useSideBlocks(document);
  const blocks = useMemo(
    () =>
      sideBlocks.filter(
        (block) => block.anchorType === "block" && Object.hasOwn(renderers, block.type),
      ),
    [renderers, sideBlocks],
  );
  // Content edits must not tear down row reservations when geometry is unchanged.
  const layoutSnapshot = JSON.stringify(
    blocks.map(({ id, anchorId, spacing, placement }) => ({ id, anchorId, spacing, placement })),
  );
  const layout = useMemo(() => JSON.parse(layoutSnapshot) as SideBlockLayout[], [layoutSnapshot]);
  const boundary = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, SideBlockPosition>>(() =>
    Object.create(null),
  );
  useSideBlockLayout(boundary.current, root, layout, setPositions);

  return (
    <div
      ref={boundary}
      className="rivto-side-blocks"
      data-side-blocks-editor
      data-has-side-blocks={blocks.length > 0}
      data-reserve-right={blocks.some(
        (block) => block.placement === "right" && block.spacing === "reserve",
      )}
    >
      <div className="rivto-side-blocks-content">{children}</div>
      <div className="rivto-side-blocks-layer">
        {blocks.map((block) => (
          <SideBlockItem
            key={block.id}
            block={block}
            position={positions[block.id]}
            component={renderers[block.type]!}
            document={document}
          />
        ))}
      </div>
    </div>
  );
}

/** Inputs for one positioned lightweight side component. */
interface SideBlockItemProps {
  /** Current detached record. */
  readonly block: SideBlock;
  /** Measured position, absent when the anchor is not mounted. */
  readonly position?: SideBlockPosition;
  /** Host-registered renderer for the record type. */
  readonly component: ComponentType<SideBlockRendererProps>;
  /** Borrowed history and plugin-data operations. */
  readonly document: SideBlockStorage;
}

/**
 * Places one renderer outside the document surface and binds its mutations.
 *
 * @param props - Record, renderer, position, and borrowed document operations.
 * @param props.block - Current detached side-block record.
 * @param props.position - Measured top, or undefined for an unmounted anchor.
 * @param props.component - Renderer registered for this record's type.
 * @param props.document - Document owning the record and history.
 * @returns A positioned renderer hidden until its anchor can be measured.
 */
function SideBlockItem({ block, position, component: Component, document }: SideBlockItemProps) {
  return (
    <div
      className="rivto-side-block"
      data-side-block-id={block.id}
      data-side-block-placement={block.placement}
      data-side-block-spacing={block.spacing}
      style={{ top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
    >
      {position?.connector && (
        <svg className="rivto-side-block-connector" aria-hidden="true" data-side-block-connector>
          <path d={position.connector} />
        </svg>
      )}
      <Component
        block={block}
        update={(data) => updateSideBlockData(document, block.id, data)}
        remove={() => deleteSideBlock(document, block.id)}
      />
    </div>
  );
}

/**
 * Measures mounted anchors and keeps side components aligned as the page changes.
 *
 * Reserved space is applied to the owning row and restored on cleanup. Missing or
 * virtualized anchors leave their side content hidden until their occurrence mounts.
 *
 * @param boundary - Occurrence-local positioning container, or null before mount.
 * @param root - Current page surface, or null before attachment.
 * @param blocks - Side records in stable creation order.
 * @param setPositions - Publishes positions for mounted anchors.
 * @returns Installs and cleans up layout observers and temporary row margins.
 */
function useSideBlockLayout(
  boundary: HTMLDivElement | null,
  root: HTMLElement | null,
  blocks: readonly SideBlockLayout[],
  setPositions: (positions: Record<string, SideBlockPosition>) => void,
) {
  useLayoutEffect(() => {
    if (!boundary || !root || !blocks.length) {
      setPositions(Object.create(null));
      return;
    }
    return observeSideBlockLayout(boundary, root, blocks, setPositions);
  }, [boundary, root, blocks, setPositions]);
}

/**
 * Observes one mounted page and releases its temporary layout changes on disposal.
 *
 * @param container - Positioning boundary owned by this view.
 * @param surface - Mounted page surface whose rows serve as anchors.
 * @param blocks - Current side-block layout descriptors.
 * @param setPositions - Publishes current mounted positions.
 * @returns Disposer for observers, event listeners, and temporary row margins.
 */
function observeSideBlockLayout(
  container: HTMLDivElement,
  surface: HTMLElement,
  blocks: readonly SideBlockLayout[],
  setPositions: (positions: Record<string, SideBlockPosition>) => void,
): () => void {
  const margins = new Map<HTMLElement, OriginalMargin>();
  const originalMinHeight = container.style.minHeight;
  const dom = new PanelDOM(surface);
  const anchors = new Map<string, HTMLElement>();
  let frame = 0;
  let lastPositions: Record<string, SideBlockPosition> | undefined;
  const schedule = () => {
    if (!frame) {
      frame = requestAnimationFrame(measure);
    }
  };
  const resize = new ResizeObserver(schedule);
  const observed = new Set<Element>();
  /**
   * Recomputes positions and row reservations after DOM or size changes.
   *
   * @returns Updates temporary row margins and visible side-block positions.
   */
  function measure() {
    frame = 0;
    const {
      measured,
      positions: next,
      changed,
    } = measureSideBlockLayout(blocks, dom, container, margins, originalMinHeight, anchors);
    observeMeasuredElements(resize, observed, container, surface, measured);
    if (!lastPositions || !samePositions(lastPositions, next)) {
      lastPositions = next;
      setPositions(next);
    }
    if (changed) {
      schedule();
    }
  }
  const stopEvents = observeSideBlockEvents(surface, container, schedule);
  measure();
  return () => {
    cancelAnimationFrame(frame);
    resize.disconnect();
    stopEvents();
    restoreSideBlockMargins(margins);
    container.style.minHeight = originalMinHeight;
  };
}

/**
 * Schedules layout after page mutations, window resizing, or ancestor scrolling.
 *
 * @param surface - Mounted page whose subtree changes can move anchors.
 * @param container - Boundary containing the side cards to observe.
 * @param schedule - Callback coalescing layout work into an animation frame.
 * @returns Disposer removing the mutation observer and window listeners.
 */
function observeSideBlockEvents(
  surface: HTMLElement,
  container: HTMLElement,
  schedule: () => void,
): () => void {
  const mutation = new MutationObserver(schedule);
  mutation.observe(surface, { childList: true, characterData: true, subtree: true });
  const layer = container.lastElementChild;
  if (layer) {
    mutation.observe(layer, { childList: true, characterData: true, subtree: true });
  }
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  return () => {
    mutation.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule, true);
  };
}

/**
 * Restores the inline row margins saved by a side-layout occurrence.
 *
 * @param margins - Original margins for rows touched by this occurrence.
 * @returns Restores each row's previous inline value and priority.
 */
function restoreSideBlockMargins(margins: Map<HTMLElement, OriginalMargin>): void {
  for (const [row, original] of margins) {
    row.style.setProperty("margin-bottom", original.value, original.priority);
  }
}

/** Result of measuring one mounted side-content layer. */
interface MeasuredSideBlockLayout {
  /** Mounted anchor and component measurements. */
  readonly measured: readonly SideBlockMeasurement[];
  /** Positioned component offsets. */
  readonly positions: Record<string, SideBlockPosition>;
  /** Whether updated row spacing requires another measurement. */
  readonly changed: boolean;
}

/**
 * Measures side blocks, applies row reservations, and retains room for overflow.
 *
 * @param blocks - Persisted layout descriptors in creation order.
 * @param dom - Panel-scoped access to mounted anchors.
 * @param container - Positioning boundary holding the side components.
 * @param margins - Original row margins retained for later restoration.
 * @param originalMinHeight - Boundary's inline minimum height before attachment.
 * @param anchors - Cached mounted anchor shells for this page occurrence.
 * @returns Measurements and positions with a flag indicating changed row spacing.
 */
function measureSideBlockLayout(
  blocks: readonly SideBlockLayout[],
  dom: PanelDOM,
  container: HTMLElement,
  margins: Map<HTMLElement, OriginalMargin>,
  originalMinHeight: string,
  anchors: Map<string, HTMLElement>,
): MeasuredSideBlockLayout {
  const measured = measureSideBlocks(
    blocks,
    dom,
    container,
    container.getBoundingClientRect().top,
    anchors,
  );
  const { positions, changed, bottom } = positionSideBlocks(measured, margins);
  const minHeight = bottom > 0 ? `${bottom}px` : originalMinHeight;
  if (container.style.minHeight !== minHeight) {
    container.style.minHeight = minHeight;
  }
  return { measured, positions, changed };
}

/**
 * Updates resize observation to follow the current mounted anchors and items.
 *
 * @param observer - Observer owned by the current page occurrence.
 * @param observed - Set of elements currently observed by that observer.
 * @param container - Side-layout boundary.
 * @param surface - Page surface containing the virtual tree.
 * @param measurements - Currently mounted anchor and side-item pairs.
 * @returns Updates the observer and the set to match the mounted elements.
 */
function observeMeasuredElements(
  observer: ResizeObserver,
  observed: Set<Element>,
  container: HTMLElement,
  surface: HTMLElement,
  measurements: readonly SideBlockMeasurement[],
): void {
  const next = new Set<Element>([container, surface]);
  const tree = surface.querySelector(`:scope > .${BLOCK_EDITOR_CLASSES.tree}`);
  if (tree) {
    next.add(tree);
  }
  for (const { row, item } of measurements) {
    next.add(row);
    next.add(item);
    for (const card of item.querySelectorAll("[data-side-block-card]")) {
      next.add(card);
    }
  }
  for (const element of observed) {
    if (!next.has(element)) {
      observer.unobserve(element);
      observed.delete(element);
    }
  }
  for (const element of next) {
    if (!observed.has(element)) {
      observed.add(element);
      observer.observe(element);
    }
  }
}

/**
 * Collects mounted block rows and their side components in visual order.
 *
 * @param blocks - Persisted records in stable order.
 * @param dom - Panel-scoped block lookup.
 * @param boundary - Owner of the side component elements.
 * @param origin - Boundary top in viewport pixels.
 * @param anchors - Cached anchor shells belonging to this occurrence.
 * @returns Measurements for anchors currently mounted in this occurrence.
 */
function measureSideBlocks(
  blocks: readonly SideBlockLayout[],
  dom: PanelDOM,
  boundary: HTMLElement,
  origin: number,
  anchors: Map<string, HTMLElement>,
): SideBlockMeasurement[] {
  resolveSideBlockAnchors(blocks, dom, anchors);
  // The side layer is the last direct child; avoid scanning the editor tree on each edit.
  const layer = boundary.lastElementChild;
  const items = new Map<string | undefined, HTMLElement>();
  for (const item of layer?.children ?? []) {
    if (item instanceof boundary.ownerDocument.defaultView!.HTMLElement) {
      items.set(item.dataset.sideBlockId, item);
    }
  }
  return blocks
    .flatMap((block) => {
      const anchor = anchors.get(block.anchorId);
      const row = anchor && dom.getRow(anchor);
      const item = items.get(block.id);
      if (!row || !item) {
        return [];
      }
      const bounds = row.getBoundingClientRect();
      return [{ block, row, item, top: bounds.top - origin, bottom: bounds.bottom - origin }];
    })
    .sort((left, right) => left.top - right.top);
}

/**
 * Reuses mounted anchors and locates any missing or replaced block shells.
 *
 * @param blocks - Side-block layouts whose anchors are needed.
 * @param dom - Panel-scoped access to mounted block shells.
 * @param anchors - Occurrence-local cache updated with current shells.
 * @returns Updates the cache without retaining detached or foreign-panel elements.
 */
function resolveSideBlockAnchors(
  blocks: readonly SideBlockLayout[],
  dom: PanelDOM,
  anchors: Map<string, HTMLElement>,
): void {
  const anchorIds = new Set(blocks.map((block) => block.anchorId));
  const missing = new Set(anchorIds);
  for (const [id, anchor] of anchors) {
    if (anchor.dataset.blockId === id && dom.root.contains(anchor) && isInPanel(dom.root, anchor)) {
      missing.delete(id);
    } else {
      anchors.delete(id);
    }
  }
  if (missing.size === 1) {
    const id = missing.values().next().value;
    const anchor = id ? dom.findBlock(id) : null;
    if (id && anchor) {
      anchors.set(id, anchor);
    }
  } else if (missing.size > 1) {
    for (const anchor of dom.getBlocks()) {
      const id = anchor.dataset.blockId;
      if (id && missing.has(id)) {
        anchors.set(id, anchor);
      }
    }
  }
}

/**
 * Places side components without overlap and reserves row space when requested.
 *
 * @param measurements - Mounted side blocks in visual anchor order.
 * @param margins - Original row margins retained until cleanup.
 * @returns Absolute offsets, occupied bottom edge, and whether a row margin changed.
 */
function positionSideBlocks(
  measurements: readonly SideBlockMeasurement[],
  margins: Map<HTMLElement, OriginalMargin>,
): { positions: Record<string, SideBlockPosition>; changed: boolean; bottom: number } {
  const positions: Record<string, SideBlockPosition> = Object.create(null);
  const required = new Map<HTMLElement, number>();
  const mountedRows = new Set(measurements.map(({ row }) => row));
  let leftBottom = -Infinity;
  let rightBottom = -Infinity;
  let reservedBottom = 0;
  for (const { block, row, item, top, bottom } of measurements) {
    let previousBottom = rightBottom;
    if (block.placement === "left") {
      previousBottom = leftBottom;
    } else if (block.placement === "full") {
      previousBottom = Math.max(leftBottom, rightBottom);
    }
    // Full-width items start below their row; each side stacks independently.
    const height = item.getBoundingClientRect().height;
    const anchorTop = block.placement === "full" ? bottom : (top + bottom - height) / 2;
    const itemTop = Math.max(anchorTop, previousBottom);
    const itemBottom = itemTop + height;
    const rowBounds = row.getBoundingClientRect();
    const itemBounds = item.getBoundingClientRect();
    let connector: string | undefined;
    if (block.placement !== "full") {
      const cards = [...item.querySelectorAll<HTMLElement>("[data-side-block-card]")];
      const targets = cards.length ? cards : [item];
      const endX =
        (block.placement === "left" ? rowBounds.left : rowBounds.right) - itemBounds.left;
      const endY = (top + bottom) / 2 - itemTop;
      connector = targets
        .map((card) => {
          const bounds = card.getBoundingClientRect();
          const startX =
            (block.placement === "left" ? bounds.right : bounds.left) - itemBounds.left;
          const startY = bounds.top - itemBounds.top + bounds.height / 2;
          const middleX = (startX + endX) / 2;
          return `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`;
        })
        .join(" ");
    }
    positions[block.id] = { top: itemTop, connector };
    if (block.placement !== "right") {
      leftBottom = itemBottom + 8;
    }
    if (block.placement !== "left") {
      rightBottom = itemBottom + 8;
    }
    if (block.spacing === "reserve") {
      // Reserve only the portion extending beyond this anchor's own row.
      required.set(row, Math.max(required.get(row) ?? 0, itemBottom - bottom));
      reservedBottom = Math.max(reservedBottom, itemBottom);
    }
  }
  const changed = applySideBlockMargins(required, margins, mountedRows);
  return { positions, changed, bottom: reservedBottom };
}

/**
 * Applies reserved space while retaining and restoring each row's original margin.
 *
 * @param required - Extra margin needed for each reserved side item.
 * @param margins - Original row margins retained by the active layout.
 * @param mountedRows - Rows whose side items remain mounted.
 * @returns Whether any inline row margin changed.
 */
function applySideBlockMargins(
  required: Map<HTMLElement, number>,
  margins: Map<HTMLElement, OriginalMargin>,
  mountedRows: Set<HTMLElement>,
): boolean {
  let changed = false;
  for (const row of new Set([...margins.keys(), ...required.keys()])) {
    let original = margins.get(row);
    if (!original) {
      original = {
        value: row.style.getPropertyValue("margin-bottom"),
        priority: row.style.getPropertyPriority("margin-bottom"),
        computed: parseFloat(getComputedStyle(row).marginBottom) || 0,
      };
      margins.set(row, original);
    }
    const margin = required.get(row) ?? 0;
    const value = margin > 0 ? `${original.computed + margin}px` : original.value;
    if (row.style.getPropertyValue("margin-bottom") !== value) {
      row.style.setProperty("margin-bottom", value, original.priority);
      changed = true;
    }
    if (!mountedRows.has(row)) {
      margins.delete(row);
    }
  }
  return changed;
}

/**
 * Compares offsets to avoid rendering again after an unchanged measurement.
 *
 * @param left - Previously published positions.
 * @param right - Newly measured positions.
 * @returns Whether every ID has the same vertical offset and connector path.
 */
function samePositions(
  left: Record<string, SideBlockPosition>,
  right: Record<string, SideBlockPosition>,
): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (id) => left[id]?.top === right[id]?.top && left[id]?.connector === right[id]?.connector,
    )
  );
}
