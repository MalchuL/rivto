/** Collaborative block geometry as seen by editor features. */
export interface EditorBlockLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** Detached block value rendered by the editor. */
export interface EditorBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  pluginData: Record<string, unknown>;
  content: string;
  children: EditorBlock[];
  layout?: EditorBlockLayout;
}

/** Block creation data accepted by editor block helpers. */
export interface EditorBlockInput {
  type: string;
  id?: string;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  children?: EditorBlockInput[];
  layout?: Partial<EditorBlockLayout>;
}
