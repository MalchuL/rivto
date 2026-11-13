import { useBlockContent } from "../../authoring/use-block-content";
import { clipboardContentBundle } from "../../managers/clipboard/clipboard-content";
import { writeClipboardBundle } from "../../managers/clipboard/browser-clipboard";
import { Link2Icon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ContextType,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { editorControlProps } from "../../constants";
import { EditorEmbed } from "../../components/editor-embed/editor-embed";
import type { BlockResolution } from "../../editor/editor-storage";
import { EditorStorageContext } from "../../editor/editor-storage-context";
import { usePanel } from "../../hooks";
import { useAcquiredEditor } from "../../hooks/editor/use-acquired-editor";
import type { BlockSlotProps, ReactEditorExtension } from "../../managers";
import type { BlockClipboardConverter } from "../../managers/clipboard/types";
import type { ReactEditorApi } from "../../editor/types";
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
  /** Empty means search the containing document before other documents. */
  readonly targetDocumentId: string;
  readonly targetBlockId: string;
}

/** Renders the selectable reference anchor without adding a header above the source editor. */
function EmbeddingBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockContent<EmbeddingProps>(blockId);
  const attributes = editing.selectionProps;
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

/** Saved reference and refresh target used by the settings fields. */
interface EmbeddingSettingsFieldsProps {
  readonly saved: EmbeddingProps;
  readonly refreshEvents: EventTarget | undefined;
}

/**
 * Renders the saved reference fields and occurrence-local refresh control.
 *
 * The fields remain uncontrolled so refreshing does not replace an unsaved draft.
 *
 * @param props - Saved reference and optional refresh event target.
 * @param props.saved - Persisted IDs used as the form's initial values.
 * @param props.refreshEvents - Occurrence-owned target for a refresh request.
 * @returns Reference inputs and the refresh button without an extra DOM wrapper.
 */
function EmbeddingSettingsFields({ saved, refreshEvents }: EmbeddingSettingsFieldsProps) {
  return (
    <>
      <div className={EMBEDDING_SETTINGS_HEADER_CLASS}>
        <div>
          <div className="text-sm font-medium">Embedding settings</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a block. Leave Document ID empty to search this document first.
          </p>
        </div>
        <Button
          {...editorControlProps}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh embedding"
          title="Refresh embedding"
          disabled={!refreshEvents || !saved.targetBlockId}
          onClick={() => refreshEvents?.dispatchEvent(new Event(REFRESH_EVENT))}
        >
          <RefreshCwIcon aria-hidden="true" />
        </Button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        Document ID (optional)
        <Input
          {...editorControlProps}
          name="targetDocumentId"
          aria-label="Target document ID"
          defaultValue={saved.targetDocumentId}
          placeholder="Current document"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Block ID
        <Input
          {...editorControlProps}
          name="targetBlockId"
          aria-label="Target block ID"
          defaultValue={saved.targetBlockId}
          placeholder="Block ID"
        />
      </label>
    </>
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
          <EmbeddingSettingsFields saved={props} refreshEvents={refreshEvents} />
          <Button {...editorControlProps} type="submit" size="sm" className="self-end">
            Save embedding
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Current location result tagged with the requested address. */
interface EmbeddingLocation extends BlockResolution {
  readonly targetAddress: string;
  readonly settled: boolean;
  readonly error?: unknown;
}

/** Reference subscription capability borrowed from the host-owned storage. */
interface EmbeddingLocationReferences {
  readonly blockReferences: Pick<
    NonNullable<ContextType<typeof EditorStorageContext>>["blockReferences"],
    "subscribeBlockLocation"
  >;
}

/**
 * Subscribes to the current reference location and resets it when lookup restarts.
 *
 * @param references - Optional storage that resolves block locations.
 * @param targetAddress - Serialized document and block address for stale-result checks.
 * @param preferredDocumentId - Document searched first for an unqualified reference.
 * @param targetBlockId - Referenced block ID, or empty when unconfigured.
 * @param refreshVersion - Occurrence-local refresh generation.
 * @returns Current lookup state and its setter for the refresh effect.
 */
function useEmbeddingLocation(
  references: EmbeddingLocationReferences | undefined,
  targetAddress: string,
  preferredDocumentId: string,
  targetBlockId: string,
  refreshVersion: number,
) {
  const [location, setLocation] = useState<EmbeddingLocation>({
    targetAddress: "",
    settled: false,
    ambiguous: false,
  });
  useEffect(() => {
    setLocation((previous) => {
      if (previous.targetAddress === targetAddress) {
        return { ...previous, settled: false, error: undefined };
      }
      return { targetAddress, settled: false, ambiguous: false };
    });
    if (!targetBlockId || !references) {
      return;
    }
    return references.blockReferences.subscribeBlockLocation(
      { documentId: preferredDocumentId, blockId: targetBlockId },
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
  }, [targetAddress, preferredDocumentId, targetBlockId, references, refreshVersion]);
  return { location, setLocation };
}

/**
 * Restarts an occurrence's lookup when its refresh control requests it.
 *
 * @param refreshEvents - Occurrence-owned event target, when available.
 * @param source - Currently acquired editor, if loading succeeded.
 * @param setLocation - Updates the lookup status without releasing a loaded editor.
 * @param setRefreshVersion - Advances the generation observed by the lookup effect.
 * @returns Subscribes to refresh events and removes the listener on cleanup.
 */
function useEmbeddingRefresh(
  refreshEvents: EventTarget | undefined,
  source:
    Pick<NonNullable<ReturnType<typeof useAcquiredEditor>["editor"]>, "getDocument"> | undefined,
  setLocation: Dispatch<SetStateAction<EmbeddingLocation>>,
  setRefreshVersion: Dispatch<SetStateAction<number>>,
): void {
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
}

/**
 * Resolves and acquires the source editor for one embedding occurrence.
 *
 * @param block - Reference block containing the saved target IDs.
 * @returns Lookup, acquisition and ancestry state used by the body slot.
 * @throws If rendered outside an editor panel.
 */
function useEmbeddingReference(block: BlockSlotProps["block"]) {
  const blockId = block.id;
  const panel = usePanel();
  const ancestors = useContext(ancestryContext);
  const { targetDocumentId, targetBlockId } = block.props as EmbeddingProps;
  const preferredDocumentId = targetDocumentId || panel.document.getDocument().id;
  const targetAddress = JSON.stringify([preferredDocumentId, targetBlockId]);
  const ownAddress = JSON.stringify([panel.document.getDocument().id, blockId]);
  const references = useContext(EditorStorageContext);
  const refreshEvents = useContext(refreshEventsContext);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { location, setLocation } = useEmbeddingLocation(
    references,
    targetAddress,
    preferredDocumentId,
    targetBlockId,
    refreshVersion,
  );
  const resolvedAddress = JSON.stringify([location.documentId, targetBlockId]);
  const locationIsCurrent = location.targetAddress === targetAddress;
  const cycle =
    locationIsCurrent && (ancestors.includes(resolvedAddress) || resolvedAddress === ownAddress);
  const ancestry = useMemo(
    () => [...ancestors, ownAddress, resolvedAddress],
    [ancestors, ownAddress, resolvedAddress],
  );
  const { editor: source, error: sourceError } = useAcquiredEditor(
    references,
    cycle || !locationIsCurrent ? undefined : location.documentId,
  );
  useEmbeddingRefresh(refreshEvents, source, setLocation, setRefreshVersion);
  const error = location.error ?? sourceError;
  return { targetBlockId, references, location, locationIsCurrent, cycle, ancestry, source, error };
}

/**
 * Selects the status shown while a reference is unavailable or resolving.
 *
 * @param state - Current lookup and acquisition state for this occurrence.
 * @returns User-facing status text and whether it needs a warning icon.
 */
function embeddingStatus({
  targetBlockId,
  cycle,
  references,
  error,
  locationIsCurrent,
  location,
}: Pick<
  ReturnType<typeof useEmbeddingReference>,
  "targetBlockId" | "cycle" | "references" | "error" | "locationIsCurrent" | "location"
>) {
  let message = "Loading embedded block…";
  let showWarning = false;
  if (!targetBlockId) {
    message = "Choose a target block.";
  } else if (cycle) {
    message = "Recursive block reference.";
  } else if (!references) {
    message = "Block resolution is unavailable.";
    showWarning = true;
  } else if (error) {
    message = "Unable to load referenced block.";
    showWarning = true;
  } else if (locationIsCurrent && location.settled && !location.documentId) {
    message = "Referenced block is unavailable.";
    showWarning = true;
  }
  return { message, showWarning };
}

/**
 * Resolves a reference and renders its editable source subtree below the reference row.
 *
 * Location searches and source acquisitions publish an unavailable or error
 * status after one attempt. The retained source editor belongs to storage;
 * changing the reference or unmounting releases this consumer and its lookup.
 * An empty document ID prefers the containing document before the shared fallback search.
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
  const state = useEmbeddingReference(block);
  const { targetBlockId, location, locationIsCurrent, cycle, ancestry, source, error } = state;
  const { message, showWarning } = embeddingStatus(state);
  return (
    <>
      {locationIsCurrent && location.ambiguous && (
        <div role="status" className={EMBEDDING_STATUS_CLASS}>
          Multiple documents contain this block; showing document {location.documentId}.
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
              <TriangleAlertIcon
                aria-hidden="true"
                className="mr-1.5 inline-block size-4 align-text-bottom text-destructive"
              />
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
          {showWarning && (
            <TriangleAlertIcon
              aria-hidden="true"
              className="mr-1.5 inline-block size-4 align-text-bottom text-destructive"
            />
          )}
          {message}
        </div>
      )}
    </>
  );
}

/** Registration capabilities borrowed by the embedding extension. */
interface EmbeddingRegistrationEditor {
  readonly blockContextMenu: Pick<ReactEditorApi["blockContextMenu"], "register">;
  readonly blockTypes: Pick<ReactEditorApi["blockTypes"], "register">;
  readonly surfaces: Pick<ReactEditorApi["surfaces"], "registerBlockSlot" | "registerBlockWrapper">;
  readonly clipboard: Pick<ReactEditorApi["clipboard"], "registerBlockConverter">;
}

/**
 * Registers the context action that copies live references to selected roots.
 *
 * @param editor - Editor exposing the block context-menu registry.
 * @returns Registers the action with cleanup owned by the extension lifecycle.
 * @throws If context-menu registration fails.
 */
function registerEmbeddingContextMenu(
  editor: Pick<EmbeddingRegistrationEditor, "blockContextMenu">,
): void {
  editor.blockContextMenu.register({
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
      await writeClipboardBundle(reactPanel.editor.clipboardFormats, bundle);
    },
  });
}

/**
 * Creates the clipboard converter for live embedding references.
 *
 * @returns A fresh converter preserving external references and remapping copied targets.
 */
function createEmbeddingClipboardConverter(): BlockClipboardConverter {
  return {
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
      if (
        block.props.targetDocumentId &&
        block.props.targetDocumentId !== context.sourceDocumentId
      ) {
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
  };
}

/**
 * Registers embedding copying, block rendering, controls, and clipboard conversion.
 *
 * @param reactEditor - Host editor receiving the embedding registrations.
 * @returns Cleanup for converters, slots, refresh wrappers, and block type; the menu registration
 * is released by the extension registration lifecycle.
 * @throws If a delegated registration fails.
 */
function registerEmbedding(reactEditor: EmbeddingRegistrationEditor): () => void {
  registerEmbeddingContextMenu(reactEditor);
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
  const edgelessWrapper = reactEditor.surfaces.registerBlockWrapper("edgeless", EmbeddingWrapper);
  const clipboard = reactEditor.clipboard.registerBlockConverter(
    EMBEDDING_BLOCK_TYPE,
    createEmbeddingClipboardConverter(),
  );
  return () => {
    clipboard();
    edgelessWrapper();
    pageWrapper();
    controls();
    body();
    dispose();
  };
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
    setup: registerEmbedding,
  };
}
