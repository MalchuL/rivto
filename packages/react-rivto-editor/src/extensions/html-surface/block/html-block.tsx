/**
 * Page block renderers for HTML widgets.
 *
 * @module
 */
import type { EditorBlockNode, PanelAPI } from "@chulane/rivto";
import { useCallback, useMemo, type ReactNode } from "react";
import { useBlockNode } from "../../../hooks/blocks/use-block";
import { useBlockSelected } from "../../../hooks/blocks/use-block-selection";
import { useBlockSelectionAnchor } from "../../../hooks/blocks/use-block-selection-anchor";
import { useHtmlWidgetContext } from "../frame/use-html-widget-context";
import { usePanel } from "../../../hooks/editor/use-panel";
import type { BlockSlotProps } from "../../../managers/surfaces/types";
import { HtmlEditButton } from "../editing/html-edit-button";
import { HtmlPasteTarget } from "../editing/html-paste-target";
import { HtmlSourceEditor } from "../editing/html-source-editor";
import { useHtmlEditing, type HtmlEditingStoreProps } from "../editing/use-html-editing";
import { HtmlFrame } from "../frame/html-frame";
import { readLabel } from "../model/widget-props";
import type { HtmlBlockView, HtmlDraft, HtmlWidgetCommand } from "../types";
import type { UnsafeHtmlFrameAccess } from "../unsafe/unsafe-requests";

/** Panel operations an HTML block writes through. */
export interface HtmlBlockPanel {
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode" | "updateBlock">;
  readonly batchUpdates: PanelAPI["batchUpdates"];
}

/**
 * Renders an `html` block.
 *
 * Its edit button lives in a registered right slot; the slot and this
 * renderer share editing state through the extension's store.
 *
 * @param props - Block ID and the extension's editing store.
 * @returns The block occurrence, or nothing after deletion.
 */
export function HtmlBlock({
  blockId,
  editingStore,
}: { readonly blockId: string } & HtmlEditingStoreProps) {
  const { block } = useBlockNode(blockId);
  const [editing, setEditing] = useHtmlEditing(editingStore, "block", blockId);
  if (!block) {
    return null;
  }
  return (
    <HtmlBlockOccurrence
      block={block}
      surface="block"
      fallbackLabel="HTML"
      editing={editing}
      onCloseEditor={() => setEditing(false)}
    />
  );
}

/**
 * Edit button placed in an `html` block's right slot.
 *
 * @param props - Slot context and the extension's editing store.
 * @returns The button, hidden while editing.
 */
export function HtmlBlockEditSlot({ block, editingStore }: BlockSlotProps & HtmlEditingStoreProps) {
  const [editing, setEditing] = useHtmlEditing(editingStore, "block", block.id);
  return <HtmlEditButton editing={editing} onOpen={() => setEditing(true)} />;
}

/** Props for {@link HtmlBlockOccurrence}. */
export interface HtmlBlockOccurrenceProps {
  /** Current block snapshot. */
  readonly block: EditorBlockNode;
  /** Value of `data-html-surface`, used by styles and tests. */
  readonly surface: "block" | "unsafe-block";
  /** Accessible name when the block has no `label` prop. */
  readonly fallbackLabel: string;
  /** Whether the source editor is open. */
  readonly editing: boolean;
  /**
   * Closes the source editor (after a save or on cancel).
   *
   * @returns Editing state is false.
   */
  readonly onCloseEditor: () => void;
  /**
   * Runs after a draft is committed, before the editor closes.
   *
   * @param draft - The saved draft.
   * @returns The owner has applied any follow-up state.
   */
  readonly onDraftSaved?: (draft: HtmlDraft) => void;
  /** Editor access for an Unsafe HTML block. */
  readonly unsafeAccess?: UnsafeHtmlFrameAccess;
  /** Extra controls rendered inside the source editor. */
  readonly editorControls?: ReactNode;
  /** Chrome rendered after the body, such as an inline edit button. */
  readonly children?: ReactNode;
}

/**
 * Renders one HTML block occurrence: the source editor, the empty paste target, or the sandbox.
 *
 * Writes go through the current panel, so they are bounded by it and recorded in history.
 *
 * @param props - Block snapshot, editing state and optional unsafe access.
 * @returns The occurrence wrapped in a block-selection anchor.
 */
export function HtmlBlockOccurrence({
  block,
  surface,
  fallbackLabel,
  editing,
  onCloseEditor,
  onDraftSaved,
  unsafeAccess,
  editorControls,
  children,
}: HtmlBlockOccurrenceProps) {
  const panel = usePanel();
  const anchor = useBlockSelectionAnchor(block.id);
  const selected = useBlockSelected(block.id);
  const context = useHtmlWidgetContext(selected);
  const node = useMemo(() => toBlockView(block), [block]);
  const onCommand = useCallback(
    (command: HtmlWidgetCommand) => applyBlockCommand(panel, block.id, command),
    [panel, block.id],
  );
  const label = readLabel(block.props, fallbackLabel);

  let body: ReactNode;
  if (editing) {
    body = (
      <HtmlSourceEditor
        source={block.content}
        props={block.props}
        listProps={block.listProps}
        onCancel={onCloseEditor}
        onSave={(draft) => {
          commitBlockDraft(panel, block.id, draft);
          onDraftSaved?.(draft);
          onCloseEditor();
        }}
      >
        {editorControls}
      </HtmlSourceEditor>
    );
  } else if (!block.content.trim()) {
    body = (
      <HtmlPasteTarget
        onCommit={(source) => panel.blocks.updateBlock(block.id, { content: source })}
      />
    );
  } else {
    body = (
      <HtmlFrame
        frameName={label}
        source={block.content}
        node={node}
        context={context}
        fit="auto"
        interactive
        unsafeAccess={unsafeAccess}
        onCommand={onCommand}
      />
    );
  }
  return (
    <div
      {...anchor}
      className="html-surface-block"
      data-html-surface={surface}
      data-html-label={label}
    >
      {body}
      {children}
    </div>
  );
}

/**
 * Copies the block fields a widget script may read.
 *
 * @param block - Detached block node.
 * @returns A plain snapshot safe to post into the sandbox.
 */
export function toBlockView(block: EditorBlockNode): Omit<HtmlBlockView, "context"> {
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
 * Applies one widget write to the current block.
 *
 * Pointer notifications are ignored (Page handles block selection natively).
 * The block is looked up at call time, so a write for a deleted block is dropped.
 *
 * @param panel - Panel that owns the block.
 * @param blockId - Stable ID of the HTML block.
 * @param command - Validated command from the sandbox.
 * @returns The write has been applied when the block still exists.
 */
export function applyBlockCommand(
  panel: Pick<HtmlBlockPanel, "blocks">,
  blockId: string,
  command: HtmlWidgetCommand,
): void {
  if (command.kind === "pointerdown" || !panel.blocks.getBlockNode(blockId)) {
    return;
  }
  switch (command.kind) {
    case "set-prop":
      panel.blocks.updateBlock(blockId, { props: { [command.key]: command.value } });
      return;
    case "set-props":
      panel.blocks.updateBlock(blockId, { props: command.props });
      return;
    case "set-list-props":
      panel.blocks.updateBlock(blockId, { listProps: command.listProps });
      return;
    case "set-content":
      panel.blocks.updateBlock(blockId, { content: command.content });
  }
}

/**
 * Saves an editor draft as one history entry.
 *
 * Content is written only if the source was edited in this session; props
 * receive only the session's patch, so concurrent edits by others survive.
 * Nothing is written for an unchanged draft or a deleted block.
 *
 * @param panel - Panel that owns the block.
 * @param blockId - Stable ID of the HTML block.
 * @param draft - Draft from the source editor.
 * @returns The draft has been applied when there was anything to write.
 */
export function commitBlockDraft(panel: HtmlBlockPanel, blockId: string, draft: HtmlDraft): void {
  const sourceChanged = draft.source !== draft.openingSource;
  const propsChanged = Object.keys(draft.propsPatch).length > 0;
  if ((!sourceChanged && !propsChanged) || !panel.blocks.getBlockNode(blockId)) {
    return;
  }
  panel.batchUpdates(() => {
    panel.blocks.updateBlock(blockId, {
      ...(sourceChanged ? { content: draft.source } : {}),
      props: draft.propsPatch,
    });
  });
}
