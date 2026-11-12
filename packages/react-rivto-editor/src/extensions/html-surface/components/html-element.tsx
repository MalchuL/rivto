/**
 * Canvas element that renders pasted HTML and gives the script its whole node.
 *
 * The host owns position and resize. The document fills that box, so a spinning
 * ring or clock scales while the resize gesture is still held.
 *
 * @module
 */
import type { ElementRenderProps } from "../../../managers/elements/types";
import type { ElementSlotProps } from "../../../managers/surfaces/types";
import { useReactPanel } from "../../../hooks/editor/use-react-panel";
import type { EditorElementNode, PanelAPI } from "@chulane/rivto";
import { useCallback, useMemo } from "react";
import { useHtmlEditing, type HtmlEditingStore } from "../hooks/use-html-editing";
import { HtmlSlotEditButton, HtmlSourceEditor } from "./html-chrome";
import { HtmlFrame } from "./html-frame";
import {
  formatWidgetProps,
  readLabel,
  replacedPropPatch,
  type HtmlDraft,
  type HtmlElementView,
  type HtmlFrameCommand,
} from "../protocol/protocol";

/** Panel operations needed to read and update HTML elements. */
interface HtmlElementPanel {
  readonly elements: Pick<PanelAPI["elements"], "getElementNode" | "updateElement">;
}

/** Panel operations needed to save an HTML element draft in one history entry. */
interface HtmlElementDraftPanel extends HtmlElementPanel {
  readonly batchUpdates: PanelAPI["batchUpdates"];
}

/** Shared editing state supplied by the installed extension. */
interface HtmlEditingProps {
  readonly editingStore: HtmlEditingStore;
}

/**
 * Opens the source editor from the element's right slot.
 *
 * Pointer down selects the element before the editor opens, matching the
 * canvas selection used by other visuals.
 *
 * @param props - Slot context for the HTML element.
 * @param props.element - Element whose edit flag this button toggles.
 * @param props.editingStore - State shared with the element renderer.
 * @returns The embedding-style edit button. A placement preview does not render slots.
 */
export function HtmlElementEditSlot({
  element,
  editingStore,
}: ElementSlotProps & HtmlEditingProps) {
  const reactPanel = useReactPanel();
  const [editing, setEditing] = useHtmlEditing(editingStore, "element", element.id);
  return (
    <HtmlSlotEditButton
      editing={editing}
      onToggle={() => setEditing(!editing)}
      onPointerDown={(event) => {
        event.stopPropagation();
        reactPanel.editor.commands.execute("edgeless.selection.set", {
          reactPanel,
          payload: [element.id],
        });
      }}
    />
  );
}

/**
 * Renders one HTML element from its registration.
 *
 * Creation previews paint the document and ignore writes. The edit control is
 * the right slot, which a preview host does not render.
 *
 * @param props - Element snapshot, panel, and preview flag from the canvas host.
 * @param props.element - Current element, including local property previews.
 * @param props.reactPanel - Panel used to update this element.
 * @param props.preview - True while the element is a detached placement ghost.
 * @param props.editingStore - State shared with its slot in this extension installation.
 * @returns The sandbox or the source editor, filling the host frame.
 */
export function HtmlElement({
  element,
  reactPanel,
  preview,
  editingStore,
}: ElementRenderProps & HtmlEditingProps) {
  const [editing, setEditing] = useHtmlEditing(editingStore, "element", element.id);
  const node = useMemo(() => toElementView(element), [element]);
  const onCommand = useCallback(
    (command: HtmlFrameCommand) => {
      if (!preview) {
        applyElementCommand(reactPanel, element.id, command);
      }
    },
    [preview, reactPanel, element.id],
  );
  const label = readLabel(element.props, "HTML");
  const source = typeof element.props.html === "string" ? element.props.html : "";
  return (
    <div className="html-surface-canvas" data-html-surface="element" data-html-label={label}>
      {editing && !preview ? (
        <HtmlSourceEditor
          source={source}
          propsText={formatWidgetProps(element.props, ["html", "rotation"])}
          onCancel={() => setEditing(false)}
          onSave={(draft) => {
            commitElementDraft(reactPanel, element.id, draft);
            setEditing(false);
          }}
        />
      ) : (
        <HtmlFrame
          frameName={label}
          source={source}
          node={node}
          fit="fill"
          interactive={!preview}
          onCommand={onCommand}
        />
      )}
    </div>
  );
}

/**
 * Copies the element fields a script is allowed to read.
 *
 * @param element - Detached element node from the canvas.
 * @returns A plain snapshot safe to post into the sandbox.
 */
function toElementView(element: EditorElementNode): HtmlElementView {
  return {
    kind: "element",
    id: element.id,
    type: element.type,
    frame: {
      x: element.frame.x,
      y: element.frame.y,
      width: element.frame.width,
      height: element.frame.height,
    },
    zIndex: element.zIndex,
    props: element.props,
    childIds: element.childIds,
  };
}

/**
 * Applies one sandbox write to the current element.
 *
 * List props are not stored on elements, so that command is ignored. Setting
 * content replaces the `html` property. Other commands merge props.
 *
 * @param panel - Panel that owns the element.
 * @param elementId - Stable id of the HTML element.
 * @param command - Validated write from the sandbox.
 * @returns Applies the write when the element still exists.
 */
function applyElementCommand(
  panel: HtmlElementPanel,
  elementId: string,
  command: HtmlFrameCommand,
): void {
  if (!panel.elements.getElementNode(elementId)) {
    return;
  }
  if (command.kind === "set-prop") {
    panel.elements.updateElement(elementId, { props: { [command.key]: command.value } });
    return;
  }
  if (command.kind === "set-props") {
    panel.elements.updateElement(elementId, { props: command.props });
    return;
  }
  if (command.kind === "set-content") {
    panel.elements.updateElement(elementId, { props: { html: command.content } });
  }
}

/**
 * Saves the HTML source and widget props, leaving canvas rotation in place.
 *
 * @param panel - Panel that owns the element.
 * @param elementId - Stable id of the HTML element.
 * @param draft - Source and parsed props from the editor. `html` in the JSON is ignored.
 * @returns Saves the draft when the element still exists.
 */
function commitElementDraft(
  panel: HtmlElementDraftPanel,
  elementId: string,
  draft: HtmlDraft,
): void {
  const current = panel.elements.getElementNode(elementId);
  if (!current) {
    return;
  }
  const data = { ...draft.props };
  delete data.html;
  delete data.rotation;
  panel.batchUpdates(() => {
    panel.elements.updateElement(elementId, {
      props: replacedPropPatch(current.props, { ...data, html: draft.source }, ["rotation"]),
    });
  });
}
