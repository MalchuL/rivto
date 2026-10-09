import { useMemo, useState } from "react";
import { CheckIcon, EllipsisIcon, MinusIcon } from "lucide-react";
import { editorControlProps } from "../../constants";
import { useBlockEditing, useEditorView } from "../../hooks";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select";
import { DefaultTodoItemPropertiesModal } from "./todo-item-properties";
import { TodoItemActions } from "./todo-item-actions";
import type { TodoItemProps, TodoItemBlock, TodoItemComponentProps, TodoItemPropertiesPatch } from "./todo-item-model";
import { TODO_ITEM_CLASS, TODO_BODY_CLASS, TODO_NAME_CLASS, TODO_DESCRIPTION_CLASS, TODO_META_CLASS, TODO_PRIORITY_CLASS, TODO_PROJECT_CLASS, TODO_PROPERTIES_BUTTON_CLASS, TODO_STATUS_CLASS, TODO_STATUS_TODO_CLASS, TODO_STATUS_DOING_CLASS, TODO_STATUS_DONE_CLASS } from "./todo-item-classes";

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
  const editorView = useEditorView();
  const editing = useBlockEditing<TodoItemProps>(blockId);
  const actions = useMemo(() => new TodoItemActions(editorView, blockId), [editorView, blockId]);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const block = editing.block as TodoItemBlock | undefined;
  if (!block) return null;

  /** Updates content and its timestamp inside one editor batch. */
  const updateName = (event: Parameters<typeof editing.attributes.onInput>[0]): void => {
    actions.commitText(() => editing.attributes.onInput(event));
  };
  /** Completes IME input and advances its timestamp atomically. */
  const finishComposition = (event: Parameters<typeof editing.attributes.onCompositionEnd>[0]): void => {
    actions.commitText(() => editing.attributes.onCompositionEnd(event));
  };
  /** Closes the modal and commits a valid changed patch. */
  const closeProperties = (patch?: TodoItemPropertiesPatch): void => {
    setPropertiesOpen(false);
    actions.commitProperties(patch);
  };

  const statusClass = {
    todo: TODO_STATUS_TODO_CLASS,
    doing: TODO_STATUS_DOING_CLASS,
    done: TODO_STATUS_DONE_CLASS,
  }[block.props.status];
  const statusIcon = { todo: null, doing: <MinusIcon aria-hidden="true" />, done: <CheckIcon aria-hidden="true" /> }[block.props.status];

  return (
    <div
      className={TODO_ITEM_CLASS}
      data-todo-status={block.props.status}
      data-todo-priority={block.props.priority}
    >
      <Button {...editorControlProps}
        {...editing.preventTextEditingAttributes}
        variant="ghost"
        size="icon-xs"
        className={`${TODO_STATUS_CLASS} ${statusClass}`}
        type="button"
        aria-label={`Status: ${block.props.status}. Change status`}
        onClick={actions.cycleStatus}
      >
        {statusIcon}
      </Button>
      <div className={TODO_BODY_CLASS}>
        <div
          {...editing.attributes}
          className={TODO_NAME_CLASS}
          role="textbox"
          aria-label="TODO item name"
          onInput={updateName}
          onCompositionEnd={finishComposition}
        />
        <Input {...editorControlProps}
          {...editing.preventTextEditingAttributes}
          className={TODO_DESCRIPTION_CLASS}
          aria-label="Description"
          value={block.props.description}
          placeholder="Add description"
          onChange={(event) => actions.commitProperties({ description: event.currentTarget.value })}
        />
        <div className={TODO_META_CLASS}>
          <NativeSelect {...editorControlProps}
            {...editing.preventTextEditingAttributes}
            className={TODO_PRIORITY_CLASS}
            aria-label="Priority"
            value={block.props.priority}
            onChange={(event) => actions.commitProperties({
              priority: Number(event.currentTarget.value) as TodoItemProps["priority"],
            })}
          >
            {[1, 2, 3, 4].map((priority) => <NativeSelectOption key={priority} value={priority}>P{priority}</NativeSelectOption>)}
          </NativeSelect>
          <Input {...editorControlProps}
            {...editing.preventTextEditingAttributes}
            className={TODO_PROJECT_CLASS}
            aria-label="Project"
            value={block.props.project}
            placeholder="Add project"
            onChange={(event) => actions.commitProperties({ project: event.currentTarget.value })}
          />
        </div>
      </div>
      <Button {...editorControlProps}
        {...editing.preventTextEditingAttributes}
        variant="ghost"
        size="icon-xs"
        className={TODO_PROPERTIES_BUTTON_CLASS}
        type="button"
        aria-label="Open TODO properties"
        onClick={() => setPropertiesOpen(true)}
      ><EllipsisIcon /></Button>
      {propertiesOpen && <PropertiesModal block={block} onClose={closeProperties} />}
    </div>
  );
}

