/**
 * Optional responsive Bento container for ordinary editor blocks. Width
 * preferences live in block props; content controls height. Tile widths are
 * previewed from left and right edges without reflowing the wrap layout, then
 * persisted once the pointer is released. Shared tree, keyboard and drag
 * extensions retain ownership of hierarchy, Enter, selection and transactions.
 *
 * @module
 */
import type { EditorBlockInput } from "@chulane/rivto";
import type { BlockLayoutProps } from "@chulane/rivto-page";
import { BentoLayout } from "./bento-layout";
import { BlockModal, BlockModalButton } from "../../../blocks/block-modal/block-modal";
import { type BlockWrapperProps } from "../../../blocks/block-wrapper/block-wrapper";
import { useBlockNode, useBlockSelectionAnchor } from "../../../hooks";
import type { ReactEditorExtension } from "../../../managers";
import { BENTO_BLOCK_TYPE, bentoBehavior } from "./bento-behavior";

export { BENTO_BLOCK_TYPE } from "./bento-behavior";
const SUMMARY_CLASS = "rivto-bento-summary";
const SUMMARY_STATS_CLASS = "rivto-bento-count";

/**
 * Creates an empty grid ready for pasted, typed or dragged blocks.
 *
 * @returns Portable block input.
 */
export function createBentoBlockInput(): EditorBlockInput {
  return { type: BENTO_BLOCK_TYPE, content: "" };
}

/**
 * Renders a structural board header and live tile count in both collapse states.
 *
 * @param props - Container identity.
 * @param props.blockId - Stable ID of the Bento board.
 * @returns Board header and statistics; the layout separately places its tile collection.
 */
export function Bento({ blockId }: BlockLayoutProps) {
  const editing = useBlockNode(blockId);
  const attributes = useBlockSelectionAnchor(blockId);
  const block = editing.block;
  if (!block) {
    return null;
  }
  const tileCount = block.childIds.length;
  return (
    <div {...attributes} className={SUMMARY_CLASS}>
      <strong>Bento</strong>
      <span className={SUMMARY_STATS_CLASS}>
        {tileCount} {tileCount === 1 ? "tile" : "tiles"}
      </span>
    </div>
  );
}

/**
 * Supplies the board's modal state without adding tile sizing subscriptions.
 *
 * Page layouts own tile widths and resize controls through their explicit items;
 * the same layout supplies those controls in each Page and Edgeless occurrence.
 * Both surfaces reuse this modal boundary and render its children exactly once.
 *
 * @param props - Current host block and the already composed structural subtree.
 * @param props.block - Snapshot identifying whether this occurrence is a Bento board.
 * @param props.children - Existing Page or Edgeless subtree, including any tile controls.
 * @returns An expandable board or unchanged non-board children.
 */
function BentoModalWrapper({ block, children }: BlockWrapperProps) {
  if (block.type !== BENTO_BLOCK_TYPE) {
    return children;
  }
  return (
    <BlockModal blockId={block.id} label="Bento">
      {children}
    </BlockModal>
  );
}

/**
 * Registers optional Bento presentation and insertion in both editor surfaces.
 *
 * @returns Extension with reversible runtime registrations.
 */
export function bentoExtension(): ReactEditorExtension {
  return {
    id: "block.bento",
    setup: (reactEditor) => {
      const disposers = [
        reactEditor.blockTypes.register({
          definition: {
            type: BENTO_BLOCK_TYPE,
            title: "Bento",
          },
          render: Bento,
          layout: BentoLayout,
          behavior: bentoBehavior,

          slashCommand: {
            id: "block.bento.insert",
            title: "Bento",
            group: "Turn into",
            keywords: ["grid", "tiles"],
          },
        }),
        reactEditor.surfaces.registerBlockWrapper("block", BentoModalWrapper),
        reactEditor.surfaces.registerBlockWrapper("edgeless", BentoModalWrapper),
        reactEditor.surfaces.registerBlockSlot({
          position: "right",
          component: BlockModalButton,
          when: ({ block }) => block.type === BENTO_BLOCK_TYPE,
        }),
      ];
      return () => disposers.reverse().forEach((dispose) => dispose());
    },
  };
}
