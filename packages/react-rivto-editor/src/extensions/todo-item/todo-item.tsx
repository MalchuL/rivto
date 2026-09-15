/**
 * Provides the opt-in TODO-item model, renderer, properties dialog, and prompt
 * conversion behavior for every renderer exposing Rivto's plain-text content
 * contract. The extension owns TODO metadata and presentation while reusing
 * core block transactions, stable identities, and both registered surfaces.
 *
 * @module
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type MouseEvent,
} from "react";
import type { EditorBlock } from "@chulane/rivto";
import { z } from "zod";
import { useBlockEditing, useEditor, useReactEditor } from "../../hooks";
import {
  restoreDOMSelection,
  saveDOMSelection,
  type ReactEditorExtension,
} from "../../managers";
import type { ReactEditor } from "../../types";
import {
  TODO_BODY_CLASS,
  TODO_DESCRIPTION_CLASS,
  TODO_ITEM_CLASS,
  TODO_META_CLASS,
  TODO_MODAL_CLASS,
  TODO_MODAL_CLOSE_CLASS,
  TODO_MODAL_FIELDS_CLASS,
  TODO_MODAL_HEADER_CLASS,
  TODO_MODAL_TIMESTAMPS_CLASS,
  TODO_NAME_CLASS,
  TODO_PRIORITY_CLASS,
  TODO_PROJECT_CLASS,
  TODO_PROMPT_CLASS,
  TODO_PROPERTIES_BUTTON_CLASS,
  TODO_STATUS_CLASS,
  TODO_STATUS_DOING_CLASS,
  TODO_STATUS_DONE_CLASS,
  TODO_STATUS_TODO_CLASS,
} from "./todo-item-classes";
import {
  TODO_STORAGE_BLOCK_TYPE,
  TodoStorage,
  TodoStorageBlockWrapper,
  TodoStorageVisibility,
  createTodoStorageProps,
  todoStorageView,
  todoStoragePropsSchema,
} from "./todo-storage";

export {
  TODO_STORAGE_BLOCK_TYPE,
  TodoStorage,
} from "./todo-storage";
export type {
  TodoStorageComponentProps,
  TodoStorageOrderMode,
  TodoStorageProps,
} from "./todo-storage";

/** Persisted native type installed by {@link todoItemExtension}. */
export const TODO_ITEM_BLOCK_TYPE = "todo-item";

/** Workflow states supported by a TODO item. */
export type TodoItemStatus = "todo" | "doing" | "done";

/** Complete validated native properties stored on each TODO item. */
export interface TodoItemProps extends Record<string, unknown> {
  readonly status: TodoItemStatus;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly priority: 1 | 2 | 3 | 4;
  readonly project: string;
}

/** Typed TODO block supplied to properties-modal implementations. */
export type TodoItemBlock = Omit<EditorBlock, "props"> & {
  readonly props: TodoItemProps & Record<string, unknown>;
};

/** Fields a properties modal may request to change when it closes. */
export type TodoItemPropertiesPatch = Partial<Pick<
  TodoItemProps,
  "status" | "description" | "priority" | "project"
>>;

/** Props shared by the default and host-supplied TODO properties modals. */
export interface TodoItemPropertiesModalProps {
  readonly block: TodoItemBlock;
  readonly onClose: (patch?: TodoItemPropertiesPatch) => void;
}

/** Configuration accepted by {@link todoItemExtension}. */
export interface TodoItemExtensionOptions {
  /** Additional case-sensitive prompt aliases grouped by resulting status. */
  readonly prompts?: Partial<Record<TodoItemStatus, readonly string[]>>;
  /** Optional replacement for the native default properties dialog. */
  readonly propertiesModal?: ComponentType<TodoItemPropertiesModalProps>;
}

/** Props accepted by the exported TODO item renderer. */
export interface TodoItemComponentProps {
  readonly blockId: string;
  readonly propertiesModal?: ComponentType<TodoItemPropertiesModalProps>;
}

const TODO_STATUSES = ["todo", "doing", "done"] as const;
const DEFAULT_PROMPTS: Readonly<Record<TodoItemStatus, readonly string[]>> = {
  todo: ["todo", "TODO"],
  doing: ["doing", "DOING"],
  done: ["done", "DONE"],
};

const utcTimestampSchema = z.iso.datetime({ offset: false }).refine((value) => value.endsWith("Z"));
const todoItemPropsSchema = z.object({
  status: z.enum(TODO_STATUSES),
  description: z.string(),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  project: z.string(),
});

interface PromptMatch {
  readonly prompt: string;
  readonly status: TodoItemStatus;
}

interface TodoCandidate extends PromptMatch {
  readonly blockId: string;
  readonly contentElement: HTMLElement;
}

/**
 * Produces a timestamp newer than the previous value, even for same-tick edits.
 *
 * @param previous - Current valid UTC timestamp.
 * @returns Current time or the next millisecond after the previous timestamp.
 */
const nextTimestamp = (previous: string): string => (
  new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
);

/**
 * Returns the next workflow state in the fixed TODO cycle.
 *
 * @param status - Current TODO status.
 * @returns Following status, wrapping done back to todo.
 */
const nextStatus = (status: TodoItemStatus): TodoItemStatus => (
  TODO_STATUSES[(TODO_STATUSES.indexOf(status) + 1) % TODO_STATUSES.length]!
);

/**
 * Builds and validates the prompt-to-status lookup for one extension instance.
 *
 * @param aliases - Host aliases that extend the built-in prompt set.
 * @returns Validated prompt lookup.
 */
const createPromptMap = (
  aliases: TodoItemExtensionOptions["prompts"],
): ReadonlyMap<string, TodoItemStatus> => {
  const prompts = new Map<string, TodoItemStatus>();
  for (const status of TODO_STATUSES) {
    for (const prompt of [...DEFAULT_PROMPTS[status], ...(aliases?.[status] ?? [])]) {
      if (!prompt || /\s/.test(prompt)) {
        throw new Error("TODO prompt aliases must be non-empty and contain no whitespace");
      }
      const existing = prompts.get(prompt);
      if (existing && existing !== status) {
        throw new Error(`TODO prompt ${prompt} is assigned to conflicting statuses`);
      }
      prompts.set(prompt, status);
    }
  }
  return prompts;
};

/**
 * Recognizes a configured token only at character zero and at a word boundary.
 *
 * @param content - Complete plain-text block content.
 * @param prompts - Validated prompt lookup.
 * @returns Matching prompt and status, or undefined for ordinary content.
 */
const matchPrompt = (
  content: string,
  prompts: ReadonlyMap<string, TodoItemStatus>,
): PromptMatch | undefined => {
  const prompt = content.match(/^\S+/)?.[0];
  const status = prompt ? prompts.get(prompt) : undefined;
  return prompt && status ? { prompt, status } : undefined;
};

/**
 * Replaces prompt decoration without changing text or the current DOM range.
 *
 * @param element - Plain-text editable host to update.
 * @param prompt - Matching leading token, or undefined to clear decoration.
 * @returns No value.
 */
const decoratePrompt = (element: HTMLElement, prompt?: string): void => {
  const text = element.textContent ?? "";
  const current = element.querySelector<HTMLElement>(`.${TODO_PROMPT_CLASS}`);
  if ((!prompt && !current) || (prompt && current?.textContent === prompt && current === element.firstChild)) return;
  const selection = saveDOMSelection(element);
  element.textContent = text;
  if (prompt) {
    const tail = element.firstChild;
    const promptNode = element.ownerDocument.createElement("span");
    promptNode.className = TODO_PROMPT_CLASS;
    promptNode.textContent = prompt;
    if (tail) {
      tail.textContent = text.slice(prompt.length);
      element.insertBefore(promptNode, tail);
    } else {
      element.append(promptNode);
    }
  }
  restoreDOMSelection(element, selection);
};

/**
 * Creates fresh TODO-owned values with identical creation/update timestamps.
 *
 * @returns A complete default property record for one insertion or conversion.
 */
const createTodoItemProps = (): TodoItemProps => {
  const timestamp = new Date().toISOString();
  return {
    status: "todo",
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    priority: 4,
    project: "",
  };
};

/**
 * Commits a validated modal patch and owns updatedAt generation.
 *
 * @param reactEditor - Runtime containing the current block.
 * @param blockId - Stable TODO block identity.
 * @param patch - Optional host or default-modal patch.
 * @returns Whether a changed, valid patch was written.
 */
const commitPropertiesPatch = (
  reactEditor: ReactEditor,
  blockId: string,
  patch?: TodoItemPropertiesPatch,
): boolean => {
  const block = reactEditor.editor.blocks.getBlock(blockId);
  if (!block || block.type !== TODO_ITEM_BLOCK_TYPE || !patch) return false;
  const changed = Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => block.props[key] !== value),
  );
  if (!Object.keys(changed).length) return false;
  const updatedAt = nextTimestamp(String(block.props.updatedAt));
  const result = todoItemPropsSchema.loose().safeParse({ ...block.props, ...changed, updatedAt });
  if (!result.success) return false;
  reactEditor.editor.batchUpdates(() => {
    reactEditor.blocks.updateBlock(blockId, { props: { ...changed, updatedAt } });
  });
  return true;
};

/**
 * Renders the native auto-committing TODO properties dialog.
 *
 * @param props - Current typed block and close callback owned by the extension.
 * @returns Native dialog with local form state and read-only timestamps.
 */
export function DefaultTodoItemPropertiesModal({
  block,
  onClose,
}: TodoItemPropertiesModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closedRef = useRef(false);
  const initial = block.props;
  const [draft, setDraft] = useState<TodoItemPropertiesPatch>({
    status: initial.status,
    description: initial.description,
    priority: initial.priority,
    project: initial.project,
  });

  /** Commits the local draft once for every native close path. */
  const finish = useCallback((): void => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose(draft);
  }, [draft, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  /** Handles Escape through the native dialog cancellation event. */
  const cancel = (event: FormEvent<HTMLDialogElement>): void => {
    event.preventDefault();
    finish();
  };

  /** Treats clicks on the native backdrop, but not dialog children, as close. */
  const backdrop = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) finish();
  };

  return (
    <dialog
      ref={dialogRef}
      className={TODO_MODAL_CLASS}
      aria-label="TODO item properties"
      onCancel={cancel}
      onClose={finish}
      onClick={backdrop}
    >
      <div className={TODO_MODAL_HEADER_CLASS}>
        <strong>TODO properties</strong>
        <button className={TODO_MODAL_CLOSE_CLASS} type="button" aria-label="Close properties" onClick={finish}>×</button>
      </div>
      <div className={TODO_MODAL_FIELDS_CLASS}>
        <label>Status
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TodoItemStatus })}>
            {TODO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label>Description
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <label>Priority
          <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) as TodoItemProps["priority"] })}>
            {[1, 2, 3, 4].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
        </label>
        <label>Project
          <input value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} />
        </label>
      </div>
      <div className={TODO_MODAL_TIMESTAMPS_CLASS}>
        <span>Created <time dateTime={initial.createdAt}>{initial.createdAt}</time></span>
        <span>Updated <time dateTime={initial.updatedAt}>{initial.updatedAt}</time></span>
      </div>
    </dialog>
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
  const editor = useEditor();
  const reactEditor = useReactEditor();
  const editing = useBlockEditing<TodoItemProps>(blockId);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const block = editing.block as TodoItemBlock | undefined;
  if (!block) return null;

  /** Updates content and its timestamp inside one editor batch. */
  const updateName = (event: Parameters<typeof editing.attributes.onInput>[0]): void => {
    const updatedAt = nextTimestamp(String(editing.getProp("updatedAt") ?? block.props.updatedAt));
    editor.batchUpdates(() => {
      editing.attributes.onInput(event);
      editing.setProp("updatedAt", updatedAt);
    });
  };

  /** Completes IME input and advances its timestamp atomically. */
  const finishComposition = (event: Parameters<typeof editing.attributes.onCompositionEnd>[0]): void => {
    const updatedAt = nextTimestamp(String(editing.getProp("updatedAt") ?? block.props.updatedAt));
    editor.batchUpdates(() => {
      editing.attributes.onCompositionEnd(event);
      editing.setProp("updatedAt", updatedAt);
    });
  };

  /** Cycles workflow state and its timestamp atomically. */
  const cycleStatus = (): void => {
    const status = editing.getProp("status") ?? block.props.status;
    const updatedAt = nextTimestamp(String(editing.getProp("updatedAt") ?? block.props.updatedAt));
    editor.batchUpdates(() => editing.setProps({
      status: nextStatus(status),
      updatedAt,
    }));
  };

  /** Closes the modal and commits a valid changed patch. */
  const closeProperties = (patch?: TodoItemPropertiesPatch): void => {
    setPropertiesOpen(false);
    commitPropertiesPatch(reactEditor, blockId, patch);
  };

  /** Commits one inline property edit through the same validated modal path. */
  const commitInlineProperty = (patch: TodoItemPropertiesPatch): void => {
    commitPropertiesPatch(reactEditor, blockId, patch);
  };

  const statusClass = {
    todo: TODO_STATUS_TODO_CLASS,
    doing: TODO_STATUS_DOING_CLASS,
    done: TODO_STATUS_DONE_CLASS,
  }[block.props.status];
  const statusGlyph = { todo: "", doing: "–", done: "✓" }[block.props.status];

  return (
    <div
      className={TODO_ITEM_CLASS}
      data-todo-status={block.props.status}
      data-todo-priority={block.props.priority}
    >
      <button
        {...editing.preventTextEditingAttributes}
        className={`${TODO_STATUS_CLASS} ${statusClass}`}
        type="button"
        aria-label={`Status: ${block.props.status}. Change status`}
        onClick={cycleStatus}
      >
        <span aria-hidden="true">{statusGlyph}</span>
      </button>
      <div className={TODO_BODY_CLASS}>
        <div
          {...editing.attributes}
          className={TODO_NAME_CLASS}
          role="textbox"
          aria-label="TODO item name"
          onInput={updateName}
          onCompositionEnd={finishComposition}
        />
        <input
          {...editing.preventTextEditingAttributes}
          className={TODO_DESCRIPTION_CLASS}
          aria-label="Description"
          value={block.props.description}
          placeholder="Add description"
          onChange={(event) => commitInlineProperty({ description: event.currentTarget.value })}
        />
        <div className={TODO_META_CLASS}>
          <select
            {...editing.preventTextEditingAttributes}
            className={TODO_PRIORITY_CLASS}
            aria-label="Priority"
            value={block.props.priority}
            onChange={(event) => commitInlineProperty({
              priority: Number(event.currentTarget.value) as TodoItemProps["priority"],
            })}
          >
            {[1, 2, 3, 4].map((priority) => <option key={priority} value={priority}>P{priority}</option>)}
          </select>
          <input
            {...editing.preventTextEditingAttributes}
            className={TODO_PROJECT_CLASS}
            aria-label="Project"
            value={block.props.project}
            placeholder="Add project"
            onChange={(event) => commitInlineProperty({ project: event.currentTarget.value })}
          />
        </div>
      </div>
      <button
        {...editing.preventTextEditingAttributes}
        className={TODO_PROPERTIES_BUTTON_CLASS}
        type="button"
        aria-label="Open TODO properties"
        onClick={() => setPropertiesOpen(true)}
      >…</button>
      {propertiesOpen && <PropertiesModal block={block} onClose={closeProperties} />}
    </div>
  );
}

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
    setup: (reactEditor) => {
      let candidate: TodoCandidate | undefined;

      /** Clears candidate markup and tracking without touching persisted text. */
      const clearCandidate = (): void => {
        if (candidate) decoratePrompt(candidate.contentElement);
        candidate = undefined;
      };

      /** Converts the tracked candidate after revalidating its latest content. */
      const convertCandidate = (): void => {
        const current = candidate;
        if (!current) return;
        candidate = undefined;
        const block = reactEditor.editor.blocks.getBlock(current.blockId);
        const match = block ? matchPrompt(block.content, prompts) : undefined;
        if (!block || block.type === TODO_ITEM_BLOCK_TYPE || !match) {
          decoratePrompt(current.contentElement);
          return;
        }
        const owned = createTodoItemProps();
        reactEditor.editor.batchUpdates(() => {
          reactEditor.editor.blocks.setBlockType(current.blockId, TODO_ITEM_BLOCK_TYPE);
          reactEditor.blocks.updateBlock(current.blockId, {
            content: block.content.slice(match.prompt.length).replace(/^\s+/, ""),
            props: { ...owned, status: match.status },
          });
        });
      };

      const disposers = [
        reactEditor.blocks.register({
          definition: {
            type: TODO_STORAGE_BLOCK_TYPE,
            title: "TODO storage",
            defaultProps: createTodoStorageProps,
            propSchema: todoStoragePropsSchema,
            metadata: { containment: { childOutline: "fixed", outlineFloor: true } },
          },
          render: TodoStorage,
          view: todoStorageView,
          slashCommand: {
            id: "type.todo-storage",
            title: "TODO storage",
            group: "Turn into",
            keywords: ["tasks", "todos"],
            isAvailable: ({ blockId }) => (
              reactEditor.editor.blocks.getBlock(blockId)?.children.length === 0
            ),
          },
        }),
        reactEditor.blocks.register({
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
        reactEditor.events.register({
          id: "todo-item.input",
          type: "input",
          scope: "content",
        }, ({ blockId, contentElement }) => {
          if (!blockId || !contentElement) return false;
          queueMicrotask(() => {
            const block = reactEditor.editor.blocks.getBlock(blockId);
            if (!block || block.type === TODO_ITEM_BLOCK_TYPE) return;
            const match = matchPrompt(contentElement.textContent ?? "", prompts);
            if (!match) {
              if (candidate?.blockId === blockId) clearCandidate();
              return;
            }
            if (candidate && candidate.blockId !== blockId) convertCandidate();
            candidate = { blockId, contentElement, ...match };
            decoratePrompt(contentElement, match.prompt);
          });
          return false;
        }),
        reactEditor.events.register({
          id: "todo-item.focus-out",
          type: "focusout",
          scope: "content",
        }, ({ raw: event, root, blockId, blockElement }) => {
          // OS overlays such as Win+Space can transiently blur the document.
          if (!root.ownerDocument.hasFocus()) return false;
          if (candidate?.blockId !== blockId) return false;
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !blockElement?.contains(next)) convertCandidate();
          return false;
        }),
        reactEditor.events.register({
          id: "todo-item.pointer-down",
          type: "pointerdown",
          target: "document",
          capture: true,
        }, ({ blockId }) => {
          if (candidate && candidate.blockId !== blockId) convertCandidate();
          return false;
        }),
        reactEditor.events.register({
          id: "todo-item.selection-change",
          type: "selectionchange",
          target: "document",
        }, ({ root }) => {
          // A lost browser range is not an editor navigation while the OS owns focus.
          if (!root.ownerDocument.hasFocus()) return false;
          const activeBlockId = reactEditor.selection.readDOM()?.focusBlockId;
          if (candidate && activeBlockId !== candidate.blockId) convertCandidate();
          return false;
        }),
      ];
      return () => {
        clearCandidate();
        disposers.reverse().forEach((dispose) => dispose());
      };
    },
  };
}
