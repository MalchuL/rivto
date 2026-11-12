/**
 * Page block that renders pasted HTML and gives the script its whole node.
 *
 * @module
 */
import { useBlockNode } from "../../../hooks/blocks/use-block";
import { useBlockSelectionAnchor } from "../../../hooks/blocks/use-block-selection-anchor";
import { usePanel } from "../../../hooks/editor/use-panel";
import type { BlockSlotProps } from "../../../managers/surfaces/types";
import type { EditorBlockNode, PanelAPI } from "@chulane/rivto";
import { useCallback, useMemo } from "react";
import { useHtmlEditing, type HtmlEditingStore } from "../hooks/use-html-editing";
import { HtmlPasteTarget, HtmlSlotEditButton, HtmlSourceEditor } from "./html-chrome";
import { HtmlFrame } from "./html-frame";
import {
  formatWidgetProps,
  readLabel,
  replacedPropPatch,
  type HtmlBlockView,
  type HtmlDraft,
  type HtmlFrameCommand,
} from "../protocol/protocol";

/** Panel operations needed to read and update HTML blocks. */
interface HtmlBlockPanel {
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode" | "updateBlock">;
}

/** Panel operations needed to save an HTML block draft in one history entry. */
interface HtmlBlockDraftPanel extends HtmlBlockPanel {
  readonly batchUpdates: PanelAPI["batchUpdates"];
}

/** Shared editing state supplied by the installed extension. */
interface HtmlEditingProps {
  readonly editingStore: HtmlEditingStore;
}

/**
 * Renders one HTML block inside its row.
 *
 * The iframe receives the block node: content, props, list props, plugin data,
 * and child ids. The edit control is the right slot and sits inside the block.
 * It appears when the block is hovered or selected.
 *
 * @param props - Renderer props from the block host.
 * @param props.blockId - Stable id of the HTML block.
 * @param props.editingStore - State shared with its slot in this extension installation.
 * @returns The sandbox, the editor, or the paste target. Nothing after deletion.
 */
export function HtmlBlock({
  blockId,
  editingStore,
}: { readonly blockId: string } & HtmlEditingProps) {
  const { block } = useBlockNode(blockId);
  const panel = usePanel();
  const anchor = useBlockSelectionAnchor(blockId);
  const [editing, setEditing] = useHtmlEditing(editingStore, "block", blockId);
  const onCommand = useCallback(
    (command: HtmlFrameCommand) => applyBlockCommand(panel, blockId, command),
    [panel, blockId],
  );
  const node = useMemo(() => (block ? toBlockView(block) : undefined), [block]);
  if (!block || !node) {
    return null;
  }
  const label = readLabel(block.props, "HTML");
  return (
    <div
      {...anchor}
      className="html-surface-block"
      data-html-surface="block"
      data-html-label={label}
    >
      <HtmlBlockBody
        block={block}
        node={node}
        label={label}
        editing={editing}
        onCommand={onCommand}
        onCommit={(source) => panel.blocks.updateBlock(blockId, { content: source })}
        onCancel={() => setEditing(false)}
        onSave={(draft) => {
          commitBlockDraft(panel, blockId, draft);
          setEditing(false);
        }}
      />
    </div>
  );
}

/**
 * Opens the source editor from inside the block's right slot.
 *
 * @param props - Slot context for the HTML block.
 * @param props.block - Block whose edit flag this button toggles.
 * @param props.editingStore - State shared with the block renderer.
 * @returns The edit button overlaid on the block.
 */
export function HtmlBlockEditSlot({ block, editingStore }: BlockSlotProps & HtmlEditingProps) {
  const [editing, setEditing] = useHtmlEditing(editingStore, "block", block.id);
  return <HtmlSlotEditButton editing={editing} onToggle={() => setEditing(!editing)} />;
}

/** Props for the preview, editor, or empty paste target. */
interface HtmlBlockBodyProps {
  readonly block: EditorBlockNode;
  readonly node: HtmlBlockView;
  readonly label: string;
  readonly editing: boolean;
  /**
   * Applies a validated sandbox command to the block.
   *
   * @param command - Command received from the iframe.
   * @returns The command has been applied when supported.
   */
  readonly onCommand: (command: HtmlFrameCommand) => void;
  /**
   * Stores HTML submitted through the empty paste target.
   *
   * @param source - Nonblank HTML text.
   * @returns The source has been submitted for storage.
   */
  readonly onCommit: (source: string) => void;
  /**
   * Closes the source editor without saving.
   *
   * @returns The caller has closed the editor.
   */
  readonly onCancel: () => void;
  /**
   * Saves a valid source and properties draft.
   *
   * @param draft - Parsed source and widget properties.
   * @returns The caller has saved the draft and closed the editor.
   */
  readonly onSave: (draft: HtmlDraft) => void;
}

/**
 * Switches a populated HTML block between preview, editing, and the empty paste target.
 *
 * @param props - Current block snapshot and the callbacks that write it.
 * @param props.block - Detached block node used to seed the editor.
 * @param props.node - Snapshot posted into the sandbox.
 * @param props.label - Accessible iframe name.
 * @param props.editing - Whether the source editor is open.
 * @param props.onCommand - Handles a write from the sandbox.
 * @param props.onCommit - Stores pasted HTML as the block content.
 * @param props.onCancel - Closes the editor without writing.
 * @param props.onSave - Persists the editor draft and the caller closes it.
 * @returns The active body for this block.
 */
function HtmlBlockBody({
  block,
  node,
  label,
  editing,
  onCommand,
  onCommit,
  onCancel,
  onSave,
}: HtmlBlockBodyProps) {
  if (editing) {
    return (
      <HtmlSourceEditor
        source={block.content}
        propsText={formatWidgetProps(block.props, [])}
        listPropsText={JSON.stringify(block.listProps, null, 2)}
        onCancel={onCancel}
        onSave={onSave}
      />
    );
  }
  if (!block.content.trim()) {
    return <HtmlPasteTarget onCommit={onCommit} />;
  }
  return (
    <HtmlFrame
      frameName={label}
      source={block.content}
      node={node}
      fit="auto"
      interactive
      onCommand={onCommand}
    />
  );
}

/**
 * Copies the block fields a script is allowed to read.
 *
 * @param block - Detached block node from the editor.
 * @returns A plain snapshot safe to post into the sandbox.
 */
export function toBlockView(block: EditorBlockNode): HtmlBlockView {
  return {
    kind: "block",
    id: block.id,
    type: block.type,
    content: block.content,
    props: block.props,
    listProps: block.listProps,
    pluginData: block.pluginData,
    childIds: block.childIds,
  };
}

/**
 * Applies one sandbox write to the current block.
 *
 * The block is read again at call time so a stale render cannot overwrite a
 * newer property. Missing blocks are ignored.
 *
 * @param panel - Panel that owns the block.
 * @param blockId - Stable id of the HTML block.
 * @param command - Validated write from the sandbox.
 * @returns Applies the supported command when the block still exists.
 */
export function applyBlockCommand(
  panel: HtmlBlockPanel,
  blockId: string,
  command: HtmlFrameCommand,
): void {
  if (!panel.blocks.getBlockNode(blockId)) {
    return;
  }
  if (command.kind === "set-prop") {
    panel.blocks.updateBlock(blockId, { props: { [command.key]: command.value } });
    return;
  }
  if (command.kind === "set-props") {
    panel.blocks.updateBlock(blockId, { props: command.props });
    return;
  }
  if (command.kind === "set-list-props") {
    panel.blocks.updateBlock(blockId, { listProps: command.listProps });
    return;
  }
  if (command.kind === "set-content") {
    panel.blocks.updateBlock(blockId, { content: command.content });
  }
}

/**
 * Saves the editor as one history entry: new HTML content and replaced props.
 *
 * @param panel - Panel that owns the block.
 * @param blockId - Stable id of the HTML block.
 * @param draft - Source and parsed props from the editor.
 * @returns Saves the draft when the block still exists.
 */
export function commitBlockDraft(
  panel: HtmlBlockDraftPanel,
  blockId: string,
  draft: HtmlDraft,
): void {
  const current = panel.blocks.getBlockNode(blockId);
  if (!current) {
    return;
  }
  panel.batchUpdates(() => {
    panel.blocks.updateBlock(blockId, {
      content: draft.source,
      props: replacedPropPatch(current.props, draft.props, []),
    });
  });
}
