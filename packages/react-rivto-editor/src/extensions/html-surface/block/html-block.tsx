/**
 * Page block renderers for HTML widgets.
 *
 * Both block types (`html` and `unsafe-html`) render through
 * {@link HtmlBlockOccurrence}. They differ only in where editing state lives
 * and whether the widget may be granted editor access.
 *
 * @module
 */
import type { EditorBlockNode, PanelAPI } from "@chulane/rivto";
import { useCallback, useMemo, type ReactNode } from "react";
import { useBlockNode } from "../../../hooks/blocks/use-block";
import { useBlockSelected } from "../../../hooks/blocks/use-block-selection";
import { useBlockSelectionAnchor } from "../../../hooks/blocks/use-block-selection-anchor";
import { usePanel } from "../../../hooks/editor/use-panel";
import type { BlockSlotProps } from "../../../managers/surfaces/types";
import { HtmlEditButton } from "../editing/html-edit-button";
import { HtmlPasteTarget } from "../editing/html-paste-target";
import { HtmlSourceEditor } from "../editing/html-source-editor";
import { useHtmlEditing, type HtmlEditingStoreProps } from "../editing/use-html-editing";
import { HtmlFrame } from "../frame/html-frame";
import { useHtmlWidgetContext } from "../frame/use-html-widget-context";
import { readLabel } from "../model/widget-props";
import type { HtmlSurfaceLimits, HtmlSurfaceLimitsProps } from "../options";
import type { HtmlBlockView, HtmlDraft, HtmlWidgetCommand } from "../types";
import type { UnsafeHtmlFrameAccess } from "../unsafe/unsafe-requests";

/** The panel operations an HTML block reads and writes through. */
type HtmlBlockPanel = {
  /** Block reads and writes, bounded by the panel. */
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode" | "updateBlock">;
  /** Groups several writes into one undo step. */
  readonly batchUpdates: PanelAPI["batchUpdates"];
};

/**
 * Renders an `html` block.
 *
 * The edit button is not rendered here: the extension registers it in the
 * block's right slot ({@link HtmlBlockEditSlot}). The slot and this renderer
 * are separate React trees, so they share the "is editing" flag through the
 * extension's editing store.
 *
 * @param props - Renderer props supplied by the block registration.
 * @param props.blockId - ID of the block in the current panel.
 * @param props.editingStore - Editing state shared with the block's edit slot.
 * @param props.limits - Frame limits of this extension installation.
 * @returns The block occurrence, or nothing once the block is deleted.
 */
export function HtmlBlock({
  blockId,
  editingStore,
  limits,
}: { readonly blockId: string } & HtmlEditingStoreProps & HtmlSurfaceLimitsProps) {
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
      limits={limits}
      editing={editing}
      onCloseEditor={() => setEditing(false)}
    />
  );
}

/**
 * Renders the edit button in an `html` block's right slot.
 *
 * @param props - Slot props supplied by the surface.
 * @param props.block - Block the slot belongs to.
 * @param props.editingStore - Editing state shared with the block renderer.
 * @returns The edit button, or nothing while the editor is open.
 */
export function HtmlBlockEditSlot({ block, editingStore }: BlockSlotProps & HtmlEditingStoreProps) {
  const [editing, setEditing] = useHtmlEditing(editingStore, "block", block.id);
  return <HtmlEditButton editing={editing} onOpen={() => setEditing(true)} />;
}

/** Props for {@link HtmlBlockOccurrence}. */
export interface HtmlBlockOccurrenceProps {
  /** Current snapshot of the block. */
  readonly block: EditorBlockNode;
  /** Value of the `data-html-surface` attribute, used by styles and tests. */
  readonly surface: "block" | "unsafe-block";
  /** Accessible name used when the block has no `label` prop. */
  readonly fallbackLabel: string;
  /** Frame limits of the extension installation. */
  readonly limits: HtmlSurfaceLimits;
  /** Whether the source editor is open. */
  readonly editing: boolean;
  /**
   * Closes the source editor. Called after a save and on Close.
   *
   * @returns The owner has set its editing state to false.
   */
  readonly onCloseEditor: () => void;
  /**
   * Runs after a draft has been written to the document, before the editor closes.
   *
   * @param draft - The draft that was saved.
   * @returns The owner has applied any follow-up state, such as an access decision.
   */
  readonly onDraftSaved?: (draft: HtmlDraft) => void;
  /** Editor access offered to the widget. Only Unsafe HTML blocks pass this. */
  readonly unsafeAccess?: UnsafeHtmlFrameAccess;
  /** Extra controls shown inside the source editor, such as the access checkbox. */
  readonly editorControls?: ReactNode;
  /** Chrome rendered after the body, such as an inline edit button. */
  readonly children?: ReactNode;
}

/**
 * Renders one HTML block occurrence.
 *
 * Shows one of three bodies:
 * - the source editor while `editing` is true;
 * - a paste box while the block has no HTML yet;
 * - otherwise the sandboxed widget.
 *
 * Every write goes through the current panel, so it stays inside the panel's
 * boundary and is recorded in undo history. The wrapper is a block-selection
 * anchor, so Page range gestures and modifier clicks work on the widget.
 *
 * @param props - Block snapshot, editing state and optional unsafe access.
 * @param props.block - Current snapshot of the block.
 * @param props.surface - Value of the `data-html-surface` attribute.
 * @param props.fallbackLabel - Accessible name used when the block has no label.
 * @param props.limits - Frame limits of the extension installation.
 * @param props.editing - Whether the source editor is open.
 * @param props.onCloseEditor - Closes the editor after a save or on Close.
 * @param props.onDraftSaved - Runs after a draft is written, before the editor closes.
 * @param props.unsafeAccess - Editor access offered to the widget, if any.
 * @param props.editorControls - Extra controls shown inside the source editor.
 * @param props.children - Chrome rendered after the body.
 * @returns The occurrence wrapped in a block-selection anchor.
 */
export function HtmlBlockOccurrence(props: HtmlBlockOccurrenceProps) {
  const { block, surface, fallbackLabel, children } = props;
  const anchor = useBlockSelectionAnchor(block.id);
  const label = readLabel(block.props, fallbackLabel);
  return (
    <div
      {...anchor}
      className="html-surface-block"
      data-html-surface={surface}
      data-html-label={label}
    >
      <HtmlBlockBody {...props} label={label} />
      {children}
    </div>
  );
}

/**
 * Chooses and renders the body of a block occurrence: editor, paste box or widget.
 *
 * @param props - Occurrence props plus the resolved label.
 * @param props.block - Current snapshot of the block.
 * @param props.label - Resolved accessible name of the widget frame.
 * @param props.limits - Frame limits of the extension installation.
 * @param props.editing - Whether the source editor is open.
 * @param props.onCloseEditor - Closes the editor after a save or on Close.
 * @param props.onDraftSaved - Runs after a draft is written.
 * @param props.unsafeAccess - Editor access offered to the widget, if any.
 * @param props.editorControls - Extra controls shown inside the source editor.
 * @returns The body element.
 */
function HtmlBlockBody({
  block,
  label,
  limits,
  editing,
  onCloseEditor,
  onDraftSaved,
  unsafeAccess,
  editorControls,
}: HtmlBlockOccurrenceProps & { readonly label: string }) {
  const panel = usePanel();
  const { node, context, onCommand } = useBlockWidget(block, panel);

  if (editing) {
    const saveDraft = (draft: HtmlDraft) => {
      commitBlockDraft(panel, block.id, draft);
      onDraftSaved?.(draft);
      onCloseEditor();
    };
    return (
      <HtmlSourceEditor
        source={block.content}
        props={block.props}
        listProps={block.listProps}
        onCancel={onCloseEditor}
        onSave={saveDraft}
      >
        {editorControls}
      </HtmlSourceEditor>
    );
  }
  if (!block.content.trim()) {
    const storeSource = (source: string) => panel.blocks.updateBlock(block.id, { content: source });
    return <HtmlPasteTarget onCommit={storeSource} />;
  }
  return (
    <HtmlFrame
      frameName={label}
      source={block.content}
      node={node}
      context={context}
      fit="auto"
      interactive
      unsafeAccess={unsafeAccess}
      limits={limits}
      onCommand={onCommand}
    />
  );
}

/**
 * Prepares what the widget frame needs: the node snapshot, its context, and a
 * command handler that writes through the panel.
 *
 * @param block - Current snapshot of the block.
 * @param panel - Panel the widget's writes go through.
 * @returns The memoized snapshot, the context and a stable command handler.
 */
function useBlockWidget(block: EditorBlockNode, panel: HtmlBlockPanel) {
  const selected = useBlockSelected(block.id);
  const context = useHtmlWidgetContext(selected);
  const node = useMemo(() => toBlockView(block), [block]);
  const onCommand = useCallback(
    (command: HtmlWidgetCommand) => applyBlockCommand(panel, block.id, command),
    [panel, block.id],
  );
  return { node, context, onCommand };
}

/**
 * Copies the block fields a widget script is allowed to read.
 *
 * @param block - Detached block snapshot.
 * @returns A plain object that can be posted into the sandbox. The frame adds
 * the presentation context when posting.
 */
function toBlockView(block: EditorBlockNode): Omit<HtmlBlockView, "context"> {
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
 * Applies one widget command to the block.
 *
 * Pointer notifications are ignored: in Page, the drag-handle overlay and the
 * block-selection anchor already handle block selection natively. The block
 * is looked up when the command arrives, so a write for a block deleted in the
 * meantime is dropped instead of recreating it.
 *
 * @param panel - Panel that owns the block.
 * @param blockId - ID of the HTML block.
 * @param command - Command already validated by the message parser.
 * @returns Nothing. The write is applied when the block still exists.
 */
function applyBlockCommand(
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
 * Writes a source-editor draft to the block as one undo step.
 *
 * Only what the user changed in this session is written. Content is written
 * only if the source was edited; props receive only the session's patch.
 * That way, changes a collaborator made while the editor was open survive.
 * Nothing is written for an unchanged draft or a block deleted in the meantime.
 *
 * @param panel - Panel that owns the block.
 * @param blockId - ID of the HTML block.
 * @param draft - Draft produced by the source editor.
 * @returns Nothing. The draft is applied when there is something to write.
 */
function commitBlockDraft(panel: HtmlBlockPanel, blockId: string, draft: HtmlDraft): void {
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
