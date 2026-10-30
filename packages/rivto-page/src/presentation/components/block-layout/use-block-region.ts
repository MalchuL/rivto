import { useMemo, type ForwardedRef } from "react";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";
import type { BlockLayoutRegion } from "./block-layout-regions";

/**
 * Binds a primitive's DOM lifetime to its editor-owned region registration.
 *
 * React releases the registration and forwarded ref on replacement or unmount.
 * The callback remains stable across selection and own-node content updates.
 *
 * @param blockId - Owner identity within the current occurrence.
 * @param role - Layout role independent of DOM nesting.
 * @param forwarded - Optional caller measurement ref, retaining its cleanup contract.
 * @returns Commit ref registering the element and releasing it on unmount.
 * @throws If outside BlockEditor or a caller ref throws.
 */
export function useBlockRegion(
  blockId: string,
  role: BlockLayoutRegion,
  forwarded?: ForwardedRef<HTMLDivElement>,
) {
  const { regions } = useBlockEditorController();
  return useMemo(() => {
    let release: (() => void) | undefined;
    let forwardedCleanup: unknown;
    return (element: HTMLDivElement | null): void => {
      release?.();
      release = element ? regions.register(blockId, role, element) : undefined;
      if (typeof forwarded === "function") {
        const hadCleanup = typeof forwardedCleanup === "function";
        if (typeof forwardedCleanup === "function") {
          forwardedCleanup();
        }
        forwardedCleanup = undefined;
        if (element || !hadCleanup) {
          forwardedCleanup = forwarded(element);
        }
      } else if (forwarded) {
        forwarded.current = element;
      }
    };
  }, [regions, blockId, role, forwarded]);
}
