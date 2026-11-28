/**
 * CodeMirror field for an HTML widget's source or JSON props.
 *
 * @module
 */
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useLayoutEffect, useRef } from "react";

/** Theme that gives every field Rivto's gutter colors and inherits the surrounding font. */
const htmlCodeTheme = EditorView.theme({
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-gutters": {
    backgroundColor: "var(--rivto-muted)",
    color: "var(--rivto-muted-foreground)",
    borderColor: "var(--rivto-border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--rivto-subtle)",
    color: "var(--rivto-subtle-foreground)",
  },
});

/** Syntax highlighting used by a field. */
export type HtmlCodeLanguage = "html" | "json";

/**
 * CodeMirror states owned by one editing session, keyed by field label.
 *
 * A field saves its state here when its view is destroyed (e.g. when moving
 * between the inline and fullscreen layouts) and restores it on remount.
 */
export type HtmlCodeFieldStates = Pick<Map<string, EditorState>, "get" | "set">;

/** Props for {@link HtmlCodeField}. */
export interface HtmlCodeFieldProps {
  /** Saved CodeMirror states of the editing session; see {@link HtmlCodeFieldStates}. */
  readonly fieldStates: HtmlCodeFieldStates;
  /** Text the field should show. A change that did not come from typing replaces the contents. */
  readonly value: string;
  /** Accessible name of the field. Also the key of its saved state, so it must be unique per session. */
  readonly label: string;
  /** Syntax highlighting. */
  readonly language: HtmlCodeLanguage;
  /** Whether the field stretches to fill the fullscreen dialog instead of using a short scroller. */
  readonly fill?: boolean;
  /** Whether the text cannot be edited. */
  readonly readOnly?: boolean;
  /**
   * Receives the whole text after each edit.
   *
   * @param value - The field's text after the edit.
   * @returns Nothing.
   */
  readonly onChange?: (value: string) => void;
}

/**
 * Renders a CodeMirror editor for HTML or JSON.
 *
 * The CodeMirror view is created when the field mounts and recreated only if
 * its label, language or read-only flag changes. On unmount the view's state
 * (text, selection, undo history) is saved in `fieldStates`, and the next
 * mount with the same label resumes from it. That is what keeps undo working
 * when the editor moves into or out of the fullscreen dialog.
 *
 * When `value` changes from outside (not by typing), the text is replaced in
 * the existing view instead of recreating it.
 *
 * @param props - Field text, language and change handler.
 * @param props.fieldStates - Saved CodeMirror states of the editing session.
 * @param props.value - Text the field should show.
 * @param props.label - Accessible name; also the key of the saved state.
 * @param props.language - `html` or `json` highlighting.
 * @param props.fill - Whether the field stretches to the fullscreen dialog.
 * @param props.readOnly - Whether the text cannot be edited.
 * @param props.onChange - Receives the whole text after each edit.
 * @returns The element that hosts the CodeMirror view.
 */
export function HtmlCodeField({
  fieldStates,
  value,
  label,
  language,
  fill = false,
  readOnly = false,
  onChange,
}: HtmlCodeFieldProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The view is not recreated when these change, so it reads them through refs.
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });
  useEffect(() => {
    return mountCodeView(host.current, view, valueRef.current, {
      fieldStates,
      label,
      language,
      readOnly,
      onChange: (next) => onChangeRef.current?.(next),
    });
  }, [fieldStates, label, language, readOnly]);
  useEffect(() => {
    replaceCodeDocument(view.current, value);
  }, [value]);
  const className = fill ? "html-code-field html-code-field-fill" : "html-code-field";
  return <div ref={host} className={className} />;
}

/** Settings fixed for the lifetime of one CodeMirror view. */
interface CodeViewOptions {
  /** Where the view's state is saved on unmount and restored from on mount. */
  readonly fieldStates: HtmlCodeFieldStates;
  /** Accessible name and saved-state key. */
  readonly label: string;
  /** Syntax highlighting. */
  readonly language: HtmlCodeLanguage;
  /** Whether the text cannot be edited. */
  readonly readOnly: boolean;
  /**
   * Receives the whole text after each edit.
   *
   * @param value - The field's text after the edit.
   * @returns Nothing.
   */
  readonly onChange: (value: string) => void;
}

/**
 * Creates a CodeMirror view, resuming from a saved state when there is one.
 *
 * @param parent - Element that hosts the view, or null if it is not mounted.
 * @param view - Ref that receives the view so later text changes can reach it.
 * @param initial - Text used only when there is no saved state.
 * @param options - Settings of the view.
 * @returns Cleanup that saves the view's state and destroys it; a no-op when
 * there was no parent.
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
  const saved = options.fieldStates.get(options.label);
  const extensions = codeExtensions(options);
  // A saved state still holds the previous view's change listener. Reconfigure it
  // with this view's extensions; the text, selection and history are kept.
  const state = saved
    ? saved.update({ effects: StateEffect.reconfigure.of(extensions) }).state
    : EditorState.create({ doc: initial, extensions });
  const created = new EditorView({ parent, state });
  view.current = created;
  return () => {
    options.fieldStates.set(options.label, created.state);
    created.destroy();
    view.current = null;
  };
}

/**
 * Builds the CodeMirror extensions for a field.
 *
 * @param options - Settings of the view.
 * @returns Basic editing, theme, language, accessible name, change listener and,
 * for read-only fields, the read-only flags.
 */
function codeExtensions(options: CodeViewOptions) {
  const language = options.language === "html" ? html() : json();
  const extensions = [
    basicSetup,
    htmlCodeTheme,
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
 * Replaces the view's text when it differs from `value`.
 *
 * Typing already updated the view, so after an edit the texts are equal and
 * nothing happens; the cursor and selection are left alone.
 *
 * @param view - The mounted view, or null before it exists.
 * @param value - Text the field should show.
 * @returns Nothing. The view shows `value`.
 */
function replaceCodeDocument(view: EditorView | null, value: string): void {
  if (!view || view.state.doc.toString() === value) {
    return;
  }
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
}
