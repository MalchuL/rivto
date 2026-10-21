import { useEffect, useRef } from "react";
import type { BlockEditorController } from "../../../editor/block-editor-controller";
import { BlockEditorContext } from "./block-editor-context";
import { BlockTree } from "./block-tree";

/** Inputs of the autonomous block forest, without access to a host editor. */
export interface BlockEditorProps {
  /** Host-owned instance; views attach/detach without destroying its registrations or nodes. */
  readonly editor: BlockEditorController;
  /** Additional root classes; import package CSS for geometry defaults and override them through theme parameters. */
  readonly className?: string;
}

/**
 * Renders a host-configured block editor and borrows its DOM attachment.
 *
 * The host creates and destroys the editor outside React rendering. Unmounting,
 * replacing the editor prop, and StrictMode replay release only the attachment
 * and React subscriptions. Registrations and cached nodes survive view remounts.
 * One instance supports one mounted view at a time; different views need separate
 * editor objects but may borrow the same data adapter. Server output reads the
 * same synchronous host sources; the host must supply matching hydration data.
 * This autonomous slice provides presentation, not rich-text input, DnD, or host wiring.
 *
 * @param props - Host-owned editor and optional root styling.
 * @param props.editor - Stable instance borrowed until this view unmounts or changes it.
 * @param props.className - Additional class applied to the existing root element.
 * @returns The DOM root and its addressed block nodes, including on the server.
 * @throws Propagates controller lifecycle, adapter, and renderer failures.
 */
export function BlockEditor({ editor, className }: BlockEditorProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => editor.attach(root.current!), [editor]);
  return (
    <div ref={root} className={className} data-rivto-block-editor="true">
      <BlockEditorContext.Provider value={editor}>
        <BlockTree />
      </BlockEditorContext.Provider>
    </div>
  );
}
