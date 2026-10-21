import { useContext } from "react";
import { BlockEditorContext } from "../components/block-editor/block-editor-context";
import type { BlockEditorApi } from "../../editor/block-editor-api";

/**
 * Reads the existing controller of the nearest autonomous block editor.
 *
 * The borrowed interface exposes registrations, data access, and node lookup.
 * Attachment and destruction remain with the host; no wrapper object is created.
 *
 * @returns The same controller shared by this occurrence's shell and renderers,
 * typed as BlockEditorApi without manager attachment or teardown methods.
 * @throws If called outside a mounted BlockEditor content subtree.
 */
export function useBlockEditorController(): BlockEditorApi {
  const controller = useContext(BlockEditorContext);
  if (!controller) {
    throw new Error("Block editor hooks require a BlockEditor");
  }
  return controller;
}
