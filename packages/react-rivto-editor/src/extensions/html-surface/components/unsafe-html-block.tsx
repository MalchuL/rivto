/** HTML block with explicitly enabled, sandboxed editor operations. */
import { useEffect, useState } from "react";
import type { EditorBlockNode } from "@chulane/rivto";
import { useBlockNode } from "../../../hooks/blocks/use-block";
import { useBlockSelectionAnchor } from "../../../hooks/blocks/use-block-selection-anchor";
import { useReactPanel } from "../../../hooks/editor/use-react-panel";
import { editorControlProps } from "../../../constants";
import { Button } from "../../../components/ui/button";
import { formatWidgetProps, readLabel, type HtmlDraft } from "../protocol/protocol";
import { commitBlockDraft, useHtmlBlockView, useHtmlBlockCommand } from "./html-block";
import { HtmlFrame } from "./html-frame";
import { HtmlPasteTarget, HtmlSourceEditor } from "./html-chrome";

/** Stable document type for the opt-in HTML block. */
export const UNSAFE_HTML_BLOCK_TYPE = "unsafe-html";

/** Props supplied by the extension's block registration. */
export interface UnsafeHtmlBlockProps {
  /** Stable ID of the block in the current panel. */
  readonly blockId: string;
}

/**
 * Renders a sandboxed HTML block with source-specific, local editor access.
 *
 * Permission belongs to this mounted occurrence and never comes from widget props.
 * Changing the source or unmounting the block revokes the grant.
 *
 * @param props - Block identity supplied by its occurrence.
 * @param props.blockId - ID of the block in the current panel.
 * @returns The current editor or sandbox, and any access warning.
 */
export function UnsafeHtmlBlock({ blockId }: UnsafeHtmlBlockProps) {
  const state = useUnsafeHtmlBlock(blockId);
  const anchor = useBlockSelectionAnchor(blockId);
  if (!state.block || !state.node) {
    return null;
  }
  return (
    <div
      {...anchor}
      className="html-surface-block"
      data-html-surface="unsafe-block"
      data-html-label={state.label}
    >
      {(state.enabled || state.denied) && (
        <p className="html-unsafe-warning" role="alert">
          {state.enabled
            ? "Editor access is enabled for this HTML."
            : "This HTML requested editor access. Enable it in edit mode to allow it."}
        </p>
      )}
      <UnsafeHtmlBody state={state} />
      {!state.editing && (
        <Button
          {...editorControlProps}
          type="button"
          size="sm"
          variant="outline"
          className="html-unsafe-edit"
          onClick={(event) => {
            if (!event.defaultPrevented) {
              state.openEditor();
            }
          }}
        >
          Edit Unsafe HTML
        </Button>
      )}
    </div>
  );
}

/**
 * Tracks source editing and a grant tied to the currently mounted source.
 *
 * @param blockId - ID of the block in the current panel.
 * @returns The current snapshot, permission, and actions used by the renderer.
 */
function useUnsafeHtmlBlock(blockId: string) {
  const { block } = useBlockNode(blockId);
  const panel = useReactPanel();
  const [editing, setEditing] = useState(false);
  const [grant, setGrant] = useState<string | null>(null);
  const [draftAccess, setDraftAccess] = useState(false);
  const [denied, setDenied] = useState(false);
  const enabled = grant !== null && block?.content === grant;
  const { node, context } = useHtmlBlockView(blockId, block);
  const onCommand = useHtmlBlockCommand(blockId);
  useEffect(() => {
    if (grant !== null && block?.content !== grant) {
      setGrant(null);
    }
  }, [block?.content, grant]);
  return {
    block,
    node,
    context,
    panel,
    blockId,
    editing,
    enabled,
    denied,
    draftAccess,
    setDraftAccess,
    onCommand,
    label: readLabel(block?.props ?? {}, "Unsafe HTML"),
    openEditor: () => {
      setDraftAccess(enabled);
      setEditing(true);
    },
    cancel: () => setEditing(false),
    onDenied: () => setDenied(true),
    isAuthorized: () => grant !== null && panel.blocks.getBlockNode(blockId)?.content === grant,
    save: (draft: HtmlDraft) => {
      commitBlockDraft(panel, blockId, draft);
      setGrant(draftAccess ? draft.source : null);
      setDenied(false);
      setEditing(false);
    },
  };
}

/** Current data and actions used by the unsafe block body. */
type UnsafeHtmlState = ReturnType<typeof useUnsafeHtmlBlock>;

/** Props for the unsafe block body. */
interface UnsafeHtmlBodyProps {
  /** Current block snapshot and actions. */
  readonly state: UnsafeHtmlState;
}

/**
 * Chooses between the source editor, empty paste target, and sandboxed preview.
 *
 * @param props - Current block state and actions.
 * @param props.state - Snapshot and host-controlled capabilities.
 * @returns The current body, or null if the block disappeared.
 */
function UnsafeHtmlBody({ state }: UnsafeHtmlBodyProps) {
  const { block, node, panel } = state;
  if (!block || !node) {
    return null;
  }
  if (state.editing) {
    return (
      <UnsafeHtmlEditor
        block={block}
        access={state.draftAccess}
        onAccess={state.setDraftAccess}
        onCancel={state.cancel}
        onSave={state.save}
      />
    );
  }
  if (!block.content.trim()) {
    return (
      <HtmlPasteTarget
        onCommit={(source) => panel.blocks.updateBlock(state.blockId, { content: source })}
      />
    );
  }
  return (
    <HtmlFrame
      frameName={state.label}
      source={block.content}
      node={node}
      context={state.context}
      fit="auto"
      interactive
      onCommand={state.onCommand}
      unsafeAccess={{
        enabled: state.enabled,
        panelBlocks: panel.blocks,
        editorBlocks: panel.editor.blocks,
        isAuthorized: state.isAuthorized,
        onDenied: state.onDenied,
      }}
    />
  );
}

/** Props for the source and permission editor. */
interface UnsafeHtmlEditorProps {
  /** Current block snapshot. */
  readonly block: EditorBlockNode;
  /** Draft permission selected by the user. */
  readonly access: boolean;
  /**
   * Updates the draft permission.
   *
   * @param value - Whether editor access will be enabled when saved.
   * @returns The selected permission is stored in the edit session.
   */
  readonly onAccess: (value: boolean) => void;
  /**
   * Discards the current edit session.
   *
   * @returns The editor closes without saving the draft.
   */
  readonly onCancel: () => void;
  /**
   * Saves the draft and applies the permission choice.
   *
   * @param draft - Parsed HTML and widget properties.
   * @returns The draft and permission choice have been applied.
   */
  readonly onSave: (draft: HtmlDraft) => void;
}

/**
 * Edits the authored source and its local editor-access decision.
 *
 * @param props - Current block and edit callbacks.
 * @param props.block - Current detached block snapshot.
 * @param props.access - Draft permission chosen by the user.
 * @param props.onAccess - Updates the draft permission.
 * @param props.onCancel - Discards the draft.
 * @param props.onSave - Saves the draft and applies the permission choice.
 * @returns The permission toggle and shared source editor.
 */
function UnsafeHtmlEditor({ block, access, onAccess, onCancel, onSave }: UnsafeHtmlEditorProps) {
  return (
    <>
      <label className="html-unsafe-permission" {...editorControlProps}>
        <input
          type="checkbox"
          checked={access}
          onChange={(event) => onAccess(event.currentTarget.checked)}
        />
        Allow this HTML to read and modify editor blocks
      </label>
      <HtmlSourceEditor
        source={block.content}
        propsText={formatWidgetProps(block.props, [])}
        listPropsText={JSON.stringify(block.listProps, null, 2)}
        onCancel={onCancel}
        onSave={onSave}
      />
    </>
  );
}
