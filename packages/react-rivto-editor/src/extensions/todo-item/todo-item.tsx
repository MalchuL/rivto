/**
 * Provides the opt-in TODO-item model, renderer, properties dialog, and prompt
 * conversion behavior for every renderer exposing Rivto's plain-text content
 * contract. The extension owns TODO metadata and presentation while reusing
 * core block transactions, stable identities, and both registered surfaces.
 *
 * @module
 */
import type { ReactEditorExtension } from "../../managers";
import {
  TODO_ITEM_BLOCK_TYPE,
  createPromptMap,
  createTodoItemProps,
  todoItemPropsSchema,
  type TodoItemExtensionOptions,
} from "./todo-item-model";
import { DefaultTodoItemPropertiesModal } from "./todo-item-properties";
import { TodoItem } from "./todo-item-renderer";
import { TodoPromptController } from "./todo-prompt-controller";
import {
  TODO_STORAGE_BLOCK_TYPE,
  TodoStorage,
  TodoStorageBlockWrapper,
  TodoStorageVisibility,
  createTodoStorageProps,
  todoStorageBehavior,
  todoStoragePropsSchema,
} from "./todo-storage";

export { TODO_ITEM_BLOCK_TYPE } from "./todo-item-model";
export type {
  TodoItemBlock,
  TodoItemComponentProps,
  TodoItemExtensionOptions,
  TodoItemPropertiesModalProps,
  TodoItemPropertiesPatch,
  TodoItemProps,
  TodoItemStatus,
} from "./todo-item-model";
export { DefaultTodoItemPropertiesModal } from "./todo-item-properties";
export { TodoItem } from "./todo-item-renderer";
export { TODO_STORAGE_BLOCK_TYPE, TodoStorage } from "./todo-storage";
export type {
  TodoStorageComponentProps,
  TodoStorageOrderMode,
  TodoStorageProps,
} from "./todo-storage";

/**
 * Installs TODO model/rendering plus delegated prompt recognition and conversion.
 *
 * @param options - Additional prompts and optional properties-modal replacement.
 * @returns Explicit opt-in React editor extension.
 */
export function todoItemExtension(options: TodoItemExtensionOptions = {}): ReactEditorExtension {
  const prompts = createPromptMap(options.prompts);
  const PropertiesModal = options.propertiesModal ?? DefaultTodoItemPropertiesModal;
  return {
    id: "block.todo-item",
    setup: (reactEditor) => {
      const disposers = [
        reactEditor.blockContextMenu.register({
          id: "type.todo-item",
          title: "Convert to TODO item",
          order: 30,
          isAvailable: ({ reactPanel, blockIds }) =>
            blockIds.every((id) => {
              const block = reactPanel.blocks.getBlockNode(id);
              return Boolean(
                block &&
                block.type !== TODO_ITEM_BLOCK_TYPE &&
                block.type !== TODO_STORAGE_BLOCK_TYPE,
              );
            }),
          execute: ({ reactPanel, blockIds }) =>
            reactPanel.batchUpdates(() => {
              blockIds.forEach((id) => reactPanel.blocks.setBlockType(id, TODO_ITEM_BLOCK_TYPE));
            }),
        }),
        reactEditor.blockTypes.register({
          definition: {
            type: TODO_STORAGE_BLOCK_TYPE,
            title: "TODO storage",
            defaultProps: createTodoStorageProps,
            propSchema: todoStoragePropsSchema,
            metadata: { containment: { childOutline: "free", outlineFloor: true } },
          },
          render: TodoStorage,
          behavior: todoStorageBehavior,
          slashCommand: {
            id: "type.todo-storage",
            title: "TODO storage",
            group: "Turn into",
            keywords: ["tasks", "todos"],
            isAvailable: ({ blockId, reactPanel }) =>
              reactPanel.blocks.hasBlock(blockId) && !reactPanel.blocks.hasChildren(blockId),
          },
        }),
        reactEditor.blockTypes.register({
          definition: {
            type: TODO_ITEM_BLOCK_TYPE,
            title: "TODO item",
            defaultProps: createTodoItemProps,
            propSchema: todoItemPropsSchema,
          },
          render: ({ blockId }) => <TodoItem blockId={blockId} propertiesModal={PropertiesModal} />,
        }),
        reactEditor.surfaces.registerBlockWrapper("block", TodoStorageVisibility),
        reactEditor.surfaces.registerBlockWrapper("edgeless", TodoStorageVisibility),
        reactEditor.surfaces.registerBlockWrapper("block", TodoStorageBlockWrapper),
        reactEditor.surfaces.registerBlockWrapper("edgeless", TodoStorageBlockWrapper),
        new TodoPromptController(reactEditor, prompts).setup(),
      ];
      return () => {
        disposers.reverse().forEach((dispose) => dispose());
      };
    },
  };
}
