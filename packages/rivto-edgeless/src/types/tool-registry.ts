import type { CanvasTool, CanvasToolOptions } from "../core/tools/canvas-tool";

/** Common presentation metadata; applications may extend registrations with typed factories. */
export interface CanvasToolEntry {
  readonly id: string;
  readonly title: string;
  readonly group?: string;
  readonly order?: number;
  readonly default?: boolean;
}

/** One level of tools; the last-used available member wins over the initial choice. */
export interface CanvasToolGroupEntry {
  readonly id: string;
  readonly title: string;
  readonly order?: number;
  readonly defaultToolId?: string;
}

/** Standalone registration using the canvas tool's dependency contract. */
export interface CanvasToolRegistration extends CanvasToolEntry {
  /**
   * Creates an isolated tool for the receiving canvas session.
   *
   * @param options - Registration identity and the resolved surface group.
   * @returns A new tool with the supplied identity; construction must not mutate source content.
   */
  readonly createTool: (options: CanvasToolOptions) => CanvasTool;
}

/** An optional application lifecycle that owns registrations. */
export interface CanvasRegistrationOwner {
  /**
   * Retains a cleanup and makes its returned disposer idempotent.
   *
   * @param release - Registration cleanup invoked explicitly or during host teardown.
   * @returns Host-owned disposer for this registration.
   */
  registerCleanup(release: () => void): () => void;
  /**
   * Rejects new registrations after host destruction starts.
   *
   * @returns Registration may proceed.
   * @throws If the host no longer accepts registrations.
   */
  assertActive(): void;
}
