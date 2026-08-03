export type EditorValue = {
  /** TipTap HTML today; later can widen for Rivto blocks / Yjs. */
  html: string;
};

export type DocumentEditorProps = {
  value: EditorValue;
  onChange: (value: EditorValue) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
};
