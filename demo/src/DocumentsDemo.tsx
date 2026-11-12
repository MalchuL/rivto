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
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { DBDocumentModel, DemoDatabase } from "./database";
import { DemoEditorSurface } from "./editor-surface";

/** State retained for one acquired document pane. */
interface DocumentPaneState {
  readonly mode: ModeManager;
  id: string;
  instanceId: string;
  reactEditor: ReactEditorApi | undefined;
  /**
   * Releases the pane's editor and document resources asynchronously.
   *
   * @returns A promise resolving after the pane's acquisition is released.
   * @throws If releasing the acquisition fails.
   */
  release(): Promise<void>;
}
/** Editor resources exposed to the document demo view. */
interface DocumentDemoRuntime {
  /** Shared editor cache owned by the active session. */
  editor: EditorStorage;
  /** Seed acquisitions retained until their first pane is ready. */
  seeded: Map<string, EditorAcquisition>;
}

/** State needed to render and release one document pane. */
interface DocumentPaneProps {
  /** Pane and its current editor acquisition. */
  pane: DocumentPaneState;
  /** Whether this pane is the active tab. */
  active: boolean;
  /** Whether inactive panes are hidden. */
  tabs: boolean;
  /** Runtime holding seed acquisitions. */
  runtime: Pick<DocumentDemoRuntime, "seeded">;
  /**
   * Removes a pane and releases its editor acquisition.
   *
   * @param pane - Pane to close.
   * @returns The pane is removed and its release is started.
   */
  close: (pane: DocumentPaneState) => void;
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

/**
 * Creates the demo registry, session database, and document provider owner.
 *
 * The caller closes the storage and database after its editor consumers release them.
 * Provider connection counts remain available for demo inspection.
 *
 * @param room - Shared registry room identity.
 * @param params - Route options selecting provider and optional WebRTC signaling servers.
 * @param onError - Reports asynchronous registry or provider failures while the demo is active.
 * @returns Document resources and per-channel provider creation counts.
 * @throws If registry, database, or storage construction fails.
 */
function createDemoDocumentStorage(
  room: string,
  params: URLSearchParams,
  onError: (error: unknown) => void,
) {
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
              signaling: params.getAll("signaling").length ? params.getAll("signaling") : undefined,
            })
          : new BroadcastChannelProvider(channel);
      channels.set(channel, (channels.get(channel) ?? 0) + 1);
      return [provider];
    },
    onError,
  });
  return { storage, registry, database, channels };
}

/**
 * Creates the demo's shared editor cache over document storage and database metadata.
 *
 * Models prepared by seeding are transferred to the cache on their first open.
 * The caller destroys the cache before closing its borrowed storage and database.
 *
 * @param storage - Document owner used to open models and look up source locations.
 * @param database - Session database supplying block-location notifications.
 * @param prepared - Seeded models awaiting transfer to the editor cache.
 * @returns An editor cache configured with the demo's standard extensions.
 * @throws If the registry or database subscription fails during construction.
 */
function createDemoEditorStorage(
  storage: Pick<DocumentStorage, "openDocument" | "findDocumentIdsWithBlock" | "subscribe">,
  database: Pick<DemoDatabase, "subscribe">,
  prepared: Map<string, DocumentModel>,
): EditorStorage {
  return new EditorStorage({
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
}

/**
 * Creates the shared source and reference documents and opens their first panes.
 *
 * @param room - Namespace used for stable demo block identities.
 * @param repeat - Additional source children for large-document scenarios.
 * @param create - Creates and retains a document until its first pane is ready.
 * @param open - Acquires and displays one document pane.
 * @returns A promise resolving after both documents are created and opened.
 * @throws If document creation or pane acquisition fails.
 */
async function seedReferenceDocuments(
  room: string,
  repeat: number,
  create: (id: string, blocks: Parameters<DocumentStorage["create"]>[1]) => Promise<void>,
  open: (id: string) => Promise<void>,
): Promise<void> {
  const sourceId = `${room}:source-block`;
  await create("source", [
    {
      id: sourceId,
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Source text",
      children: Array.from({ length: 2 + repeat }, (value, index) => ({
        id: `${room}:child-${index}`,
        ...paragraphBlockFactory.createEmptyBlock(),
        content: `Source child ${index}`,
      })),
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

/** Callbacks used to publish session changes to the document demo component. */
interface DemoSessionCallbacks {
  /**
   * Publishes the newly created editor cache and seed acquisitions.
   *
   * @param runtime - Editor cache and retained seed acquisitions for this session.
   * @returns The runtime has been published to the component.
   */
  onReady(runtime: DocumentDemoRuntime): void;
  /**
   * Adds a newly acquired pane and activates it.
   *
   * @param pane - Pane holding the acquired editor and release callback.
   * @returns The pane is queued for display.
   */
  onPaneOpened(pane: DocumentPaneState): void;
  /**
   * Publishes the current registry document identities.
   *
   * @param ids - Registered document identities.
   * @returns The document list is queued for display.
   */
  onDocumentsChanged(ids: string[]): void;
  /**
   * Reports an asynchronous session failure.
   *
   * @param error - Registry, provider, or seeding failure.
   * @returns The failure is queued for display.
   */
  onError(error: unknown): void;
}

/**
 * Creates an operation that acquires and publishes document panes for one session.
 *
 * An acquisition completed after session cleanup is released without opening a pane.
 *
 * @param editor - Shared editor cache that owns acquired models and runtimes.
 * @param livePanes - Session-owned set used by demo inspection.
 * @param isActive - Reports whether the session may still publish acquisitions.
 * @param onPaneOpened - Publishes and activates the new pane.
 * @returns An asynchronous operation that opens a document by identity.
 */
function createDemoPaneOpener(
  editor: Pick<EditorStorage, "acquireEditor">,
  livePanes: Set<DocumentPaneState>,
  isActive: () => boolean,
  onPaneOpened: (pane: DocumentPaneState) => void,
): (id: string) => Promise<void> {
  return async (id) => {
    if (!isActive()) {
      return;
    }
    const acquisition = await editor.acquireEditor(id);
    if (!isActive()) {
      await acquisition.release();
      return;
    }
    const pane: DocumentPaneState = {
      id,
      instanceId: crypto.randomUUID(),
      reactEditor: acquisition.editor,
      mode: new ModeManager(),
      release: acquisition.release,
    };
    livePanes.add(pane);
    onPaneOpened(pane);
  };
}

/**
 * Creates an operation that transfers newly seeded models to the editor cache.
 *
 * @param storage - Document storage creating the seeded model.
 * @param editor - Editor cache that acquires the prepared model.
 * @param prepared - Models waiting for their first cache acquisition.
 * @param seeded - Acquisitions retained until the first pane becomes ready.
 * @param isActive - Reports whether the session still accepts new models.
 * @returns An asynchronous document creation and acquisition operation.
 */
function createDemoDocumentCreator(
  storage: Pick<DocumentStorage, "create">,
  editor: Pick<EditorStorage, "acquireEditor">,
  prepared: Map<string, DocumentModel>,
  seeded: Map<string, EditorAcquisition>,
  isActive: () => boolean,
): (id: string, blocks: Parameters<DocumentStorage["create"]>[1]) => Promise<void> {
  return async (id, blocks) => {
    const model = await storage.create(id, blocks);
    if (!isActive()) {
      await model.destroy();
      return;
    }
    prepared.set(id, model);
    seeded.set(id, await editor.acquireEditor(id));
  };
}

/**
 * Seeds shared and optional private demo documents after registry initialization.
 *
 * @param storage - Registry readiness for this session.
 * @param room - Namespace used for seeded block identities.
 * @param params - Route options controlling joining, document size, and private user.
 * @param isActive - Reports whether the session still accepts seeded documents.
 * @param create - Creates and retains a document until its first pane is ready.
 * @param open - Acquires and displays a document pane.
 * @param refresh - Publishes current registry identities after seeding.
 * @returns A promise resolving after the requested documents have been seeded.
 * @throws If registry initialization, document creation, or pane acquisition fails.
 */
async function seedDemoSession(
  storage: Pick<DocumentStorage, "ready">,
  room: string,
  params: URLSearchParams,
  isActive: () => boolean,
  create: (id: string, blocks: Parameters<DocumentStorage["create"]>[1]) => Promise<void>,
  open: (id: string) => Promise<void>,
  refresh: () => void,
): Promise<void> {
  await storage.ready;
  if (!isActive()) {
    return;
  }
  if (params.get("join") !== "1") {
    await seedReferenceDocuments(room, Number(params.get("repeat") ?? 0), create, open);
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
}

/**
 * Creates a reporter that ignores failures after its session is closed.
 *
 * @param isActive - Reports whether the session can still update the component.
 * @param onError - Publishes an active session's failure.
 * @returns A callback that forwards failures only while the session is active.
 */
function createActiveErrorReporter(
  isActive: () => boolean,
  onError: (error: unknown) => void,
): (error: unknown) => void {
  return (error) => {
    if (isActive()) {
      onError(error);
    }
  };
}

/**
 * Starts one document demo session and returns its React effect cleanup.
 *
 * Acquisitions completed after cleanup are released instead of being published.
 * The session owns its database, registry, editor cache, and inspection state.
 *
 * @param room - Registry room and namespace for seeded block identities.
 * @param params - Route options fixed for the lifetime of this session.
 * @param callbacks - Component updates for runtime, panes, documents, and errors.
 * @returns Cleanup that starts releasing the session's resources.
 * @throws If synchronous resource creation or subscription fails.
 */
function startDemoSession(
  room: string,
  params: URLSearchParams,
  callbacks: DemoSessionCallbacks,
): () => void {
  let active = true;
  const livePanes = new Set<DocumentPaneState>();
  const reportError = createActiveErrorReporter(() => active, callbacks.onError);
  const { storage, registry, database, channels } = createDemoDocumentStorage(
    room,
    params,
    reportError,
  );
  const prepared = new Map<string, DocumentModel>();
  const editor = createDemoEditorStorage(storage, database, prepared);
  const seeded = new Map<string, EditorAcquisition>();
  callbacks.onReady({ editor, seeded });
  const refresh = () => {
    if (active) {
      callbacks.onDocumentsChanged(storage.getDocumentIds());
    }
  };
  const unsubscribe = storage.subscribe(() => {
    storage.getDocumentIds().forEach((id) => database.openDocument(id));
    refresh();
  });
  const open = createDemoPaneOpener(editor, livePanes, () => active, callbacks.onPaneOpened);
  const create = createDemoDocumentCreator(storage, editor, prepared, seeded, () => active);
  void seedDemoSession(storage, room, params, () => active, create, open, refresh).catch(
    reportError,
  );
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
}

/**
 * Requests a document pane from the active demo session.
 *
 * @param id - Registered document identity to open.
 * @returns The session starts acquisition when it is available.
 */
function openDemoDocument(id: string): void {
  const inspection = (
    window as unknown as {
      __rivtoDocuments?: {
        /**
         * Opens the requested persisted document in the document demo.
         *
         * @param id - Stable ID of the record or registration to access.
         * @returns A promise resolving after the pane is acquired or the session closes.
         * @throws If acquisition or cleanup fails.
         */
        open(id: string): Promise<void>;
      };
    }
  ).__rivtoDocuments;
  void inspection?.open(id);
}

/** Props used to render the document demo's session and pane controls. */
interface DocumentsDemoViewProps {
  /** Shared editor cache and retained seed acquisitions, once initialized. */
  readonly runtime: DocumentDemoRuntime | undefined;
  /** Registry room displayed in the header. */
  readonly room: string;
  /** Registered document IDs available to open. */
  readonly ids: readonly string[];
  /** Initialization failure to display, when present. */
  readonly error: string | undefined;
  /** Whether inactive panes are hidden behind tabs. */
  readonly tabs: boolean;
  /** Open document panes in display order. */
  readonly panes: readonly DocumentPaneState[];
  /** Instance ID of the active pane, when one exists. */
  readonly activeTab: string | undefined;
  /**
   * Activates an open pane.
   *
   * @param instanceId - Identity of the pane to activate.
   * @returns The active pane update is queued.
   */
  onActivate(instanceId: string): void;
  /**
   * Closes one pane and releases its acquisition.
   *
   * @param pane - Pane to remove.
   * @returns The pane removal and release are started.
   */
  onClose(pane: DocumentPaneState): void;
}

/**
 * Renders the tabs for open document panes.
 *
 * @param props - Open panes, active identity, and activation callback.
 * @param props.panes - Open panes in display order.
 * @param props.activeTab - Active pane instance identity, when present.
 * @param props.onActivate - Activates the selected pane instance.
 * @returns An accessible tab list for the open panes.
 */
function DocumentsDemoTabs({
  panes,
  activeTab,
  onActivate,
}: Pick<DocumentsDemoViewProps, "panes" | "activeTab" | "onActivate">) {
  return (
    <div role="tablist" aria-label="Open documents">
      {panes.map((pane) => (
        <button
          role="tab"
          type="button"
          key={pane.instanceId}
          aria-selected={activeTab === pane.instanceId}
          onClick={() => onActivate(pane.instanceId)}
        >
          {pane.id}
        </button>
      ))}
    </div>
  );
}

/**
 * Renders registered-document controls and the currently open panes.
 *
 * @param props - Session resources, presentation state, and pane actions.
 * @param props.runtime - Shared editor cache and seed acquisitions, when available.
 * @param props.room - Displayed registry room.
 * @param props.ids - Registered document identities.
 * @param props.error - Initialization error, when present.
 * @param props.tabs - Whether panes use tab visibility.
 * @param props.panes - Open panes in display order.
 * @param props.activeTab - Active pane instance identity, when present.
 * @param props.onActivate - Activates the selected pane instance.
 * @param props.onClose - Removes and releases the selected pane.
 * @returns Document controls and editor panes within the shared storage context.
 */
function DocumentsDemoView({
  runtime,
  room,
  ids,
  error,
  tabs,
  panes,
  activeTab,
  onActivate,
  onClose,
}: DocumentsDemoViewProps) {
  return (
    <EditorStorageContext.Provider value={runtime?.editor}>
      <div>
        <header className="sync-editor-banner">
          <span>Document views · room={room}</span>
          {ids.map((id) => (
            <button type="button" key={id} onClick={() => openDemoDocument(id)}>
              Open {id}
            </button>
          ))}
          <span>Closed documents can be reopened.</span>
        </header>
        {error && <p role="alert">{error}</p>}
        {tabs && <DocumentsDemoTabs panes={panes} activeTab={activeTab} onActivate={onActivate} />}
        <div className="multi-editor-page">
          {runtime &&
            panes.map((pane) => (
              <DocumentPane
                key={pane.instanceId}
                pane={pane}
                runtime={runtime}
                tabs={tabs}
                active={!tabs || activeTab === pane.instanceId}
                close={onClose}
              />
            ))}
        </div>
      </div>
    </EditorStorageContext.Provider>
  );
}

/**
 * Removes one pane and releases its editor and last retained seed acquisition.
 *
 * @param pane - Pane to close.
 * @param panes - Current pane list used to identify the final view of a document.
 * @param activeTab - Currently active pane identity, if any.
 * @param runtime - Session resources containing retained seed acquisitions.
 * @param setPanes - Queues the updated pane list.
 * @param setActiveTab - Queues a replacement active pane when necessary.
 * @returns The pane is removed and its acquisitions begin releasing.
 */
function closeDemoPane(
  pane: DocumentPaneState,
  panes: readonly DocumentPaneState[],
  activeTab: string | undefined,
  runtime: Pick<DocumentDemoRuntime, "seeded"> | undefined,
  setPanes: Dispatch<SetStateAction<DocumentPaneState[]>>,
  setActiveTab: Dispatch<SetStateAction<string | undefined>>,
): void {
  setPanes((current) => {
    const next = current.filter((entry) => entry !== pane);
    if (activeTab === pane.instanceId) {
      setActiveTab(next[0]?.instanceId);
    }
    return next;
  });
  (
    window as unknown as { __rivtoDocuments: { panes: Set<DocumentPaneState> } }
  ).__rivtoDocuments.panes.delete(pane);
  // React may retain the previous pane state after the pane is removed.
  pane.reactEditor = undefined;
  void pane.release().catch(console.error);
  const seed = runtime?.seeded.get(pane.id);
  if (seed && !panes.some((other) => other !== pane && other.id === pane.id)) {
    runtime!.seeded.delete(pane.id);
    void seed.release().catch(console.error);
  }
}

/**
 * Renders the session-only document demo with shared storage and editor runtimes.
 *
 * Document views acquire models independently; panes for the same document share
 * its runtime. Unmounting starts pane and editor cleanup, then closes storage
 * if editor cleanup succeeds; the demo database is cleaned up in either case.
 *
 * @returns Controls and document panes for the current demo session.
 */
export function DocumentsDemo() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room") ?? "embedding-demo";
  const tabs = params.get("tabs") === "1";
  const [runtime, setRuntime] = useState<DocumentDemoRuntime>();
  const [panes, setPanes] = useState<DocumentPaneState[]>([]);
  const [activeTab, setActiveTab] = useState<string>();
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    return startDemoSession(room, params, {
      onReady: setRuntime,
      onPaneOpened: (pane) => {
        setPanes((current) => [...current, pane]);
        setActiveTab(pane.instanceId);
      },
      onDocumentsChanged: setIds,
      onError: (failure) => setError(String(failure)),
    });
    // Route options are fixed for this demo mount.
  }, []);

  return (
    <DocumentsDemoView
      runtime={runtime}
      room={room}
      ids={ids}
      error={error}
      tabs={tabs}
      panes={panes}
      activeTab={activeTab}
      onActivate={setActiveTab}
      onClose={(pane) => closeDemoPane(pane, panes, activeTab, runtime, setPanes, setActiveTab)}
    />
  );
}
