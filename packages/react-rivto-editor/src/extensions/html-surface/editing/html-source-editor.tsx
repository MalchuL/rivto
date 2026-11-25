/**
 * CodeMirror editor for a widget's HTML source and JSON props, inline or fullscreen.
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
import { HtmlCodeField } from "./html-code-field";

/** Props for {@link HtmlSourceEditor}. */
export interface HtmlSourceEditorProps {
  /** HTML source at the time the editor opens. */
  readonly source: string;
  /** Persisted widget properties at the time the editor opens. */
  readonly props: Record<string, unknown>;
  /** Property keys edited elsewhere and hidden from the JSON field (e.g. element `html`). */
  readonly hiddenProps?: readonly string[];
  /** Block list properties, shown read-only. Omit for canvas elements. */
  readonly listProps?: Record<string, unknown>;
  /** Extra controls shown above the fields in both layouts (e.g. the unsafe access toggle). */
  readonly children?: ReactNode;
  /**
   * Receives the draft when Done is pressed and the props JSON is valid.
   *
   * @param draft - New source and the session's property patch.
   * @returns The owner has saved the draft and closed the editor.
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
 * The opening values are captured once; later document changes do not reset
 * the draft, and saving yields only the edits made in this session (see
 * {@link changedPropPatch}). Expanding to fullscreen keeps each field's
 * CodeMirror state, so selection and undo history survive the switch.
 *
 * @param props - Opening values, optional extra controls and callbacks.
 * @returns The inline editor and its fullscreen dialog.
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
  const [fieldStates] = useState(() => new Map<string, EditorState>());
  const [opening] = useState(() => ({ source, propsText: formatWidgetProps(props, hiddenProps) }));
  // Read-only, so it follows the live document rather than the opening snapshot.
  const listPropsText = useMemo(() => listProps && JSON.stringify(listProps, null, 2), [listProps]);
  const [html, setHtml] = useState(opening.source);
  const [propsText, setPropsText] = useState(opening.propsText);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const save = () => {
    try {
      const openingProps = parseWidgetProps(opening.propsText);
      const propsPatch = changedPropPatch(openingProps, parseWidgetProps(propsText));
      onSave({ openingSource: opening.source, source: html, propsPatch });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the HTML");
    }
  };

  const pane = (fullscreen: boolean) => (
    <>
      <HtmlEditorActions
        expanded={fullscreen}
        onToggleExpanded={() => setExpanded(!fullscreen)}
        onSave={save}
        onCancel={onCancel}
      />
      <Separator />
      {children}
      <div className="html-code-fields">
        <CodeFieldLabel title="HTML">
          <HtmlCodeField
            fieldStates={fieldStates}
            value={html}
            label="HTML source"
            language="html"
            fill={fullscreen}
            onChange={setHtml}
          />
        </CodeFieldLabel>
        <CodeFieldLabel title="Props">
          <HtmlCodeField
            fieldStates={fieldStates}
            value={propsText}
            label="Widget props"
            language="json"
            fill={fullscreen}
            onChange={setPropsText}
          />
        </CodeFieldLabel>
        {listPropsText !== undefined && (
          <CodeFieldLabel title="List Props" readOnly>
            <HtmlCodeField
              fieldStates={fieldStates}
              value={listPropsText}
              label="List props"
              language="json"
              fill={fullscreen}
              readOnly
            />
          </CodeFieldLabel>
        )}
      </div>
      {error ? <p role="alert">{error}</p> : <p>{HTML_EDIT_HINT}</p>}
    </>
  );

  return (
    <div
      {...editorControlProps}
      ref={inline}
      className="html-source-editor"
      data-edgeless-ui="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {!expanded && pane(false)}
      <BlockModalDialog
        expanded={expanded}
        title="HTML source"
        onExpanded={setExpanded}
        restoreFocus={() =>
          inline.current?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.focus()
        }
      >
        <div className="html-source-editor html-source-editor-fullscreen" {...editorControlProps}>
          {pane(true)}
        </div>
      </BlockModalDialog>
    </div>
  );
}

/**
 * Wraps a code field with its visible title.
 *
 * @param props - Title, read-only badge flag and the field.
 * @returns A labeled field.
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
  readonly expanded: boolean;
  /**
   * Switches between inline and fullscreen layouts.
   *
   * @returns The layout has changed.
   */
  readonly onToggleExpanded: () => void;
  /**
   * Submits the draft.
   *
   * @returns The draft was saved, or an error is displayed.
   */
  readonly onSave: () => void;
  /**
   * Discards the draft.
   *
   * @returns The editor is closed.
   */
  readonly onCancel: () => void;
}

/**
 * Title row with the expand, close and Done actions.
 *
 * @param props - Layout state and action callbacks.
 * @returns The action row.
 */
function HtmlEditorActions({
  expanded,
  onToggleExpanded,
  onSave,
  onCancel,
}: HtmlEditorActionsProps) {
  const expandLabel = expanded ? "Collapse HTML editor" : "Expand HTML editor";
  return (
    <div className="html-source-actions">
      <span className="html-source-title">
        <CodeXmlIcon size={16} aria-hidden="true" />
        HTML source
      </span>
      <ButtonGroup aria-label="HTML editor actions">
        <Button
          {...editorControlProps}
          type="button"
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
          variant="default"
          size="sm"
          aria-label="Done"
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
