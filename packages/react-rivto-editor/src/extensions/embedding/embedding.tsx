import { clipboardContentBundle } from "../../managers/clipboard/clipboard-content";
import { writeClipboardBundle } from "../../managers/clipboard/browser-clipboard";
import { Link2Icon, RefreshCwIcon } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { editorControlProps } from "../../constants";
import { EditorEmbed } from "../../components/editor-embed/editor-embed";
import type { BlockResolution } from "../../editor/editor-storage";
import { EditorStorageContext } from "../../editor/editor-storage-context";
import { useBlockNode, useBlockSelectionAnchor, usePanel } from "../../hooks";
import { useAcquiredEditor } from "../../hooks/editor/use-acquired-editor";
import type { BlockSlotProps, ReactEditorExtension } from "../../managers";
import { PageSurface } from "../../surfaces/page";
import type { BlockWrapperProps } from "../../blocks";

/** Persisted block type for a live reference to another workspace block. */
export const EMBEDDING_BLOCK_TYPE = "embedding";
const EMBEDDING_CLASS = "rivto-embedding";
const EMBEDDED_SURFACE_CLASS = "rivto-embedded-surface";
const EMBEDDING_STATUS_CLASS = "rivto-embedding-status";
const EMBEDDING_SETTINGS_HEADER_CLASS = "rivto-embedding-settings-header";
const REFRESH_EVENT = "refresh";
const ancestryContext = createContext<readonly string[]>([]);
const refreshEventsContext = createContext<EventTarget | undefined>(undefined);

/**
 * Shares refresh requests between one embedding's settings and body slots.
 *
 * The event target belongs to this rendered occurrence and adds no DOM wrapper.
 *
 * @param props - Rendered embedding shell and its descendants.
 * @param props.children - Existing shell to render inside the refresh boundary.
 * @returns The unchanged shell with an occurrence-local refresh event target.
 */
function EmbeddingRefreshBoundary({ children }: { readonly children: ReactNode }) {
  const [events] = useState(() => new EventTarget());
  return <refreshEventsContext.Provider value={events}>{children}</refreshEventsContext.Provider>;
}

/**
 * Gives embedding shells a refresh boundary while passing other block shells through.
 *
 * @param props - Current block node and already-rendered shared shell.
 * @param props.block - Node whose type determines whether refresh state is needed.
 * @param props.children - Shared shell, rendered exactly once.
 * @returns A refresh boundary for an embedding, or the unchanged shell.
 */
function EmbeddingWrapper({ block, children }: BlockWrapperProps) {
  return block.type === EMBEDDING_BLOCK_TYPE ? (
    <EmbeddingRefreshBoundary>{children}</EmbeddingRefreshBoundary>
  ) : (
    children
  );
}

/** Native embedding props; an empty target is an unconfigured reference. */
export interface EmbeddingProps extends Record<string, unknown> {
  readonly targetDocumentId: string;
  readonly targetBlockId: string;
}

/** Renders the selectable reference anchor without adding a header above the source editor. */
function EmbeddingBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockNode<EmbeddingProps>(blockId);
  const attributes = useBlockSelectionAnchor(blockId);
  if (!editing.block) {
    return null;
  }
  return (
    <div
      {...attributes}
      className={`${EMBEDDING_CLASS} w-full min-w-0 max-w-full box-border min-h-(--rivto-default-block-height)`}
    />
  );
}

/**
 * Edits the reference in a right-slot popover, saving both IDs as one document update.
 *
 * Refresh requests use the saved reference and leave unsaved form fields intact.
 * The refresh button restarts only this occurrence's reference search and failed load.
 *
 * @param props - Right-slot context supplied by the host block tree.
 * @param props.block - Embedding node supplying the saved document and block IDs.
 * @returns Settings trigger and popover with reference fields and an icon-only refresh button.
 * @throws If rendered outside an editor panel or a delegated save operation fails.
 */
function EmbeddingControls({ block }: BlockSlotProps) {
  const panel = usePanel();
  const refreshEvents = useContext(refreshEventsContext);
  const [open, setOpen] = useState(false);
  const props = block.props as EmbeddingProps;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...editorControlProps}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Edit embedding"
          title="Edit embedding"
        >
          <Link2Icon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" role="dialog" aria-label="Embedding settings">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            panel.blocks.updateBlock(block.id, {
              props: {
                targetDocumentId: String(fields.get("targetDocumentId") ?? "").trim(),
                targetBlockId: String(fields.get("targetBlockId") ?? "").trim(),
              },
            });
            setOpen(false);
          }}
        >
          <div className={EMBEDDING_SETTINGS_HEADER_CLASS}>
            <div>
              <div className="text-sm font-medium">Embedding settings</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose the document and block to show here.
              </p>
            </div>
            <Button
              {...editorControlProps}
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Refresh embedding"
              title="Refresh embedding"
              disabled={!refreshEvents || !props.targetDocumentId || !props.targetBlockId}
              onClick={() => refreshEvents?.dispatchEvent(new Event(REFRESH_EVENT))}
            >
              <RefreshCwIcon aria-hidden="true" />
            </Button>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            Document ID
            <Input
              {...editorControlProps}
              name="targetDocumentId"
              aria-label="Target document ID"
              defaultValue={props.targetDocumentId}
              placeholder="Document ID"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Block ID
            <Input
              {...editorControlProps}
              name="targetBlockId"
              aria-label="Target block ID"
              defaultValue={props.targetBlockId}
              placeholder="Block ID"
            />
          </label>
          <Button {...editorControlProps} type="submit" size="sm" className="self-end">
            Save embedding
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Resolves a reference and renders its editable source subtree below the reference row.
 *
 * Location searches and source acquisitions publish an unavailable or error
 * status after one attempt. The retained source editor belongs to storage;
 * changing the reference or unmounting releases this consumer and its lookup.
 * Reference ancestry prevents recursive acquisition without changing persisted IDs.
 * Settings refresh restarts lookup and failed acquisition while retaining a
 * successfully loaded source editor and its document history.
 *
 * @param props - Body-slot context supplied by the host block tree.
 * @param props.block - Reference block whose props contain the target document and block IDs.
 * @returns Source subtree, or a status for pending, unavailable, unconfigured,
 * recursive, or failed references.
 * @throws If rendered outside an editor panel.
 */
function EmbeddingBody({ block }: BlockSlotProps) {
  const blockId = block.id;
  const panel = usePanel();
  const ancestors = useContext(ancestryContext);
  const { targetDocumentId, targetBlockId } = block.props as EmbeddingProps;
  const targetAddress = JSON.stringify([targetDocumentId, targetBlockId]);
  const ownAddress = JSON.stringify([panel.document.getDocument().id, blockId]);
  const references = useContext(EditorStorageContext);
  const refreshEvents = useContext(refreshEventsContext);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [location, setLocation] = useState<
    BlockResolution & { targetAddress: string; settled: boolean; error?: unknown }
  >({ targetAddress: "", settled: false, ambiguous: false });
  const resolvedAddress = JSON.stringify([location.documentId, targetBlockId]);
  const locationIsCurrent = location.targetAddress === targetAddress;
  const cycle =
    locationIsCurrent && (ancestors.includes(resolvedAddress) || resolvedAddress === ownAddress);
  const ancestry = useMemo(
    () => [...ancestors, ownAddress, resolvedAddress],
    [ancestors, ownAddress, resolvedAddress],
  );
  useEffect(() => {
    setLocation((previous) => {
      if (previous.targetAddress === targetAddress) {
        return { ...previous, settled: false, error: undefined };
      }
      return { targetAddress, settled: false, ambiguous: false };
    });
    if (!targetDocumentId || !targetBlockId || !references) {
      return;
    }
    return references.blockReferences.subscribeBlockLocation(
      { documentId: targetDocumentId, blockId: targetBlockId },
      (resolution, error) => {
        setLocation((previous) => {
          if (
            previous.targetAddress === targetAddress &&
            previous.settled &&
            previous.documentId === resolution.documentId &&
            previous.ambiguous === resolution.ambiguous &&
            previous.error === error
          ) {
            return previous;
          }
          return { targetAddress, settled: true, ...resolution, error };
        });
      },
    );
  }, [targetAddress, targetDocumentId, targetBlockId, references, refreshVersion]);
  const { editor: source, error: sourceError } = useAcquiredEditor(
    references,
    cycle || !locationIsCurrent ? undefined : location.documentId,
  );
  useEffect(() => {
    /**
     * Restarts lookup and clears a failed acquisition without releasing a loaded editor.
     *
     * @returns Cleared local lookup status and a new search request for the saved reference.
     */
    const refresh = () => {
      setLocation((previous) => ({
        ...previous,
        documentId: source?.getDocument().id,
        settled: false,
        error: undefined,
      }));
      setRefreshVersion((version) => version + 1);
    };
    refreshEvents?.addEventListener(REFRESH_EVENT, refresh);
    return () => refreshEvents?.removeEventListener(REFRESH_EVENT, refresh);
  }, [refreshEvents, source]);
  const error = location.error ?? sourceError;
  let message = "Loading embedded block…";
  if (!targetDocumentId || !targetBlockId) {
    message = "Choose a target document and block.";
  } else if (cycle) {
    message = "Recursive block reference.";
  } else if (!references) {
    message = "Block resolution is unavailable.";
  } else if (error) {
    message = "Unable to load referenced block.";
  } else if (locationIsCurrent && location.settled && !location.documentId) {
    message = "Referenced block is unavailable.";
  }
  return (
    <>
      {locationIsCurrent && location.ambiguous && (
        <div role="status" className={EMBEDDING_STATUS_CLASS}>
          Multiple documents contain this block; showing the first match.
        </div>
      )}
      {!cycle &&
      targetBlockId &&
      locationIsCurrent &&
      location.documentId &&
      source &&
      source.getDocument().id === location.documentId ? (
        <ancestryContext.Provider value={ancestry}>
          {Boolean(error) && (
            <div role="status" className={EMBEDDING_STATUS_CLASS}>
              Unable to load referenced block.
            </div>
          )}
          <div className={`${EMBEDDED_SURFACE_CLASS} min-w-0 max-w-full`} hidden={Boolean(error)}>
            <EditorEmbed editor={source} rootBlockId={targetBlockId} active={!error}>
              <PageSurface />
            </EditorEmbed>
          </div>
        </ancestryContext.Provider>
      ) : (
        <div role="status" className={EMBEDDING_STATUS_CLASS}>
          {message}
        </div>
      )}
    </>
  );
}

/**
 * Registers live embedding props, rendering, and slash conversion.
 * Source documents are found and acquired through EditorStorageContext; each nested EditorPanel owns its acquisition.
 * Source blocks reuse their source editor's renderers, commands, selection, and history.
 * The reference shell accepts ordinary host-document children through shared outline behavior.
 * @returns Optional extension; install it in each host editor that renders references.
 */
export function embeddingExtension(): ReactEditorExtension {
  return {
    id: "block.embedding",
    /**
     * Registers embedding copying, block rendering, controls, and clipboard conversion.
     *
     * @param reactEditor - Host editor receiving the embedding registrations.
     * @returns Cleanup for converters, slots, refresh wrappers, and block type; the menu registration
     * is released by the extension registration lifecycle.
     * @throws If a delegated registration fails.
     */
    setup: (reactEditor) => {
      reactEditor.blockContextMenu.register({
        id: "embedding.copy",
        title: "Copy block embedding",
        order: 70,
        /**
         * Copies live embedding references for the captured root blocks.
         *
         * Each reference carries the source document ID and block ID; source
         * content is not cloned or changed. Normal paste creates reference blocks.
         *
         * @param context - Invoking panel and ancestor-deduplicated source roots.
         * @returns Completion of the browser clipboard write.
         * @throws If formatting or browser clipboard access fails.
         */
        execute: async ({ reactPanel, rootIds }) => {
          const bundle = clipboardContentBundle({
            blocks: rootIds.map((id) => ({
              type: EMBEDDING_BLOCK_TYPE,
              props: { targetDocumentId: reactPanel.editor.getDocument().id, targetBlockId: id },
            })),
          });
          bundle.sourceDocumentId = reactPanel.editor.getDocument().id;
          await writeClipboardBundle(reactPanel.editor, bundle);
        },
      });
      const dispose = reactEditor.blockTypes.register({
        definition: {
          type: EMBEDDING_BLOCK_TYPE,
          title: "Embedded block",
          defaultProps: { targetDocumentId: "", targetBlockId: "" },
          propSchema: z.object({ targetDocumentId: z.string(), targetBlockId: z.string() }),
        },
        render: (props) => <EmbeddingBlock {...props} />,
        slashCommand: { title: "Embedded block" },
      });
      const body = reactEditor.surfaces.registerBlockSlot({
        position: "body",
        component: EmbeddingBody,
        when: ({ block }) => block.type === EMBEDDING_BLOCK_TYPE,
      });
      const controls = reactEditor.surfaces.registerBlockSlot({
        position: "right",
        component: EmbeddingControls,
        when: ({ block }) => block.type === EMBEDDING_BLOCK_TYPE,
      });
      const pageWrapper = reactEditor.surfaces.registerBlockWrapper("block", EmbeddingWrapper);
      const edgelessWrapper = reactEditor.surfaces.registerBlockWrapper(
        "edgeless",
        EmbeddingWrapper,
      );
      const clipboard = reactEditor.clipboard.registerBlockConverter(EMBEDDING_BLOCK_TYPE, {
        format: ({ block }, current) => ({
          ...current,
          plain: `Embedded block: ${String(block.props.targetDocumentId)}/${String(block.props.targetBlockId)}`,
          markdown: `Embedded block: ${String(block.props.targetDocumentId)}/${String(block.props.targetBlockId)}`,
        }),
        /**
         * Remaps references to copied blocks from the source document when their destination IDs are available.
         *
         * @param block - Block snapshot or input used by this operation.
         * @param context - Operation metadata, including propagation or clipboard identity mappings.
         * @returns Reference property patch, or an empty patch for external or unmapped targets.
         */
        paste(block, context) {
          if (block.props.targetDocumentId !== context.sourceDocumentId) {
            return {};
          }
          const targetBlockId = context.blockIdMap.get(String(block.props.targetBlockId));
          if (!targetBlockId) {
            return {};
          }
          return {
            props: {
              ...block.props,
              targetDocumentId: context.destinationDocumentId,
              targetBlockId,
            },
          };
        },
      });
      return () => {
        clipboard();
        edgelessWrapper();
        pageWrapper();
        controls();
        body();
        dispose();
      };
    },
  };
}
