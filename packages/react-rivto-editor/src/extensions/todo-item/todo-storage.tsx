/**
 * Provides TODO-storage data rules, direct-child filtering, status ordering,
 * toolbar presentation, and the complete-card wrapper shared by page and
 * edgeless surfaces. Search and filters stay local to the mounted wrapper;
 * ordering preferences and normalized child positions remain collaborative.
 *
 * @module
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { EditorBlock, EditorBlockNode } from "@chulane/rivto";
import { z } from "zod";
import { useBlockChildren, useBlockEditing, useReactEditor } from "../../hooks";
import type { BlockWrapperProps } from "../../blocks";
import { ContainerBlockView } from "../../views";
import { createBlockViewContext } from "../../views/context";
import type { TodoItemProps, TodoItemStatus } from "./todo-item";
import { TODO_ITEM_BLOCK_TYPE } from "./todo-item";
import {
  TODO_STORAGE_CLASS,
  TODO_STORAGE_CLEAR_CLASS,
  TODO_STORAGE_CONTENT_CLASS,
  TODO_STORAGE_DROP_COPY_CLASS,
  TODO_STORAGE_DROP_FIELD_CLASS,
  TODO_STORAGE_DROP_ICON_CLASS,
  TODO_STORAGE_FILTER_GROUP_CLASS,
  TODO_STORAGE_MENU_CLASS,
  TODO_STORAGE_MENU_PANEL_CLASS,
  TODO_STORAGE_SEARCH_CLASS,
  TODO_STORAGE_SUMMARY_CLASS,
  TODO_STORAGE_TOOLBAR_CLASS,
} from "./todo-item-classes";
import { TODO_STATUS_LABELS, TodoStatusOrder } from "./todo-status-order";

/** Persisted native type installed by `todoItemExtension`. */
export const TODO_STORAGE_BLOCK_TYPE = "todo-storage";

/** Available persisted child-ordering policies. */
export type TodoStorageOrderMode = "manual" | "status";

/** Complete validated native properties stored on a TODO storage. */
export interface TodoStorageProps extends Record<string, unknown> {
  readonly orderMode: TodoStorageOrderMode;
  readonly statusOrder: readonly TodoItemStatus[];
}

/** Props accepted by the exported TODO-storage renderer. */
export interface TodoStorageComponentProps {
  readonly blockId: string;
}

/** Fixed statuses which every customized sequence must contain exactly once. */
export const TODO_STATUSES = ["todo", "doing", "done"] as const;

const PRIORITIES = [1, 2, 3, 4] as const;
const DEFAULT_STATUS_ORDER: readonly TodoItemStatus[] = [...TODO_STATUSES];
/** Runtime schema enforcing the complete status permutation, not only members. */
export const todoStoragePropsSchema = z.object({
  orderMode: z.enum(["manual", "status"]),
  statusOrder: z.array(z.enum(TODO_STATUSES)).length(TODO_STATUSES.length).refine(
    (statuses) => TODO_STATUSES.every((status) => statuses.filter((value) => value === status).length === 1),
    "statusOrder must contain todo, doing, and done exactly once",
  ),
});

interface TodoStorageFilters {
  readonly statuses: ReadonlySet<TodoItemStatus>;
  readonly priorities: ReadonlySet<TodoItemProps["priority"]>;
  readonly projects: ReadonlySet<string>;
}

interface TodoStorageContextValue {
  readonly storageId: string;
  readonly query: string;
  readonly filters: TodoStorageFilters;
  readonly projects: readonly string[];
  readonly setQuery: (query: string) => void;
  readonly setFilters: (filters: TodoStorageFilters) => void;
}

const TodoStorageContext = createContext<TodoStorageContextValue | undefined>(undefined);
const NO_CHILD_BLOCKS: EditorBlock[] = [];

/** Shared vertical-container behavior used by keyboard and drag dispatchers. */
export const todoStorageView = new ContainerBlockView();

/** Creates persisted defaults without sharing the mutable status-order array. */
export function createTodoStorageProps(): TodoStorageProps {
  return { orderMode: "status", statusOrder: [...DEFAULT_STATUS_ORDER] };
}

/** Normalizes search text consistently for the query and searchable fields. */
export function normalizeTodoSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

/** Reports whether one TODO satisfies search plus every active filter category. */
export function matchesTodoStorage(
  block: EditorBlockNode,
  query: string,
  filters: TodoStorageFilters,
): boolean {
  if (block.type !== TODO_ITEM_BLOCK_TYPE) return true;
  const props = block.props as TodoItemProps;
  const normalizedQuery = normalizeTodoSearch(query);
  const searchable = normalizeTodoSearch(`${block.content}\n${props.description}`);
  return (!normalizedQuery || searchable.includes(normalizedQuery))
    && (!filters.statuses.size || filters.statuses.has(props.status))
    && (!filters.priorities.size || filters.priorities.has(props.priority))
    && (!filters.projects.size || filters.projects.has(props.project));
}

/** Derives sorted unique direct-child project values, retaining empty as no project. */
export function deriveTodoProjects(children: readonly EditorBlock[]): string[] {
  return [...new Set(children
    .filter((child) => child.type === TODO_ITEM_BLOCK_TYPE)
    .map((child) => String(child.props.project ?? "")))]
    .sort((left, right) => (left || "No project").localeCompare(right || "No project"));
}

/** Computes stable status ordering while retaining non-TODO child slots. */
export function orderTodoStorageChildren(
  children: readonly EditorBlock[],
  statusOrder: readonly TodoItemStatus[],
): string[] {
  const ranks = new Map(statusOrder.map((status, index) => [status, index]));
  const todos = children
    .filter((child) => child.type === TODO_ITEM_BLOCK_TYPE)
    .map((child, index) => ({ child, index }))
    .sort((left, right) => (
      (ranks.get(left.child.props.status as TodoItemStatus) ?? statusOrder.length)
      - (ranks.get(right.child.props.status as TodoItemStatus) ?? statusOrder.length)
      || left.index - right.index
    ))
    .map(({ child }) => child.id);
  let todoIndex = 0;
  return children.map((child) => (
    child.type === TODO_ITEM_BLOCK_TYPE ? todos[todoIndex++]! : child.id
  ));
}

/** Toggles one value in a copied filter set. */
function toggleFilter<T>(current: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Supplies local storage state and a card boundary around the shared subtree. */
function TodoStorageState({ block, children }: BlockWrapperProps) {
  const reactEditor = useReactEditor();
  const subscribe = useCallback(
    (listener: () => void) => reactEditor.blocks.subscribeBlock(block.id, listener),
    [block.id, reactEditor],
  );
  const getSnapshot = useCallback(
    () => reactEditor.blocks.getBlock(block.id),
    [block.id, reactEditor],
  );
  const tree = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const childBlocks = tree?.children ?? NO_CHILD_BLOCKS;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<TodoStorageFilters>({
    statuses: new Set(),
    priorities: new Set(),
    projects: new Set(),
  });
  const projects = deriveTodoProjects(childBlocks);
  const projectKey = JSON.stringify(projects);
  useEffect(() => {
    const available = new Set(projects);
    if ([...filters.projects].some((project) => !available.has(project))) {
      setFilters((current) => ({
        ...current,
        projects: new Set([...current.projects].filter((project) => available.has(project))),
      }));
    }
  }, [projectKey]);

  useEffect(() => {
    const props = block.props as TodoStorageProps;
    if (!tree || props.orderMode !== "status") return;
    const desired = orderTodoStorageChildren(childBlocks, props.statusOrder);
    const current = childBlocks.map(({ id }) => id);
    if (desired.some((id, index) => id !== current[index])) {
      reactEditor.history.batchUpdates(() => {
        desired.forEach((id, index) => {
          reactEditor.blocks.moveBlock(id, index ? desired[index - 1]! : null);
        });
      });
    }
  }, [block.props, childBlocks, reactEditor, tree]);

  const value = useMemo<TodoStorageContextValue>(() => ({
    storageId: block.id,
    query,
    filters,
    projects,
    setQuery,
    setFilters,
  }), [block.id, filters, projectKey, query]);
  return (
    <TodoStorageContext.Provider value={value}>
      <div className={TODO_STORAGE_CLASS}>{children}</div>
    </TodoStorageContext.Provider>
  );
}

/** Adds storage state only around storage blocks, keeping wrapper hooks unconditional. */
export function TodoStorageBlockWrapper({ block, children }: BlockWrapperProps) {
  return block.type === TODO_STORAGE_BLOCK_TYPE
    ? <TodoStorageState block={block}>{children}</TodoStorageState>
    : children;
}

/** Renders search, native filter menus, and persisted status-order controls. */
export function TodoStorage({ blockId }: TodoStorageComponentProps) {
  const reactEditor = useReactEditor();
  const editing = useBlockEditing<TodoStorageProps>(blockId, { textEdit: false });
  const { children: childIds } = useBlockChildren(blockId);
  const block = editing.block;
  const context = useContext(TodoStorageContext);
  const filterMenu = useRef<HTMLDetailsElement>(null);
  const orderMenu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const ownerDocument = reactEditor.events.getRoot()?.ownerDocument;
    if (!ownerDocument) return;
    /** Closes each open menu when the pointer lands outside that menu. */
    const closeOutside = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      [filterMenu.current, orderMenu.current].forEach((menu) => {
        if (menu?.open && !menu.contains(target)) menu.open = false;
      });
    };
    ownerDocument.addEventListener("pointerdown", closeOutside, true);
    return () => ownerDocument.removeEventListener("pointerdown", closeOutside, true);
  }, [reactEditor]);

  if (!block || !context) return null;
  const props = block.props as TodoStorageProps;

  /** Persists a validated ordering-property patch. */
  const updateProps = (patch: Partial<TodoStorageProps>): void => {
    reactEditor.blocks.updateBlock(blockId, { props: patch });
  };

  /** Replaces one filter category while preserving the other categories. */
  const updateFilters = <K extends keyof TodoStorageFilters>(
    category: K,
    values: TodoStorageFilters[K],
  ): void => context.setFilters({ ...context.filters, [category]: values });

  /** Clears every filter category without changing the search query. */
  const clearFilters = (): void => context.setFilters({
    statuses: new Set(),
    priorities: new Set(),
    projects: new Set(),
  });

  /** Inserts the first writing block through the registered container view. */
  const startWriting = (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>): void => {
    if (childIds.length || event.defaultPrevented) return;
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    const root = reactEditor.events.getRoot();
    const viewContext = root ? createBlockViewContext(reactEditor, blockId, root) : undefined;
    if (viewContext) todoStorageView.insertFirstChild(viewContext);
  };

  if (block.listProps.collapsed === true) {
    const itemCount = childIds.length;
    return (
      <div {...editing.attributes} className={TODO_STORAGE_SUMMARY_CLASS}>
        <strong>TODO storage</strong>
        <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
      </div>
    );
  }

  return (
    <div {...editing.attributes} className={TODO_STORAGE_CONTENT_CLASS}>
      <div {...editing.preventTextEditingAttributes} className={TODO_STORAGE_TOOLBAR_CLASS}>
        <input
          className={TODO_STORAGE_SEARCH_CLASS}
          type="search"
          aria-label="Search TODOs"
          placeholder="Search"
          value={context.query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => context.setQuery(event.currentTarget.value)}
        />
        <details ref={filterMenu} className={TODO_STORAGE_MENU_CLASS}>
          <summary>Filter</summary>
          <div className={TODO_STORAGE_MENU_PANEL_CLASS}>
            <fieldset className={TODO_STORAGE_FILTER_GROUP_CLASS}>
              <legend>Status</legend>
              {TODO_STATUSES.map((status) => <label key={status}>
                <input
                  type="checkbox"
                  checked={context.filters.statuses.has(status)}
                  onChange={() => updateFilters("statuses", toggleFilter(context.filters.statuses, status))}
                /> {TODO_STATUS_LABELS[status]}
              </label>)}
            </fieldset>
            <fieldset className={TODO_STORAGE_FILTER_GROUP_CLASS}>
              <legend>Priority</legend>
              {PRIORITIES.map((priority) => <label key={priority}>
                <input
                  type="checkbox"
                  checked={context.filters.priorities.has(priority)}
                  onChange={() => updateFilters("priorities", toggleFilter(context.filters.priorities, priority))}
                /> P{priority}
              </label>)}
            </fieldset>
            {context.projects.length > 0 && <fieldset className={TODO_STORAGE_FILTER_GROUP_CLASS}>
              <legend>Project</legend>
              {context.projects.map((project) => <label key={project || "no-project"}>
                <input
                  type="checkbox"
                  checked={context.filters.projects.has(project)}
                  onChange={() => updateFilters("projects", toggleFilter(context.filters.projects, project))}
                /> {project || "No project"}
              </label>)}
            </fieldset>}
            <button className={TODO_STORAGE_CLEAR_CLASS} type="button" onClick={clearFilters}>Clear filters</button>
          </div>
        </details>
        <details ref={orderMenu} className={TODO_STORAGE_MENU_CLASS}>
          <summary>Order</summary>
          <div className={TODO_STORAGE_MENU_PANEL_CLASS}>
            <label><input
              type="checkbox"
              checked={props.orderMode === "status"}
              onChange={(event) => updateProps({ orderMode: event.currentTarget.checked ? "status" : "manual" })}
            /> Status</label>
            {props.orderMode === "status" && <TodoStatusOrder
              order={props.statusOrder}
              onChange={(statusOrder) => updateProps({ statusOrder })}
            />}
          </div>
        </details>
      </div>
      {childIds.length === 0 && (
        <div
          {...editing.preventTextEditingAttributes}
          className={TODO_STORAGE_DROP_FIELD_CLASS}
          role="button"
          tabIndex={0}
          aria-label="Drop blocks into TODO storage"
          onClick={startWriting}
          onKeyDown={startWriting}
        >
          <span className={TODO_STORAGE_DROP_ICON_CLASS} aria-hidden="true">↓</span>
          <span className={TODO_STORAGE_DROP_COPY_CLASS}>
            <strong>Drag a task here</strong>
            <small>Drop it inside this storage</small>
          </span>
        </div>
      )}
    </div>
  );
}

/** Hides a direct TODO child when its owning storage presentation rejects it. */
export function TodoStorageVisibility({ block, children }: BlockWrapperProps) {
  const reactEditor = useReactEditor();
  const context = useContext(TodoStorageContext);
  const directChild = context && reactEditor.blocks.getParentId(block.id) === context.storageId;
  if (directChild && !matchesTodoStorage(block, context.query, context.filters)) return null;
  return children;
}
