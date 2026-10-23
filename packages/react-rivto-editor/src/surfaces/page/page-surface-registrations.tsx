import type { PanelAPI, ModeManagerApi } from "@chulane/rivto";
import type {
  BlockEditorApi,
  BlockWrapperProps as PageWrapperProps,
  BlockSlotProps as PageSlotProps,
} from "@chulane/rivto-page";
import { BlockChildrenIdContext } from "../../hooks/blocks/block-children-id-context";
import { useBlockNode } from "../../hooks/blocks/use-block";
import type { RenderersApi } from "../../managers/blocks/renderers-api";
import type { BlockRendererRegistration } from "../../managers/blocks/renderer-types";
import type { SurfacesApi } from "../../managers/surfaces/api";
import type {
  BlockSlotRegistration,
  BlockWrapperRegistration,
} from "../../managers/surfaces/types";

/** Registration-only Page capabilities borrowed by the panel's contribution owner. */
interface PageRegistrationTarget {
  readonly slots: Pick<BlockEditorApi["slots"], "register">;
  readonly wrappers: Pick<BlockEditorApi["wrappers"], "register">;
  readonly renderers: Pick<BlockEditorApi["renderers"], "register">;
}

/** Copies live host contributions into one occurrence without owning either registry. */
export class PageSurfaceRegistrations {
  private readonly slotRegistrations = new Map<Readonly<BlockSlotRegistration>, () => void>();
  private readonly wrapperRegistrations = new Map<Readonly<BlockWrapperRegistration>, () => void>();
  private readonly rendererRegistrations = new Map<BlockRendererRegistration, () => void>();
  private readonly subscriptions: Array<() => void> = [];
  private destroyed = false;
  private previousMode: ReturnType<ModeManagerApi["get"]> = "block";

  /**
   * Installs current Page contributions and observes later host extension changes.
   *
   * @param surfaces - Borrowed host registration reads and notifications.
   * @param renderers - Host content and layout registrations, observed once per occurrence.
   * @param page - Borrowed Page registration capabilities; destruction stays with its controller.
   * @param blocks - Addressed host snapshots used by live slot filters.
   * @param mode - Live occurrence presentation; omission uses writing-page contributions.
   * @throws Rolls back installed registrations when setup fails.
   */
  constructor(
    private readonly surfaces: Pick<
      SurfacesApi,
      "getBlockSlotRegistrations" | "getBlockWrapperRegistrations" | "subscribe"
    >,
    private readonly renderers: Pick<RenderersApi, "getRegistrations" | "subscribe">,
    private readonly page: PageRegistrationTarget,
    private readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode">,
    private readonly mode?: Pick<ModeManagerApi, "get" | "subscribe">,
  ) {
    try {
      this.subscriptions.push(surfaces.subscribe(this.reconcile));
      if (mode) {
        this.subscriptions.push(mode.subscribe(this.reconcile));
      }
      this.subscriptions.push(renderers.subscribe(this.reconcileRenderers));
      this.reconcileRenderers();
      this.reconcile();
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Page contribution setup and cleanup failed",
        );
      }
      throw error;
    }
  }

  /**
   * Releases the host subscription and every occurrence-local renderer, slot and wrapper registration.
   *
   * @returns All retained cleanup has been attempted; repeated calls do nothing.
   * @throws Aggregates cleanup failures after attempting every release.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const releases = [
      ...this.subscriptions.splice(0),
      ...this.rendererRegistrations.values(),
      ...this.slotRegistrations.values(),
      ...this.wrapperRegistrations.values(),
    ];
    this.rendererRegistrations.clear();
    this.slotRegistrations.clear();
    this.wrapperRegistrations.clear();
    const errors: unknown[] = [];
    for (const release of releases) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Page contribution cleanup failed");
    }
  }

  /**
   * Installs concrete host components directly in Page without per-block lookup wrappers.
   *
   * Unchanged entries retain their Page registration identity and mounted content.
   * Removal happens before replacement so the native type remains unique.
   *
   * @returns Page renderers and layouts match the live host registrations.
   * @throws Propagates registration and cleanup errors to the publishing host.
   */
  private readonly reconcileRenderers = (): void => {
    const current = new Set(this.renderers.getRegistrations());
    for (const [entry, release] of this.rendererRegistrations) {
      if (!current.has(entry)) {
        this.rendererRegistrations.delete(entry);
        release();
      }
    }
    for (const entry of current) {
      if (!this.rendererRegistrations.has(entry)) {
        this.rendererRegistrations.set(
          entry,
          this.page.renderers.register(entry.type, {
            content: entry.renderer,
            layout: entry.layout,
          }),
        );
      }
    }
  };

  /**
   * Removes obsolete contributions and installs new ones while retaining surviving identities.
   *
   * @returns Page registrations reflect the current host list and its priorities.
   * @throws Propagates filter, registration, or cleanup failures to the host publisher.
   */
  private readonly reconcile = (): void => {
    this.reconcileWrappers();
    const mode = this.mode?.get() ?? "block";
    if (this.previousMode !== mode) {
      for (const release of this.slotRegistrations.values()) {
        release();
      }
      this.slotRegistrations.clear();
      this.previousMode = mode;
    }
    const current = new Set(
      this.surfaces
        .getBlockSlotRegistrations()
        .filter((entry) => !entry.mode || entry.mode === mode || entry.mode.includes(mode)),
    );
    for (const [entry, release] of this.slotRegistrations) {
      if (!current.has(entry)) {
        this.slotRegistrations.delete(entry);
        release();
      }
    }
    for (const entry of current) {
      if (!this.slotRegistrations.has(entry)) {
        this.slotRegistrations.set(entry, this.install(entry));
      }
    }
  };

  /**
   * Reconciles the host decorator chain while preserving surviving Page entries.
   *
   * Host wrappers append in outermost-first order; equal Page priorities retain
   * that registration order without a second runtime ordering convention.
   *
   * @returns Page decorators reflect the current host block-mode registrations.
   * @throws Propagates Page registration or cleanup failures.
   */
  private reconcileWrappers(): void {
    const current = new Set(
      this.surfaces.getBlockWrapperRegistrations(this.mode?.get() ?? "block"),
    );
    for (const [entry, release] of this.wrapperRegistrations) {
      if (!current.has(entry)) {
        this.wrapperRegistrations.delete(entry);
        release();
      }
    }
    for (const entry of current) {
      if (this.wrapperRegistrations.has(entry)) {
        continue;
      }
      const Wrapper = entry.wrapper;
      const release = this.page.wrappers.register({
        priority: 0,
        /**
         * Supplies concrete host fields to a decorator around the existing Page shell.
         *
         * @param props - Page occurrence and the already-composed remaining chain.
         * @returns The host wrapper with its supplied children, or null after deletion.
         */
        component: function PageHostWrapper({ block, children }: PageWrapperProps) {
          const { block: hostBlock } = useBlockNode(block.id);
          if (!hostBlock) {
            return null;
          }
          return <Wrapper block={hostBlock}>{children}</Wrapper>;
        },
      });
      this.wrapperRegistrations.set(entry, release);
    }
  }

  /**
   * Translates one host contribution without copying model data into Page snapshots.
   *
   * @param entry - Immutable host registration retained until its explicit removal.
   * @returns Disposer releasing only this occurrence's translated registration.
   * @throws Propagates Page registration failures.
   */
  private install(entry: Readonly<BlockSlotRegistration>): () => void {
    const Component = entry.component;
    const mode = this.mode?.get() ?? "block";
    return this.page.slots.register({
      position: entry.position,
      priority: entry.priority,
      /**
       * Evaluates the host predicate against current concrete block fields.
       *
       * @param props - Current Page block identity and whole-block selection bit.
       * @returns Whether the block remains accessible and matches the host predicate.
       * @throws Propagates host reads and predicate failures.
       */
      when: ({ block, selected }) => {
        const hostBlock = this.blocks.getBlockNode(block.id);
        return !!hostBlock && (!entry.when || entry.when({ block: hostBlock, selected, mode }));
      },
      /**
       * Supplies concrete host data and the actual Page child-region ID to a slot.
       *
       * @param props - Current Page occurrence and selection feedback.
       * @returns Host contribution, or null after the block leaves the panel.
       */
      component: function PageHostSlot({ block, selected, childrenId }: PageSlotProps) {
        const { block: hostBlock } = useBlockNode(block.id);
        if (!hostBlock) {
          return null;
        }
        return (
          <BlockChildrenIdContext.Provider value={{ blockId: block.id, childrenId }}>
            <Component block={hostBlock} selected={selected} mode={mode} />
          </BlockChildrenIdContext.Provider>
        );
      },
    });
  }
}
