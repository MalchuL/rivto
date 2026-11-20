import type { RegionIdentity } from "@chulane/rivto-root";
import { Slot } from "radix-ui";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { getDropTargetIdentity } from "./browser/drop-target-identity";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";
import type {
  BlockDropBoundaryMode,
  BlockDropLayoutRegistration,
  BlockDropRegion,
  BlockDropTargetRegistration,
  BlockDropTargetsApi,
} from "../../editor/drag-and-drop/types";
import { BlockEditorContext } from "../components/block-editor/block-editor-context";
import type { BlockDropLayoutOptions, BlockDropLayoutProps } from "./types";

export type { BlockDropLayoutOptions, BlockDropLayoutProps } from "./types";

/** Maintains DOM identities in committed flow order, without reading element geometry. */
class MountedDropItems {
  private readonly items = new Map<string, BlockDropTargetRegistration>();
  private order: readonly string[] = [];
  private snapshot: readonly BlockDropTargetRegistration[] | undefined = [];
  private pending = false;

  /**
   * Adds one mounted item and schedules a single publication for the React commit.
   *
   * @param blockId - Canonical identity in the containing ordered layout.
   * @param item - Borrowed existing placement and its region getter.
   * @returns Disposer releasing that placement and scheduling the next publication.
   */
  register(blockId: string, item: BlockDropTargetRegistration): () => void {
    this.items.set(blockId, item);
    this.publish();
    return () => {
      if (this.items.get(blockId) === item) {
        this.items.delete(blockId);
        this.publish();
      }
    };
  }

  /**
   * Reads committed anchors without filtering, sorting or measuring on pointer input.
   *
   * @returns Stable ordered anchors, or undefined during a structural update.
   */
  read = (): readonly BlockDropTargetRegistration[] | undefined => this.snapshot;

  /**
   * Invalidates order and coalesces registration/reorder changes into a microtask.
   *
   * Supplied canonical order must match visual flow; hidden/unmounted IDs are skipped.
   * No DOM-order comparisons or geometry reads occur during publication.
   *
   * @param order - Current layout order; omission retains the last committed order.
   * @returns A publication is queued, unless one is already pending.
   */
  publish(order = this.order): void {
    this.order = order;
    this.snapshot = undefined;
    if (this.pending) {
      return;
    }
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      const snapshot: BlockDropTargetRegistration[] = [];
      for (const id of this.order) {
        const item = this.items.get(id);
        if (item) {
          snapshot.push(item);
        }
      }
      this.snapshot = snapshot;
    });
  }
}

/** Existing child-list host supplies mounted anchors; nested lists replace this context. */
export const BlockDropLayoutContext = createContext<Pick<MountedDropItems, "register"> | null>(
  null,
);

/** View default borrowed by layouts; explicit layout options override it. */
export const BlockDropBoundaryContext = createContext<BlockDropBoundaryMode>("merged");

/**
 * Registers an existing layout and provides its child-anchor collection without adding DOM.
 *
 * @param options - Flow, canonical order identity, and independent region declarations.
 * @param forwarded - Existing ref whose registration and cleanup remain intact.
 * @returns DOM and identity refs for the current host and the context borrowed by its mounted items.
 * @throws If outside an editor or delegated registration/ref callbacks fail.
 */
export function useBlockDropLayout(
  options: BlockDropLayoutOptions,
  forwarded?: (element: HTMLDivElement | null) => void,
) {
  const editor = useContext(BlockEditorContext);
  if (!editor) {
    throw new Error("Block editor hooks require a BlockEditor");
  }
  const targets: Pick<BlockDropTargetsApi, "register" | "registerLayout"> = editor.dropTargets;
  const boundaries = useContext(BlockDropBoundaryContext);
  options = { ...options, boundaries: options.boundaries ?? boundaries };
  const items = useMemo(() => new MountedDropItems(), []);
  const current = useRef(options);
  useLayoutEffect(() => {
    current.current = options;
  }, [options]);
  const release = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => items.publish(options.order), [items, options.order]);
  const identityRef = useCallback(
    (identity: RegionIdentity | null) => {
      release.current?.();
      release.current = undefined;
      if (!identity) {
        return;
      }
      const layout: BlockDropLayoutRegistration = {
        identity,
        /**
         * Reads the latest committed flow direction.
         *
         * @returns Axis used by the local gap search.
         */
        get axis() {
          return current.current.axis;
        },
        /**
         * Reads the committed gap policy independently of edge and inside regions.
         *
         * @returns Explicit policy, defaulting to enabled for linear layouts.
         */
        get gaps() {
          return current.current.gaps ?? current.current.axis !== "grid";
        },
        /**
         * Reads how far neighboring boundaries continue into free row gutters.
         *
         * @returns Local CSS-pixel extent, zero to disable, or row (the default) to fill the host.
         */
        get gutterSize() {
          return current.current.gutterSize ?? "row";
        },
        /**
         * Reads whether endpoint boundaries fill the remaining free list space.
         *
         * @returns True by default, or false to retain only measured edge continuation.
         */
        get endGaps() {
          return current.current.endGaps ?? true;
        },
        /**
         * Reads whether mounted roots require consecutive display indices.
         *
         * @returns True for virtual roots; otherwise undefined or false.
         */
        get virtual() {
          return current.current.virtual;
        },
        /**
         * Reads the committed shared-boundary feedback policy.
         *
         * @returns The explicit layout mode or inherited view default.
         */
        get boundaries() {
          return current.current.boundaries;
        },
        getItems: items.read,
      };
      const stopLayout = targets.registerLayout(layout);
      const stopRegions = targets.register({
        identity,
        /**
         * Reads committed host declarations without retaining layout geometry.
         *
         * @returns Current host regions, or an empty list when disabled.
         */
        getRegions: () => current.current.regions ?? [],
      });
      release.current = () => {
        stopRegions();
        stopLayout();
      };
    },
    [targets, items],
  );
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      identityRef(null);
      forwarded?.(element);
      if (element) {
        identityRef(getBrowserElementIdentity(element));
      }
    },
    [forwarded, identityRef],
  );
  return { ref, identityRef, items };
}

/**
 * Registers data-only areas on a mounted placement and borrows its containing layout.
 *
 * @param anchor - Opaque identity of the current shell/item or its lookup; null detaches this registration.
 * @param regions - Live declarative geometry, independent of the element's dimensions.
 * @param blockId - Canonical item identity in the containing layout order.
 * @returns The effect releases registry and containing-layout references on replacement/unmount.
 * @throws If outside an editor or delegated registration fails.
 */
export function useBlockDropRegions(
  anchor: object | null | (() => object | null),
  regions: readonly BlockDropRegion[],
  blockId: string,
): void {
  const editor = useContext(BlockEditorContext);
  if (!editor) {
    throw new Error("Block editor hooks require a BlockEditor");
  }
  const targets: Pick<BlockDropTargetsApi, "register"> = editor.dropTargets;
  const items = useContext(BlockDropLayoutContext);
  const current = useRef(regions);
  useLayoutEffect(() => {
    current.current = regions;
  }, [regions]);
  useLayoutEffect(() => {
    const identity = typeof anchor === "function" ? anchor() : anchor;
    if (!identity) {
      return;
    }
    const entry = {
      identity,
      /**
       * Reads the last committed declarations for this mounted item.
       *
       * @returns Live regions without reinstalling the anchor.
       */
      getRegions: () => current.current,
    };
    const stop = targets.register(entry);
    const stopItem = items?.register(blockId, entry);
    return () => {
      stopItem?.();
      stop();
    };
  }, [targets, anchor, items, blockId]);
}

/**
 * Attaches a layout scope to an existing element without adding a wrapper or replacing its ref.
 *
 * @param props - Existing element and explicit flow/region declarations.
 * @param props.options - Stable order plus gap and background policies.
 * @param props.children - One existing element forwarding its DOM element or region identity and containing its already-rendered items.
 * @returns The same DOM subtree with occurrence-owned registration and item context.
 * @throws If outside an editor or composed ref/registration callbacks fail.
 */
export function BlockDropLayout({ options, children }: BlockDropLayoutProps) {
  const layout = useBlockDropLayout(options);
  const attach = useCallback(
    (target: object | null) => layout.identityRef(target ? getDropTargetIdentity(target) : null),
    [layout.identityRef],
  );
  return (
    <BlockDropLayoutContext.Provider value={layout.items}>
      <Slot.Root ref={attach}>{children}</Slot.Root>
    </BlockDropLayoutContext.Provider>
  );
}
