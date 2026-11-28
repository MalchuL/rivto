import type { DocumentModel } from "@chulane/document-model";
import { UNSAFE_HTML_BLOCK_TYPE } from "../constants";

/** One host-controlled capability requested by the authored HTML. */
export type HtmlPermission = "editorAccess";

/** Identifies a permission for one exact source within the provider's document. */
export interface HtmlPermissionRequest {
  readonly blockId: string;
  readonly source: string;
  readonly permission: HtmlPermission;
}

/** A document policy can override the individually approved source. */
export type HtmlPermissionDecision = "denied" | "block" | "document";

/** Document identity and node observation borrowed for an installation's lifetime. */
export type HtmlPermissionDocument = Pick<DocumentModel, "id"> & {
  readonly blocks: Pick<DocumentModel["blocks"], "getBlockNode" | "subscribeBlockNode">;
};

/** Host policy for one installed document. */
export interface HtmlPermissions {
  /**
   * Reads the effective permission synchronously, including host overrides.
   *
   * @param request - Exact source and capability being checked.
   * @returns The authority granting access, or denied by default.
   */
  read(request: HtmlPermissionRequest): HtmlPermissionDecision;
  /**
   * Saves an individual decision after the source draft is committed.
   *
   * @param request - Saved source and requested capability.
   * @param allow - Whether to approve that source.
   * @returns Subscribers can read the new decision.
   */
  write(request: HtmlPermissionRequest, allow: boolean): void;
  /**
   * Observes changes to effective decisions in this document.
   *
   * @param listener - Called when consumers should read their decision again.
   * @returns A function that unsubscribes this listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Releases installation-owned observers.
   *
   * @returns Storage records survive disposal.
   */
  dispose(): void;
}

/**
 * Creates the browser permission provider for one open document.
 *
 * Each document namespaces independent block keys so different tabs editing different
 * grants cannot overwrite each other. The private versioned value is the approved HTML.
 * Source observers outlive rendered occurrences and revoke on change, conversion or deletion.
 *
 * @param document - Identity and canonical block reads and subscriptions for this installation.
 * @returns A provider that denies access when its storage is unavailable.
 */
export function createLocalHtmlPermissions(document: HtmlPermissionDocument): HtmlPermissions {
  return new LocalHtmlPermissions(document);
}

/** Browser-owned decisions and observers scoped to one extension installation. */
class LocalHtmlPermissions implements HtmlPermissions {
  private readonly prefix: string;
  private readonly listeners = new Set<() => void>();
  private readonly watched = new Map<string, () => void>();
  private readonly storage?: Storage;

  /**
   * Restores observers for previously approved sources in this document.
   *
   * @param document - Canonical nodes to observe independently of mounted views.
   */
  constructor(private readonly document: HtmlPermissionDocument) {
    this.prefix = "rivto:html-permissions:v1:" + encodeURIComponent(document.id) + ":editorAccess:";
    try {
      this.storage = window.localStorage;
    } catch {
      return;
    }
    window.addEventListener("storage", this.changed);
    for (const key of Object.keys(this.storage)) {
      if (key.startsWith(this.prefix)) {
        this.watch(key.slice(this.prefix.length));
      }
    }
  }

  /**
   * Checks whether this exact source has the requested capability.
   *
   * @param request - Source and block identity supplied by the host.
   * @returns Block approval or denial for an unknown or unreadable decision.
   */
  read(request: HtmlPermissionRequest): HtmlPermissionDecision {
    return request.permission === "editorAccess" &&
      this.sourceFor(request.blockId) === request.source
      ? "block"
      : "denied";
  }

  /**
   * Changes only this block's individual permission.
   *
   * @param request - Approved source and capability.
   * @param allow - Whether to store or remove approval.
   * @returns Local readers have been notified after a successful write.
   * @throws When browser storage refuses the decision.
   */
  write(request: HtmlPermissionRequest, allow: boolean): void {
    if (
      request.permission === "editorAccess" &&
      (allow || this.sourceFor(request.blockId) !== null)
    ) {
      this.save(request.blockId, allow ? request.source : null);
    }
  }

  /**
   * Observes effective changes to individual decisions for this document.
   *
   * @param listener - Callback that reads the updated permission.
   * @returns A disposer that removes this callback.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Detaches storage and block observers when the extension is removed.
   *
   * @returns Browser decisions remain available to future installations.
   */
  dispose(): void {
    if (this.storage) {
      window.removeEventListener("storage", this.changed);
    }
    this.watched.forEach((release) => release());
    this.watched.clear();
    this.listeners.clear();
  }

  /**
   * Reads a single approved source without trusting malformed storage.
   *
   * @param id - Canonical block ID.
   * @returns The stored source string or null for missing or unreadable decisions.
   */
  private sourceFor(id: string): string | null {
    try {
      const value: unknown = JSON.parse(this.storage?.getItem(this.prefix + id) ?? "null");
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }

  /**
   * Synchronizes a block observer with its persisted approval.
   *
   * @param id - Block whose storage entry may have changed.
   * @returns The observer is retained only while that block has a grant.
   */
  private watch(id: string): void {
    if (this.sourceFor(id) === null) {
      this.watched.get(id)?.();
      this.watched.delete(id);
    } else if (!this.watched.has(id)) {
      const validate = () => {
        const block = this.document.blocks.getBlockNode(id);
        const approved = this.sourceFor(id);
        if (
          approved !== null &&
          (block?.type !== UNSAFE_HTML_BLOCK_TYPE || block.content !== approved)
        ) {
          this.save(id, null);
        }
      };
      this.watched.set(id, this.document.blocks.subscribeBlockNode(id, validate));
      if (this.document.blocks.getBlockNode(id)) {
        validate();
      }
    }
  }

  /**
   * Writes one versioned permission and wakes readers in this window.
   *
   * @param id - Block receiving the decision.
   * @param source - Approved HTML, or null to revoke.
   * @returns Other windows receive the browser's native storage notification.
   * @throws When the browser refuses to persist a decision.
   */
  private save(id: string, source: string | null): void {
    if (!this.storage) {
      throw new Error("HTML permission storage is unavailable");
    }
    const key = this.prefix + id;
    if (source === null) {
      this.storage.removeItem(key);
    } else {
      this.storage.setItem(key, JSON.stringify(source));
    }
    window.dispatchEvent(new StorageEvent("storage", { key, storageArea: this.storage }));
  }

  /**
   * Refreshes observers and notifies readers after same-window or cross-tab storage changes.
   *
   * @param event - Browser storage mutation, including a full storage clear.
   * @returns Matching document listeners have been notified.
   */
  private readonly changed = (event: StorageEvent) => {
    if (
      event.storageArea !== this.storage ||
      (event.key !== null && !event.key.startsWith(this.prefix))
    ) {
      return;
    }
    if (event.key === null) {
      this.watched.forEach((_, id) => this.watch(id));
    } else {
      this.watch(event.key.slice(this.prefix.length));
    }
    this.listeners.forEach((listener) => listener());
  };
}
