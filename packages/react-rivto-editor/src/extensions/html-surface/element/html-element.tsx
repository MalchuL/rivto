/**
 * Edgeless canvas element that runs an HTML widget.
 *
 * The canvas owns the element's position and size; the widget page fills that
 * box. Because the iframe follows the host box, a widget scales live while a
 * resize gesture is still in progress.
 *
 * @module
 */
import type { EditorElementNode, PanelAPI } from "@chulane/rivto";
import { useCallback, useMemo } from "react";
import { useReactPanel } from "../../../hooks/editor/use-react-panel";
import type { ElementRenderProps } from "../../../managers/elements/types";
import type { ElementSlotProps } from "../../../managers/surfaces/types";
import { resolveEdgelessPointerTarget } from "../../edgeless/edgeless-pointer-target";
import { HtmlEditButton } from "../editing/html-edit-button";
import { HtmlSourceEditor } from "../editing/html-source-editor";
import { useHtmlEditing, type HtmlEditingStoreProps } from "../editing/use-html-editing";
import { HtmlFrame } from "../frame/html-frame";
import { useHtmlWidgetContext } from "../frame/use-html-widget-context";
import type { HtmlSurfaceLimitsProps } from "../options";
import type { HtmlDraft, HtmlElementView, HtmlWidgetCommand } from "../types";

/**
 * Element props managed by the canvas or the HTML field, not by the props JSON.
 *
 * They are hidden from the JSON field and never written from it, so editing
 * widget props cannot overwrite the source or the canvas rotation.
 */
const HOST_OWNED_PROPS = ["html", "rotation"] as const;

/** The panel operations an HTML element reads and writes through. */
type HtmlElementPanel = {
  /** Element reads and writes of the panel. */
  readonly elements: Pick<PanelAPI["elements"], "getElementNode" | "updateElement">;
  /** Groups several writes into one undo step. */
  readonly batchUpdates: PanelAPI["batchUpdates"];
};

/** The canvas selection operations used when a press inside the iframe selects the element. */
type HtmlElementSelection = Pick<
  ElementRenderProps["operations"],
  "getSelection" | "getParentId" | "select"
>;

/**
 * Renders the edit button in an HTML element's right slot.
 *
 * Pressing the button first selects the element, the same way pressing any
 * other canvas object selects it, and then opens the editor on click.
 * Placement previews have no slots, so this never renders for a preview.
 *
 * @param props - Slot props supplied by the surface.
 * @param props.element - Element the slot belongs to.
 * @param props.editingStore - Editing state shared with the element renderer.
 * @returns The edit button, or nothing while the editor is open.
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
 * Renders an HTML canvas element: the source editor while editing, otherwise the widget.
 *
 * A placement preview (the ghost shown while placing a new element) renders
 * the widget but never opens the editor, and its writes are ignored.
 *
 * @param props - Renderer props supplied by the canvas host.
 * @param props.element - Current element, including local property previews during gestures.
 * @param props.reactPanel - Panel the element's writes go through.
 * @param props.preview - True while the element is a placement preview.
 * @param props.selected - Whether the canvas selection includes the element.
 * @param props.operations - Canvas selection operations of this panel.
 * @param props.editingStore - Editing state shared with the element's edit slot.
 * @param props.limits - Frame limits of this extension installation.
 * @returns The editor or the widget, filling the element box.
 */
export function HtmlElement(
  props: ElementRenderProps & HtmlEditingStoreProps & HtmlSurfaceLimitsProps,
) {
  const { element, reactPanel, preview, selected, operations, editingStore, limits } = props;
  const [editing, setEditing] = useHtmlEditing(editingStore, "element", element.id);
  const context = useHtmlWidgetContext(selected, preview);
  const node = useMemo(() => toElementView(element), [element]);
  const onCommand = useHtmlElementCommand(reactPanel, operations, element.id, preview);
  const source = typeof element.props.html === "string" ? element.props.html : "";
  let body;
  if (editing && !preview) {
    body = (
      <HtmlSourceEditor
        source={source}
        node={node}
        selected={selected}
        limits={limits}
        hiddenProps={HOST_OWNED_PROPS}
        onCancel={() => setEditing(false)}
        onSave={(draft) => {
          commitElementDraft(reactPanel, element.id, draft);
          setEditing(false);
        }}
      />
    );
  } else {
    body = (
      <HtmlFrame
        source={source}
        node={node}
        context={context}
        fit="fill"
        limits={limits}
        interactive={!preview}
        onCommand={onCommand}
      />
    );
  }
  return (
    <div className="html-surface-canvas" data-html-surface="element">
      {body}
    </div>
  );
}

/**
 * Returns the handler for commands from an element's widget.
 *
 * A pointer press inside the iframe selects the element, because the iframe
 * swallows the press and the canvas never sees it. Writes update the element.
 * Previews and deleted elements ignore everything.
 *
 * @param panel - Panel the writes go through.
 * @param operations - Canvas selection operations of this panel.
 * @param id - ID of the HTML element.
 * @param preview - Whether this occurrence is a placement preview.
 * @returns A stable command handler.
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
 * Updates the canvas selection after a press inside an element's iframe.
 *
 * The press itself stays with the iframe, so buttons work on the first click
 * and text stays selectable; it is not replayed as a canvas drag. Which
 * element gets selected follows the normal canvas rules: the first plain
 * click on a grouped element selects its group, a later click selects the
 * element itself, and Ctrl/Cmd toggles it in the current selection.
 *
 * @param operations - Canvas selection operations of this panel.
 * @param id - ID of the HTML element that was pressed.
 * @param primary - Whether Ctrl or Cmd was held.
 * @returns Nothing. The canvas selection reflects the press.
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
  const alreadySelected = current.includes(target);
  if (!primary) {
    if (!alreadySelected) {
      operations.select([target]);
    }
    return;
  }
  if (alreadySelected) {
    operations.select(current.filter((item) => item !== target));
  } else {
    operations.select([...current, target]);
  }
}

/**
 * Copies the element fields a widget script is allowed to read.
 *
 * @param element - Detached element snapshot.
 * @returns A plain object that can be posted into the sandbox. The frame adds
 * the presentation context when posting.
 */
function toElementView(element: EditorElementNode): Omit<HtmlElementView, "context"> {
  const { x, y, width, height } = element.frame;
  return {
    kind: "element",
    id: element.id,
    type: element.type,
    frame: { x, y, width, height },
    zIndex: element.zIndex,
    props: element.props,
    childIds: element.childIds,
  };
}

/**
 * Applies one widget write to the element.
 *
 * Elements have no list props, so `set-list-props` is ignored. `set-content`
 * replaces the `html` prop; the other writes merge into props. A write for an
 * element deleted in the meantime is dropped.
 *
 * @param panel - Panel that owns the element.
 * @param elementId - ID of the HTML element.
 * @param command - Write already validated by the message parser.
 * @returns Nothing. The write is applied when the element still exists.
 */
function applyElementCommand(
  panel: Pick<HtmlElementPanel, "elements">,
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
 * Writes a source-editor draft to the element as one undo step.
 *
 * Applies the session's patch to the current element, preserving props outside
 * the patch. The JSON field cannot write host-owned `html` or `rotation`. The
 * save handler adds `props.html` to the patch when the submitted source differs
 * from the opening source. A props-only edit therefore keeps the current HTML.
 * A missing element or an empty patch results in no write.
 *
 * @param panel - Panel that owns the element.
 * @param elementId - ID of the HTML element.
 * @param draft - Draft produced by the source editor.
 * @returns The edited fields have been applied if the element still exists and the patch is nonempty.
 * @throws If the panel rejects the update or the history batch fails.
 */
function commitElementDraft(panel: HtmlElementPanel, elementId: string, draft: HtmlDraft): void {
  if (!panel.elements.getElementNode(elementId)) {
    return;
  }
  const patch = { ...draft.propsPatch };
  for (const key of HOST_OWNED_PROPS) {
    delete patch[key];
  }
  if (draft.source !== draft.openingSource) {
    patch.html = draft.source;
  }
  if (Object.keys(patch).length === 0) {
    return;
  }
  panel.batchUpdates(() => {
    panel.elements.updateElement(elementId, { props: patch });
  });
}
