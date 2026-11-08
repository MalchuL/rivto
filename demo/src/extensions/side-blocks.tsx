import {
  COMMENT_SIDE_BLOCK_TYPE,
  commentsExtension,
  createCommentSideBlockRenderer,
  createSideBlock,
  ContainerBlockBehavior,
  BlockColorPalette,
  BLOCK_BACKGROUND_COLORS,
  editorControlProps,
  SideBlockEditor,
  SideBlockContent,
  sideBlocksExtension,
  useReactPanel,
  useBlockSelectionAnchor,
  useBlockNode,
  useRootBlockIds,
  type BlockBehaviorAvailabilityContext,
  type ReactEditorExtension,
  type ReactEditorApi,
  type SideBlockRendererProps,
} from "@chulane/rivto-react";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { Plus, Trash2, Settings2 } from "lucide-react";
import type { CSSProperties } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../packages/react-rivto-editor/src/components/ui/popover";
import { Button } from "../../../packages/react-rivto-editor/src/components/ui/button";
import { z } from "zod";

/** Document subtree identity associated with one demo note. */
const sideNoteDataSchema = z.object({ rootBlockId: z.string().min(1) });
const SIDE_NOTE_CONTAINER_TYPE = "demo.side-note-container";
/** Theme palette shared by the note's fill and border selectors. */
const COLORS = ["default", "transparent", ...BLOCK_BACKGROUND_COLORS.slice(1)] as const;
const appearanceSchema = z.object({
  fill: z.enum(COLORS).default("default"),
  borderColor: z.enum(COLORS).default("default"),
  borderStyle: z.enum(["solid", "dashed"]).default("solid"),
  animated: z.boolean().default(false),
  appearance: z.enum(["card", "editor"]).default("card"),
});
type SideNoteAppearance = z.infer<typeof appearanceSchema>;

/** CSS variables consumed by the note container. */
interface SideNoteStyle extends CSSProperties {
  readonly "--side-note-fill": string;
  readonly "--side-note-border": string;
}

/**
 * Resolves a selected theme color without conflating default and transparent.
 *
 * @param value - Persisted palette choice.
 * @param fallback - Theme color used by the default choice.
 * @returns A CSS color or theme variable reference.
 */
function resolveSideNoteColor(value: SideNoteAppearance["fill"], fallback: string): string {
  if (value === "default") {
    return fallback;
  }
  return value === "transparent" ? "transparent" : `var(--rivto-block-${value})`;
}

/** Applies shared container behavior to the document root of a side note. */
class SideNoteContainerBehavior extends ContainerBlockBehavior {
  /**
   * Selects the registered side-note container for shared container behavior.
   *
   * @param context - Block being evaluated by the behavior registry.
   * @returns Whether this block is a side-note container.
   */
  isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === SIDE_NOTE_CONTAINER_TYPE;
  }
}

/**
 * Provides selectable content when a side-note container is displayed directly.
 *
 * Normal side-note panels display the container's children instead of the root.
 *
 * @param props - Identity of the container being rendered.
 * @param props.blockId - Persisted container block ID.
 * @returns A selection anchor for the container's content region.
 */
function SideNoteContainer({ blockId }: { readonly blockId: string }) {
  const anchor = useBlockSelectionAnchor(blockId);
  return <div {...anchor}>Side note</div>;
}

/**
 * Displays the document-owned children associated with a side note.
 *
 * @param props - Side record and its removal callback.
 * @param props.block - Persisted note association.
 * @param props.remove - Removes the note association.
 * @returns A scoped editor and note controls, or an error for invalid data.
 */
function SideNote({ block, remove }: SideBlockRendererProps) {
  const parsed = sideNoteDataSchema.safeParse(block.data);
  if (!parsed.success) {
    return <div role="alert">Invalid side note data</div>;
  }
  return <SideNoteView rootBlockId={parsed.data.rootBlockId} remove={remove} />;
}

/** Properties for a note bound to its persisted document container. */
interface SideNoteViewProps {
  /** Document-owned root containing the editable blocks. */
  readonly rootBlockId: string;
  /** Removes the containing note. */
  readonly remove: SideBlockRendererProps["remove"];
}

/**
 * Displays a side note and its independently persisted appearance.
 *
 * @param props - Container identity and note removal callback.
 * @param props.rootBlockId - Document-owned root containing the note's blocks.
 * @param props.remove - Removes the note association.
 * @returns The styled note and its scoped editing panel.
 */
function SideNoteView({ rootBlockId, remove }: SideNoteViewProps) {
  const panel = useReactPanel();
  const { block } = useBlockNode<SideNoteAppearance>(rootBlockId);
  const appearance = appearanceSchema.parse(block?.props ?? {});
  const style: SideNoteStyle = {
    "--side-note-fill": resolveSideNoteColor(appearance.fill, "var(--rivto-background)"),
    "--side-note-border": resolveSideNoteColor(appearance.borderColor, "var(--rivto-border)"),
  };
  return (
    <SideBlockEditor rootBlockId={rootBlockId}>
      <div
        className="demo-side-note"
        data-side-note
        data-appearance={appearance.appearance}
        data-border-style={appearance.borderStyle}
        data-border-animated={appearance.animated}
        style={style}
      >
        {appearance.appearance === "card" && appearance.borderStyle === "dashed" && (
          <svg className="demo-side-note-border" aria-hidden="true">
            <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="13" />
          </svg>
        )}
        <div className="demo-side-note-controls">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                {...editorControlProps}
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Side note settings"
                title="Side note settings"
              >
                <Settings2 size={14} aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" role="dialog" aria-label="Side note settings">
              <SideNoteSettings rootBlockId={rootBlockId} appearance={appearance} />
            </PopoverContent>
          </Popover>
          <Button
            {...editorControlProps}
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Delete note"
            title="Delete note"
            onClick={() => {
              panel.batchUpdates(() => {
                panel.editor.blocks.removeBlock(rootBlockId);
                return remove();
              });
              panel.getRoot()?.focus({ preventScroll: true });
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
          </Button>
        </div>
        <SideBlockContent />
        <SideNoteActions />
      </div>
    </SideBlockEditor>
  );
}

/**
 * Provides an add-block control while the note has no blocks.
 *
 * @returns An add control bound to an empty note, or null when blocks exist.
 */
function SideNoteActions() {
  const panel = useReactPanel();
  const roots = useRootBlockIds();
  if (roots.length) {
    return null;
  }
  return (
    <div className="demo-side-note-actions">
      <button
        type="button"
        onClick={() =>
          panel.blocks.insertBlock(panel.editor.defaultWritingBlockFactory.createEmptyBlock())
        }
      >
        <Plus size={14} aria-hidden="true" /> Add block
      </button>
    </div>
  );
}

/** Props for settings bound to the document-owned container. */
interface SideNoteSettingsProps {
  /** Stable container identity. */
  readonly rootBlockId: string;
  /** Current validated appearance settings. */
  readonly appearance: SideNoteAppearance;
}

/**
 * Updates the side note's appearance through the document block manager.
 *
 * @param props - Current container identity and appearance.
 * @param props.rootBlockId - Document block receiving changes.
 * @param props.appearance - Current appearance used by the controls.
 * @returns Accessible appearance controls with immediate persisted updates.
 */
function SideNoteSettings({ rootBlockId, appearance }: SideNoteSettingsProps) {
  const panel = useReactPanel();
  // The scoped panel protects its hidden root; its owner edits container settings.
  /**
   * Persists one appearance change on the document-owned container.
   *
   * @param patch - Validated appearance fields to update.
   * @returns The updated container node.
   */
  const update = (patch: Partial<SideNoteAppearance>) =>
    panel.editor.blocks.updateBlock(rootBlockId, { props: patch });
  return (
    <div className="demo-side-note-settings">
      <div className="demo-side-note-settings-heading">
        <span>Side note</span>
        <strong>Appearance</strong>
      </div>
      <label>
        Appearance
        <select
          aria-label="Appearance"
          value={appearance.appearance}
          onChange={(event) =>
            update({ appearance: appearanceSchema.shape.appearance.parse(event.target.value) })
          }
        >
          <option value="card">Bento card</option>
          <option value="editor">Borderless editor</option>
        </select>
      </label>
      <div className="demo-side-note-color-field">
        <span>Fill color</span>
        <BlockColorPalette
          label="Fill color"
          includeTransparent
          value={appearance.fill === "default" ? "" : appearance.fill}
          onChange={(value) =>
            update({ fill: appearanceSchema.shape.fill.parse(value || "default") })
          }
        />
      </div>
      <div className="demo-side-note-color-field">
        <span>Border color</span>
        <BlockColorPalette
          label="Border color"
          includeTransparent
          value={appearance.borderColor === "default" ? "" : appearance.borderColor}
          onChange={(value) =>
            update({ borderColor: appearanceSchema.shape.borderColor.parse(value || "default") })
          }
        />
      </div>
      <label>
        Border style
        <select
          aria-label="Border style"
          value={appearance.borderStyle}
          onChange={(event) =>
            update({ borderStyle: appearanceSchema.shape.borderStyle.parse(event.target.value) })
          }
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
      </label>
      <label className="demo-side-note-toggle">
        <input
          type="checkbox"
          checked={appearance.animated}
          disabled={appearance.borderStyle !== "dashed"}
          onChange={(event) => update({ animated: event.target.checked })}
        />{" "}
        Animate dashes
      </label>
    </div>
  );
}

/** Operations used to create the note association and its document subtree. */
interface SideBlockDemoEditor extends Pick<
  ReactEditorApi,
  "defaultWritingBlockFactory" | "history" | "getDocument"
> {
  /** Creates a document subtree and reads page roots. */
  readonly blocks: Pick<DocumentEditorAPI["blocks"], "getRootIds" | "insertBlock">;
}

/**
 * Creates a note association and its independent document subtree together.
 *
 * @param editor - Editor owning the document and block creation policy.
 * @param anchorId - Document block that anchors the note.
 * @param placement - Requested position relative to its anchor.
 * @param spacing - Whether the note reserves space in the page layout.
 * @param content - Optional initial text for its first block.
 * @returns Creates the note and its subtree in one history batch.
 */
function createSideNote(
  editor: SideBlockDemoEditor,
  anchorId: string,
  placement: "left" | "right" | "full",
  spacing: "flow" | "reserve",
  content?: string,
): void {
  editor.history.batchUpdates(() => {
    const input = editor.defaultWritingBlockFactory.createEmptyBlock();
    const root = editor.blocks.insertBlock(
      {
        type: SIDE_NOTE_CONTAINER_TYPE,
        children: [{ ...input, content: content ?? input.content }],
      },
      { parentId: null, additional: true },
    );
    createSideBlock(editor.getDocument(), {
      anchorId,
      type: "note",
      data: { rootBlockId: root.id },
      placement,
      spacing,
    });
  });
}

/**
 * Adds comments and example note renderers to the optional side-block demo.
 *
 * @param includeComments - Whether to install the comments example and canvas sidebar.
 * @returns Shared side layout, optional comments, and note-creation commands.
 */
export function demoSideBlockExtensions(includeComments: boolean): ReactEditorExtension[] {
  return [
    sideBlocksExtension({
      renderers: {
        [COMMENT_SIDE_BLOCK_TYPE]: createCommentSideBlockRenderer({
          author: { id: "demo-user", name: "Demo User" },
        }),
        note: SideNote,
      },
    }),
    ...(includeComments
      ? [commentsExtension({ author: { id: "demo-user", name: "Demo User" } })]
      : []),
    demoSideNoteCommands(),
  ];
}

/**
 * Registers demo commands and menu actions that create side notes.
 *
 * @returns The extension owning the note command and menu registrations.
 */
function demoSideNoteCommands(): ReactEditorExtension {
  return {
    id: "demo.side-notes",
    setup: (editor) => {
      const removeContainer = editor.blockTypes.register({
        definition: {
          type: SIDE_NOTE_CONTAINER_TYPE,
          title: "Side note",
          propSchema: appearanceSchema,
        },
        render: SideNoteContainer,
        behavior: new SideNoteContainerBehavior(),
      });
      const removeFlow = editor.slashCommands.register({
        id: "side-note.flow",
        title: "Side note (flow)",
        group: "Actions",
        isAvailable: ({ reactPanel, blockId }) =>
          !reactPanel.blocks.includeRoot &&
          reactPanel.editor.getDocument().blocks.hasBlock(blockId),
        execute: ({ reactPanel, blockId }) => {
          createSideNote(reactPanel.editor, blockId, "right", "flow");
        },
      });
      const removeFull = editor.slashCommands.register({
        id: "side-note.full",
        title: "Full-width note",
        group: "Actions",
        isAvailable: ({ reactPanel, blockId }) =>
          !reactPanel.blocks.includeRoot &&
          reactPanel.editor.getDocument().blocks.hasBlock(blockId),
        execute: ({ reactPanel, blockId }) => {
          createSideNote(reactPanel.editor, blockId, "full", "reserve");
        },
      });
      const removeMenuActions = (["left", "right"] as const).map((placement) =>
        editor.blockContextMenu.register({
          id: `side-note.${placement}`,
          title: `Add note to ${placement}`,
          order: 16,
          /**
           * Restricts note creation to document blocks in the page panel.
           *
           * @param context - Panel and clicked block captured when the menu opened.
           * @returns Whether the clicked block can anchor a visible note.
           */
          isAvailable: ({ reactPanel, blockId }) =>
            reactPanel.getSurfaceType() === "block" &&
            !reactPanel.blocks.includeRoot &&
            reactPanel.editor.getDocument().blocks.hasBlock(blockId),
          /**
           * Creates an editable note beside the clicked block.
           *
           * @param context - Panel and clicked block captured when the menu opened.
           * @returns Creates a flowing note in the invoking document.
           * @throws If the document rejects the side-block data.
           */
          execute: ({ reactPanel, blockId }) => {
            createSideNote(reactPanel.editor, blockId, placement, "flow");
          },
        }),
      );
      const removeMenuSeparator = editor.blockContextMenu.register({
        id: "separator.side-notes",
        title: "Side notes",
        kind: "separator",
        order: 17,
        /**
         * Shows the separator only when the note actions are available.
         *
         * @param context - Panel and clicked block captured when the menu opened.
         * @returns Whether the clicked block can anchor a visible note.
         */
        isAvailable: ({ reactPanel, blockId }) =>
          reactPanel.getSurfaceType() === "block" &&
          !reactPanel.blocks.includeRoot &&
          reactPanel.editor.getDocument().blocks.hasBlock(blockId),
      });
      return () => {
        removeMenuSeparator();
        removeMenuActions.forEach((remove) => remove());
        removeFull();
        removeFlow();
        removeContainer();
      };
    },
  };
}

/**
 * Adds one editable flow note on each side of the first journal block.
 *
 * @param editor - Borrowed editor whose journal has already been seeded.
 * @returns Creates the example records when a root block exists.
 */
export function seedDemoSideBlocks(editor: SideBlockDemoEditor): void {
  const anchorId = editor.blocks.getRootIds()[0];
  if (!anchorId) {
    return;
  }
  createSideNote(editor, anchorId, "left", "flow", "A note on the left.");
  createSideNote(editor, anchorId, "right", "flow", "A note on the right.");
}
