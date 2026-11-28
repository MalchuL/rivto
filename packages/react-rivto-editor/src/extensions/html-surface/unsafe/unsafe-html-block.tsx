/**
 * The `unsafe-html` block: an HTML block whose script the user may let read
 * and modify editor blocks.
 *
 * @module
 */
import { useCallback, useId, useState, useSyncExternalStore } from "react";
import { Checkbox } from "../../../components/ui/checkbox";
import { Label } from "../../../components/ui/label";
import { editorControlProps } from "../../../constants";
import { useBlockNode } from "../../../hooks/blocks/use-block";
import { useReactPanel } from "../../../hooks/editor/use-react-panel";
import { HtmlBlockOccurrence } from "../block/html-block";
import { HtmlEditButton, type UnsafeHtmlAccessState } from "../editing/html-edit-button";
import type { HtmlSurfaceLimitsProps } from "../options";
import { UNSAFE_HTML_BLOCK_TYPE } from "../constants";
import type { HtmlPermissions } from "./permissions";
import type { UnsafeHtmlFrameAccess } from "./unsafe-requests";

/**
 * Renders an Unsafe HTML block.
 *
 * Access is off by default. The user turns it on with a checkbox in the source
 * editor; the grant then applies to exactly the source that was saved. Any
 * later change to the source revokes individual approval across surfaces.
 *
 * The grant is supplied by the installed host policy outside the editable
 * document: a widget can write its own props, so storing permission there
 * would let it grant itself access. For the same reason the editing flag is
 * local, and the edit button is rendered inline (not in a slot) because it
 * displays the grant state.
 *
 * @param props - Renderer props supplied by the block registration.
 * @param props.blockId - ID of the block in the current panel.
 * @param props.permissions - Host policy scoped to this document.
 * @param props.limits - Frame limits of this extension installation.
 * @returns The block occurrence, or nothing once the block is deleted.
 */
export function UnsafeHtmlBlock({
  blockId,
  limits,
  permissions,
}: {
  readonly blockId: string;
  readonly permissions: Pick<HtmlPermissions, "read" | "write" | "subscribe">;
} & HtmlSurfaceLimitsProps) {
  const { block } = useBlockNode(blockId);
  const grant = useUnsafeHtmlGrant(blockId, block?.content, permissions);
  const [editing, setEditing] = useState(false);
  // The checkbox value while the editor is open; applied only when the draft is saved.
  const [allowAccessDraft, setAllowAccessDraft] = useState<boolean | null>(null);
  if (!block) {
    return null;
  }
  const openEditor = () => {
    setAllowAccessDraft(null);
    setEditing(true);
  };
  return (
    <HtmlBlockOccurrence
      block={block}
      surface="unsafe-block"
      limits={limits}
      editing={editing}
      onCloseEditor={() => setEditing(false)}
      onDraftSaved={(draft) => grant.decide(draft.source, allowAccessDraft ?? grant.individual)}
      unsafeAccess={grant.frameAccess}
      editorControls={
        grant.documentAccess ? (
          <p>Editor access is allowed for this document.</p>
        ) : (
          <EditorAccessCheckbox
            checked={allowAccessDraft ?? grant.individual}
            onChange={setAllowAccessDraft}
          />
        )
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
  readonly individual: boolean;
  readonly documentAccess: boolean;
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
 * @param permissions - Live host policy for this document.
 * @param content - Content from the rendered snapshot; undefined after deletion.
 * @returns The grant state, the frame capabilities and the decision setter.
 */
function useUnsafeHtmlGrant(
  blockId: string,
  content: string | undefined,
  permissions: Pick<HtmlPermissions, "read" | "write" | "subscribe">,
): UnsafeHtmlGrant {
  const panel = useReactPanel();
  const [denied, setDenied] = useState(false);
  const subscribe = useCallback(
    (notify: () => void) => permissions.subscribe(notify),
    [permissions],
  );
  const read = () =>
    content === undefined
      ? "denied"
      : permissions.read({ blockId, source: content, permission: "editorAccess" });
  const decision = useSyncExternalStore(subscribe, read, () => "denied");
  const enabled = decision === "block" || decision === "document";

  let state: UnsafeHtmlAccessState = "disabled";
  if (enabled) {
    state = "enabled";
  } else if (denied) {
    state = "denied";
  }
  return {
    state,
    individual: decision === "block",
    documentAccess: decision === "document",
    frameAccess: {
      enabled,
      panelBlocks: panel.blocks,
      editorBlocks: panel.editor.blocks,
      isAuthorized: () => {
        const block = panel.blocks.getBlockNode(blockId);
        const current = read();
        return (
          block?.type === UNSAFE_HTML_BLOCK_TYPE &&
          block.content === content &&
          (current === "block" || current === "document")
        );
      },
      onDenied: () => setDenied(true),
    },
    decide: (source, allow) => {
      if (
        panel.blocks.getBlockNode(blockId)?.content === source &&
        permissions.read({ blockId, source, permission: "editorAccess" }) !== "document"
      ) {
        permissions.write({ blockId, source, permission: "editorAccess" }, allow);
      }
      setDenied(false);
    },
  };
}
