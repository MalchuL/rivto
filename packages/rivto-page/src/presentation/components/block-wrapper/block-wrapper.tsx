import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";
import type { BlockWrapperProps } from "./types";

/**
 * Composes live registered decorators around one already-created block shell.
 *
 * Higher-priority components are outermost; ties retain registration order. This
 * boundary adds no DOM, geometry, renderer selection, adapter subscriptions, or
 * recursive traversal. Each decorator owns its own elements, refs, and handlers. Changing the chain can remount React
 * descendants; host data and controller-cached node objects retain their identity.
 *
 * @param props - Current bounded snapshot and the existing shell.
 * @param props.block - Own-node snapshot passed to every registered decorator.
 * @param props.children - Single Page-owned shell rendered at the end of the chain.
 * @returns Registered decorators in order, or the supplied shell when none exist.
 * @throws If outside BlockEditor or a registered decorator throws while rendering.
 */
export function BlockWrapper({ block, children }: BlockWrapperProps) {
  const { wrappers } = useBlockEditorController();
  const subscribe = useCallback((listener: () => void) => wrappers.subscribe(listener), [wrappers]);
  const read = useCallback(() => wrappers.getSnapshot(), [wrappers]);
  const entries = useSyncExternalStore(subscribe, read, read);
  let result: ReactNode = children;
  for (let index = entries.length - 1; index >= 0; index--) {
    const { id, component: Wrapper } = entries[index];
    result = (
      <Wrapper key={id} block={block}>
        {result}
      </Wrapper>
    );
  }
  return result;
}
