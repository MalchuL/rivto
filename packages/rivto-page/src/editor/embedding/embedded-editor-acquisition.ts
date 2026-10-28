/** One retained source editor; its provider owns the editor's eventual destruction. */
export interface SourceEditorLease<Editor> {
  readonly editor: Editor;
  /**
   * Releases this consumer without releasing other occurrences of the same editor.
   *
   * @returns A promise resolving when the provider finishes this release.
   * @throws Rejects when provider cleanup fails.
   */
  release(): Promise<void>;
}

/** The only loading capability borrowed by an embedded view. */
export interface SourceEditorProvider<Editor> {
  /**
   * Retains a source editor for one independent view.
   *
   * @param documentId - Stable document identity to acquire.
   * @param options - Cancellation for this consumer; other consumers remain independent.
   * @returns A promise resolving with this consumer's lease on a shared editor.
   * @throws Rejects when loading fails or the consumer is cancelled.
   */
  acquireEditor(
    documentId: string,
    options: { readonly signal?: AbortSignal },
  ): Promise<SourceEditorLease<Editor>>;
}

/** Detached acquisition result; both fields are absent before loading completes. */
export interface EmbeddedEditorSnapshot<Editor> {
  readonly editor?: Editor;
  readonly error?: unknown;
}

/** Owns the asynchronous lease of one embedded occurrence without creating a document model. */
export class EmbeddedEditorAcquisition<Editor> {
  private readonly abort = new AbortController();
  private lease: SourceEditorLease<Editor> | undefined;
  private started = false;

  /**
   * Borrows a provider and callbacks without starting a request.
   *
   * Storage shares loading between consumers. Cancellation releases only this
   * acquisition; a late completion after destruction is released immediately.
   * A rejected acquisition publishes its error without automatically retrying.
   * Nested views create independent acquisitions even when they share an editor.
   *
   * @param provider - Host-owned editor loader and reference counter.
   * @param documentId - Source identity fixed for this occurrence's acquisition.
   * @param publish - Receives a loaded editor or load error while this acquisition is active.
   * @param reportError - Receives asynchronous release or publication failures, including after destruction.
   */
  constructor(
    private readonly provider: SourceEditorProvider<Editor>,
    private readonly documentId: string,
    private readonly publish: (snapshot: EmbeddedEditorSnapshot<Editor>) => void,
    private readonly reportError: (error: unknown) => void,
  ) {}

  /**
   * Starts at most one asynchronous request for this acquisition.
   *
   * @returns Loading is scheduled; repeated calls and calls after destruction do nothing.
   */
  start(): void {
    if (this.started || this.abort.signal.aborted) {
      return;
    }
    this.started = true;
    void this.load().catch(this.reportError);
  }

  /**
   * Cancels this consumer and releases its acquired editor once.
   *
   * A provider that finishes after cancellation is still released when it resolves.
   * Release failures are reported through the constructor callback rather than
   * discarded by a synchronous view cleanup.
   *
   * @returns Cancellation is signalled and any current lease release is started.
   */
  destroy(): void {
    this.abort.abort();
    void this.release().catch(this.reportError);
  }

  /**
   * Acquires the source and publishes only while this occurrence remains active.
   *
   * @returns Completion after publication or release of a cancelled late acquisition.
   * @throws If publication or release fails; start reports that failure to the host.
   */
  private async load(): Promise<void> {
    try {
      this.lease = await this.provider.acquireEditor(this.documentId, {
        signal: this.abort.signal,
      });
    } catch (error) {
      if (!this.abort.signal.aborted) {
        this.publish({ error });
      }
      return;
    }
    if (this.abort.signal.aborted) {
      await this.release();
    } else {
      this.publish({ editor: this.lease.editor });
    }
  }

  /**
   * Takes and releases the current lease, preventing duplicate release during races.
   *
   * @returns Completion after provider cleanup, or immediately without a current lease.
   * @throws Propagates provider cleanup failures to the calling lifecycle operation.
   */
  private async release(): Promise<void> {
    const lease = this.lease;
    this.lease = undefined;
    await lease?.release();
  }
}
