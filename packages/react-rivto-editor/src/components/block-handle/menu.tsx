import { useSyncExternalStore } from "react";
import type {
  BlockContextMenuContext,
  BlockContextMenuEntry,
} from "../../managers/block-context-menu/types";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "../ui/dropdown-menu";
import {
  CopyIcon,
  ScissorsIcon,
  Trash2Icon,
  ListIcon,
  ListTodoIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  LinkIcon,
} from "lucide-react";

const MENU_CLASS = "block-context-menu rounded-xl border-border/80 p-1.5 shadow-xl";
const ITEM_CLASS = "block-context-menu-item rounded-md text-[13px]";

const actionIcons = {
  "clipboard.copy": CopyIcon,
  "clipboard.cut": ScissorsIcon,
  "block.delete": Trash2Icon,
  list: ListIcon,
  "type.todo-item": ListTodoIcon,
  "block.collapse": ChevronsDownUpIcon,
  "block.expand": ChevronsUpDownIcon,
  "embedding.copy": LinkIcon,
};

/**
 * Renders decorative artwork for a known built-in menu entry.
 *
 * @param props - Identity of the entry whose artwork is requested.
 * @param props.id - Registration ID used to look up the built-in icon.
 * @returns An aria-hidden icon, or null when no artwork is mapped; the caller
 * still renders the entry's text label.
 */
function ActionIcon({ id }: { id: string }) {
  const Icon = actionIcons[id as keyof typeof actionIcons];
  return Icon ? <Icon aria-hidden="true" /> : null;
}

/**
 * Renders available entries at one level of the block context menu.
 *
 * Filters by parent ID and availability, then omits leading, trailing, and repeated
 * separators. Actions execute through the invoking panel manager; custom entries
 * render their own controls, and submenu entries resolve their children recursively.
 * The caller supplies registry ordering; this component does not sort entries.
 *
 * @param props - Captured menu context, ordered definitions, and level ownership.
 * @param props.context - Invoking panel and target IDs captured when the menu opened.
 * @param props.entries - Ordered definitions shared by every level of this menu.
 * @param props.parentId - Parent submenu ID; omitted selects top-level entries.
 * @param props.close - Callback passed to custom controls to dismiss the whole menu.
 * @returns Menu items, custom content, separators, and submenu triggers for this level.
 */
function MenuEntries({
  context,
  entries,
  parentId,
  close,
}: {
  context: BlockContextMenuContext;
  entries: BlockContextMenuEntry[];
  parentId?: string;
  close: () => void;
}) {
  const visible = entries.filter(
    (entry) => entry.parentId === parentId && entry.isAvailable?.(context) !== false,
  );
  return visible
    .filter(
      (entry, index) =>
        entry.kind !== "separator" ||
        (index > 0 &&
          visible[index - 1].kind !== "separator" &&
          visible.slice(index + 1).some((next) => next.kind !== "separator")),
    )
    .map((entry) => {
      if (entry.kind === "separator") {
        return <DropdownMenuSeparator key={entry.id} />;
      }
      if (entry.kind === "custom") {
        return <div key={entry.id}>{entry.render?.({ ...context, close })}</div>;
      }
      if (entry.kind === "submenu") {
        return (
          <BlockSubmenu
            key={entry.id}
            entry={entry}
            context={context}
            entries={entries}
            close={close}
          />
        );
      }
      const Item = entry.isChecked ? DropdownMenuCheckboxItem : DropdownMenuItem;
      return (
        <Item
          checked={entry.isChecked?.(context)}
          variant={entry.id === "block.delete" ? "destructive" : "default"}
          key={entry.id}
          className={ITEM_CLASS}
          onSelect={() => {
            void context.reactPanel.blockContextMenu.execute(entry.id, context);
          }}
        >
          {!entry.isChecked && <ActionIcon id={entry.id} />}
          {entry.title}
        </Item>
      );
    });
}

/** Captured invocation coordinates and focus ownership for an active block menu. */
interface BlockContextMenuProps {
  /** Invoking panel and captured target IDs, retained while menu focus moves. */
  context: BlockContextMenuContext;
  /** Horizontal anchor coordinate in viewport CSS pixels. */
  x: number;
  /** Vertical anchor coordinate in viewport CSS pixels. */
  y: number;
  /**
   * Requests dismissal of this menu without changing its captured targets.
   *
   * @returns No value after the owning handle has been notified.
   */
  close: () => void;
  /** Button receiving focus on dismissal, or null if it is no longer mounted. */
  handle: HTMLButtonElement | null;
}

/**
 * Mounts an open, nonmodal menu at the captured pointer or keyboard anchor.
 *
 * Registry revisions refresh the available entries. A zero-size fixed trigger
 * anchors the portaled content; collision handling keeps it within the viewport.
 * Dismissal notifies the owning handle and restores focus to its button when present.
 * Document edits do not independently trigger a registry subscription update.
 *
 * @param props - Captured invocation context and focus ownership.
 * @param props.context - Invoking panel and document-local target IDs.
 * @param props.x - Horizontal viewport anchor coordinate in CSS pixels.
 * @param props.y - Vertical viewport anchor coordinate in CSS pixels.
 * @param props.close - Callback asking the owning handle to unmount the menu.
 * @param props.handle - Button to refocus on close, or null when unavailable.
 * @returns The controlled shadcn/ui menu and its portaled contents.
 */
export function BlockContextMenu({ context, x, y, close, handle }: BlockContextMenuProps) {
  const registry = context.reactPanel.editor.blockContextMenu;
  useSyncExternalStore(
    (listener) => registry.subscribe(listener),
    () => registry.revision,
  );
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      modal={false}
    >
      <DropdownMenuTrigger
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: "fixed", left: x, top: y, width: 0, height: 0, opacity: 0 }}
      />
      <DropdownMenuContent
        className={MENU_CLASS}
        align="start"
        sideOffset={2}
        collisionPadding={8}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          handle?.focus();
        }}
      >
        <MenuEntries
          context={context}
          entries={context.reactPanel.blockContextMenu.getAll(context)}
          close={close}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Renders a submenu trigger and its nested extension contributions.
 *
 * The shared menu primitives own keyboard navigation and focus. Child entries are
 * resolved using this entry's ID; custom content receives the top-level close
 * callback so it can dismiss the entire menu after completing an operation.
 *
 * @param props - Submenu definition, captured targets, and shared ordered entries.
 * @param props.entry - Submenu registration whose ID selects its children.
 * @param props.context - Panel and target IDs captured for the entire menu.
 * @param props.entries - Ordered definitions including this submenu's children.
 * @param props.close - Callback dismissing the owning top-level menu.
 * @returns A submenu trigger and portaled content for its available children.
 */
function BlockSubmenu({
  entry,
  context,
  entries,
  close,
}: {
  entry: BlockContextMenuEntry;
  context: BlockContextMenuContext;
  entries: BlockContextMenuEntry[];
  close: () => void;
}) {
  return (
    <DropdownMenuSub key={entry.id}>
      <DropdownMenuSubTrigger className={ITEM_CLASS}>
        <ActionIcon id={entry.id} />
        {entry.title}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className={MENU_CLASS} sideOffset={4}>
          <MenuEntries context={context} entries={entries} parentId={entry.id} close={close} />
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
