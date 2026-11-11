/**
 * Page block that renders pasted HTML and gives the script its whole node.
 *
 * @module
 */
import { useBlockSelectionAnchor, usePanel, type BlockSlotProps } from "@chulane/rivto-react";
import type { EditorBlockNode, PanelAPI } from "@chulane/rivto";
import { useCallback, useMemo } from "react";
import { useHtmlEditing } from "./html-edit-session";
import { HtmlPasteTarget, HtmlSlotEditButton, HtmlSourceEditor } from "./html-chrome";
import { HtmlFrame } from "./html-frame";
import {
  formatWidgetProps,
  readLabel,
  readSample,
  replacedPropPatch,
  type HtmlBlockView,
  type HtmlDraft,
  type HtmlFrameCommand,
} from "./protocol";

/**
 * Marks the HTML block row so selection can start there.
 *
 * The preview and editor live in the body slot, with the same highlight an
 * embedding uses. The edit control lives in the right slot.
 *
 * @param props - Renderer props from the block host.
 * @param props.blockId - Stable id of the HTML block.
 * @returns An empty selection anchor for the block row.
 */
export function HtmlBlock({ blockId }: { readonly blockId: string }) {
  const anchor = useBlockSelectionAnchor(blockId);
  return <div {...anchor} className="html-surface-anchor" />;
}

/**
 * Opens the source editor from the block's right slot.
 *
 * @param props - Slot context for the HTML block.
 * @param props.block - Block whose edit flag this button toggles.
 * @returns The embedding-style edit button.
 */
export function HtmlBlockEditSlot({ block }: BlockSlotProps) {
  const [editing, setEditing] = useHtmlEditing(block.id);
  return <HtmlSlotEditButton editing={editing} onToggle={() => setEditing(!editing)} />;
}

/**
 * Renders the highlighted HTML body: preview, paste target, or source editor.
 *
 * The iframe receives the block node: content, props, list props, plugin data,
 * and child ids. Opening the editor replaces that preview until Done or Cancel.
 *
 * @param props - Slot context for the HTML block.
 * @param props.block - Current block snapshot.
 * @returns The body shown under the block row.
 */
export function HtmlBlockBodySlot({ block }: BlockSlotProps) {
  const panel = usePanel();
  const [editing, setEditing] = useHtmlEditing(block.id);
  const onCommand = useCallback(
    (command: HtmlFrameCommand) => applyBlockCommand(panel, block.id, command),
    [panel, block.id],
  );
  const node = useMemo(() => toBlockView(block), [block]);
  const label = readLabel(block.props, "HTML");
  const sample = readSample(block.props);
  return (
    <div
      className="html-surface-block"
      data-html-surface="block"
      data-html-label={label}
      {...(sample ? { "data-html-sample": sample } : {})}
    >
      <div className="html-surface-bar">
        <span className="html-surface-title">{label}</span>
      </div>
      <HtmlBlockBody
        block={block}
        node={node}
        label={label}
        editing={editing}
        onCommand={onCommand}
        onCommit={(source) => panel.blocks.updateBlock(block.id, { content: source })}
        onCancel={() => setEditing(false)}
        onSave={(draft) => {
          commitBlockDraft(panel, block.id, draft);
          setEditing(false);
        }}
      />
    </div>
  );
}

/** Props for the preview, editor, or empty paste target. */
interface HtmlBlockBodyProps {
  readonly block: EditorBlockNode;
  readonly node: HtmlBlockView;
  readonly label: string;
  readonly editing: boolean;
  readonly onCommand: (command: HtmlFrameCommand) => void;
  readonly onCommit: (source: string) => void;
  readonly onCancel: () => void;
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
  const sample = readSample(block.props);
  return (
    <HtmlFrame
      frameName={sample ?? label}
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
function toBlockView(block: EditorBlockNode): HtmlBlockView {
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
 * @returns Nothing. The document changes when the block still exists.
 */
function applyBlockCommand(panel: PanelAPI, blockId: string, command: HtmlFrameCommand): void {
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
 * @returns Nothing. A missing block is left unchanged.
 */
function commitBlockDraft(panel: PanelAPI, blockId: string, draft: HtmlDraft): void {
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
