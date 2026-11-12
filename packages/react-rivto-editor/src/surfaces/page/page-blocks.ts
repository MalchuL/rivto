import type { EditorBlockNode, PanelAPI } from "@chulane/rivto";
import type {
  BlockEditorBlocks,
  BlockEditorNodePatch,
  BlockEditorNodeSnapshot,
} from "@chulane/rivto-page";
import type { BlockBehaviorsApi } from "../../managers/blocks/block-behaviors-api";
import {
  PAGE_BLOCK_DECORATIONS_KEY,
  updatePageBlockDecorations,
  type PageBlockDecorationAdapter,
} from "../../blocks/page-block-decorations";
import type { SharedSpace } from "../../managers/extensions/shared-space";

/** Shared-space operations borrowed by the Page projection. */
interface PageBlockHostExtensions {
  readonly shared: Pick<SharedSpace, "getValue" | "subscribe">;
}

/** Editor capabilities borrowed by the Page projection. */
interface PageBlockHostEditor {
  readonly extensions: PageBlockHostExtensions;
}

/** Panel capabilities borrowed by the structural projection, without lifecycle ownership. */
interface PageBlockHost {
  readonly editor: PageBlockHostEditor;
  readonly blocks: Pick<
    PanelAPI["blocks"],
    | "getBlockNode"
    | "getRootIds"
    | "subscribeRootIds"
    | "subscribeBlockNode"
    | "updateBlock"
    | "deleteListProps"
  >;
  readonly document: {
    readonly blocks: Pick<
      PanelAPI["document"]["blocks"],
      "getBlockNode" | "getParentId" | "subscribeBlockNode"
    >;
    readonly blockListProps: Pick<PanelAPI["document"]["blockListProps"], "prepare">;
  };
  readonly rootBlockId: string | undefined;
  readonly batchUpdates: PanelAPI["batchUpdates"];
}

/** Projection tied to the existing model cache's immutable own-node identity. */
interface PageNodeProjection {
  readonly revision: number;
  readonly decorations: PageBlockDecorationAdapter | undefined;
  readonly snapshot: BlockEditorNodeSnapshot;
}

/** Host-owned structural projection; concrete content stays in the model's existing cache. */
export class PageBlocks implements BlockEditorBlocks {
  private readonly projections = new WeakMap<EditorBlockNode, PageNodeProjection>();

  /**
   * Borrows panel mutation boundaries and document hierarchy without attaching DOM.
   *
   * The hidden panel root remains readable for canonical child destinations, but
   * mutations still use panel commands and cannot edit an excluded root.
   *
   * @param panel - Addressed reads, bounded writes, canonical hierarchy and list-property policy.
   * @param behaviors - Live child-visibility rules and their registration revision.
   */
  constructor(
    private readonly panel: PageBlockHost,
    private readonly behaviors: Pick<
      BlockBehaviorsApi,
      "childrenVisible" | "childDropPlacement" | "subscribe" | "revision"
    >,
  ) {}

  /**
   * Exposes document roots only when this occurrence owns the whole document boundary.
   *
   * @returns Stable actual roots, or undefined when document-root drops would escape the panel.
   */
  getRootIds(): readonly string[] | undefined {
    return this.panel.rootBlockId === undefined ? this.panel.blocks.getRootIds() : undefined;
  }

  /**
   * Reads the actual parent of an accessible node, including a hidden panel boundary.
   *
   * @param blockId - Node whose ancestry is requested.
   * @returns Canonical parent ID, or undefined for a document root or inaccessible node.
   */
  getParentId(blockId: string): string | undefined {
    if (!this.panel.blocks.getBlockNode(blockId)) {
      return undefined;
    }
    return this.panel.document.blocks.getParentId(blockId) ?? undefined;
  }

  /**
   * Reads the panel's stable display roots without interpreting them as document roots.
   *
   * @returns Current display IDs from the existing panel cache.
   */
  getBlockIds(): readonly string[] {
    return this.panel.blocks.getRootIds();
  }

  /**
   * Observes changes to this panel's displayed roots independently of payload edits.
   *
   * @param listener - Callback rereading display IDs after a structural change.
   * @returns Disposer releasing the panel root subscription.
   */
  subscribeBlockIds(listener: () => void): () => void {
    return this.panel.blocks.subscribeRootIds(listener);
  }

  /**
   * Projects one cached model node without materializing its descendants.
   *
   * The WeakMap borrows the model cache's identities instead of maintaining a
   * second block cache or invalidation index. Behavior changes invalidate only
   * projections that are subsequently read. The shared decoration adapter also
   * invalidates cached projections when replaced. The default adapter uses
   * transparent shells for uncolored blocks so body decorations and whole-subtree
   * selection remain visible, and resolves palette colors to host CSS variables.
   *
   * @param blockId - Accessible node or the hidden panel boundary.
   * @returns Stable structural projection, or undefined when unavailable.
   * @throws Propagates host node reads and visibility-rule failures.
   */
  getBlockNode(blockId: string): BlockEditorNodeSnapshot | undefined {
    const node = this.readNode(blockId);
    if (!node) {
      return undefined;
    }
    const cached = this.projections.get(node);
    const decorations = this.panel.editor.extensions.shared
      .getValue<PageBlockDecorationAdapter>(PAGE_BLOCK_DECORATIONS_KEY)
      ?.get();
    if (cached?.revision === this.behaviors.revision && cached.decorations === decorations) {
      return cached.snapshot;
    }
    const presentation = decorations?.read(node) ?? { checked: false, color: "transparent" };
    const snapshot: BlockEditorNodeSnapshot = {
      id: node.id,
      type: node.type,
      childIds: node.childIds,
      ...presentation,
      collapsed: !this.behaviors.childrenVisible(node),
      dropPlacement: this.behaviors.childDropPlacement(node),
    };
    this.projections.set(node, { revision: this.behaviors.revision, decorations, snapshot });
    return snapshot;
  }

  /**
   * Observes the addressed model node and changes to installed visibility rules.
   *
   * @param blockId - Accessible identity or hidden boundary to observe.
   * @param listener - Callback rereading its current structural projection.
   * @returns Idempotent disposer attempting every subscription cleanup.
   * @throws Setup rolls back on subscription failure; cleanup aggregates failures.
   */
  subscribeBlockNode(blockId: string, listener: () => void): () => void {
    const source =
      blockId === this.panel.rootBlockId ? this.panel.document.blocks : this.panel.blocks;
    const releaseNode = source.subscribeBlockNode(blockId, listener);
    let releaseBehavior: (() => void) | undefined;
    let releaseDecorations: () => void;
    try {
      releaseBehavior = this.behaviors.subscribe(listener);
      releaseDecorations = this.panel.editor.extensions.shared.subscribe(
        PAGE_BLOCK_DECORATIONS_KEY,
        listener,
      );
    } catch (error) {
      const errors: unknown[] = [error];
      try {
        releaseBehavior?.();
      } catch (cleanupError) {
        errors.push(cleanupError);
      }
      try {
        releaseNode();
      } catch (cleanupError) {
        errors.push(cleanupError);
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "Page node subscription failed");
      }
      throw error;
    }
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const errors: unknown[] = [];
      for (const release of [releaseDecorations, releaseBehavior, releaseNode]) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Page node subscription cleanup failed");
      }
    };
  }

  /**
   * Converts Page controls to one history batch of bounded host writes, preserving unrelated list properties.
   *
   * @param blockId - Existing node within the panel's editable boundary.
   * @param patch - Structural decorations interpreted by the current adapter.
   * @returns The validated panel update and its synchronous notifications have completed.
   * @throws If the node is inaccessible, the adapter is missing or rejects the patch, or panel validation fails.
   */
  updateBlockNode(blockId: string, patch: BlockEditorNodePatch): void {
    updatePageBlockDecorations(this.panel, blockId, patch);
  }

  /**
   * Reads only a panel member or its explicitly configured hidden boundary.
   *
   * @param blockId - Requested model identity.
   * @returns Existing cached node, or undefined outside the occurrence.
   */
  private readNode(blockId: string): EditorBlockNode | undefined {
    return (
      this.panel.blocks.getBlockNode(blockId) ??
      (blockId === this.panel.rootBlockId
        ? this.panel.document.blocks.getBlockNode(blockId)
        : undefined)
    );
  }
}
