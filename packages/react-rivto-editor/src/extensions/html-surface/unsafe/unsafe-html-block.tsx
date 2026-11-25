/**
 * `unsafe-html` block: an HTML block whose script may be granted editor access.
 *
 * @module
 */
import { useEffect, useId, useState } from "react";
import { Checkbox } from "../../../components/ui/checkbox";
import { Label } from "../../../components/ui/label";
import { editorControlProps } from "../../../constants";
import { useBlockNode } from "../../../hooks/blocks/use-block";
import { useReactPanel } from "../../../hooks/editor/use-react-panel";
import { HtmlBlockOccurrence } from "../block/html-block";
import { HtmlEditButton, type UnsafeHtmlAccessState } from "../editing/html-edit-button";
import type { UnsafeHtmlFrameAccess } from "./unsafe-requests";

/**
 * Renders an Unsafe HTML block with an occurrence-local, source-specific grant.
 *
 * The grant is never stored in the document (where a widget could write it).
 * It applies to the exact source approved in the editor; any change to the
 * source, or unmounting the block, revokes it. Editing state is local to this
 * occurrence, and the edit button is rendered inline because it reflects the grant.
 *
 * @param props - ID of the block in the current panel.
 * @returns The block occurrence, or nothing after deletion.
 */
export function UnsafeHtmlBlock({ blockId }: { readonly blockId: string }) {
  const { block } = useBlockNode(blockId);
  const grant = useUnsafeHtmlGrant(blockId, block?.content);
  const [editing, setEditing] = useState(false);
  const [allowAccessDraft, setAllowAccessDraft] = useState(false);
  const permissionId = useId();
  if (!block) {
    return null;
  }
  return (
    <HtmlBlockOccurrence
      block={block}
      surface="unsafe-block"
      fallbackLabel="Unsafe HTML"
      editing={editing}
      onCloseEditor={() => setEditing(false)}
      onDraftSaved={(draft) => grant.decide(draft.source, allowAccessDraft)}
      unsafeAccess={grant.frameAccess}
      editorControls={
        <div className="html-unsafe-permission" {...editorControlProps}>
          <Checkbox
            id={permissionId}
            checked={allowAccessDraft}
            onCheckedChange={(checked) => setAllowAccessDraft(checked === true)}
          />
          <Label htmlFor={permissionId}>Allow this HTML to read and modify editor blocks</Label>
        </div>
      }
    >
      <HtmlEditButton
        editing={editing}
        access={grant.state}
        onOpen={() => {
          setAllowAccessDraft(grant.state === "enabled");
          setEditing(true);
        }}
      />
    </HtmlBlockOccurrence>
  );
}

/** Grant state and capabilities of one Unsafe HTML occurrence. */
interface UnsafeHtmlGrant {
  /** What the edit button shows. */
  readonly state: UnsafeHtmlAccessState;
  /** Capabilities handed to the frame. */
  readonly frameAccess: UnsafeHtmlFrameAccess;
  /**
   * Records the user's decision for a saved source.
   *
   * @param source - Source that was saved.
   * @param allow - Whether access was allowed in the editor.
   * @returns Access is granted for exactly `source`, or revoked; the warning is cleared.
   */
  readonly decide: (source: string, allow: boolean) => void;
}

/**
 * Tracks a grant bound to an exact source string.
 *
 * @param blockId - Block whose live content is rechecked on every request.
 * @param content - Current content from the rendered snapshot.
 * @returns Grant state, frame capabilities and the decision setter.
 */
function useUnsafeHtmlGrant(blockId: string, content: string | undefined): UnsafeHtmlGrant {
  const panel = useReactPanel();
  const [grantedSource, setGrantedSource] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const enabled = grantedSource !== null && content === grantedSource;
  // Once the source diverges, drop the grant so restoring identical text doesn't re-enable it.
  useEffect(() => {
    if (grantedSource !== null && content !== grantedSource) {
      setGrantedSource(null);
    }
  }, [content, grantedSource]);

  let state: UnsafeHtmlAccessState = "disabled";
  if (enabled) {
    state = "enabled";
  } else if (denied) {
    state = "denied";
  }
  return {
    state,
    frameAccess: {
      enabled,
      panelBlocks: panel.blocks,
      editorBlocks: panel.editor.blocks,
      isAuthorized: () =>
        grantedSource !== null && panel.blocks.getBlockNode(blockId)?.content === grantedSource,
      onDenied: () => setDenied(true),
    },
    decide: (source, allow) => {
      setGrantedSource(allow ? source : null);
      setDenied(false);
    },
  };
}
