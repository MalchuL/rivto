/**
 * Empty-state input for a block that has no HTML yet.
 *
 * @module
 */
import { useState, type ClipboardEvent } from "react";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { editorControlProps } from "../../../constants";
import { HTML_EDIT_HINT } from "../constants";

/** Props for {@link HtmlPasteTarget}. */
export interface HtmlPasteTargetProps {
  /**
   * Receives nonblank HTML from a paste or from Render.
   *
   * @param source - Authored HTML.
   * @returns The owner has stored the source.
   */
  readonly onCommit: (source: string) => void;
}

/**
 * Accepts pasted HTML and renders it as soon as the paste arrives.
 *
 * Typed text is kept locally until Render is pressed. A paste without text
 * (e.g. an image) is left to the field's default behavior.
 *
 * @param props - Commit callback.
 * @returns The paste field and Render button.
 */
export function HtmlPasteTarget({ onCommit }: HtmlPasteTargetProps) {
  const [text, setText] = useState("");
  const commit = (source: string) => {
    if (source.trim()) {
      onCommit(source);
    }
  };
  const paste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = event.clipboardData;
    const source = data ? data.getData("text/plain") || data.getData("text/html") : "";
    if (!source.trim()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    commit(source);
  };
  return (
    <form
      className="html-surface-paste"
      onSubmit={(event) => {
        event.preventDefault();
        commit(text);
      }}
    >
      <p>{HTML_EDIT_HINT}</p>
      <Textarea
        {...editorControlProps}
        aria-label="HTML source"
        placeholder="Paste HTML, CSS, and JavaScript"
        spellCheck={false}
        value={text}
        onPaste={paste}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <Button {...editorControlProps} type="submit" size="sm">
        Render
      </Button>
    </form>
  );
}
