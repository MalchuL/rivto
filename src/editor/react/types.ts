import type { ComponentType } from "react";
import type { Block } from "../../store/document-model";
import type { EditorRuntime } from "../editor";
import type { SlashMenuState } from "../plugins";

/** Common inputs supplied to page and edgeless renderer strategies. */
export interface EditorRendererProps {
  /** Editor commands and runtime registries. */
  editor: EditorRuntime;
  /** Current detached root block values. */
  blocks: Block[];
  /** Explicit native type used by UI actions that create an empty block. */
  defaultBlockType: string;
  /** Active slash query, or `null`. */
  slash: SlashMenuState | null;
  /** Selected edgeless block ID. */
  selected: string | null;
  /** Updates selected edgeless block ID. */
  setSelected: (value: string | null) => void;
  /** Current local edgeless zoom factor. */
  zoom: number;
}

/** Public properties for the React editor binding. */
export interface RivtoEditorProps {
  /** Long-lived editor instance owned by the host application. */
  editor: EditorRuntime;
  /** Explicit registered type used by generic UI creation actions. */
  defaultBlockType: string;
  /** Optional host class appended to the root element. */
  className?: string;
  /** Optional page and edgeless renderer strategy replacements. */
  renderers?: {
    page?: ComponentType<EditorRendererProps>;
    edgeless?: ComponentType<EditorRendererProps>;
  };
}
