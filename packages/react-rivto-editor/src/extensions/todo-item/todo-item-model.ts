import type { ComponentType } from "react";
import type { EditorBlock } from "@chulane/rivto";
import { z } from "zod";

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

export const TODO_STATUSES = ["todo", "doing", "done"] as const;
const DEFAULT_PROMPTS: Readonly<Record<TodoItemStatus, readonly string[]>> = {
  todo: ["todo", "TODO"],
  doing: ["doing", "DOING"],
  done: ["done", "DONE"],
};

const utcTimestampSchema = z.iso.datetime({ offset: false }).refine((value) => value.endsWith("Z"));
export const todoItemPropsSchema = z.object({
  status: z.enum(TODO_STATUSES),
  description: z.string(),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  project: z.string(),
});

export interface PromptMatch {
  readonly prompt: string;
  readonly status: TodoItemStatus;
}

/**
 * Produces a timestamp newer than the previous value, even for same-tick edits.
 *
 * @param previous - Current valid UTC timestamp.
 * @returns Current time or the next millisecond after the previous timestamp.
 */
export const nextTimestamp = (previous: string): string => (
  new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
);

/**
 * Returns the next workflow state in the fixed TODO cycle.
 *
 * @param status - Current TODO status.
 * @returns Following status, wrapping done back to todo.
 */
export const nextStatus = (status: TodoItemStatus): TodoItemStatus => (
  TODO_STATUSES[(TODO_STATUSES.indexOf(status) + 1) % TODO_STATUSES.length]!
);

/**
 * Builds and validates the prompt-to-status lookup for one extension instance.
 *
 * @param aliases - Host aliases that extend the built-in prompt set.
 * @returns Validated prompt lookup.
 */
export const createPromptMap = (
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
export const matchPrompt = (
  content: string,
  prompts: ReadonlyMap<string, TodoItemStatus>,
): PromptMatch | undefined => {
  const prompt = content.match(/^\S+/)?.[0];
  const status = prompt ? prompts.get(prompt) : undefined;
  return prompt && status ? { prompt, status } : undefined;
};

/**
 * Creates fresh TODO-owned values with identical creation/update timestamps.
 *
 * @returns A complete default property record for one insertion or conversion.
 */
export const createTodoItemProps = (): TodoItemProps => {
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

