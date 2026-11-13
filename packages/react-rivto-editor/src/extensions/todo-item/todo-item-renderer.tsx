import { BlockText } from "../../authoring/block-text";
import { CheckIcon, EllipsisIcon, MinusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select";
import { editorControlProps } from "../../constants";
import { useBlockEditing, useReactPanel } from "../../hooks";
import { TodoItemActions } from "./todo-item-actions";
import {
  TODO_BODY_CLASS,
  TODO_DESCRIPTION_CLASS,
  TODO_ITEM_CLASS,
  TODO_META_CLASS,
  TODO_NAME_CLASS,
  TODO_PRIORITY_CLASS,
  TODO_PROJECT_CLASS,
  TODO_PROPERTIES_BUTTON_CLASS,
  TODO_STATUS_CLASS,
  TODO_STATUS_DOING_CLASS,
  TODO_STATUS_DONE_CLASS,
  TODO_STATUS_TODO_CLASS,
} from "./todo-item-classes";
import type {
  TodoItemBlock,
  TodoItemComponentProps,
  TodoItemPropertiesPatch,
  TodoItemProps,
} from "./todo-item-model";
import { DefaultTodoItemPropertiesModal } from "./todo-item-properties";

/** Data and borrowed operations needed by the inline property controls. */
interface TodoItemMetaProps {
  readonly block: TodoItemBlock;
  readonly editing: Pick<
    ReturnType<typeof useBlockEditing<TodoItemProps>>,
    "preventTextEditingAttributes"
  >;
  readonly actions: Pick<TodoItemActions, "commitProperties">;
}

/** Data and borrowed operations needed to render the inline TODO fields. */
interface TodoItemBodyProps {
  readonly block: TodoItemBlock;
  readonly editing: Pick<
    ReturnType<typeof useBlockEditing<TodoItemProps>>,
    "attributes" | "preventTextEditingAttributes"
  >;
  readonly actions: Pick<TodoItemActions, "commitText" | "commitProperties">;
}

/**
 * Renders the priority and project controls for the current TODO snapshot.
 *
 * @param props - Current block, editing prevention attributes and property operation.
 * @param props.block - Snapshot supplying the displayed property values.
 * @param props.editing - Attributes protecting controls from block text editing.
 * @param props.actions - Operation that validates and commits changed properties.
 * @returns Inline priority and project controls.
 */
function TodoItemMeta({ block, editing, actions }: TodoItemMetaProps) {
  return (
    <div className={TODO_META_CLASS}>
      <NativeSelect
        {...editorControlProps}
        {...editing.preventTextEditingAttributes}
        className={TODO_PRIORITY_CLASS}
        aria-label="Priority"
        value={block.props.priority}
        onChange={(event) =>
          actions.commitProperties({
            priority: Number(event.currentTarget.value) as TodoItemProps["priority"],
          })
        }
      >
        {[1, 2, 3, 4].map((priority) => (
          <NativeSelectOption key={priority} value={priority}>
            P{priority}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Input
        {...editorControlProps}
        {...editing.preventTextEditingAttributes}
        className={TODO_PROJECT_CLASS}
        aria-label="Project"
        value={block.props.project}
        placeholder="Add project"
        onChange={(event) => actions.commitProperties({ project: event.currentTarget.value })}
      />
    </div>
  );
}

/**
 * Renders the editable TODO name and inline property controls.
 *
 * @param props - Current block, editing attributes and borrowed mutation operations.
 * @param props.block - Snapshot supplying the displayed property values.
 * @param props.editing - Hook-owned text attributes and control prevention attributes.
 * @param props.actions - Operations that commit text or properties with timestamps.
 * @returns Editable name, description and metadata controls.
 */
function TodoItemBody({ block, editing, actions }: TodoItemBodyProps) {
  /**
   * Updates content and its timestamp inside one editor batch.
   *
   * @param event - Input event received by the hook-owned editable.
   * @returns Commits the input and timestamp through the current block operations.
   */
  const updateName = (event: Parameters<typeof editing.attributes.onInput>[0]): void => {
    actions.commitText(() => editing.attributes.onInput(event));
  };
  /**
   * Completes IME input and advances its timestamp atomically.
   *
   * @param event - Composition completion event received by the editable.
   * @returns Commits the composition result and timestamp in one batch.
   */
  const finishComposition = (
    event: Parameters<typeof editing.attributes.onCompositionEnd>[0],
  ): void => {
    actions.commitText(() => editing.attributes.onCompositionEnd(event));
  };
  return (
    <div className={TODO_BODY_CLASS}>
      <BlockText
        attributes={{
          ...editing.attributes,
          onInput: updateName,
          onCompositionEnd: finishComposition,
        }}
        className={TODO_NAME_CLASS}
        label="TODO item name"
      />
      <Input
        {...editorControlProps}
        {...editing.preventTextEditingAttributes}
        className={TODO_DESCRIPTION_CLASS}
        aria-label="Description"
        value={block.props.description}
        placeholder="Add description"
        onChange={(event) => actions.commitProperties({ description: event.currentTarget.value })}
      />
      <TodoItemMeta block={block} editing={editing} actions={actions} />
    </div>
  );
}

/**
 * Renders the workflow-status control for the current TODO snapshot.
 *
 * @param block - Snapshot supplying the displayed status.
 * @param editing - Attributes protecting the button from block text editing.
 * @param cycleStatus - Callback that commits the next workflow status.
 * @returns Accessible status button with its current icon and color.
 */
function renderTodoStatus(
  block: TodoItemBlock,
  editing: Pick<ReturnType<typeof useBlockEditing<TodoItemProps>>, "preventTextEditingAttributes">,
  cycleStatus: () => void,
) {
  const statusClass = {
    todo: TODO_STATUS_TODO_CLASS,
    doing: TODO_STATUS_DOING_CLASS,
    done: TODO_STATUS_DONE_CLASS,
  }[block.props.status];
  const statusIcon = {
    todo: null,
    doing: <MinusIcon aria-hidden="true" />,
    done: <CheckIcon aria-hidden="true" />,
  }[block.props.status];

  return (
    <Button
      {...editorControlProps}
      {...editing.preventTextEditingAttributes}
      variant="ghost"
      size="icon-xs"
      className={`${TODO_STATUS_CLASS} ${statusClass}`}
      type="button"
      aria-label={`Status: ${block.props.status}. Change status`}
      onClick={cycleStatus}
    >
      {statusIcon}
    </Button>
  );
}

/**
 * Renders one compact, editable TODO row and its selected properties modal.
 *
 * @param props - Stable block identity and configured modal implementation.
 * @returns TODO controls, editable name, and an optional dialog.
 */
export function TodoItem({
  blockId,
  propertiesModal: PropertiesModal = DefaultTodoItemPropertiesModal,
}: TodoItemComponentProps) {
  const reactPanel = useReactPanel();
  const editing = useBlockEditing<TodoItemProps>(blockId);
  const actions = useMemo(() => new TodoItemActions(reactPanel, blockId), [reactPanel, blockId]);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const block = editing.block as TodoItemBlock | undefined;
  if (!block) {
    return null;
  }

  /**
   * Closes the modal and commits a valid changed patch.
   *
   * @param patch - Optional changes supplied by the properties modal.
   * @returns Closes the dialog and commits a changed, valid patch when supplied.
   */
  const closeProperties = (patch?: TodoItemPropertiesPatch): void => {
    setPropertiesOpen(false);
    actions.commitProperties(patch);
  };

  return (
    <div
      className={TODO_ITEM_CLASS}
      data-todo-status={block.props.status}
      data-todo-priority={block.props.priority}
    >
      {renderTodoStatus(block, editing, actions.cycleStatus)}
      <TodoItemBody block={block} editing={editing} actions={actions} />
      <Button
        {...editorControlProps}
        {...editing.preventTextEditingAttributes}
        variant="ghost"
        size="icon-xs"
        className={TODO_PROPERTIES_BUTTON_CLASS}
        type="button"
        aria-label="Open TODO properties"
        onClick={() => setPropertiesOpen(true)}
      >
        <EllipsisIcon />
      </Button>
      {propertiesOpen && <PropertiesModal block={block} onClose={closeProperties} />}
    </div>
  );
}
