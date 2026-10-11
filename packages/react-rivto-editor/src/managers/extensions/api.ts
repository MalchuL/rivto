import type { ExtensionComponent, ExtensionMountPosition, ReactEditorExtension } from "./types";

/** Extension installation, mounted components, and revision subscriptions. */
export interface ExtensionsApi {
  mount(
    component: ExtensionComponent,
    position?: ExtensionMountPosition,
  ): () => void;
  getComponents(
    position?: ExtensionMountPosition,
  ): readonly ExtensionComponent[];
  /** Installs one extension after creation and returns its disposer. */
  install(extension: ReactEditorExtension): () => void;
  readonly revision: number;
  subscribe(listener: () => void): () => void;
}
