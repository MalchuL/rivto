import type { ReactNode } from "react";

/** Properties for the page drag-and-drop boundary. */
export interface PageDragExtensionOptions {
  readonly children: ReactNode;
  readonly activationDistance?: number;
}
