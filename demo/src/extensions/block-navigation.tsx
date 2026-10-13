import { createContext, useContext } from "react";
import type { BlockSlotProps, ReactEditorExtension } from "@chulane/rivto-react";
import { editorControlProps } from "../../../packages/react-rivto-editor/src/constants";

/** Requests navigation without prescribing a window, tab, or persistence mechanism. */
export const BlockNavigationContext = createContext<((blockId: string) => void) | undefined>(undefined);

/** Application-owned navigation control; absent outside a demo navigation provider. */
function OpenBlockButton({ block }: BlockSlotProps) {
  const openBlock = useContext(BlockNavigationContext);
  if (!openBlock) return null;
  return <button {...editorControlProps} type="button" aria-label="Open block"
    className="inline-flex h-[var(--rivto-default-block-height)] w-6 items-center justify-center"
    contentEditable={false} onClick={() => openBlock(block.id)}>
    <span aria-hidden="true">↗</span>
  </button>;
}

/** Registers optional demo navigation independently of drag-and-drop and panel APIs. */
export const blockNavigationExtension = (): ReactEditorExtension => ({
  id: "demo.block-navigation",
  setup(reactEditor) {
    // Keep navigation in row flow so nested controls cannot cover a parent drag handle.
    // Leave the noninteractive ID label at the row edge used to drag canvas cards.
    reactEditor.surfaces.registerBlockSlot({ position: "end", priority: 100, component: OpenBlockButton });
  },
});
