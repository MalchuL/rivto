import type { RegionIdentity } from "@chulane/rivto-root";
import { forwardRef, useCallback, useContext, useRef } from "react";
import { BlockItem } from "../components/block-layout/block-item";
import type { BlockDropWrapperProps } from "./types";
import { BlockChildPlacementContext } from "../components/block-layout/block-item-context";
import { useBlockDropRegions } from "./block-drop-layout";
import { BlockDropDepthContext, useBlockDropEdges } from "./block-drop-item";

export type { BlockDropWrapperProps } from "./types";

/**
 * Declares insertion edges on one existing placement without creating hit-area elements.
 *
 * The item retains its counter, identity, content and caller-owned identity ref. Its content
 * wrapper remains a positioning container for controls. Presentation padding is
 * independent from targetSize: changing drop geometry never changes layout width.
 * Top/inline-start declare before and bottom/inline-end declare after, including RTL.
 * Block-end boundaries inherit the list's outline depth policy through the same
 * declaration builder as linear items; inline grid seams remain sibling placement.
 *
 * @param props - Existing native placement attributes and its already-rendered node.
 * @param props.axis - Edges to enable; defaults to all four for wrapping layouts.
 * @param props.targetSize - Optional edge thickness in local CSS pixels.
 * @param props.className - Optional placement classes appended to the package hook.
 * @param props.style - Placement styles and shared theme parameters.
 * @param props.bindInput - Optional normalized input setup for the mounted placement.
 * @param props.children - Single existing subtree and host controls, rendered once.
 * @param ref - Optional ref receiving the placement identity, with cleanup preserved on replacement and unmount.
 * @returns One ordinary placement item and its positioned content, without boundary strips.
 * @throws If outside a canonical child placement or registration/ref callbacks fail.
 */
export const BlockDropWrapper = forwardRef<RegionIdentity, BlockDropWrapperProps>(
  function BlockDropWrapper(
    { className, children, axis = "grid", targetSize, ...attributes },
    ref,
  ) {
    const placement = useContext(BlockChildPlacementContext);
    const identity = useRef<RegionIdentity | null>(null);
    const generation = useRef(0);
    const anchor = useCallback(() => identity.current, []);
    /**
     * Shares the placement identity with the caller and the drop-region lookup.
     *
     * @param next - Current placement identity, or null after unmount.
     * @returns Caller cleanup, when provided, with stale identity protection.
     * @throws Propagates caller ref and cleanup failures.
     */
    const attach = useCallback(
      (next: RegionIdentity | null) => {
        const current = ++generation.current;
        identity.current = next;
        try {
          if (typeof ref === "function") {
            const cleanup: unknown = ref(next);
            if (typeof cleanup === "function") {
              return () => {
                if (generation.current === current) {
                  identity.current = null;
                }
                cleanup();
              };
            }
          } else if (ref) {
            ref.current = next;
          }
        } catch (error) {
          if (generation.current === current) {
            identity.current = null;
          }
          throw error;
        }
      },
      [ref],
    );
    if (placement?.parentId === undefined) {
      throw new Error("BlockDropWrapper requires a canonical child placement");
    }
    const { regions, depth } = useBlockDropEdges({
      placement,
      axis,
      outline: placement.dropPlacement !== "siblings",
      size: targetSize,
    });
    useBlockDropRegions(anchor, regions, placement.blockId);
    return (
      <BlockItem
        {...attributes}
        ref={attach}
        data-drop-wrapper-axis={axis}
        className={["rivto-block-drop-wrapper", className].filter(Boolean).join(" ")}
      >
        <BlockDropDepthContext.Provider value={depth}>
          <div className="rivto-block-drop-wrapper-content">{children}</div>
        </BlockDropDepthContext.Provider>
      </BlockItem>
    );
  },
);
