/**
 * CodeMirror field for an HTML widget's source or JSON props.
 *
 * @module
 */
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

/** Language highlighted inside one widget editor. */
export type HtmlCodeLanguage = "html" | "json";

/** Props for one CodeMirror document. */
export interface HtmlCodeFieldProps {
  /** Current document text. External changes replace the editor contents. */
  readonly value: string;
  /** Accessible name of the editor content. */
  readonly label: string;
  /** Highlighting used for this document. */
  readonly language: HtmlCodeLanguage;
  /** When true, the field grows with a fullscreen modal instead of a short scroller. */
  readonly fill?: boolean;
  /** When true, the document cannot be changed. */
  readonly readOnly?: boolean;
  /**
   * Receives the full document after each user edit.
   *
   * @param value - Current document text.
   */
  readonly onChange?: (value: string) => void;
}

/**
 * Mounts a CodeMirror editor for HTML or JSON.
 *
 * The view is created once per language and label. Later `value` changes that
 * did not come from the view itself replace the document without recreating it.
 *
 * @param props - Document text, language, and change callback.
 * @param props.value - Text loaded into the document.
 * @param props.label - Accessible name announced for the editor.
 * @param props.language - `html` or `json` highlighting.
 * @param props.fill - Uses the taller modal layout when true.
 * @param props.readOnly - Prevents edits when true.
 * @param props.onChange - Called with the full document after a user edit.
 * @returns The host element that owns the CodeMirror view.
 */
export function HtmlCodeField({
  value,
  label,
  language,
  fill = false,
  readOnly = false,
  onChange,
}: HtmlCodeFieldProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;
  useEffect(() => {
    return mountCodeView(host.current, view, valueRef.current, {
      label,
      language,
      readOnly,
      onChange: (next) => onChangeRef.current?.(next),
    });
  }, [label, language, readOnly]);
  useEffect(() => {
    replaceCodeDocument(view.current, value);
  }, [value]);
  const className = fill ? "html-code-field html-code-field-fill" : "html-code-field";
  return <div ref={host} className={className} />;
}

/** Options captured when a CodeMirror view is created. */
interface CodeViewOptions {
  readonly label: string;
  readonly language: HtmlCodeLanguage;
  readonly readOnly: boolean;
  readonly onChange: (value: string) => void;
}

/**
 * Creates a CodeMirror view in a host and destroys it on cleanup.
 *
 * @param parent - Element that receives the view, or null before layout.
 * @param view - Ref that retains the view for later document replacement.
 * @param initial - Document text at creation.
 * @param options - Language, label, and the edit callback.
 * @returns Destroys the view. Does nothing when the host is missing.
 */
function mountCodeView(
  parent: HTMLDivElement | null,
  view: { current: EditorView | null },
  initial: string,
  options: CodeViewOptions,
): () => void {
  if (!parent) {
    return () => {};
  }
  const created = new EditorView({
    parent,
    state: EditorState.create({
      doc: initial,
      extensions: codeExtensions(options),
    }),
  });
  view.current = created;
  return () => {
    created.destroy();
    view.current = null;
  };
}

/**
 * Builds the extensions for one widget document.
 *
 * @param options - Language, accessible name, read-only flag, and edit callback.
 * @returns Extensions installed on the editor state.
 */
function codeExtensions(options: CodeViewOptions) {
  const language = options.language === "html" ? html() : json();
  const extensions = [
    basicSetup,
    language,
    EditorView.contentAttributes.of({ "aria-label": options.label }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange(update.state.doc.toString());
      }
    }),
  ];
  if (options.readOnly) {
    extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
  }
  return extensions;
}

/**
 * Replaces the view document when the text came from outside the editor.
 *
 * @param view - Mounted editor, or null before the view exists.
 * @param value - Document text that should be showing.
 * @returns Nothing. An equal document is left unchanged, including its selection.
 */
function replaceCodeDocument(view: EditorView | null, value: string): void {
  if (!view || view.state.doc.toString() === value) {
    return;
  }
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
}
