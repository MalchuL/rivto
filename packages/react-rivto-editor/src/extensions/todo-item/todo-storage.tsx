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
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { EditorBlock, EditorBlockNode } from "@chulane/rivto";
import { z } from "zod";
import { ArrowDownIcon } from "lucide-react";
import { useBlock, useBlockEditing, useReactEditor } from "../../hooks";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
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
  TODO_STORAGE_FILTER_LEGEND_CLASS,
  TODO_STORAGE_FILTER_OPTION_CLASS,
  TODO_STORAGE_MENU_CLASS,
  TODO_STORAGE_MENU_PANEL_CLASS,
  TODO_STORAGE_SEARCH_CLASS,
  TODO_STORAGE_SUMMARY_CLASS,
  TODO_STORAGE_SUMMARY_STATS_CLASS,
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
  block: Pick<EditorBlockNode, "type" | "props" | "content">,
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

/**
 * Renders one labelled filter checkbox using the shadcn Checkbox primitive.
 *
 * @param props - Checkbox identity, state, label text, and toggle callback.
 * @param props.id - Unique DOM id linking the label to the checkbox.
 * @param props.checked - Whether the option is currently active.
 * @param props.label - Visible text that also names the checkbox.
 * @param props.onToggle - Invoked when the user flips the option.
 * @returns A label row containing an accessible checkbox.
 */
function FilterOption({ id, checked, label, onToggle }: {
  readonly id: string;
  readonly checked: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  return (
    <Label className={TODO_STORAGE_FILTER_OPTION_CLASS} htmlFor={id}>
      <Checkbox id={id} checked={checked} onCheckedChange={onToggle} />
      {label}
    </Label>
  );
}

/** Supplies local storage state and a card boundary around the shared subtree. */
function TodoStorageState({ block, children }: BlockWrapperProps) {
  const reactEditor = useReactEditor();
  const { block: tree } = useBlock(block.id);
  const childBlocks = tree?.children ?? [];
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

/** Renders search, popover filter menus, and persisted status-order controls. */
export function TodoStorage({ blockId }: TodoStorageComponentProps) {
  const reactEditor = useReactEditor();
  const editing = useBlockEditing<TodoStorageProps>(blockId, { textEdit: false });
  const block = editing.block;
  const context = useContext(TodoStorageContext);
  const fieldId = useId();

  if (!block || !context) return null;
  const childIds = block.childIds;
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
        <span className={TODO_STORAGE_SUMMARY_STATS_CLASS}>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
      </div>
    );
  }

  // Menus are Radix popovers rendered in a portal: they escape the editable
  // block tree, close on outside pointer down, and only one is open at a time.
  return (
    <div {...editing.attributes} className={TODO_STORAGE_CONTENT_CLASS}>
      <div {...editing.preventTextEditingAttributes} className={TODO_STORAGE_TOOLBAR_CLASS}>
        <Input
          className={TODO_STORAGE_SEARCH_CLASS}
          type="search"
          aria-label="Search TODOs"
          placeholder="Search"
          value={context.query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => context.setQuery(event.currentTarget.value)}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" type="button" className={TODO_STORAGE_MENU_CLASS}>Filter</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className={TODO_STORAGE_MENU_PANEL_CLASS} aria-label="Filters">
            <fieldset className={TODO_STORAGE_FILTER_GROUP_CLASS}>
              <legend className={TODO_STORAGE_FILTER_LEGEND_CLASS}>Status</legend>
              {TODO_STATUSES.map((status) => <FilterOption
                key={status}
                id={`${fieldId}-status-${status}`}
                checked={context.filters.statuses.has(status)}
                label={TODO_STATUS_LABELS[status]}
                onToggle={() => updateFilters("statuses", toggleFilter(context.filters.statuses, status))}
              />)}
            </fieldset>
            <fieldset className={TODO_STORAGE_FILTER_GROUP_CLASS}>
              <legend className={TODO_STORAGE_FILTER_LEGEND_CLASS}>Priority</legend>
              {PRIORITIES.map((priority) => <FilterOption
                key={priority}
                id={`${fieldId}-priority-${priority}`}
                checked={context.filters.priorities.has(priority)}
                label={`P${priority}`}
                onToggle={() => updateFilters("priorities", toggleFilter(context.filters.priorities, priority))}
              />)}
            </fieldset>
            {context.projects.length > 0 && <fieldset className={TODO_STORAGE_FILTER_GROUP_CLASS}>
              <legend className={TODO_STORAGE_FILTER_LEGEND_CLASS}>Project</legend>
              {context.projects.map((project, index) => <FilterOption
                key={project || "no-project"}
                id={`${fieldId}-project-${index}`}
                checked={context.filters.projects.has(project)}
                label={project || "No project"}
                onToggle={() => updateFilters("projects", toggleFilter(context.filters.projects, project))}
              />)}
            </fieldset>}
            <Button variant="outline" size="sm" className={TODO_STORAGE_CLEAR_CLASS} type="button" onClick={clearFilters}>Clear filters</Button>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" type="button" className={TODO_STORAGE_MENU_CLASS}>Order</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className={TODO_STORAGE_MENU_PANEL_CLASS} aria-label="Ordering">
            <FilterOption
              id={`${fieldId}-order-status`}
              checked={props.orderMode === "status"}
              label="Status"
              onToggle={() => updateProps({ orderMode: props.orderMode === "status" ? "manual" : "status" })}
            />
            {props.orderMode === "status" && <TodoStatusOrder
              order={props.statusOrder}
              onChange={(statusOrder) => updateProps({ statusOrder })}
            />}
          </PopoverContent>
        </Popover>
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
          <span className={TODO_STORAGE_DROP_ICON_CLASS} aria-hidden="true"><ArrowDownIcon /></span>
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
