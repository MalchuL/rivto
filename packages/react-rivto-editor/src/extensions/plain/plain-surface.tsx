/**
 * Plain-text surface for the shared block document.
 *
 * The column reuses the block shell, slots, and registered renderers so text
 * looks like the block editor without block borders. Unsupported types, and
 * anything nested inside them, are omitted. Enter still splits a block through
 * the shared creation binding; Shift+Enter stays a newline in that block.
 *
 * @module
 */
import { createCaretSelection, type EditorBlockNode } from "@chulane/rivto";
import { memo, useCallback, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { BlockSlots, BlockView, BlockWrapper, type BlockShellProps } from "../../blocks";
import { BLOCK_ROW_CLASS } from "../../constants";
import {
  useBlockEditing,
  useBlockNode,
  useBlockSelected,
  useEditorRoot,
  useReactEditor,
  useRootBlockIds,
} from "../../hooks";
import type { ReactEditor } from "../../types";

const PLAIN_BULLET_CLASS = "plain-bullet";
const BLOCK_CONTENT_FLOW_CLASS = "rivto-block-content-flow";

/** Properties for one filtered block tree. */
interface PlainTreeProps {
  /** Root ids from the document, including types this surface will skip. */
  readonly blockIds: readonly string[];
  /** Types this surface renders. */
  readonly blockTypes: ReadonlySet<string>;
  /** Whether nested blocks show a bullet outside the text. */
  readonly bullets: boolean;
}

/**
 * Inserts one default writing block and places the caret in it.
 *
 * @param reactEditor - Runtime providing the writing factory.
 * @returns Nothing.
 */
function addWritingBlock(reactEditor: ReactEditor): void {
  reactEditor.history.batchUpdates(() => {
    const block = reactEditor.blocks.insertBlock(reactEditor.createDefaultBlock());
    reactEditor.selection.set(createCaretSelection(block.id, 0));
  });
}

/**
 * Reports whether a nested block already draws its own list marker.
 *
 * Numbered rows and checkboxes keep those controls. Other nested rows get a
 * plain bullet so the outline reads as a list.
 *
 * @param listType - Stored list mode, when one is set.
 * @returns Whether the row already has a marker.
 */
function hasOwnListMarker(listType: unknown): boolean {
  return listType === "checkbox"
    || listType === "numbered_list"
    || listType === "start_numbered_list"
    || listType === "continue_numbered_list";
}

/**
 * Editable text used when an allowed type has no registered renderer.
 *
 * Allowed types normally reuse the block editor's renderer. This fallback
 * keeps a text-only type editable if the host adds it before supplying a
 * custom renderer.
 *
 * @param props - Block whose content is edited.
 * @returns One plain-text contenteditable.
 */
function PlainTextContent({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId);
  return (
    <div
      {...editing.attributes}
      className="page-block-content"
      role="textbox"
      aria-multiline="true"
      aria-label="Text block content"
    />
  );
}

/** Keeps an unchanged renderer boundary asleep when only an ancestor snapshot changes. */
const PlainBlockContent = memo(function PlainBlockContent({
  renderer: Content,
  blockId,
}: {
  readonly renderer: ComponentType<{ blockId: string }>;
  readonly blockId: string;
}) {
  return <Content blockId={blockId} />;
});

/**
 * Lays out one plain row: optional bullet, the shared renderer, then children.
 *
 * The bullet is a non-editable sibling of the renderer so Shift+Enter newlines
 * and caret offsets stay aligned with the stored block text.
 *
 * @param props - Slots prepared by the filtered tree.
 * @returns The `.page-block` shell drag-and-drop already understands.
 */
function PlainShell({ block, isSelected, content, controls, children }: BlockShellProps) {
  return (
    <BlockView block={block} isSelected={isSelected} className="page-block">
      <div className={BLOCK_ROW_CLASS}>
        {controls}
        <BlockSlots block={block} selected={isSelected}>
          <div className={BLOCK_CONTENT_FLOW_CLASS}>{content}</div>
        </BlockSlots>
      </div>
      {children}
    </BlockView>
  );
}

/**
 * Renders one allowed block and the allowed descendants under it.
 *
 * An unsupported node returns nothing and does not mount its children, so
 * text nested inside a hidden container stays out of the column.
 *
 * @param props - Block id, visible depth, and projection options.
 * @returns The shared block shell, or null when this branch is hidden.
 */
function PlainBlockNode({
  blockId,
  depth,
  blockTypes,
  bullets,
}: {
  readonly blockId: string;
  readonly depth: number;
  readonly blockTypes: ReadonlySet<string>;
  readonly bullets: boolean;
}) {
  const { block } = useBlockNode(blockId);
  const reactEditor = useReactEditor();
  const selected = useBlockSelected(blockId);
  const subscribeRenderers = useCallback(
    (listener: () => void) => reactEditor.renderers.subscribe(listener),
    [reactEditor],
  );
  useSyncExternalStore(
    subscribeRenderers,
    () => reactEditor.renderers.revision,
    () => reactEditor.renderers.revision,
  );

  if (!block || !blockTypes.has(block.type)) return null;
  const Content = reactEditor.renderers.get(block.type) ?? PlainTextContent;
  const collapseActive = reactEditor.blockListProps.has("collapse");
  const expanded = !collapseActive || block.listProps.collapsed !== true;
  const showBullet = bullets && depth > 0 && !hasOwnListMarker(block.listProps.type);
  const bullet: ReactNode = showBullet
    ? <span className={PLAIN_BULLET_CLASS} contentEditable={false} aria-hidden="true">•</span>
    : undefined;

  return (
    <BlockWrapper
      fallback={PlainShell}
      block={block}
      isSelected={selected}
      content={<PlainBlockContent renderer={Content} blockId={block.id} />}
      controls={bullet}
    >
      {block.childIds.length > 0 && expanded && (
        <div id={`block-children-${block.id}`} className="page-block-children">
          {block.childIds.map((childId) => (
            <MemoPlainBlockNode
              key={childId}
              blockId={childId}
              depth={depth + 1}
              blockTypes={blockTypes}
              bullets={bullets}
            />
          ))}
        </div>
      )}
    </BlockWrapper>
  );
}

/** Stable node boundary; focused stores wake only affected ids and ancestors. */
const MemoPlainBlockNode = memo(PlainBlockNode);

/**
 * Renders document roots, skipping types the plain editor does not show.
 *
 * @param props - Root ids and projection options.
 * @returns Block roots without an extra DOM wrapper.
 */
export const PlainBlockTree = memo(function PlainBlockTree({
  blockIds,
  blockTypes,
  bullets,
}: PlainTreeProps) {
  return (
    <>
      {blockIds.map((blockId) => (
        <MemoPlainBlockNode
          key={blockId}
          blockId={blockId}
          depth={0}
          blockTypes={blockTypes}
          bullets={bullets}
        />
      ))}
    </>
  );
});

/**
 * Renders the plain-text column for the active document.
 *
 * @param props - Allowed types, bullet policy, and the initial separator toggle.
 * @returns The editor root, separator control, and visible blocks.
 */
export function PlainSurface({
  blockTypes,
  bullets,
  initialSeparators,
}: {
  readonly blockTypes: ReadonlySet<string>;
  readonly bullets: boolean;
  readonly initialSeparators: boolean;
}) {
  const reactEditor = useReactEditor();
  const rootIds = useRootBlockIds();
  const { ref } = useEditorRoot();
  const [separators, setSeparators] = useState(initialSeparators);
  const subscribe = useCallback(
    (listener: () => void) => reactEditor.subscribe(listener),
    [reactEditor],
  );
  const revision = useSyncExternalStore(
    subscribe,
    () => reactEditor.revision,
    () => reactEditor.revision,
  );
  const hasVisible = rootIds.some((id) => {
    void revision;
    const node: EditorBlockNode | undefined = reactEditor.blocks.getBlockNode(id);
    return blockTypes.has(node?.type ?? "");
  });

  return (
    <main
      ref={ref}
      className="plain-surface"
      data-rivto-page-editor-root
      data-plain-editor="true"
      data-separators={separators ? "true" : undefined}
      data-empty={hasVisible ? undefined : "true"}
      aria-label="Plain text editor"
      tabIndex={-1}
    >
      <div className="plain-toolbar">
        <button
          type="button"
          className="plain-separators-toggle"
          aria-pressed={separators}
          data-plain-separators-toggle="true"
          onClick={() => setSeparators((current) => !current)}
        >
          Separators
        </button>
      </div>
      <div className="plain-document">
        <PlainBlockTree blockIds={rootIds} blockTypes={blockTypes} bullets={bullets} />
        {!hasVisible && (
          <button type="button" className="plain-empty" onClick={() => addWritingBlock(reactEditor)}>
            Start writing
          </button>
        )}
      </div>
    </main>
  );
}
