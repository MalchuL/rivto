import type { ComponentType } from "react";
import type { ReactEditor } from "../../../react-editor";

/** Idempotent ownership handle returned by every manager registration. */
export type RegistrationDisposer = () => void;

/** Headless or visual component mounted by a functional plugin. */
export type PluginComponent = ComponentType;

/** Functional extension installed synchronously during ReactEditor creation. */
export interface ReactEditorPlugin {
  /** Stable identity used to reject duplicate installation. */
  readonly id: string;
  /**
   * Registers behavior through the complete public React runtime.
   *
   * @param reactEditor - Runtime and public managers available to the plugin.
   * @returns Optional cleanup for resources not owned by a React manager.
   */
  setup(reactEditor: ReactEditor): void | (() => void);
}
