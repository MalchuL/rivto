import type { ComponentType } from "react";
import type { Block } from "../../store/document-model";
import type { RivtoEditorCore } from "../editor";

/** Mutable slash-query state shared by renderer strategies. */
export interface SlashState {
  /** Block containing the leading slash query. */
  blockId: string;
  /** Query text after the slash. */
  query: string;
}

/** Common inputs supplied to page and edgeless renderer strategies. */
export interface EditorRendererProps {
  /** Editor commands and runtime registries. */
  editor: RivtoEditorCore;
  /** Current detached root block values. */
  blocks: Block[];
  /** Explicit native type used by UI actions that create an empty block. */
  defaultBlockType: string;
  /** Active slash query, or `null`. */
  slash: SlashState | null;
  /** Updates active slash query. */
  setSlash: (value: SlashState | null) => void;
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
  editor: RivtoEditorCore;
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
