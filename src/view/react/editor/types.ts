import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import type { RivtoEditorApi } from "../../../editor";
import type { EditorBlock } from "../../../editor/model";

export interface ViewPluginBlockProps {
  readonly block: EditorBlock;
  readonly children: ReactNode;
}

/** A composable root or block wrapper installed for one editor view. */
export interface ViewPlugin {
  readonly id: string;
  readonly View?: ComponentType<PropsWithChildren>;
  readonly Block?: ComponentType<ViewPluginBlockProps>;
}

export interface EditorViewProps {
  readonly editor: RivtoEditorApi;
  readonly plugins?: readonly ViewPlugin[];
  readonly children: ReactNode;
}
