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

/** Resolves built-in action artwork; extension entries without artwork keep their text label. */
function ActionIcon({ id }: { id: string }) {
  const Icon = actionIcons[id as keyof typeof actionIcons];
  return Icon ? <Icon aria-hidden="true" /> : null;
}

/** Renders one menu level, allowing extension-owned interactive content and nested contributions. */
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

/** Mounts only the active menu, anchored at the pointer or keyboard-invoked handle. */
interface BlockContextMenuProps {
  context: BlockContextMenuContext;
  x: number;
  y: number;
  close: () => void;
  handle: HTMLButtonElement | null;
}

/** Mounts only the active menu, anchored at the pointer or keyboard-invoked handle. */
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

/** Renders one extension-owned submenu using the shared keyboard and focus primitives. */
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
