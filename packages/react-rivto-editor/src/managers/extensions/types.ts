import type { ComponentType } from "react";
import type { ReactEditorApi } from "../../editor/types";

/** Idempotent ownership handle returned by every manager registration. */
export type RegistrationDisposer = () => void;

/** Headless or visual component mounted by a functional extension. */
export type ExtensionComponent = ComponentType;

/** Explicit EditorPanel placement relative to the active surface. */
export type ExtensionMountPosition = "beforeSurface" | "afterSurface";

declare global {
  // Extension modules augment this registry with their own installed types.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface RivtoInstalledExtensions {}
}

/* eslint-disable @typescript-eslint/no-empty-object-type */
/** Installed extension types keyed by ID; extension authors may augment this interface. */
export interface InstalledExtensions extends RivtoInstalledExtensions {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

/** Functional extension installed synchronously during ReactEditorApi creation. */
export interface ReactEditorExtension<Fields = unknown> {
  /** Stable identity used to reject duplicate installation. */
  readonly id: string;
  /** Optional extension-specific values and operations exposed to other extensions. */
  readonly fields?: Fields;
  /**
   * Registers behavior through the complete public React runtime.
   *
   * @param reactEditor - Runtime and public managers available to the extension.
   * @returns Optional cleanup for resources not owned by a React manager.
   */
  setup(reactEditor: ReactEditorApi): void | (() => void);
}

/** Owns registrations and rejects new work after extension teardown begins. */
export interface RegistrationOwner {
  /** Retains cleanup and returns an idempotent disposer. */
  registerCleanup(release: RegistrationDisposer): RegistrationDisposer;
  /** Throws when the owner has started destruction. */
  assertActive(): void;
}
