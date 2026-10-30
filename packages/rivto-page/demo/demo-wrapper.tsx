import { BlockItem, type BlockWrapperProps } from "../src";

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
  return (
    <BlockItem
      block={block}
      data-demo-wrapper={block.id}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest("[data-demo-wrapper]") === event.currentTarget
        ) {
          event.currentTarget.dataset.demoWrapperPointer = "true";
        }
      }}
    >
      {children}
    </BlockItem>
  );
}
