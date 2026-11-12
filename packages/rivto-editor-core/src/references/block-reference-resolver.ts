import type {
  ReferencedDocument,
  ReferencedEditor,
  BlockReferenceSource,
  BlockReferenceOptions,
  BlockReference,
  BlockResolution,
} from "./types";
import { waitWithAbort } from "./wait-with-abort";
import { releaseAfterCall } from "@chulane/rivto-utils";

/** Resolves document-qualified block references and observes source relocation. */
export class BlockReferenceResolver<
  Model extends ReferencedDocument = ReferencedDocument,
  Editor extends ReferencedEditor<Model> = ReferencedEditor<Model>,
> {
  private readonly locationSubscriptions = new Set<() => void>();
  private destroyed = false;
  /**
   * Borrows addressed document reads and optional host metadata without acquiring content.
   *
   * The host owns loaded documents and editors. This resolver owns only its
   * location subscriptions; constructing it does not load or subscribe to anything.
   *
   * @param storage - Open document cache exposing only lookup and availability observation.
   * @param options - Host metadata and resolution policies.
   */
  constructor(
    private storage: BlockReferenceSource<Model, Editor> | undefined,
    private options: BlockReferenceOptions,
  ) {}
  /**
   * Resolves a document-qualified reference without acquiring document content.
   * The preferred loaded document is checked first. Application metadata supplies
   * unloaded candidates; otherwise only loaded documents can participate in fallback.
   * An unloaded preferred address without a metadata lookup is retained until its
   * view loads it, since provider attachment does not prove remote data has arrived.
   * Hosts with asynchronous remote content supply metadata listing its source or a
   * custom resolver to distinguish missing blocks from content still in transit.
   * @param reference - Persisted preferred document and document-local block ID.
   * @param options - Cancellation for this request, including custom resolvers.
   * @returns Preferred match, or first sorted fallback with an ambiguity flag; absence has no documentId.
   * @throws On cancellation, destruction, or application lookup failure; failures never trigger fallback.
   */
  async resolveBlock(
    reference: BlockReference,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BlockResolution> {
    this.assertActive();
    options.signal?.throwIfAborted();
    let pending: Promise<BlockResolution>;
    if (this.options.resolveBlock) {
      pending = this.options.resolveBlock(reference, options);
    } else {
      pending = this.resolveDefault(reference, options);
    }
    const result = await waitWithAbort(pending, options.signal);
    this.assertActive();
    options.signal?.throwIfAborted();
    return result;
  }

  /**
   * Observes the resolved document without acquiring or loading its content.
   *
   * The last known identity is retained after deletion so an acquiring view can
   * keep source history alive. Direct references observe only their preferred
   * source; unresolved or fallback references observe loaded candidates as well.
   * Ordinary text changes do not perform another location search.
   * Each search publishes its result or error without scheduling another attempt.
   * The first notification follows completion of the initial search; subscribing
   * does not publish a synthetic missing result before that search completes.
   *
   * @param reference - Persisted preferred document and document-local target ID.
   * @param listener - Receives a completed resolution, missing location, or lookup error.
   * @returns Cleanup cancelling pending searches and removing node/storage subscriptions.
   * @throws If this resolver has been destroyed.
   */
  subscribeBlockLocation(
    reference: BlockReference,
    listener: (resolution: BlockResolution, error?: unknown) => void,
  ): () => void {
    this.assertActive();
    const subscription = new BlockLocationSubscription(
      this,
      () => this.requireStorage(),
      this.locationSubscriptions,
      reference,
      listener,
    );
    return subscription.subscribe();
  }

  /**
   * Locates the first matching block among open documents without loading or traversing forests.
   * @param blockId - Document-local identity to find.
   * @returns Matching single editor in sorted document ID order, or undefined when absent.
   * Multiple documents may contain the ID; use resolveBlock when ambiguity matters.
   * @throws If this resolver has been destroyed.
   */
  findEditorWithBlock(blockId: string): Editor | undefined {
    return this.requireStorage()
      .getEditors()
      .filter((editor) => editor.blocks.hasBlock(blockId))
      .sort((a, b) => a.getDocument().id.localeCompare(b.getDocument().id))[0];
  }
  /**
   * Finds the first loaded containing document without acquiring another consumer.
   *
   * @param blockId - Document-local identity.
   * @returns First loaded containing model in sorted document ID order, or undefined.
   * @throws If this resolver has been destroyed.
   */
  findDocumentWithBlock(blockId: string): Model | undefined {
    return this.findEditorWithBlock(blockId)?.getDocument();
  }

  /**
   * Cancels outstanding location observers; documents remain owned by storage.
   *
   * Releases borrowed storage and host options after cleanup, even if cleanup throws.
   *
   * @returns Subscriptions are released unless a delegated disposer throws.
   * @throws Propagates a subscription cleanup failure.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    try {
      this.locationSubscriptions.forEach((cleanup) => cleanup());
    } finally {
      this.storage = undefined;
      this.options = {};
    }
  }

  /**
   * Resolves a block reference using its preferred document, optional index lookup, and loaded documents.
   *
   * @param reference - Block ID and preferred document identity to resolve.
   * @param options - Optional abort signal forwarded to the document index lookup.
   * @returns Preferred or first sorted document match with ambiguity metadata; the document ID can be undefined.
   */
  private async resolveDefault(
    reference: BlockReference,
    options: { readonly signal?: AbortSignal },
  ): Promise<BlockResolution> {
    const preferred = this.requireStorage().getDocument(reference.documentId);
    if (preferred?.blocks.hasBlock(reference.blockId)) {
      return { documentId: reference.documentId, ambiguous: false };
    }
    if (!preferred && reference.documentId && !this.options.lookupDocumentIds) {
      return { documentId: reference.documentId, ambiguous: false };
    }
    const indexed = (await this.options.lookupDocumentIds?.(reference.blockId, options)) ?? [];
    const ids = [
      ...new Set([
        ...indexed,
        ...this.requireStorage()
          .getDocuments()
          .filter((model) => model.blocks.hasBlock(reference.blockId))
          .map((model) => model.id),
      ]),
    ].sort();
    if (ids.includes(reference.documentId)) {
      return { documentId: reference.documentId, ambiguous: false };
    }
    return { documentId: ids[0], ambiguous: ids.length > 1 };
  }
  /**
   * Reads the borrowed source while this resolver is active.
   *
   * @returns The storage supplying loaded documents and subscriptions.
   * @throws If this resolver has been destroyed.
   */
  private requireStorage(): BlockReferenceSource<Model, Editor> {
    if (!this.storage) {
      throw new Error("Block reference resolver is destroyed");
    }
    return this.storage;
  }

  /**
   * Guards access after resolver destruction.
   *
   * @throws If this block reference resolver has been destroyed.
   */
  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("Block reference resolver is destroyed");
    }
  }
}

/**
 * Owns one block-location search and its borrowed document observations.
 *
 * The resolver owns the returned cleanup; the observed models and registry remain
 * borrowed. Search generations discard stale asynchronous results after refresh.
 */
class BlockLocationSubscription<
  Model extends ReferencedDocument,
  Editor extends ReferencedEditor<Model>,
> {
  private readonly controller = new AbortController();
  private readonly watched = new Map<Model, () => void>();
  private location: BlockResolution = { ambiguous: false };
  private failed = false;
  private settled = false;
  private generation = 0;

  /**
   * Captures the resolver and registry needed by one location observer.
   *
   * @param resolver - Borrowed operation that resolves the captured reference.
   * @param source - Reads the resolver's borrowed document source while it remains active.
   * @param subscriptions - Resolver-owned cleanup set updated on subscription and release.
   * @param reference - Preferred document and document-local block identity.
   * @param listener - Receives completed resolutions or lookup errors.
   */
  constructor(
    private readonly resolver: Pick<BlockReferenceResolver<Model, Editor>, "resolveBlock">,
    private readonly source: () => Pick<
      BlockReferenceSource<Model, Editor>,
      "getDocument" | "getDocuments" | "subscribeDocuments"
    >,
    private readonly subscriptions: Pick<Set<() => void>, "add" | "delete">,
    private readonly reference: BlockReference,
    private readonly listener: (resolution: BlockResolution, error?: unknown) => void,
  ) {}

  /**
   * Subscribes to availability and starts the initial source lookup.
   *
   * @returns An idempotent cleanup that cancels lookup and removes owned observations.
   * @throws If registry or block observation setup fails.
   */
  subscribe(): () => void {
    const unsubscribe = this.source().subscribeDocuments(this.refresh);
    const cleanup = releaseAfterCall(() => {
      this.controller.abort();
      unsubscribe();
      this.subscriptions.delete(cleanup);
      this.watched.forEach((stop) => stop());
      this.watched.clear();
    });
    this.subscriptions.add(cleanup);
    this.refresh();
    return cleanup;
  }

  /**
   * Starts one location search and supersedes results from earlier searches.
   *
   * Registry and source-presence changes may start another search through
   * the subscriptions below; failed or missing results do not schedule one.
   *
   * @returns Scheduling of one lookup and publication of its current result or error.
   */
  private search(): void {
    const current = ++this.generation;
    // CRDT structure observers can run before every record in a transaction is visible.
    queueMicrotask(() => {
      if (this.controller.signal.aborted || current !== this.generation) {
        return;
      }
      void this.resolver
        .resolveBlock(this.reference, { signal: this.controller.signal })
        .then((result) => {
          if (this.controller.signal.aborted || current !== this.generation) {
            return;
          }
          const next = result.documentId
            ? result
            : { ...result, documentId: this.location.documentId };
          if (
            !this.settled ||
            next.documentId !== this.location.documentId ||
            next.ambiguous !== this.location.ambiguous ||
            this.failed
          ) {
            this.failed = false;
            this.settled = true;
            this.location = next;
            this.listener(next);
            this.watch();
          }
        })
        .catch((error) => {
          if (!this.controller.signal.aborted && current === this.generation) {
            this.failed = true;
            this.listener(this.location, error);
          }
        });
    });
  }

  /**
   * Watches the preferred source or loaded candidates for block presence changes.
   *
   * @returns Subscriptions match the currently relevant loaded documents.
   * @throws If a document lookup or subscription fails.
   */
  private watch(): void {
    const direct =
      (!this.location.documentId || this.location.documentId === this.reference.documentId) &&
      this.source().getDocument(this.reference.documentId)?.blocks.hasBlock(this.reference.blockId);
    const models = new Set(
      direct
        ? [this.source().getDocument(this.reference.documentId)!]
        : this.source().getDocuments(),
    );
    this.watched.forEach((unsubscribe, model) => {
      if (!models.has(model)) {
        unsubscribe();
        this.watched.delete(model);
      }
    });
    models.forEach((model) => {
      if (!this.watched.has(model)) {
        let present = model.blocks.hasBlock(this.reference.blockId);
        this.watched.set(
          model,
          model.blocks.subscribeBlockNode(this.reference.blockId, () => {
            queueMicrotask(() => {
              if (this.controller.signal.aborted) {
                return;
              }
              const next = model.blocks.hasBlock(this.reference.blockId);
              if (next !== present) {
                present = next;
                this.watch();
                this.search();
              }
            });
          }),
        );
      }
    });
  }

  /**
   * Reconciles watched documents and schedules a fresh location search.
   *
   * @returns Current sources are watched and a lookup is scheduled.
   * @throws If reconciling document observations fails.
   */
  private readonly refresh = (): void => {
    this.watch();
    this.search();
  };
}
