/**
 * Paste target, slot edit button, and CodeMirror source editor for HTML widgets.
 *
 * The edit control uses the same right-slot hover treatment as an embedding.
 * Fullscreen editing reuses the shared block dialog.
 *
 * @module
 */
import { editorControlProps } from "@chulane/rivto-react";
import { CheckIcon, CodeXmlIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import {
  useState,
  type ClipboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Button } from "../../../../packages/react-rivto-editor/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../../../packages/react-rivto-editor/src/components/ui/dialog";
import { HtmlCodeField } from "./html-code";
import { parseWidgetProps, type HtmlDraft } from "./protocol";

const HTML_EDIT_HINT =
  "Scripts call rivto.ready() for this node. Blocks expose props, listProps, content, pluginData, and childIds. Elements expose props, frame, zIndex, and childIds. rivto.setProp(key, value) writes one property.";

/** Props for the right-slot control that opens the source editor. */
export interface HtmlSlotEditButtonProps {
  /** True while this widget's source editor is open. */
  readonly editing: boolean;
  /**
   * Toggles the source editor.
   *
   * @returns Nothing. The caller updates the shared edit flag.
   */
  readonly onToggle: () => void;
  /**
   * Called on pointer down before the click.
   *
   * @param event - Pointer event on the button. Callers can select the element here.
   */
  readonly onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

/**
 * Shows the embedding-style edit control in the owner's right slot.
 *
 * The button stays hidden until the owner is hovered or focused. Opening the
 * editor removes it; Close and Done live in the editor instead.
 *
 * @param props - Edit flag and toggle handler.
 * @param props.editing - Whether the source editor is open. The button is omitted then.
 * @param props.onToggle - Opens the source editor.
 * @param props.onPointerDown - Optional pointer-down hook for selection.
 * @returns The icon button placed in the right slot, or nothing while editing.
 */
export function HtmlSlotEditButton({ editing, onToggle, onPointerDown }: HtmlSlotEditButtonProps) {
  if (editing) {
    return null;
  }
  return (
    <Button
      {...editorControlProps}
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Edit HTML"
      title="Edit HTML"
      data-edgeless-ui="true"
      onPointerDown={onPointerDown}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <CodeXmlIcon aria-hidden="true" />
    </Button>
  );
}

/** Props for the empty HTML paste target. */
export interface HtmlPasteTargetProps {
  /**
   * Receives pasted or submitted markup.
   *
   * @param source - HTML text from the clipboard or the field.
   */
  readonly onCommit: (source: string) => void;
}

/**
 * Accepts a pasted HTML document and renders it as soon as the paste arrives.
 *
 * Typing is kept locally until Render is pressed. A paste with text skips that step.
 * A paste event without clipboard data is left for the field.
 *
 * @param props - Commit callback.
 * @param props.onCommit - Writes the authored HTML onto the node.
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
    if (!data) {
      return;
    }
    const source = data.getData("text/plain") || data.getData("text/html");
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
      <textarea
        {...editorControlProps}
        aria-label="HTML source"
        placeholder="Paste HTML, CSS, and JavaScript"
        spellCheck={false}
        value={text}
        onPaste={paste}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <button {...editorControlProps} type="submit">
        Render
      </button>
    </form>
  );
}

/** Props for the source and props editor. */
export interface HtmlSourceEditorProps {
  /** Current HTML source. */
  readonly source: string;
  /** Pretty JSON for the editable widget props. */
  readonly propsText: string;
  /** Pretty JSON for block list props. Omitted for elements. */
  readonly listPropsText?: string;
  /**
   * Persists a valid draft.
   *
   * @param draft - HTML source and parsed props. Invalid JSON never reaches this callback.
   */
  readonly onSave: (draft: HtmlDraft) => void;
  /** Closes the editor without writing. */
  readonly onCancel: () => void;
}

/**
 * Edits the HTML source and JSON props in CodeMirror.
 *
 * List props are shown for blocks so the whole node is visible. They stay
 * read-only; a script updates them with `rivto.setListProps`. The expand
 * button opens the same documents in the shared fullscreen dialog.
 *
 * @param props - Current source, prop text, and save or cancel callbacks.
 * @param props.source - HTML loaded into the source editor.
 * @param props.propsText - JSON loaded into the props editor.
 * @param props.listPropsText - Read-only list props, when this node is a block.
 * @param props.onSave - Called with a parsed draft after Done.
 * @param props.onCancel - Called when Close is pressed.
 * @returns The inline editor, or the same editor inside the fullscreen dialog.
 */
export function HtmlSourceEditor({
  source,
  propsText,
  listPropsText,
  onSave,
  onCancel,
}: HtmlSourceEditorProps) {
  const [html, setHtml] = useState(source);
  const [props, setProps] = useState(propsText);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const save = () => {
    try {
      onSave({ source: html, props: parseWidgetProps(props) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Props must be a JSON object");
    }
  };
  const message = error ? <p role="alert">{error}</p> : <p>{HTML_EDIT_HINT}</p>;
  const pane = (fullscreen: boolean) => (
    <HtmlEditorPane
      expanded={fullscreen}
      onExpand={() => setExpanded(true)}
      onCollapse={() => setExpanded(false)}
      onSave={save}
      onCancel={onCancel}
    >
      <HtmlEditorFields
        html={html}
        propsText={props}
        listPropsText={listPropsText}
        fill={fullscreen}
        onHtml={setHtml}
        onProps={setProps}
      />
      {message}
    </HtmlEditorPane>
  );
  return (
    <div
      className="html-source-editor"
      data-edgeless-ui="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {expanded ? (
        <HtmlEditorDialog expanded={expanded} onExpanded={setExpanded}>
          {pane(true)}
        </HtmlEditorDialog>
      ) : (
        pane(false)
      )}
    </div>
  );
}

/** Props for the HTML, props, and optional list-props documents. */
interface HtmlEditorFieldsProps {
  readonly html: string;
  readonly propsText: string;
  readonly listPropsText?: string;
  readonly fill: boolean;
  readonly onHtml: (value: string) => void;
  readonly onProps: (value: string) => void;
}

/**
 * Renders the CodeMirror documents for one edit session.
 *
 * @param props - Current texts and their writers.
 * @param props.html - HTML document.
 * @param props.propsText - Editable props JSON.
 * @param props.listPropsText - Read-only list props, when this node is a block.
 * @param props.fill - Gives each editor the modal height.
 * @param props.onHtml - Replaces the HTML document.
 * @param props.onProps - Replaces the props JSON.
 * @returns The labeled code editors.
 */
function HtmlEditorFields({
  html,
  propsText,
  listPropsText,
  fill,
  onHtml,
  onProps,
}: HtmlEditorFieldsProps) {
  return (
    <div className="html-code-fields">
      <label className="html-code-label">
        HTML
        <HtmlCodeField
          value={html}
          label="HTML source"
          language="html"
          fill={fill}
          onChange={onHtml}
        />
      </label>
      <label className="html-code-label">
        Props
        <HtmlCodeField
          value={propsText}
          label="Widget props"
          language="json"
          fill={fill}
          onChange={onProps}
        />
      </label>
      {listPropsText === undefined ? null : (
        <label className="html-code-label">
          List props
          <HtmlCodeField
            value={listPropsText}
            label="List props"
            language="json"
            fill={fill}
            readOnly
          />
        </label>
      )}
    </div>
  );
}

/** Props for the editor actions and the documents they apply to. */
interface HtmlEditorPaneProps {
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly onCollapse: () => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly children: ReactNode;
}

/**
 * Draws the expand, save, and cancel actions around the code documents.
 *
 * @param props - Action callbacks and the documents to show.
 * @param props.expanded - True inside the fullscreen dialog.
 * @param props.onExpand - Opens the dialog.
 * @param props.onCollapse - Closes the dialog without leaving edit mode.
 * @param props.onSave - Persists the current documents.
 * @param props.onCancel - Discards the edit session.
 * @param props.children - Code editors and the status line.
 * @returns The action row and the documents.
 */
function HtmlEditorPane({
  expanded,
  onExpand,
  onCollapse,
  onSave,
  onCancel,
  children,
}: HtmlEditorPaneProps) {
  return (
    <>
      <div className="html-source-actions">
        <Button
          {...editorControlProps}
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={expanded ? "Collapse HTML editor" : "Expand HTML editor"}
          onClick={expanded ? onCollapse : onExpand}
        >
          {expanded ? <Minimize2Icon aria-hidden="true" /> : <Maximize2Icon aria-hidden="true" />}
        </Button>
        <Button
          {...editorControlProps}
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Close"
          title="Close"
          onClick={onCancel}
        >
          <XIcon aria-hidden="true" />
        </Button>
        <Button
          {...editorControlProps}
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Done"
          title="Done"
          onClick={onSave}
        >
          <CheckIcon aria-hidden="true" />
        </Button>
      </div>
      {children}
    </>
  );
}

/** Props for the fullscreen code dialog. */
interface HtmlEditorDialogProps {
  readonly expanded: boolean;
  readonly onExpanded: (expanded: boolean) => void;
  readonly children: ReactNode;
}

/**
 * Opens the widget source in the shared fullscreen block dialog.
 *
 * Closing the dialog returns to the inline editor and keeps the unsaved documents.
 *
 * @param props - Dialog visibility and the editor pane.
 * @param props.expanded - Whether the dialog is open.
 * @param props.onExpanded - Updates that visibility. False returns to the inline editor.
 * @param props.children - Editor pane rendered inside the dialog.
 * @returns The dialog. It renders no inline content while closed.
 */
function HtmlEditorDialog({ expanded, onExpanded, children }: HtmlEditorDialogProps) {
  return (
    <Dialog open={expanded} onOpenChange={onExpanded}>
      {expanded ? (
        <DialogContent
          className="rivto-block-modal-content html-code-modal"
          showCloseButton={false}
          aria-describedby={undefined}
          aria-modal="true"
        >
          <DialogTitle className="sr-only">HTML source</DialogTitle>
          {children}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
