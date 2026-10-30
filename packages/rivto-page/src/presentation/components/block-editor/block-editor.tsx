import { BlockDropBoundaryContext } from "../../drag-and-drop/block-drop-layout";
import type { BlockDropBoundaryMode } from "../../../editor/drag-and-drop/types";
import type { BlockVirtualizationOptions } from "../../../editor/virtualization/block-virtualization-controller";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useState,
  type HTMLAttributes,
} from "react";
import { BlockEditorScope, type BlockEditorViewApi } from "./block-editor-scope";
import { BlockTree } from "./block-tree";

/** Inputs of the autonomous block forest, without access to a host editor. */
export interface BlockEditorProps extends HTMLAttributes<HTMLDivElement> {
  /** Host-owned instance; views attach/detach without destroying its registrations or nodes. */
  readonly editor: BlockEditorViewApi;
  /** Additional root classes; import package CSS for geometry defaults and override them through theme parameters. */
  readonly className?: string;
  /** Shared sibling feedback, default merged; separate retains nearest-edge feedback. */
  readonly dropBoundaries?: BlockDropBoundaryMode;
  /** Opt-in window scrolling of display subtrees; omitted renders the full tree. */
  readonly virtualization?: BlockVirtualizationOptions;
  /** Actual receiving parent for an empty view; null denotes document roots, undefined disables it. */
  readonly emptyDropParentId?: string | null;
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
 * Existing free space before/after the complete displayed root list accepts
 * insertion through its registered layout, without extra elements or dimensions.
 * Optional controller extensions supply selection and pointer dragging; concrete
 * rich-text editing and document commands remain with the host adapter.
 *
 * @param props - Host-owned editor and optional root styling.
 * @param props.editor - Stable instance borrowed until this view unmounts or changes it.
 * @param props.dropBoundaries - Default boundary mode for this view, overridable by each layout.
 * @param props.virtualization - Optional variable-height windowing settings (enabled, estimateSize in CSS pixels, overscan in roots); omission disables windowing. Changing settings preserves mounted roots; selected IDs remain in the adapter.
 * @param props.emptyDropParentId - Actual empty receiving parent; undefined disables an empty region, null denotes document roots.
 * @param props.className - Additional class applied to the existing root element.
 * @param props.children - Host page-ending slot rendered after the block forest, inside the Page context.
 * @param ref - Borrows the same DOM root for host panel routing; no additional root is created.
 * @returns The DOM root and its addressed block nodes. With virtualization, server
 * output reserves estimated space until the client measures its viewport.
 * @throws Propagates controller lifecycle, adapter, and renderer failures.
 */
export const BlockEditor = forwardRef<HTMLDivElement, BlockEditorProps>(function BlockEditor(
  {
    editor,
    className,
    virtualization,
    emptyDropParentId,
    dropBoundaries = "merged",
    children,
    ...attributes
  },
  ref,
) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useImperativeHandle(ref, () => root!, [root]);
  useLayoutEffect(() => {
    if (!root || emptyDropParentId === undefined) {
      return;
    }
    const destination = { kind: "inside", parentId: emptyDropParentId } as const;
    const region = { kind: "inside", coverage: "background", destination } as const;
    return editor.dropTargets.register({
      element: root,
      /**
       * Declares append on the existing empty editor surface without adding a spacer.
       *
       * Display emptiness is read live, so insertion immediately disables the area.
       * @returns Background append for an empty view, otherwise no regions.
       */
      getRegions: () => (editor.adapter.blocks.getBlockIds().length ? [] : [region]),
    });
  }, [editor, root, emptyDropParentId]);
  return (
    <div
      {...attributes}
      ref={setRoot}
      className={className}
      data-rivto-block-editor="true"
      data-block-root-list
      tabIndex={attributes.tabIndex ?? -1}
    >
      <BlockEditorScope editor={editor} root={root}>
        <BlockDropBoundaryContext.Provider value={dropBoundaries}>
          <BlockTree virtualization={virtualization} />
          {children}
        </BlockDropBoundaryContext.Provider>
      </BlockEditorScope>
    </div>
  );
});
