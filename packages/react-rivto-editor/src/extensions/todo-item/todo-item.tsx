/**
 * Provides the opt-in TODO-item model, renderer, properties dialog, and prompt
 * conversion behavior for every renderer exposing Rivto's plain-text content
 * contract. The extension owns TODO metadata and presentation while reusing
 * core block transactions, stable identities, and both registered surfaces.
 *
 * @module
 */
import type { ReactEditorExtension } from "../../managers";
import { TodoItem } from "./todo-item-renderer";
import { DefaultTodoItemPropertiesModal } from "./todo-item-properties";
import { TodoPromptController } from "./todo-prompt-controller";
import { TODO_ITEM_BLOCK_TYPE, createTodoItemProps, createPromptMap, todoItemPropsSchema, type TodoItemExtensionOptions } from "./todo-item-model";
import { TODO_STORAGE_BLOCK_TYPE, TodoStorage, TodoStorageBlockWrapper, TodoStorageVisibility, createTodoStorageProps, todoStorageView, todoStoragePropsSchema } from "./todo-storage";

export { TODO_ITEM_BLOCK_TYPE } from "./todo-item-model";
export type { TodoItemStatus, TodoItemProps, TodoItemBlock, TodoItemPropertiesPatch, TodoItemPropertiesModalProps, TodoItemExtensionOptions, TodoItemComponentProps } from "./todo-item-model";
export { TodoItem } from "./todo-item-renderer";
export { DefaultTodoItemPropertiesModal } from "./todo-item-properties";
export { TODO_STORAGE_BLOCK_TYPE, TodoStorage } from "./todo-storage";
export type { TodoStorageComponentProps, TodoStorageOrderMode, TodoStorageProps } from "./todo-storage";

/**
 * Installs TODO model/rendering plus delegated prompt recognition and conversion.
 *
 * @param options - Additional prompts and optional properties-modal replacement.
 * @returns Explicit opt-in React editor extension.
 */
export function todoItemExtension(
  options: TodoItemExtensionOptions = {},
): ReactEditorExtension {
  const prompts = createPromptMap(options.prompts);
  const PropertiesModal = options.propertiesModal ?? DefaultTodoItemPropertiesModal;
  return {
    id: "block.todo-item",
    setup: (editorRuntime) => {
      const disposers = [
        editorRuntime.blockTypes.register({
          definition: {
            type: TODO_STORAGE_BLOCK_TYPE,
            title: "TODO storage",
            defaultProps: createTodoStorageProps,
            propSchema: todoStoragePropsSchema,
            metadata: { containment: { childOutline: "free", outlineFloor: true } },
          },
          render: TodoStorage,
          view: todoStorageView,
          slashCommand: {
            id: "type.todo-storage",
            title: "TODO storage",
            group: "Turn into",
            keywords: ["tasks", "todos"],
            isAvailable: ({ blockId }) => (
              editorRuntime.blocks.hasBlock(blockId) && !editorRuntime.blocks.hasChildren(blockId)
            ),
          },
        }),
        editorRuntime.blockTypes.register({
          definition: {
            type: TODO_ITEM_BLOCK_TYPE,
            title: "TODO item",
            defaultProps: createTodoItemProps,
            propSchema: todoItemPropsSchema,
          },
          render: ({ blockId }) => <TodoItem blockId={blockId} propertiesModal={PropertiesModal} />,
        }),
        editorRuntime.surfaces.registerBlockWrapper("block", TodoStorageVisibility),
        editorRuntime.surfaces.registerBlockWrapper("edgeless", TodoStorageVisibility),
        editorRuntime.surfaces.registerBlockWrapper("block", TodoStorageBlockWrapper),
        editorRuntime.surfaces.registerBlockWrapper("edgeless", TodoStorageBlockWrapper),
        new TodoPromptController(editorRuntime, prompts).setup(),
      ];
      return () => {
        disposers.reverse().forEach((dispose) => dispose());
      };
    },
  };
}
