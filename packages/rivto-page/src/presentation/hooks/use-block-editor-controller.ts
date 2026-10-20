import { useContext } from "react";
import { BlockEditorContext } from "../components/block-editor/block-editor-context";
import type { BlockEditorController } from "../../editor/block-editor-controller";

/**
 * Reads the existing controller of the nearest autonomous block editor.
 *
 * @returns The same controller shared by this occurrence's shell and renderers.
 * @throws If called outside a mounted BlockEditor content subtree.
 */
export function useBlockEditorController(): BlockEditorController {
  const controller = useContext(BlockEditorContext);
  if (!controller) {
    throw new Error("Block editor hooks require a BlockEditor");
  }
  return controller;
}
