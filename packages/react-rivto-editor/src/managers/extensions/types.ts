import type { ComponentType } from "react";
import type { EditorRuntime } from "../../editor-runtime";

/** Idempotent ownership handle returned by every manager registration. */
export type RegistrationDisposer = () => void;

/** Headless or visual component mounted by a functional extension. */
export type ExtensionComponent = ComponentType;

/** Explicit EditorView placement relative to the active surface. */
export type ExtensionMountPosition = "beforeSurface" | "afterSurface";

/** Functional extension installed synchronously during EditorRuntime creation. */
export interface ReactEditorExtension {
  /** Stable identity used to reject duplicate installation. */
  readonly id: string;
  /**
   * Registers behavior through the complete public React runtime.
   *
   * @param editorRuntime - Runtime and public managers available to the extension.
   * @returns Optional cleanup for resources not owned by a React manager.
   */
  setup(editorRuntime: EditorRuntime): void | (() => void);
}
