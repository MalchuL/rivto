/**
 * The input shown by a block that has no HTML yet.
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
   * Receives the HTML when the user pastes it or presses Render. Blank text is never passed.
   *
   * @param source - The HTML to store.
   * @returns Nothing. The owner has stored the source.
   */
  readonly onCommit: (source: string) => void;
}

/**
 * Renders a text box that turns pasted HTML into a widget immediately.
 *
 * Pasting text stores it right away; there is no need to press Render.
 * Typed text stays local until Render is pressed. A paste without text,
 * such as an image, is left to the text box's default behavior.
 *
 * @param props - Commit callback.
 * @param props.onCommit - Receives the HTML to store.
 * @returns The text box and the Render button.
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
