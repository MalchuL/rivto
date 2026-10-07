import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { EditorBlock } from "@chulane/rivto";
import type { BlockResolution } from "../../editor-storage";
import type { ReactEditor } from "../../types";
import { z } from "zod";
import { Link2Icon } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { PageSurface } from "../../surfaces/page";
import { EditorView } from "../../editor-view";
import { EditorStorageContext } from "../../editor-storage-context";
import { useBlockEditing, useReactEditor } from "../../hooks";
import type { BlockSlotProps, ReactEditorExtension } from "../../managers";

/** Persisted block type for a live reference to another workspace block. */
export const EMBEDDING_BLOCK_TYPE = "embedding";
const EMBEDDING_CLASS = "rivto-embedding";
const EMBEDDED_SURFACE_CLASS = "rivto-embedded-surface";
const ancestryContext = createContext<readonly string[]>([]);

/** Native embedding props; an empty target is an unconfigured reference. */
export interface EmbeddingProps extends Record<string, unknown> {
  readonly targetDocumentId: string;
  readonly targetBlockId: string;
}

/** Renders the selectable reference anchor without adding a header above the source editor. */
function EmbeddingBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<EmbeddingProps>(blockId, { textEdit: false });
  if (!editing.block) return null;
  return (
    <div {...editing.attributes} className={`${EMBEDDING_CLASS} w-full min-w-0 max-w-full box-border min-h-(--rivto-default-block-height)`} />
  );
}

/** Edits the reference in a right-slot popover, saving both IDs as one document update. */
function EmbeddingControls({ block }: BlockSlotProps) {
  const reactEditor = useReactEditor();
  const [open, setOpen] = useState(false);
  const props = block.props as EmbeddingProps;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Edit embedding" title="Edit embedding">
          <Link2Icon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" role="dialog" aria-label="Embedding settings">
        <form className="flex flex-col gap-3" onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          reactEditor.blocks.updateBlock(block.id, { props: {
            targetDocumentId: String(fields.get("targetDocumentId") ?? "").trim(),
            targetBlockId: String(fields.get("targetBlockId") ?? "").trim(),
          } });
          setOpen(false);
        }}>
          <div>
            <div className="text-sm font-medium">Embedding settings</div>
            <p className="mt-1 text-xs text-muted-foreground">Choose the document and block to show here.</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            Document ID
            <Input name="targetDocumentId" aria-label="Target document ID" defaultValue={props.targetDocumentId} placeholder="Document ID" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Block ID
            <Input name="targetBlockId" aria-label="Target block ID" defaultValue={props.targetBlockId} placeholder="Block ID" />
          </label>
          <Button type="submit" size="sm" className="self-end">Save embedding</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Acquires and renders the editable source subtree below the reference row. */
function EmbeddingBody({ block }: BlockSlotProps) {
  const blockId = block.id;
  const reactEditor = useReactEditor();
  const ancestors = useContext(ancestryContext);
  const { targetDocumentId, targetBlockId } = block.props as EmbeddingProps;
  const targetAddress = JSON.stringify([targetDocumentId, targetBlockId]);
  const ownAddress = JSON.stringify([reactEditor.getDocument().id, blockId]);
  const references = useContext(EditorStorageContext);
  const [source, setSource] = useState<ReactEditor>();
  const [location, setLocation] = useState<BlockResolution & { targetAddress: string; error?: unknown }>({ targetAddress: "", ambiguous: false });
  const resolvedAddress = JSON.stringify([location.documentId, targetBlockId]);
  const locationIsCurrent = location.targetAddress === targetAddress;
  const cycle = locationIsCurrent && (ancestors.includes(resolvedAddress) || resolvedAddress === ownAddress);
  const ancestry = useMemo(() => [...ancestors, ownAddress, resolvedAddress], [ancestors, ownAddress, resolvedAddress]);
  useEffect(() => {
    setLocation({ targetAddress, ambiguous: false });
    if (!targetDocumentId || !targetBlockId || !references) return;
    return references.subscribeBlockLocation({ documentId: targetDocumentId, blockId: targetBlockId }, (resolution, error) => {
      setLocation((previous) => {
        if (previous.targetAddress === targetAddress
          && previous.documentId === resolution.documentId
          && previous.ambiguous === resolution.ambiguous
          && previous.error === error) return previous;
        return { targetAddress, ...resolution, error };
      });
    });
  }, [targetAddress, targetDocumentId, targetBlockId, references]);
  useEffect(() => {
    setSource(undefined);
    if (!references || !location.documentId || cycle) return;
    const controller = new AbortController();
    let release: (() => Promise<void>) | undefined;
    void references.acquireEditor(location.documentId, { signal: controller.signal }).then((acquisition) => {
      release = acquisition.release;
      if (controller.signal.aborted) void release().catch(console.error);
      else setSource(acquisition.editor);
    }).catch((error) => {
      if (!controller.signal.aborted) setLocation((current) => ({ ...current, error }));
    });
    return () => {
      controller.abort();
      void release?.().catch(console.error);
    };
  }, [references, location.documentId, cycle]);
  let message = "Loading embedded block…";
  if (!targetDocumentId || !targetBlockId) message = "Choose a target document and block.";
  else if (cycle) message = "Recursive block reference.";
  else if (!references) message = "Block resolution is unavailable.";
  else if (location.error) message = "Unable to load referenced block.";
  return (
    <>
      {locationIsCurrent && location.ambiguous && <div role="status">Multiple documents contain this block; showing the first match.</div>}
      {!cycle && targetBlockId && locationIsCurrent && location.documentId && source?.getDocument().id === location.documentId ? (
        <ancestryContext.Provider value={ancestry}>
          {Boolean(location.error) && <div role="status">Unable to load referenced block.</div>}
          <div className={`${EMBEDDED_SURFACE_CLASS} min-w-0 max-w-full`} hidden={Boolean(location.error)}>
            <EditorView reactEditor={source} rootBlockId={targetBlockId} active={!location.error}><PageSurface /></EditorView>
          </div>
        </ancestryContext.Provider>
      ) : <div role="status" className="px-2 pb-2">{message}</div>}
    </>
  );
}

/**
 * Registers live embedding props, rendering, and slash conversion.
 * Source documents are found and acquired through EditorStorageContext; each nested EditorView owns its acquisition.
 * Source blocks reuse their source editor's renderers, commands, selection, and history.
 * The reference shell accepts ordinary host-document children through shared outline behavior.
 * @returns Optional extension; install it in each host editor that renders references.
 */
export function embeddingExtension(): ReactEditorExtension {
  return {
    id: "block.embedding",
    setup: (reactEditor) => {
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
      const formatter = reactEditor.clipboard.registerFormatter({
        id: "embedding.reference",
        matches: ({ block }) => block.type === EMBEDDING_BLOCK_TYPE,
        format: ({ block }, current) => ({ ...current, plain: `Embedded block: ${String(block.props.targetDocumentId)}/${String(block.props.targetBlockId)}`, markdown: `Embedded block: ${String(block.props.targetDocumentId)}/${String(block.props.targetBlockId)}` }),
      });
      const paste = reactEditor.clipboard.pasteStrategies.register("paste.embedding-references", {
        matches: (context) => Boolean(context.bundle?.sourceDocumentId && context.blockIdMap),
        paste: (context) => {
          const map = context.blockIdMap!;
          const visit = (blocks: readonly EditorBlock[]) => blocks.forEach((block) => {
            if (block.type === EMBEDDING_BLOCK_TYPE && block.props.targetDocumentId === context.bundle!.sourceDocumentId) {
              const targetId = map.get(String(block.props.targetBlockId));
              const pastedId = map.get(block.id);
              if (targetId && pastedId) reactEditor.blocks.updateBlock(pastedId, {
                props: { ...block.props, targetDocumentId: reactEditor.getDocument().id, targetBlockId: targetId },
              });
            }
            visit(block.children);
          });
          visit(context.bundle!.blocks);
          return undefined;
        },
      });
      return () => { paste(); formatter(); controls(); body(); dispose(); };
    },
  };
}
