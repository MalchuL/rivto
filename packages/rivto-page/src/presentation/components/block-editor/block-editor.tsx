import { useEffect, useRef, useState } from "react";
import type { BlockEditorAdapter } from "../../../adapter/types";
import { BlockEditorController } from "../../../editor/block-editor-controller";
import { BlockEditorContext } from "./block-editor-context";
import { BlockTree } from "./block-tree";

/** Inputs of the autonomous block forest, without access to a host editor. */
export interface BlockEditorProps {
  /** One live bounded adapter; a different identity starts a new controller lifetime. */
  readonly adapter: BlockEditorAdapter;
  /** Additional styling of the root; no surface styles or fixed dimensions are imposed. */
  readonly className?: string;
}

/**
 * Renders a bounded block forest using one locally owned controller.
 *
 * The controller is created and attached after commit, then destroyed on adapter
 * replacement or unmount. StrictMode replay creates a fresh instance after cleanup.
 * Server output and the first client render contain only the root until attachment.
 * This autonomous slice provides presentation, not text input, DnD, or host wiring.
 *
 * @param props - Limited live capabilities and optional root styling.
 * @param props.adapter - Stable region adapter borrowed for this controller lifetime.
 * @param props.className - Additional class applied to the existing root element.
 * @returns The DOM root and, after attachment, its addressed block forest.
 * @throws Propagates controller lifecycle, adapter, and renderer failures.
 */
export function BlockEditor({ adapter, className }: BlockEditorProps) {
  const root = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<BlockEditorController>();
  useEffect(() => {
    const controller = new BlockEditorController(adapter);
    const detach = controller.attach(root.current!);
    setCurrent(controller);
    return () => {
      detach();
      controller.destroy();
    };
  }, [adapter]);
  const controller = current?.adapter === adapter ? current : undefined;
  return (
    <div ref={root} className={className} data-rivto-block-editor="true">
      {controller && (
        <BlockEditorContext.Provider value={controller}>
          <BlockTree />
        </BlockEditorContext.Provider>
      )}
    </div>
  );
}
