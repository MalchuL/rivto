/**
 * Optional responsive Bento container for ordinary editor blocks. Width preferences
 * live in block props; content controls height. Shared tree, keyboard and drag
 * extensions retain ownership of hierarchy, Enter, selection and transactions.
 * @module
 */
import { useLayoutEffect, useState } from "react";
import type { EditorBlockInput } from "@chulane/rivto";
import { createCaretSelection } from "@chulane/rivto";
import { BlockElementRefProvider, type BlockWrapperProps } from "../../blocks/block-wrapper";
import { BlockModal, BlockModalButton } from "../../blocks/block-modal";
import { MarkdownContent } from "../../blocks/markdown";
import { useReactEditor } from "../../hooks";
import { focusBlock, type BlockSlotProps, type ReactEditorExtension } from "../../managers";

export const BENTO_BLOCK_TYPE = "bento";
const SETTINGS_CLASS = "rivto-bento-settings";
const PANEL_CLASS = "rivto-bento-settings-panel";
const WIDTH_PROPERTY = "--rivto-bento-width";

/**
 * Creates an empty grid ready for pasted, typed or dragged blocks.
 * @returns Portable container input.
 */
export function createBentoBlockInput(): EditorBlockInput {
  return { type: BENTO_BLOCK_TYPE, content: "Bento" };
}

/**
 * Renders the editable title and identifies the grid's drop geometry.
 * @param props - Container identity.
 * @returns Editable title; the shared tree renders its tiles.
 */
export function Bento({ blockId }: { readonly blockId: string }) {
  const runtime = useReactEditor();
  return <div data-block-drop-container="" data-block-sort-children="grid" onKeyDownCapture={(event) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing
      || runtime.editor.blocks.getBlock(blockId)?.children.length) return;
    event.preventDefault();
    event.stopPropagation();
    let id = "";
    runtime.editor.batchUpdates(() => {
      id = runtime.blocks.insertBlock(runtime.createDefaultBlock(), blockId);
      runtime.editor.blocks.moveBlocks([id], blockId, "inside");
      runtime.selection.set(createCaretSelection(id, 0));
    });
    requestAnimationFrame(() => { const root = runtime.events.getRoot(); if (root) focusBlock(root, id, 0); });
  }}><MarkdownContent blockId={blockId} /></div>;
}

/**
 * Applies persisted preferred widths to the existing shell without extra DOM.
 * @param props - Block snapshot and shared subtree.
 * @returns Expandable container or a width-aware ordinary block.
 */
function BentoWrapper({ block, children }: BlockWrapperProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const width = block.props.bentoWidth;
  useLayoutEffect(() => {
    const value = typeof width === "number" && Number.isFinite(width) ? Math.max(160, Math.min(960, width)) : 280;
    element?.style.setProperty(WIDTH_PROPERTY, `${value}px`);
    return () => { element?.style.removeProperty(WIDTH_PROPERTY); };
  }, [element, width]);
  const subtree = <BlockElementRefProvider elementRef={setElement}>{children}</BlockElementRefProvider>;
  return block.type === BENTO_BLOCK_TYPE ? <BlockModal label="Bento">{subtree}</BlockModal> : subtree;
}

/**
 * Provides top-right settings and the shared modal button.
 * @param props - Live container snapshot.
 * @returns Width-only settings for the container's direct children.
 */
function BentoControls({ block }: BlockSlotProps) {
  const runtime = useReactEditor();
  const [open, setOpen] = useState(false);
  return <>
    <div className={SETTINGS_CLASS}>
      <button type="button" aria-label="Bento settings" aria-expanded={open} onClick={() => setOpen(!open)}>⚙</button>
      {open && <div className={PANEL_CLASS} role="group" aria-label="Bento widths">
        <strong>Tile widths</strong>
        {block.children.length === 0 && <p>Drag blocks in, or press Enter in the title to start.</p>}
        {block.children.map((child, index) => <label key={child.id}>
          {child.content || `Block ${index + 1}`}
          <input type="range" min="160" max="960" step="20" aria-label={`Width of tile ${index + 1}`}
            value={typeof child.props.bentoWidth === "number" ? child.props.bentoWidth : 280}
            onChange={(event) => runtime.blocks.updateBlock(child.id, { props: { ...child.props, bentoWidth: Number(event.target.value) } })} />
        </label>)}
      </div>}
    </div>
    <BlockModalButton />
  </>;
}

/**
 * Registers optional Bento presentation and insertion in both editor surfaces.
 * @returns Extension with reversible runtime registrations.
 */
export function bentoExtension(): ReactEditorExtension {
  return {
    id: "block.bento",
    setup: (runtime) => {
      const disposers = [
        runtime.blocks.register({ definition: { type: BENTO_BLOCK_TYPE, title: "Bento" }, render: Bento }),
        runtime.surfaces.registerBlockWrapper("block", BentoWrapper),
        runtime.surfaces.registerBlockWrapper("edgeless", BentoWrapper),
        runtime.surfaces.registerBlockSlot({ position: "right", component: BentoControls, when: ({ block }) => block.type === BENTO_BLOCK_TYPE }),
        runtime.slashCommands.register({ id: "block.bento.insert", title: "Bento", group: "Insert", keywords: ["grid", "tiles"],
          execute: ({ blockId }) => { runtime.blocks.insertBlock(createBentoBlockInput(), blockId); } }),
      ];
      return () => disposers.reverse().forEach((dispose) => dispose());
    },
  };
}
