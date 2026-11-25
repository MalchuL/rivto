/**
 * Canvas element that renders pasted HTML and gives the script its whole node.
 *
 * The host owns position and resize. The document fills that box, so a spinning
 * ring or clock scales while the resize gesture is still held.
 *
 * @module
 */
import { resolveEdgelessPointerTarget } from "../../edgeless/edgeless-pointer-target";
import type { ElementRenderProps } from "../../../managers/elements/types";
import type { ElementSlotProps } from "../../../managers/surfaces/types";
import { useReactPanel } from "../../../hooks/editor/use-react-panel";
import { useHtmlWidgetContext } from "../frame/use-html-widget-context";
import type { EditorElementNode, PanelAPI } from "@chulane/rivto";
import { useCallback, useMemo } from "react";
import { HtmlEditButton } from "../editing/html-edit-button";
import { HtmlSourceEditor } from "../editing/html-source-editor";
import { useHtmlEditing, type HtmlEditingStoreProps } from "../editing/use-html-editing";
import { HtmlFrame } from "../frame/html-frame";
import { readLabel } from "../model/widget-props";
import type { HtmlDraft, HtmlElementView, HtmlWidgetCommand } from "../types";

/** Props owned by the canvas rather than the widget's JSON editor. */
const HOST_OWNED_PROPS = ["html", "rotation"] as const;

/** Panel operations needed to read and update HTML elements. */
interface HtmlElementPanel {
  readonly elements: Pick<PanelAPI["elements"], "getElementNode" | "updateElement">;
}

/** Canvas selection operations used when a press inside the iframe selects the element. */
type HtmlElementSelection = Pick<
  ElementRenderProps["operations"],
  "getSelection" | "getParentId" | "select"
>;

/** Panel operations needed to save an HTML element draft in one history entry. */
interface HtmlElementDraftPanel extends HtmlElementPanel {
  readonly batchUpdates: PanelAPI["batchUpdates"];
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
}: ElementSlotProps & HtmlEditingStoreProps) {
  const reactPanel = useReactPanel();
  const [editing, setEditing] = useHtmlEditing(editingStore, "element", element.id);
  return (
    <HtmlEditButton
      editing={editing}
      onOpen={() => setEditing(true)}
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
 * @param props.selected - Whether the owning canvas element is selected.
 * @param props.operations - Panel-bound canvas selection operations.
 * @param props.editingStore - State shared with its slot in this extension installation.
 * @returns The sandbox or the source editor, filling the host frame.
 */
export function HtmlElement({
  element,
  reactPanel,
  preview,
  selected,
  operations,
  editingStore,
}: ElementRenderProps & HtmlEditingStoreProps) {
  const [editing, setEditing] = useHtmlEditing(editingStore, "element", element.id);
  const { node, context } = useHtmlElementView(element, selected, preview);
  const onCommand = useHtmlElementCommand(reactPanel, operations, element.id, preview);
  const label = readLabel(element.props, "HTML");
  const source = typeof element.props.html === "string" ? element.props.html : "";
  return (
    <div className="html-surface-canvas" data-html-surface="element" data-html-label={label}>
      {editing && !preview ? (
        <HtmlSourceEditor
          source={source}
          props={element.props}
          hiddenProps={HOST_OWNED_PROPS}
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
          context={context}
          fit="fill"
          interactive={!preview}
          onCommand={onCommand}
        />
      )}
    </div>
  );
}

/**
 * Routes widget notifications and writes to the owning canvas occurrence.
 *
 * @param panel - Borrowed operations for reading and updating elements.
 * @param operations - Borrowed canvas selection and parent operations.
 * @param id - Persisted element identity.
 * @param preview - Whether this is a detached, noninteractive placement preview.
 * @returns Stable callback that ignores commands from previews and deleted elements.
 */
function useHtmlElementCommand(
  panel: HtmlElementPanel,
  operations: HtmlElementSelection,
  id: string,
  preview: boolean,
): (command: HtmlWidgetCommand) => void {
  return useCallback(
    (command: HtmlWidgetCommand) => {
      if (preview) {
        return;
      }
      if (command.kind !== "pointerdown") {
        applyElementCommand(panel, id, command);
      } else if (panel.elements.getElementNode(id)) {
        selectHtmlElement(operations, id, command.primary);
      }
    },
    [preview, panel, id, operations],
  );
}

/**
 * Builds an element snapshot with its current surface and selection state.
 *
 * @param element - Detached element or placement preview supplied by the host.
 * @param selected - Whether the canvas selection includes the element.
 * @param preview - Whether the element is an uncommitted placement preview.
 * @returns Stable document data and separately observed presentation context.
 */
function useHtmlElementView(element: EditorElementNode, selected: boolean, preview: boolean) {
  const context = useHtmlWidgetContext(selected, preview);
  const node = useMemo(() => toElementView(element), [element]);
  return { node, context };
}

/**
 * Selects a canvas element after a pointer gesture inside its sandboxed frame.
 *
 * The iframe owns native selection and controls, so its pointer is not replayed
 * as a canvas drag. Group entry and modifier toggling follow the shared target policy.
 *
 * @param operations - Canvas selection and parent operations for this panel.
 * @param id - Persisted HTML element under the pointer.
 * @param primary - Whether Control or Meta was held during the gesture.
 * @returns Canvas selection reflects the iframe interaction.
 */
function selectHtmlElement(operations: HtmlElementSelection, id: string, primary: boolean): void {
  const current = operations.getSelection().items;
  const selectedId = current.length === 1 ? current[0] : undefined;
  const target = resolveEdgelessPointerTarget({
    elementId: id,
    parentId: operations.getParentId(id),
    selectedId,
    selectedParentId: selectedId ? operations.getParentId(selectedId) : undefined,
    primary,
  });
  const selected = current.includes(target);
  if (primary) {
    operations.select(selected ? current.filter((item) => item !== target) : [...current, target]);
  } else if (!selected) {
    operations.select([target]);
  }
}

/**
 * Copies the element fields a script is allowed to read.
 *
 * @param element - Detached element node from the canvas.
 * @returns A plain snapshot safe to post into the sandbox.
 */
function toElementView(element: EditorElementNode): Omit<HtmlElementView, "context"> {
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
  command: HtmlWidgetCommand,
): void {
  if (!panel.elements.getElementNode(elementId)) {
    return;
  }
  switch (command.kind) {
    case "set-prop":
      panel.elements.updateElement(elementId, { props: { [command.key]: command.value } });
      return;
    case "set-props":
      panel.elements.updateElement(elementId, { props: command.props });
      return;
    case "set-content":
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
  const data = { ...draft.propsPatch };
  for (const key of HOST_OWNED_PROPS) {
    delete data[key];
  }
  if (draft.source !== draft.openingSource) {
    data.html = draft.source;
  }
  if (!Object.keys(data).length) {
    return;
  }
  panel.batchUpdates(() => {
    panel.elements.updateElement(elementId, { props: data });
  });
}
