import type { ComponentType } from "react";
import type { ReactEditorApi } from "../../editor/types";
import type { FileExtensionFields } from "../../attachments/ingestion/file-input-routing";
import type { ImageViewConfiguration } from "../../components/image-view-types";
import type { CollapseExtensionFields } from "../clipboard/block-paste-children";

/** Idempotent ownership handle returned by every manager registration. */
export type RegistrationDisposer = () => void;

/** Headless or visual component mounted by a functional extension. */
export type ExtensionComponent = ComponentType;

/** Explicit EditorPanel placement relative to the active surface. */
export type ExtensionMountPosition = "beforeSurface" | "afterSurface";

/** Installed extension types keyed by ID; extension authors may augment this interface. */
export interface InstalledExtensions {
  /** Generic file extension and its public fields. */
  file: FileReactEditorExtension;
  /** Image extension and its public fields. */
  image: ImageReactEditorExtension;
  /** Block collapse extension and its public operations. */
  "block.collapse": CollapseReactEditorExtension;
}

/** Block collapse extension with its public paste placement operation. */
export interface CollapseReactEditorExtension extends ReactEditorExtension<CollapseExtensionFields> {
  readonly id: "block.collapse";
  readonly fields: CollapseExtensionFields;
}

/** Generic file extension with its public input and provider operations. */
export interface FileReactEditorExtension extends ReactEditorExtension<FileExtensionFields> {
  readonly id: "file";
  readonly fields: FileExtensionFields;
}

/** Image extension with its public view settings and provider. */
export interface ImageReactEditorExtension extends ReactEditorExtension<ImageViewConfiguration> {
  readonly id: "image";
  readonly fields: ImageViewConfiguration;
}

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
