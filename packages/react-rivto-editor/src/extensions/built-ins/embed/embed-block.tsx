/**
 * Live embed of another block in the same document.
 *
 * The embed's persisted content stays the reference string `{{embed <id>}}`.
 * The renderer mounts the target through the shared block tree, so its HTML,
 * controls, and text edits write the target's CRDT record and every other
 * view of that block updates with it. A missing or cyclic target is an alert
 * instead of an empty frame. The right-slot pen edits the reference string.
 *
 * @module
 */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pen, TriangleAlert } from "lucide-react";
import { BlockTree, BlockTreeMirrorScope, BlockElementRefBoundary } from "../../../blocks";
import { Button } from "../../../components/ui/button";
import { BLOCK_ID_SELECTOR, BLOCK_SELECTION_ANCHOR_ATTRIBUTE, EMBED_MIRROR_ATTRIBUTE } from "../../../constants";
import { useBlockEditing, useBlockNode } from "../../../hooks";
import type { BlockSlotProps, ReactEditorExtension } from "../../../managers";

/** Persisted native type for a block that renders another block by id. */
export const EMBED_BLOCK_TYPE = "embed";

const EMBED_CONTENT_PATTERN = /^\{\{embed\s+([^\s}]+)\s*\}\}$/;
const EMBED_LOOSE_PATTERN = /^\{\{embed\s*([^}]*)\}\}$/;
const EMBED_FRAME_ATTRIBUTE = "data-rivto-embed-frame";
const EMBED_FRAME_SELECTOR = `[${EMBED_FRAME_ATTRIBUTE}]`;
const EMBED_EDIT_EVENT = "rivto-embed-edit";
const EMBED_FRAME_CLASS = "rivto-embed-frame m-0 box-border flex w-full min-w-0 max-w-full flex-col gap-0 border border-(--rivto-border) p-0";
const EMBED_MIRROR_CLASS = "m-0 p-0";
const EMBED_ERROR_CLASS = "rivto-embed-error flex min-h-(--rivto-default-block-height) w-full min-w-0 max-w-full items-center gap-2 text-(--rivto-destructive)";
const EMBED_EDIT_CLASS = "rivto-embed-edit";
const EMBED_REFERENCE_CLASS = "page-block-content rivto-embed-reference w-full min-w-0";
const EMPTY_EMBED_CHAIN: readonly string[] = [];

/** Embeds currently being rendered, used to stop a reference cycle. */
const EmbedChainContext = createContext<readonly string[]>(EMPTY_EMBED_CHAIN);

/**
 * Reads the target id from an embed block's content string.
 *
 * @param content - Persisted block content, expected as `{{embed <id>}}`.
 * @returns The referenced block id, or null when the string is not that macro.
 */
export function readEmbedTargetId(content: string): string | null {
  return EMBED_CONTENT_PATTERN.exec(content.trim())?.[1] ?? null;
}

/**
 * Builds the persisted content string for an embed of `targetId`.
 *
 * @param targetId - Block id the embed should render.
 * @returns Content in the `{{embed <id>}}` form.
 */
export function embedBlockContent(targetId: string): string {
  return `{{embed ${targetId.trim()}}}`;
}

/**
 * Text placed after "id:" when the reference cannot be rendered.
 *
 * A strict id is preferred. A loose `{{embed ...}}` macro still shows its
 * inner text, and any other string is shown as written.
 *
 * @param content - Persisted embed content.
 * @returns The id or leftover text to display in the error.
 */
export function embedReferenceLabel(content: string): string {
  const id = readEmbedTargetId(content);
  if (id) return id;
  const loose = EMBED_LOOSE_PATTERN.exec(content.trim());
  return (loose ? loose[1] : content).trim();
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]!);

/**
 * Alert shown when the referenced block cannot be drawn.
 *
 * @param props - Message already including the missing or cyclic id.
 * @returns A bordered-row alert with a red warning icon.
 */
function EmbedUnavailable({ message }: { readonly message: string }) {
  return (
    <div className={EMBED_ERROR_CLASS} role="alert">
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Renders one embed block: a live copy of its target, or an error alert.
 *
 * @param props - Renderer context carrying this embed's identity.
 * @returns The framed mirror, reference editor, or missing-target alert.
 */
export function EmbedBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId);
  const chain = useContext(EmbedChainContext);
  const [editingReference, setEditingReference] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const wasEditingReference = useRef(false);
  const content = editing.block?.content ?? "";
  const targetId = readEmbedTargetId(content);
  const target = useBlockNode(targetId || blockId);
  const found = Boolean(targetId && target.block?.id === targetId);
  const cyclic = Boolean(
    targetId && (targetId === blockId || chain.includes(blockId) || chain.includes(targetId)),
  );
  const showMirror = found && !cyclic && !editingReference;
  const nextChain = useMemo(
    () => (chain.includes(blockId) ? chain : [...chain, blockId]),
    [blockId, chain],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onEdit = () => setEditingReference(true);
    frame.addEventListener(EMBED_EDIT_EVENT, onEdit);
    return () => frame.removeEventListener(EMBED_EDIT_EVENT, onEdit);
  }, [editing.block?.id]);

  useLayoutEffect(() => {
    const element = editing.attributes.ref.current;
    if (!editingReference || !element) {
      wasEditingReference.current = false;
      return;
    }
    const entered = !wasEditingReference.current;
    wasEditingReference.current = true;
    const next = editing.block?.content ?? "";
    if (element.textContent !== next) element.textContent = next;
    if (entered) element.focus();
  }, [editing.attributes.ref, editing.block?.content, editingReference]);

  if (!editing.block) return null;

  const message = cyclic && targetId
    ? `Impossible to embed block with id: ${targetId}`
    : `Impossible to find block with id: ${embedReferenceLabel(content)}`;
  const selectionAnchor = editingReference
    ? {}
    : { [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" as const };

  return (
    <div
      {...selectionAnchor}
      ref={frameRef}
      className={EMBED_FRAME_CLASS}
      data-rivto-embed-frame=""
      data-embed-state={editingReference ? "reference" : showMirror ? "mirror" : cyclic ? "cycle" : "missing"}
    >
      {showMirror && targetId ? (
        <BlockElementRefBoundary>
          <BlockTreeMirrorScope>
            <EmbedChainContext.Provider value={nextChain}>
              <div className={EMBED_MIRROR_CLASS} {...{ [EMBED_MIRROR_ATTRIBUTE]: "" }}>
                <BlockTree blockIds={[targetId]} />
              </div>
            </EmbedChainContext.Provider>
          </BlockTreeMirrorScope>
        </BlockElementRefBoundary>
      ) : null}
      {!showMirror && !editingReference ? <EmbedUnavailable message={message} /> : null}
      {editingReference ? (
        <div
          {...editing.attributes}
          className={EMBED_REFERENCE_CLASS}
          role="textbox"
          aria-label="Embed reference"
          aria-multiline="false"
          spellCheck={false}
          onBlur={() => setEditingReference(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Right-slot pen that reveals the embed reference editor.
 *
 * The control is mounted for every embed row and stays invisible until the
 * pointer or keyboard is on that row. Styling lives in `embed-block.css`.
 *
 * @param props - Slot context for the embed row.
 * @returns The pen button.
 */
function EmbedEditSlot({ block }: BlockSlotProps) {
  if (block.type !== EMBED_BLOCK_TYPE) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      className={EMBED_EDIT_CLASS}
      aria-label="Edit embed reference"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const host = event.currentTarget.closest<HTMLElement>(BLOCK_ID_SELECTOR);
        host?.querySelector<HTMLElement>(EMBED_FRAME_SELECTOR)?.dispatchEvent(new Event(EMBED_EDIT_EVENT));
      }}
    >
      <Pen aria-hidden="true" />
    </Button>
  );
}

/**
 * Installs the embed block, its reference pen, clipboard text, and slash action.
 *
 * @returns Extension included by the standard preset.
 */
export const embedBlockExtension = (): ReactEditorExtension => ({
  id: "block.embed",
  setup: (reactEditor) => {
    const disposers = [
      reactEditor.blockTypes.register({
        definition: { type: EMBED_BLOCK_TYPE, title: "Embed" },
        render: EmbedBlock,
      }),
      reactEditor.surfaces.registerBlockSlot({
        position: "right",
        component: EmbedEditSlot,
        when: ({ block }) => block.type === EMBED_BLOCK_TYPE,
      }),
      reactEditor.clipboard.registerFormatter({
        id: "embed",
        matches: ({ block }) => block.type === EMBED_BLOCK_TYPE,
        format: ({ block }) => ({
          plain: block.content,
          markdown: block.content,
          html: `<aside data-rivto-embed="${escapeHtml(readEmbedTargetId(block.content) ?? "")}">${escapeHtml(block.content)}</aside>`,
        }),
      }),
      reactEditor.slashCommands.register({
        id: "block.embed.insert",
        title: "Embed block",
        group: "Insert",
        keywords: ["embed", "transclude", "reference", "sync"],
        isAvailable: ({ blockId }) => {
          const block = reactEditor.blocks.getBlockNode(blockId);
          return Boolean(block && block.type !== EMBED_BLOCK_TYPE);
        },
        execute: ({ blockId }) => {
          const block = reactEditor.blocks.getBlockNode(blockId);
          if (!block || block.type === EMBED_BLOCK_TYPE) return;
          const content = readEmbedTargetId(block.content)
            ? block.content.trim()
            : embedBlockContent(block.content);
          reactEditor.history.batchUpdates(() => {
            reactEditor.blocks.setBlockType(blockId, EMBED_BLOCK_TYPE);
            reactEditor.blocks.updateBlock(blockId, { content });
          });
        },
      }),
    ];
    return () => disposers.reverse().forEach((dispose) => dispose());
  },
});
