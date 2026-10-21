import type { ComponentType, ReactNode } from "react";
import type { BlockEditorNodeSnapshot } from "../../../adapter/types";

/** Bounded inputs for a decorator around one existing Page block shell. */
export interface BlockWrapperProps {
  /** Immutable own-node snapshot; descendants are rendered independently by Page. */
  readonly block: BlockEditorNodeSnapshot;
  /** Next decorator or the existing shell; render exactly once without recursing. */
  readonly children: ReactNode;
}

/**
 * Decorates one existing shell without choosing its content renderer or layout.
 *
 * @param props - Bounded own-node snapshot and the already-rendered remaining chain.
 * @returns Decorator presentation/context containing the supplied children exactly once.
 */
export type BlockWrapperComponent = ComponentType<BlockWrapperProps>;

/** Host decorator and explicit ordering captured when it is installed. */
export interface BlockWrapperRegistration {
  /** Stable component rendering its supplied children exactly once. */
  readonly component: BlockWrapperComponent;
  /** Finite priority; higher values are outermost, ties retain installation order. */
  readonly priority: number;
}

/** Stable registration identity used to compose independently removable decorators. */
export interface BlockWrapperEntry extends BlockWrapperRegistration {
  /** Editor-local identity retained until this registration is removed. */
  readonly id: number;
}

/** Borrowed registration and observation capabilities, without attachment or teardown. */
export interface BlockWrapperRegistryApi {
  /**
   * Installs a decorator in descending priority order, keeping ties in installation order.
   *
   * @param registration - Stable component and a required finite priority.
   * @returns Idempotent disposer removing only this registration, including duplicates.
   * @throws If destroyed, priority is nonfinite/missing, or a publication/rollback observer fails.
   */
  register(registration: BlockWrapperRegistration): () => void;
  /**
   * Reads the retained immutable priority order without creating a new snapshot.
   *
   * @returns Current entries, retaining identity until a registration changes.
   */
  getSnapshot(): readonly BlockWrapperEntry[];
  /**
   * Observes registration changes independently of node data and selection.
   *
   * @param listener - Callback rereading the snapshot after publication.
   * @returns Idempotent disposer releasing this individual subscription.
   * @throws If the editor has been destroyed.
   */
  subscribe(listener: () => void): () => void;
}
