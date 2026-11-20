import { useCallback } from "react";
import { BlockItem, type BlockItemInputBinding, type BlockWrapperProps } from "../src";

/**
 * Wraps the existing shell with an element owning its own pointer handler.
 *
 * BlockItem preserves one sibling counter even when several decorators wrap the
 * same node. Events bubble/capture normally through nested wrappers; the marker
 * is updated on this wrapper only, not on an ancestor representing another block.
 *
 * @param props - Current bounded node snapshot and the remaining decorator chain.
 * @param props.block - Borrowed snapshot supplying identity/list decoration without an additional subscription.
 * @param props.children - Existing shell or next decorator, rendered exactly once.
 * @returns An ordinary counter-aware wrapper with its own pointer-capture feedback.
 */
export function DemoBlockWrapper({ block, children }: BlockWrapperProps) {
  /**
   * Marks only the nearest wrapper during normalized pointer capture.
   *
   * @param identity - Opaque identity of this mounted wrapper.
   * @param events - Region input registration borrowed from the editor.
   * @returns Cleanup releasing the observation and its presentation marker.
   * @throws Propagates registration, marker, and cleanup failures.
   */
  const bindInput = useCallback<BlockItemInputBinding>((identity, events) => {
    let restoreMarker: (() => void) | undefined;
    const release = events.observeRegion(identity, "pointerdown", "capture", (input, region) => {
      if (
        input.target?.isElement?.() &&
        input.target.getNearestAncestorIdentity?.("[data-demo-wrapper]") === identity
      ) {
        const previous = restoreMarker;
        restoreMarker = region.setTemporaryAttribute("data-demo-wrapper-pointer", "true");
        previous?.();
      }
    });
    return () => {
      const errors: unknown[] = [];
      for (const cleanup of [release, restoreMarker]) {
        try {
          cleanup?.();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Demo wrapper input cleanup failed");
      }
    };
  }, []);
  return (
    <BlockItem block={block} data-demo-wrapper={block.id} bindInput={bindInput}>
      {children}
    </BlockItem>
  );
}
