import type { ComponentType } from "react";
import type { ReactEditorExtensionApi } from "../../editor/types";

/** Idempotent ownership handle returned by every manager registration. */
export type RegistrationDisposer = () => void;

/** Headless or visual component mounted by a functional extension. */
export type ExtensionComponent = ComponentType;

/** Explicit EditorPanel placement relative to the active surface. */
export type ExtensionMountPosition = "beforeSurface" | "afterSurface";

/** Functional extension installed synchronously during ReactEditorApi creation. */
export interface ReactEditorExtension<CustomEvents extends object = object> {
  /** Stable identity used to reject duplicate installation. */
  readonly id: string;
  /**
   * Registers behavior through the borrowed React runtime's public managers.
   *
   * @param reactEditor - Runtime and public managers available to the extension; panel registration and runtime destruction remain with their owners.
   * @returns Optional cleanup for resources not owned by a React manager.
   */
  setup(reactEditor: ReactEditorExtensionApi<CustomEvents>): void | (() => void);
}

/** Owns registrations and rejects new work after extension teardown begins. */
export interface RegistrationOwner {
  /** Retains cleanup and returns an idempotent disposer. */
  registerCleanup(release: RegistrationDisposer): RegistrationDisposer;
  /** Throws when the owner has started destruction. */
  assertActive(): void;
}
