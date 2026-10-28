import {
  BlockBody,
  BlockChildren,
  BlockContent,
  BlockDropTarget,
  BlockRow,
  type BlockChildrenItemProps,
} from "@chulane/rivto-page";
import type { BlockOutlineContext, BlockBehaviorOutcome } from "../../block-behaviors/types";
import type { BlockBehaviorAvailabilityContext } from "../../block-behaviors/types";
/**
 * Provides TODO-storage data rules, direct-child filtering, status ordering,
 * toolbar presentation, and the complete layout shared by page and edgeless
 * surfaces. Search and filters stay local to the mounted layout provider;
 * ordering preferences and normalized child positions remain collaborative.
 *
 * The child item applies visibility only to this storage's immediate children;
 * global block wrappers do not participate in filtering or storage geometry.
 *
 * @module
 */
import type { EditorBlock, EditorBlockNode } from "@chulane/rivto";
import { ArrowDownIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { z } from "zod";
import { createBlockBehaviorContext } from "../../block-behaviors/utils/context";
import { ContainerBlockBehavior } from "../../block-behaviors";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { editorControlProps } from "../../constants";
import {
  useBlock,
  useBlockNode,
  useBlockSelectionAnchor,
  useEditorRoot,
  useReactPanel,
  usePanel,
  usePreventTextEditing,
} from "../../hooks";
import type { TodoItemProps, TodoItemStatus } from "./todo-item";
import { TODO_ITEM_BLOCK_TYPE } from "./todo-item";
import {
  TODO_STORAGE_CLEAR_CLASS,
  TODO_STORAGE_CONTENT_CLASS,
  TODO_STORAGE_DROP_COPY_CLASS,
  TODO_STORAGE_DROP_FIELD_CLASS,
  TODO_STORAGE_DROP_ICON_CLASS,
  TODO_STORAGE_FILTER_GROUP_CLASS,
  TODO_STORAGE_FILTER_LEGEND_CLASS,
  TODO_STORAGE_FILTER_OPTION_CLASS,
  TODO_STORAGE_SEARCH_CLASS,
  TODO_STORAGE_SUMMARY_CLASS,
  TODO_STORAGE_SUMMARY_STATS_CLASS,
  TODO_STORAGE_TOOLBAR_CLASS,
} from "./todo-item-classes";
import { TODO_STATUS_LABELS, TodoStatusOrder } from "./todo-status-order";
import { TodoStorageMenu } from "./todo-storage-menu";

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
  statusOrder: z
    .array(z.enum(TODO_STATUSES))
    .length(TODO_STATUSES.length)
    .refine(
      (statuses) =>
        TODO_STATUSES.every((status) => statuses.filter((value) => value === status).length === 1),
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
  /** True when persisted children exist but none match this local filter. */
  readonly allChildrenFiltered: boolean;
  readonly query: string;
  readonly filters: TodoStorageFilters;
  readonly projects: readonly string[];
  readonly setQuery: (query: string) => void;
  readonly setFilters: (filters: TodoStorageFilters) => void;
}

const TodoStorageContext = createContext<TodoStorageContextValue | undefined>(undefined);

/** Vertical-container behavior restricted to TODO storage blocks. */
class TodoStorageBehavior extends ContainerBlockBehavior {
  /**
   * Keeps direct children within this container during outline outdent.
   *
   * This outline restriction does not prevent independently permitted dragging.
   * The handler rejects the complete requested group before child behavior runs.
   *
   * @param context - Current container fields and the live invoking panel.
   * @param ids - Complete child group requested by the outline operation.
   * @returns Rejected without mutating the document.
   */
  onChildOutdent(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome {
    return "rejected";
  }

  /**
   * Selects TODO storage without applying its container actions to ordinary task blocks.
   * @param context - Current detached block fields and runtime; applicability is independent of the called method.
   * @returns True only for the TODO storage native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === TODO_STORAGE_BLOCK_TYPE;
  }
}

/** Shared vertical-container behavior used by keyboard and drag dispatchers. */
export const todoStorageBehavior = new TodoStorageBehavior();

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
  if (block.type !== TODO_ITEM_BLOCK_TYPE) {
    return true;
  }
  const props = block.props as TodoItemProps;
  const normalizedQuery = normalizeTodoSearch(query);
  const searchable = normalizeTodoSearch(`${block.content}\n${props.description}`);
  return (
    (!normalizedQuery || searchable.includes(normalizedQuery)) &&
    (!filters.statuses.size || filters.statuses.has(props.status)) &&
    (!filters.priorities.size || filters.priorities.has(props.priority)) &&
    (!filters.projects.size || filters.projects.has(props.project))
  );
}

/** Derives sorted unique direct-child project values, retaining empty as no project. */
export function deriveTodoProjects(children: readonly EditorBlock[]): string[] {
  return [
    ...new Set(
      children
        .filter((child) => child.type === TODO_ITEM_BLOCK_TYPE)
        .map((child) => String(child.props.project ?? "")),
    ),
  ].sort((left, right) => (left || "No project").localeCompare(right || "No project"));
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
    .sort(
      (left, right) =>
        (ranks.get(left.child.props.status as TodoItemStatus) ?? statusOrder.length) -
          (ranks.get(right.child.props.status as TodoItemStatus) ?? statusOrder.length) ||
        left.index - right.index,
    )
    .map(({ child }) => child.id);
  let todoIndex = 0;
  return children.map((child) =>
    child.type === TODO_ITEM_BLOCK_TYPE ? todos[todoIndex++]! : child.id,
  );
}

/** Toggles one value in a copied filter set. */
function toggleFilter<T>(current: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
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
function FilterOption({
  id,
  checked,
  label,
  onToggle,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  return (
    <Label className={TODO_STORAGE_FILTER_OPTION_CLASS} htmlFor={id}>
      <Checkbox {...editorControlProps} id={id} checked={checked} onCheckedChange={onToggle} />
      {label}
    </Label>
  );
}

/** Layout-local storage state; no wrapper changes the block's visual boundary. */
interface TodoStorageStateProps extends TodoStorageComponentProps {
  readonly children: ReactNode;
}

/**
 * Owns filters and ordering subscriptions for one mounted storage layout.
 *
 * Search and filters are occurrence-local. Persisted status ordering continues
 * through the panel's ordinary batched commands; the provider adds no DOM shell.
 * Removing the layout releases its React subscriptions and effects.
 *
 * @param props - Storage identity and the layout primitives using its state.
 * @param props.blockId - Canonical storage whose direct children supply filter choices.
 * @param props.children - Header and child items rendered within this occurrence.
 * @returns A local state provider around the layout's existing JSX.
 */
function TodoStorageState({ blockId, children }: TodoStorageStateProps) {
  const panel = usePanel();
  const { block: tree } = useBlock(blockId);
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
    const props = tree?.props as TodoStorageProps | undefined;
    if (!tree || props?.orderMode !== "status") {
      return;
    }
    const desired = orderTodoStorageChildren(childBlocks, props.statusOrder);
    const current = childBlocks.map(({ id }) => id);
    if (desired.some((id, index) => id !== current[index])) {
      panel.batchUpdates(() => {
        desired.forEach((id, index) => {
          panel.blocks.moveBlock(id, index ? desired[index - 1]! : null);
        });
      });
    }
  }, [childBlocks, panel, tree]);

  const value = useMemo<TodoStorageContextValue>(
    () => ({
      storageId: blockId,
      allChildrenFiltered:
        childBlocks.length > 0 &&
        !childBlocks.some((child) => matchesTodoStorage(child, query, filters)),
      query,
      filters,
      projects,
      setQuery,
      setFilters,
    }),
    [blockId, filters, projectKey, query, childBlocks],
  );
  return <TodoStorageContext.Provider value={value}>{children}</TodoStorageContext.Provider>;
}

/**
 * Reads state owned by the nearest mounted TODO storage layout.
 *
 * @returns Local search/filter values and their update callbacks.
 * @throws If a storage control is rendered outside TodoStorageLayout.
 */
function useTodoStorageState(): TodoStorageContextValue {
  const state = useContext(TodoStorageContext);
  if (!state) {
    throw new Error("TODO storage controls require their layout provider");
  }
  return state;
}

/** Inputs for a single category of storage filters. */
interface StorageFilterGroupProps<T> {
  readonly title: string;
  readonly options: readonly T[];
  readonly selected: ReadonlySet<T>;
  /**
   * Names one available option without changing its persisted value.
   *
   * @param value - Available filter option.
   * @returns Visible accessible label for the checkbox.
   */
  readonly label: (value: T) => string;
  /**
   * Replaces this category's local selection after one checkbox activation.
   *
   * @param values - New set; the previous selected set is not mutated.
   * @returns The local category has been updated.
   */
  readonly onChange: (values: ReadonlySet<T>) => void;
}

/**
 * Renders labelled checkboxes for one local filter category.
 *
 * IDs belong to this mounted occurrence; synced storages do not share labels
 * or component state. Toggling an option copies the set before publication.
 *
 * @param props - Category title, available values, selection and update callback.
 * @returns A fieldset whose checkboxes retain the category's actual values.
 */
function StorageFilterGroup<T>({
  title,
  options,
  selected,
  label,
  onChange,
}: StorageFilterGroupProps<T>) {
  const id = useId();
  return (
    <fieldset className={TODO_STORAGE_FILTER_GROUP_CLASS}>
      <legend className={TODO_STORAGE_FILTER_LEGEND_CLASS}>{title}</legend>
      {options.map((value, index) => (
        <FilterOption
          key={index}
          id={`${id}-${index}`}
          checked={selected.has(value)}
          label={label(value)}
          onToggle={() => onChange(toggleFilter(selected, value))}
        />
      ))}
    </fieldset>
  );
}

/**
 * Composes status, priority and project filters with an explicit clear action.
 *
 * Values stay local to this storage occurrence and do not mutate document data.
 * Empty project values are retained as the accessible No project option.
 *
 * @returns An in-flow disclosure containing the three filter categories.
 * @throws If rendered without the storage layout provider.
 */
function TodoStorageFiltersMenu() {
  const state = useTodoStorageState();
  return (
    <TodoStorageMenu label="Filter" panelLabel="Filters">
      <StorageFilterGroup
        title="Status"
        options={TODO_STATUSES}
        selected={state.filters.statuses}
        label={(status) => TODO_STATUS_LABELS[status]}
        onChange={(statuses) => state.setFilters({ ...state.filters, statuses })}
      />
      <StorageFilterGroup
        title="Priority"
        options={PRIORITIES}
        selected={state.filters.priorities}
        label={(priority) => `P${priority}`}
        onChange={(priorities) => state.setFilters({ ...state.filters, priorities })}
      />
      {state.projects.length > 0 && (
        <StorageFilterGroup
          title="Project"
          options={state.projects}
          selected={state.filters.projects}
          label={(project) => project || "No project"}
          onChange={(projects) => state.setFilters({ ...state.filters, projects })}
        />
      )}
      <Button
        {...editorControlProps}
        variant="outline"
        size="sm"
        className={TODO_STORAGE_CLEAR_CLASS}
        type="button"
        onClick={() =>
          state.setFilters({ statuses: new Set(), priorities: new Set(), projects: new Set() })
        }
      >
        Clear filters
      </Button>
    </TodoStorageMenu>
  );
}

/**
 * Edits the persisted ordering policy through the storage's ID-bound commands.
 *
 * Status rows remain in an in-flow disclosure, preserving document offsets for
 * their existing drag behavior. Manual order does not rewrite the stored sequence.
 *
 * @param props - Storage identity owning the collaborative ordering settings.
 * @param props.blockId - Block whose validated props are read and updated.
 * @returns Mode checkbox and reorder control, or null when the block is missing.
 */
function TodoStorageOrderMenu({ blockId }: TodoStorageComponentProps) {
  const editing = useBlockNode<TodoStorageProps>(blockId);
  const id = useId();
  if (!editing.block) {
    return null;
  }
  const props = editing.block.props;
  return (
    <TodoStorageMenu label="Order" panelLabel="Ordering">
      <FilterOption
        id={`${id}-order-status`}
        checked={props.orderMode === "status"}
        label="Status"
        onToggle={() =>
          editing.operations.setProps({
            orderMode: props.orderMode === "status" ? "manual" : "status",
          })
        }
      />
      {props.orderMode === "status" && (
        <TodoStatusOrder
          order={props.statusOrder}
          onChange={(statusOrder) => editing.operations.setProps({ statusOrder })}
        />
      )}
    </TodoStorageMenu>
  );
}

/**
 * Places the search field and independent filter/order disclosures in one toolbar.
 *
 * Controls retain their native pointer and keyboard behavior. The toolbar does
 * not render child blocks or own their collapse and placement geometry.
 *
 * @param props - Storage identity passed to the persisted ordering control.
 * @param props.blockId - Owner of the ordering policy.
 * @returns Search and two in-flow menus using the current layout's local state.
 */
function TodoStorageToolbar({ blockId }: TodoStorageComponentProps) {
  const state = useTodoStorageState();
  const attributes = usePreventTextEditing();
  return (
    <div {...attributes} className={TODO_STORAGE_TOOLBAR_CLASS}>
      <Input
        {...editorControlProps}
        className={TODO_STORAGE_SEARCH_CLASS}
        type="search"
        aria-label="Search TODOs"
        placeholder="Search"
        value={state.query}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          state.setQuery(event.currentTarget.value)
        }
      />
      <TodoStorageFiltersMenu />
      <TodoStorageOrderMenu blockId={blockId} />
    </div>
  );
}

/**
 * Renders search, disclosure filter menus, and persisted status-order controls.
 *
 * The layout supplies state and separately places children and the empty field.
 * A collapsed storage replaces its toolbar with the immediate-child summary.
 *
 * @param props - Identity of the storage represented by this content region.
 * @param props.blockId - Block whose collapse flag and direct-child count are read.
 * @returns Toolbar or collapsed summary; null when the block has been removed.
 */
export function TodoStorage({ blockId }: TodoStorageComponentProps) {
  const { block } = useBlockNode(blockId);
  const attributes = useBlockSelectionAnchor(blockId);
  if (!block) {
    return null;
  }
  if (block.listProps.collapsed === true) {
    const count = block.childIds.length;
    return (
      <div {...attributes} className={TODO_STORAGE_SUMMARY_CLASS}>
        <strong>TODO storage</strong>
        <span className={TODO_STORAGE_SUMMARY_STATS_CLASS}>
          {count} {count === 1 ? "item" : "items"}
        </span>
      </div>
    );
  }
  return (
    <div {...attributes} className={TODO_STORAGE_CONTENT_CLASS}>
      <TodoStorageToolbar blockId={blockId} />
    </div>
  );
}

/**
 * Filters only the already-rendered immediate children of this storage layout.
 *
 * Nested blocks retain their own layout and any nested storage gets its own
 * provider. Filtering never changes document membership or canonical ordering.
 *
 * @param props - Child identity and its Page-owned subtree.
 * @param props.blockId - Direct child whose searchable fields are observed.
 * @param props.children - Existing subtree, rendered once when accepted.
 * @returns The subtree or null while it does not match this occurrence's filters.
 */
function TodoStorageItem({ blockId, children }: BlockChildrenItemProps) {
  const { block } = useBlockNode(blockId);
  const context = useContext(TodoStorageContext);
  if (!block || !context || !matchesTodoStorage(block, context.query, context.filters)) {
    return null;
  }
  return children;
}

/**
 * Supplies an accessible writing action when the storage has no children.
 *
 * The layout places this in its child host, so collapse removes it together
 * with the list and Page measures the empty region in normal document flow.
 *
 * @param props - Receiving storage identity.
 * @param props.blockId - Empty storage passed to the registered writing behavior.
 * @returns The empty writing field, or null when a real child exists.
 */
function TodoStorageEmpty({ blockId }: TodoStorageComponentProps) {
  const reactPanel = useReactPanel();
  const { element: root } = useEditorRoot();
  const { block } = useBlockNode(blockId);
  const preventTextEditingAttributes = usePreventTextEditing();
  const childIds = block?.childIds ?? [];
  /** Inserts the first writing block through the registered container view. */
  const startWriting = (event: MouseEvent<HTMLButtonElement>): void => {
    if (childIds.length || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const behaviorContext = root
      ? createBlockBehaviorContext(reactPanel, blockId, root)
      : undefined;
    if (behaviorContext) {
      todoStorageBehavior.appendWritingBlock(behaviorContext);
    }
  };

  if (childIds.length) {
    return null;
  }
  return (
    <Button
      {...editorControlProps}
      {...preventTextEditingAttributes}
      variant="ghost"
      type="button"
      className={TODO_STORAGE_DROP_FIELD_CLASS}
      aria-label="Drop blocks into TODO storage"
      onClick={startWriting}
    >
      <span className={TODO_STORAGE_DROP_ICON_CLASS} aria-hidden="true">
        <ArrowDownIcon />
      </span>
      <span className={TODO_STORAGE_DROP_COPY_CLASS}>
        <strong>Drag a task here</strong>
        <small>Drop it inside this storage</small>
      </span>
    </Button>
  );
}

/**
 * Composes the toolbar, local storage state, and a single filtered child traversal.
 *
 * The toolbar and retained empty child host accept inside drops; the outer rim
 * remains the block's sibling boundary. Header, body and children belong to the
 * existing BlockView, giving Page one selection boundary in both surfaces.
 * Direct-child boundaries share ordinary outline depth: the leading band sorts
 * siblings and the indented trailing band appends children without entering content.
 *
 * @param props - Storage identity supplied by the registered Page layout.
 * @param props.blockId - Canonical parent for toolbar drops and the empty writing field.
 * @returns Layout-owned state, header, body contributions and the vertical child host.
 */
export function TodoStorageLayout({ blockId }: TodoStorageComponentProps) {
  return (
    <TodoStorageState blockId={blockId}>
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        <BlockRow className="rivto-todo-storage-header">
          <BlockContent />
        </BlockRow>
      </BlockDropTarget>
      <BlockBody />
      <BlockChildren
        dropBackground
        className="rivto-todo-storage-children"
        targetSize={16}
        dropAxis="vertical"
        dropPlacement="outline"
        item={TodoStorageItem}
        emptyDropTarget
      >
        <TodoStorageEmpty blockId={blockId} />
      </BlockChildren>
    </TodoStorageState>
  );
}
