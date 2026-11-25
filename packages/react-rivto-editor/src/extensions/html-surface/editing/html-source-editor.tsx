/**
 * Source editor for an HTML widget: CodeMirror fields for the HTML and the
 * widget's JSON props, shown inline or in a fullscreen dialog.
 *
 * @module
 */
import type { EditorState } from "@codemirror/state";
import { CheckIcon, CodeXmlIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { BlockModalDialog } from "../../../blocks/block-modal/block-modal";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { ButtonGroup } from "../../../components/ui/button-group";
import { Separator } from "../../../components/ui/separator";
import { editorControlProps } from "../../../constants";
import { HTML_EDIT_HINT } from "../constants";
import { changedPropPatch, formatWidgetProps, parseWidgetProps } from "../model/widget-props";
import type { HtmlDraft } from "../types";
import { HtmlCodeField, type HtmlCodeFieldStates } from "./html-code-field";

/** Props for {@link HtmlSourceEditor}. */
export interface HtmlSourceEditorProps {
  /** HTML source when the editor opens. */
  readonly source: string;
  /** Persisted widget props when the editor opens. */
  readonly props: Record<string, unknown>;
  /** Prop keys managed elsewhere and hidden from the JSON field, such as an element's `html`. */
  readonly hiddenProps?: readonly string[];
  /** Block list props, shown read-only. Omitted for canvas elements, which have none. */
  readonly listProps?: Record<string, unknown>;
  /** Extra controls shown above the fields in both layouts, such as the access checkbox. */
  readonly children?: ReactNode;
  /**
   * Receives the draft when Done is pressed and the props JSON is valid.
   *
   * @param draft - The new source and the props edited in this session.
   * @returns The owner has saved the draft and closed the editor.
   * @throws Any error is shown in the editor instead of propagating.
   */
  readonly onSave: (draft: HtmlDraft) => void;
  /**
   * Closes the editor without saving.
   *
   * @returns The owner has closed the editor.
   */
  readonly onCancel: () => void;
}

/**
 * Edits a widget's HTML source and JSON props.
 *
 * The editor captures the source and props once, when it opens. Later
 * document changes do not reset what the user is typing, and saving reports
 * only the edits made in this session (see {@link changedPropPatch}), so a
 * collaborator's concurrent changes are not overwritten.
 *
 * Block list props are shown read-only so the whole node is visible; widgets
 * change them with `rivto.setListProps`. Unlike the editable fields, that
 * field follows the live document.
 *
 * The expand button moves the same fields into the shared fullscreen dialog.
 * Each field's CodeMirror state is kept across the move, so the cursor,
 * selection and undo history survive switching layouts.
 *
 * @param props - Opening values, optional extra controls and callbacks.
 * @param props.source - HTML source when the editor opens.
 * @param props.props - Widget props when the editor opens.
 * @param props.hiddenProps - Prop keys hidden from the JSON field.
 * @param props.listProps - Block list props, shown read-only; omitted for elements.
 * @param props.children - Extra controls shown above the fields.
 * @param props.onSave - Receives the draft when Done is pressed.
 * @param props.onCancel - Closes the editor without saving.
 * @returns The inline editor, or a placeholder plus the fullscreen dialog while expanded.
 */
export function HtmlSourceEditor({
  source,
  props,
  hiddenProps,
  listProps,
  children,
  onSave,
  onCancel,
}: HtmlSourceEditorProps) {
  const inline = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const draft = useSourceDraft(source, props, hiddenProps, onSave);
  const listPropsText = useMemo(() => listProps && JSON.stringify(listProps, null, 2), [listProps]);

  const renderPane = (fullscreen: boolean) => (
    <HtmlEditorPane
      fullscreen={fullscreen}
      draft={draft}
      listPropsText={listPropsText}
      onToggleExpanded={() => setExpanded(!fullscreen)}
      onCancel={onCancel}
    >
      {children}
    </HtmlEditorPane>
  );
  const focusExpandButton = () =>
    inline.current?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.focus();

  return (
    <div
      {...editorControlProps}
      ref={inline}
      className="html-source-editor"
      data-edgeless-ui="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {!expanded && renderPane(false)}
      <BlockModalDialog
        expanded={expanded}
        title="HTML source"
        onExpanded={setExpanded}
        restoreFocus={focusExpandButton}
      >
        <div className="html-source-editor html-source-editor-fullscreen" {...editorControlProps}>
          {renderPane(true)}
        </div>
      </BlockModalDialog>
    </div>
  );
}

/** Props for {@link HtmlEditorPane}. */
interface HtmlEditorPaneProps {
  /** Whether the pane is shown in the fullscreen dialog. */
  readonly fullscreen: boolean;
  /** The editing session's text and actions. */
  readonly draft: SourceDraft;
  /** Read-only list props JSON; omitted for elements. */
  readonly listPropsText: string | undefined;
  /** Extra controls shown above the fields. */
  readonly children?: ReactNode;
  /**
   * Switches between the inline and fullscreen layouts.
   *
   * @returns Nothing.
   */
  readonly onToggleExpanded: () => void;
  /**
   * Discards the draft and closes the editor.
   *
   * @returns Nothing.
   */
  readonly onCancel: () => void;
}

/**
 * Renders the editor content: action row, extra controls, code fields and the hint or error.
 *
 * The same pane is rendered inline or inside the fullscreen dialog.
 *
 * @param props - Layout, draft and actions.
 * @param props.fullscreen - Whether the pane is in the fullscreen dialog.
 * @param props.draft - The editing session's text and actions.
 * @param props.listPropsText - Read-only list props JSON; omitted for elements.
 * @param props.children - Extra controls shown above the fields.
 * @param props.onToggleExpanded - Switches between inline and fullscreen.
 * @param props.onCancel - Discards the draft and closes the editor.
 * @returns The pane content.
 */
function HtmlEditorPane({
  fullscreen,
  draft,
  listPropsText,
  children,
  onToggleExpanded,
  onCancel,
}: HtmlEditorPaneProps) {
  return (
    <>
      <HtmlEditorActions
        expanded={fullscreen}
        onToggleExpanded={onToggleExpanded}
        onSave={draft.save}
        onCancel={onCancel}
      />
      <Separator />
      {children}
      <HtmlEditorFields draft={draft} listPropsText={listPropsText} fill={fullscreen} />
      {draft.error ? <p role="alert">{draft.error}</p> : <p>{HTML_EDIT_HINT}</p>}
    </>
  );
}

/** Editable text of one editing session and the action that saves it. */
interface SourceDraft {
  /** Current HTML text. */
  readonly html: string;
  /** Current props JSON text. */
  readonly propsText: string;
  /** Message shown when saving failed; empty otherwise. */
  readonly error: string;
  /** CodeMirror states of the fields, kept across inline and fullscreen layouts. */
  readonly fieldStates: HtmlCodeFieldStates;
  /**
   * Replaces the HTML text.
   *
   * @param html - Text from the HTML field.
   * @returns Nothing. The draft holds the new text.
   */
  readonly setHtml: (html: string) => void;
  /**
   * Replaces the props JSON text.
   *
   * @param text - Text from the props field.
   * @returns Nothing. The draft holds the new text.
   */
  readonly setPropsText: (text: string) => void;
  /**
   * Parses the props, computes the session's edits and passes the draft to `onSave`.
   *
   * @returns Nothing. On failure (invalid JSON, or `onSave` throwing) the
   * message is stored in `error` and the editor stays open.
   */
  readonly save: () => void;
}

/**
 * Holds the editable text of one editing session.
 *
 * The opening source and props are captured (and the props formatted as
 * JSON) on the first render only; the draft is compared against them when saving.
 *
 * @param source - HTML source when the editor opens.
 * @param props - Widget props when the editor opens.
 * @param hiddenProps - Prop keys left out of the JSON text.
 * @param onSave - Receives a valid draft.
 * @returns The current text, its setters and the save action.
 */
function useSourceDraft(
  source: string,
  props: Record<string, unknown>,
  hiddenProps: readonly string[] | undefined,
  onSave: (draft: HtmlDraft) => void,
): SourceDraft {
  const [opening] = useState(() => ({
    source,
    propsText: formatWidgetProps(props, hiddenProps),
  }));
  const [fieldStates] = useState(() => new Map<string, EditorState>());
  const [html, setHtml] = useState(opening.source);
  const [currentPropsText, setPropsText] = useState(opening.propsText);
  const [error, setError] = useState("");
  const save = () => {
    try {
      const openingProps = parseWidgetProps(opening.propsText);
      const propsPatch = changedPropPatch(openingProps, parseWidgetProps(currentPropsText));
      onSave({ openingSource: opening.source, source: html, propsPatch });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the HTML");
    }
  };
  return { html, propsText: currentPropsText, error, fieldStates, setHtml, setPropsText, save };
}

/**
 * Renders the code fields of one editing session.
 *
 * @param props - Draft and layout.
 * @param props.draft - Editable text, its setters and the saved CodeMirror states.
 * @param props.listPropsText - Read-only list props JSON; omitted for elements.
 * @param props.fill - Whether the fields stretch to the fullscreen dialog.
 * @returns The labeled HTML, props and optional list-props fields.
 */
function HtmlEditorFields({
  draft,
  listPropsText,
  fill,
}: {
  readonly draft: SourceDraft;
  readonly listPropsText: string | undefined;
  readonly fill: boolean;
}) {
  const { fieldStates } = draft;
  return (
    <div className="html-code-fields">
      <CodeFieldLabel title="HTML">
        <HtmlCodeField
          fieldStates={fieldStates}
          value={draft.html}
          label="HTML source"
          language="html"
          fill={fill}
          onChange={draft.setHtml}
        />
      </CodeFieldLabel>
      <CodeFieldLabel title="Props">
        <HtmlCodeField
          fieldStates={fieldStates}
          value={draft.propsText}
          label="Widget props"
          language="json"
          fill={fill}
          onChange={draft.setPropsText}
        />
      </CodeFieldLabel>
      {listPropsText !== undefined && (
        <CodeFieldLabel title="List Props" readOnly>
          <HtmlCodeField
            fieldStates={fieldStates}
            value={listPropsText}
            label="List props"
            language="json"
            fill={fill}
            readOnly
          />
        </CodeFieldLabel>
      )}
    </div>
  );
}

/**
 * Wraps a code field with its visible title.
 *
 * @param props - Title and field.
 * @param props.title - Visible field title.
 * @param props.readOnly - Whether to show a "Read only" badge next to the title.
 * @param props.children - The code field.
 * @returns The labeled field.
 */
function CodeFieldLabel({
  title,
  readOnly = false,
  children,
}: {
  readonly title: string;
  readonly readOnly?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <label className="html-code-label">
      <span>
        {title}
        {readOnly && (
          <>
            {" "}
            <Badge variant="outline">Read only</Badge>
          </>
        )}
      </span>
      {children}
    </label>
  );
}

/** Props for {@link HtmlEditorActions}. */
interface HtmlEditorActionsProps {
  /** Whether the editor is currently shown in the fullscreen dialog. */
  readonly expanded: boolean;
  /**
   * Switches between the inline and fullscreen layouts.
   *
   * @returns Nothing. The layout changes without leaving edit mode.
   */
  readonly onToggleExpanded: () => void;
  /**
   * Saves the draft.
   *
   * @returns Nothing. The draft was saved, or an error is shown.
   */
  readonly onSave: () => void;
  /**
   * Discards the draft.
   *
   * @returns Nothing. The editor is closed.
   */
  readonly onCancel: () => void;
}

/**
 * Renders the title row with the expand/collapse, Close and Done buttons.
 *
 * @param props - Layout state and actions.
 * @param props.expanded - Whether the editor is in the fullscreen dialog.
 * @param props.onToggleExpanded - Switches between inline and fullscreen.
 * @param props.onSave - Saves the draft.
 * @param props.onCancel - Discards the draft and closes the editor.
 * @returns The action row.
 */
function HtmlEditorActions({
  expanded,
  onToggleExpanded,
  onSave,
  onCancel,
}: HtmlEditorActionsProps) {
  const expandLabel = expanded ? "Collapse HTML editor" : "Expand HTML editor";
  const buttonProps = { ...editorControlProps, type: "button" } as const;
  return (
    <div className="html-source-actions">
      <span className="html-source-title">
        <CodeXmlIcon size={16} aria-hidden="true" />
        HTML source
      </span>
      <ButtonGroup aria-label="HTML editor actions">
        <Button
          {...buttonProps}
          variant="outline"
          size="icon-sm"
          title={expandLabel}
          aria-label={expandLabel}
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? <Minimize2Icon aria-hidden="true" /> : <Maximize2Icon aria-hidden="true" />}
        </Button>
        <Button
          {...buttonProps}
          variant="outline"
          size="icon-sm"
          aria-label="Close"
          title="Close"
          onClick={onCancel}
        >
          <XIcon aria-hidden="true" />
        </Button>
        <Button
          {...buttonProps}
          variant="default"
          size="sm"
          title="Done"
          onClick={onSave}
        >
          <CheckIcon aria-hidden="true" />
          Done
        </Button>
      </ButtonGroup>
    </div>
  );
}
