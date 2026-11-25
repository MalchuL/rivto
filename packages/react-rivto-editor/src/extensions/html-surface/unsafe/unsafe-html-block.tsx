/**
 * The `unsafe-html` block: an HTML block whose script the user may let read
 * and modify editor blocks.
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
import type { HtmlSurfaceLimitsProps } from "../options";
import type { UnsafeHtmlFrameAccess } from "./unsafe-requests";

/**
 * Renders an Unsafe HTML block.
 *
 * Access is off by default. The user turns it on with a checkbox in the source
 * editor; the grant then applies to exactly the source that was saved. Any
 * later change to the source, or unmounting the block, revokes it.
 *
 * The grant lives in React state of this mounted occurrence, never in the
 * document: a widget can write its own props, so storing permission there
 * would let it grant itself access. For the same reason the editing flag is
 * local, and the edit button is rendered inline (not in a slot) because it
 * displays the grant state.
 *
 * @param props - Renderer props supplied by the block registration.
 * @param props.blockId - ID of the block in the current panel.
 * @param props.limits - Frame limits of this extension installation.
 * @returns The block occurrence, or nothing once the block is deleted.
 */
export function UnsafeHtmlBlock({
  blockId,
  limits,
}: { readonly blockId: string } & HtmlSurfaceLimitsProps) {
  const { block } = useBlockNode(blockId);
  const grant = useUnsafeHtmlGrant(blockId, block?.content);
  const [editing, setEditing] = useState(false);
  // The checkbox value while the editor is open; applied only when the draft is saved.
  const [allowAccessDraft, setAllowAccessDraft] = useState(false);
  if (!block) {
    return null;
  }
  const openEditor = () => {
    setAllowAccessDraft(grant.state === "enabled");
    setEditing(true);
  };
  return (
    <HtmlBlockOccurrence
      block={block}
      surface="unsafe-block"
      fallbackLabel="Unsafe HTML"
      limits={limits}
      editing={editing}
      onCloseEditor={() => setEditing(false)}
      onDraftSaved={(draft) => grant.decide(draft.source, allowAccessDraft)}
      unsafeAccess={grant.frameAccess}
      editorControls={
        <EditorAccessCheckbox checked={allowAccessDraft} onChange={setAllowAccessDraft} />
      }
    >
      <HtmlEditButton editing={editing} access={grant.state} onOpen={openEditor} />
    </HtmlBlockOccurrence>
  );
}

/**
 * Renders the "allow editor access" checkbox shown in the source editor.
 *
 * @param props - Current value and change handler.
 * @param props.checked - Whether access will be allowed when the draft is saved.
 * @param props.onChange - Receives the new value when the user toggles the box.
 * @returns The labeled checkbox.
 */
function EditorAccessCheckbox({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="html-unsafe-permission" {...editorControlProps}>
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor={id}>Allow this HTML to read and modify editor blocks</Label>
    </div>
  );
}

/** Grant state and capabilities of one Unsafe HTML occurrence. */
interface UnsafeHtmlGrant {
  /** What the edit button shows: no access, a refused access attempt, or access granted. */
  readonly state: UnsafeHtmlAccessState;
  /** Capabilities passed to the frame, including the live authorization check. */
  readonly frameAccess: UnsafeHtmlFrameAccess;
  /**
   * Records the user's decision when a draft is saved.
   *
   * @param source - The source that was saved.
   * @param allow - Whether the user ticked "allow editor access".
   * @returns Nothing. Access is granted for exactly `source`, or revoked; any
   * earlier "access denied" warning is cleared.
   */
  readonly decide: (source: string, allow: boolean) => void;
}

/**
 * Tracks an access grant bound to one exact source string.
 *
 * The grant is checked twice:
 * - `frameAccess.enabled` reflects the rendered snapshot and decides whether the
 *   widget page is built with live proxies (`rivto.panel`) or with `null`;
 * - `frameAccess.isAuthorized()` reads the live document when a request arrives,
 *   so a request queued before a source edit is still refused.
 *
 * @param blockId - Block whose live content is rechecked on every request.
 * @param content - Content from the rendered snapshot; undefined after deletion.
 * @returns The grant state, the frame capabilities and the decision setter.
 */
function useUnsafeHtmlGrant(blockId: string, content: string | undefined): UnsafeHtmlGrant {
  const panel = useReactPanel();
  const [grantedSource, setGrantedSource] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const enabled = grantedSource !== null && content === grantedSource;

  // Drop the grant as soon as the source diverges, so that typing the exact
  // approved text back in later does not silently re-enable access.
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
