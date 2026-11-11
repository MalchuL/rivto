import { paragraphBlockFactory } from "@chulane/rivto-react/block-factories";
import { ModeManager } from "@chulane/rivto";
import { BroadcastChannelProvider, WebRTCProvider, YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DocumentStorage, type DocumentModel } from "@chulane/document-model";
import {
  createReactEditor,
  edgelessPreset,
  EditorStorage,
  EditorStorageContext,
  EditorPanel,
  EMBEDDING_BLOCK_TYPE,
  embeddingExtension,
  pageDragExtension,
  standardPreset,
  type ReactEditorApi,
  type EditorAcquisition,
} from "@chulane/rivto-react";
import { useEffect, useState } from "react";
import { DBDocumentModel, DemoDatabase } from "./database";
import { DemoEditorSurface } from "./editor-surface";

interface Pane {
  readonly mode: ModeManager;
  id: string;
  instanceId: string;
  reactEditor: ReactEditorApi | undefined;
  /**
   * Releases the pane's editor and document resources asynchronously.
   */
  release(): Promise<void>;
}
interface Runtime {
  storage: DocumentStorage;
  editor: EditorStorage;
  seeded: Map<string, EditorAcquisition>;
}

/** State needed to render and release one document pane. */
interface DocumentPaneProps {
  /** Pane and its current editor acquisition. */
  pane: Pane;
  /** Whether this pane is the active tab. */
  active: boolean;
  /** Whether inactive panes are hidden. */
  tabs: boolean;
  /** Runtime holding seed acquisitions. */
  runtime: Runtime;
  /**
   * Removes a pane and releases its editor acquisition.
   *
   * @param pane - Pane to close.
   * @returns The pane is removed and its release is started.
   */
  close: (pane: Pane) => void;
}

/**
 * Renders one acquired editor inside its own React subtree.
 *
 * Keeping the editor in this subtree allows React to release its element props
 * when the pane unmounts, even if the parent retains an earlier render.
 *
 * @param props - Pane state, runtime, visibility, and close operation.
 * @param props.pane - Document pane holding the current editor acquisition.
 * @param props.active - Whether the editor panel is active.
 * @param props.tabs - Whether inactive panels are hidden.
 * @param props.runtime - Runtime holding seed acquisitions.
 * @param props.close - Callback that removes and releases a pane.
 * @returns The editor pane, or null after its acquisition has been released.
 */
function DocumentPane({ pane, active, tabs, runtime, close }: DocumentPaneProps) {
  if (!pane.reactEditor) {
    return null;
  }
  return (
    <section className="multi-editor-pane" data-document-pane={pane.id} hidden={tabs && !active}>
      <button type="button" onClick={() => close(pane)}>
        Close {pane.id}
      </button>
      <button
        type="button"
        onClick={() => pane.mode.set(pane.mode.get() === "block" ? "edgeless" : "block")}
      >
        Toggle mode
      </button>
      <EditorPanel
        mode={pane.mode}
        editor={pane.reactEditor}
        active={active}
        onReady={() => {
          const seed = runtime.seeded.get(pane.id);
          if (seed) {
            runtime.seeded.delete(pane.id);
            void seed.release().catch(console.error);
          }
        }}
      >
        <DemoEditorSurface />
      </EditorPanel>
    </section>
  );
}

/** Session-only demo: document views acquire models and all tabs share one runtime. */
export function DocumentsDemo() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room") ?? "embedding-demo";
  const tabs = params.get("tabs") === "1";
  const [runtime, setRuntime] = useState<Runtime>();
  const [panes, setPanes] = useState<Pane[]>([]);
  const [activeTab, setActiveTab] = useState<string>();
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    const livePanes = new Set<Pane>();
    const channels = new Map<string, number>();
    const registry = new YjsDocumentRegistry(room);
    const database = new DemoDatabase(registry.root);
    const storage = new DocumentStorage({
      registry,
      createDocumentModel: (crdt) => new DBDocumentModel(crdt, database),
      lookupDocumentIds: async (blockId) => database.findDocumentIdsWithBlock(blockId),
      createProviders: (channel) => {
        const provider =
          params.get("provider") === "webrtc"
            ? new WebRTCProvider(channel, {
                signaling: params.getAll("signaling").length
                  ? params.getAll("signaling")
                  : undefined,
              })
            : new BroadcastChannelProvider(channel);
        channels.set(channel, (channels.get(channel) ?? 0) + 1);
        return [provider];
      },
      onError: (failure) => {
        if (active) {
          setError(String(failure));
        }
      },
    });
    const prepared = new Map<string, DocumentModel>();
    const editor = new EditorStorage({
      openDocument: async (id) => {
        const document = prepared.get(id);
        prepared.delete(id);
        return document ?? storage.openDocument(id);
      },
      lookupDocumentIds: (id, options) => storage.findDocumentIdsWithBlock(id, options),
      subscribeDocumentIds: (listener) => {
        const registrySubscription = storage.subscribe(listener);
        const databaseSubscription = database.subscribe(listener);
        return () => {
          registrySubscription();
          databaseSubscription();
        };
      },
      createEditor: (editor) =>
        createReactEditor({
          editor,
          extensions: [
            standardPreset(),
            pageDragExtension(),
            ...edgelessPreset(),
            embeddingExtension(),
          ],
        }),
    });
    const seeded = new Map<string, EditorAcquisition>();
    setRuntime({ storage, editor, seeded });
    const refresh = () => {
      if (active) {
        setIds(storage.getDocumentIds());
      }
    };
    const unsubscribe = storage.subscribe(() => {
      storage.getDocumentIds().forEach((id) => database.openDocument(id));
      refresh();
    });
    const open = async (id: string) => {
      if (!active) {
        return;
      }
      const acquisition = await editor.acquireEditor(id);
      if (!active) {
        await acquisition.release();
        return;
      }
      const pane: Pane = {
        id,
        instanceId: crypto.randomUUID(),
        reactEditor: acquisition.editor,
        mode: new ModeManager(),
        release: acquisition.release,
      };
      livePanes.add(pane);
      setPanes((current) => [...current, pane]);
      setActiveTab(pane.instanceId);
    };
    const create = async (id: string, blocks: Parameters<DocumentStorage["create"]>[1]) => {
      const model = await storage.create(id, blocks);
      if (!active) {
        await model.destroy();
        return;
      }
      prepared.set(id, model);
      seeded.set(id, await editor.acquireEditor(id));
    };
    const seed = async () => {
      await storage.ready;
      if (!active) {
        return;
      }
      if (params.get("join") !== "1") {
        const sourceId = `${room}:source-block`;
        await create("source", [
          {
            id: sourceId,
            ...paragraphBlockFactory.createEmptyBlock(),
            content: "Source text",
            children: Array.from(
              { length: 2 + Number(params.get("repeat") ?? 0) },
              (value, index) => ({
                id: `${room}:child-${index}`,
                ...paragraphBlockFactory.createEmptyBlock(),
                content: `Source child ${index}`,
              }),
            ),
          },
        ]);
        await create("references", [
          {
            id: `${room}:reference-heading`,
            ...paragraphBlockFactory.createEmptyBlock(),
            content: "Live source references",
          },
          {
            id: `${room}:embed-1`,
            type: EMBEDDING_BLOCK_TYPE,
            props: { targetDocumentId: "source", targetBlockId: sourceId },
          },
          {
            id: `${room}:embed-2`,
            type: EMBEDDING_BLOCK_TYPE,
            props: { targetDocumentId: "source", targetBlockId: sourceId },
          },
        ]);
        await open("source");
        await open("references");
      }
      const user = params.get("user");
      if (user) {
        const id = `private-${user}`;
        await create(id, [
          {
            id: `${room}:source-block`,
            ...paragraphBlockFactory.createEmptyBlock(),
            content: `Only opened by ${user}`,
          },
        ]);
        await open(id);
      }
      refresh();
    };
    void seed().catch((failure) => {
      if (active) {
        setError(String(failure));
      }
    });
    const inspection = { storage, registry, panes: livePanes, open, editor, database, channels };
    (window as unknown as { __rivtoDocuments?: typeof inspection }).__rivtoDocuments = inspection;
    return () => {
      active = false;
      unsubscribe();
      delete (window as unknown as { __rivtoDocuments?: unknown }).__rivtoDocuments;
      void editor
        .destroy()
        .then(() => storage.destroy())
        .catch(console.error)
        .finally(() => database.destroy());
    };
    // Route options are fixed for this demo mount.
  }, []);

  const open = (id: string) => {
    const inspection = (
      window as unknown as {
        __rivtoDocuments?: {
          /**
           * Opens the requested persisted document in the document demo.
           *
           * @param id - Stable ID of the record or registration to access.
           */
          open(id: string): Promise<void>;
        };
      }
    ).__rivtoDocuments;
    void inspection?.open(id);
  };
  const close = (pane: Pane) => {
    setPanes((current) => {
      const next = current.filter((entry) => entry !== pane);
      if (activeTab === pane.instanceId) {
        setActiveTab(next[0]?.instanceId);
      }
      return next;
    });
    (window as unknown as { __rivtoDocuments: { panes: Set<Pane> } }).__rivtoDocuments.panes.delete(
      pane,
    );
    // React may retain the previous pane state after the pane is removed.
    pane.reactEditor = undefined;
    void pane.release().catch(console.error);
    const seed = runtime?.seeded.get(pane.id);
    if (seed && !panes.some((other) => other !== pane && other.id === pane.id)) {
      runtime!.seeded.delete(pane.id);
      void seed.release().catch(console.error);
    }
  };
  return (
    <EditorStorageContext.Provider value={runtime?.editor}>
      <div>
        <header className="sync-editor-banner">
          <span>Document views · room={room}</span>
          {ids.map((id) => (
            <button type="button" key={id} onClick={() => open(id)}>
              Open {id}
            </button>
          ))}
          <span>Closed documents can be reopened.</span>
        </header>
        {error && <p role="alert">{error}</p>}
        {tabs && (
          <div role="tablist" aria-label="Open documents">
            {panes.map((pane) => (
              <button
                role="tab"
                type="button"
                key={pane.instanceId}
                aria-selected={activeTab === pane.instanceId}
                onClick={() => setActiveTab(pane.instanceId)}
              >
                {pane.id}
              </button>
            ))}
          </div>
        )}
        <div className="multi-editor-page">
          {runtime &&
            panes.map((pane) => (
              <DocumentPane
                key={pane.instanceId}
                pane={pane}
                runtime={runtime}
                tabs={tabs}
                active={!tabs || activeTab === pane.instanceId}
                close={close}
              />
            ))}
        </div>
      </div>
    </EditorStorageContext.Provider>
  );
}
