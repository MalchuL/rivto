"use client";

import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  Pin,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CreateMenu } from "@/components/shared/create-menu";
import {
  useTabsStore,
  useWorkspaceTabs,
  type TabKind,
  type WorkspaceTab,
} from "@/domain/workspace/store/tabs-store";
import { cn } from "@/lib/utils";

const TAB_ICONS: Record<TabKind, React.ComponentType<{ className?: string }>> = {
  page: FileText,
  journal: BookOpen,
  "journal-day": CalendarDays,
  project: FolderKanban,
  projects: FolderKanban,
  search: Search,
};

function Tab({
  tab,
  active,
  onDragToIndex,
  index,
}: {
  tab: WorkspaceTab;
  active: boolean;
  index: number;
  onDragToIndex: (tabId: string, toIndex: number) => void;
}) {
  const router = useRouter();
  const { setActive, closeTab, togglePin, tabs } = useTabsStore();
  const Icon = TAB_ICONS[tab.kind];

  const open = () => {
    setActive(tab.id);
    router.push(tab.href);
  };

  const close = () => {
    const nextHref = closeTab(tab.id);
    if (nextHref) router.push(nextHref);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/rivto-tab", tab.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("text/rivto-tab")) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            const draggedId = event.dataTransfer.getData("text/rivto-tab");
            if (draggedId && draggedId !== tab.id) {
              event.preventDefault();
              onDragToIndex(draggedId, index);
            }
          }}
          onClick={open}
          onAuxClick={(event) => {
            if (event.button === 1) close();
          }}
          className={cn(
            "group flex h-full min-w-0 cursor-default select-none items-center gap-1.5 border-r border-border/60 px-3 text-sm transition-colors",
            active
              ? "bg-background text-foreground"
              : "bg-transparent text-muted-foreground hover:bg-background/60",
            tab.pinned ? "max-w-40" : "max-w-52",
          )}
        >
          {tab.pinned ? (
            <Pin className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <Icon className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{tab.title}</span>
          {!tab.pinned ? (
            <button
              type="button"
              aria-label="Close tab"
              onClick={(event) => {
                event.stopPropagation();
                close();
              }}
              className={cn(
                "ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
                active ? "opacity-70" : "opacity-0 group-hover:opacity-70",
              )}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => togglePin(tab.id)}>
          <Pin />
          {tab.pinned ? "Unpin tab" : "Pin tab"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={close}>
          <X />
          Close tab
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            const others = tabs.filter((it) => it.id !== tab.id && !it.pinned);
            for (const other of others) {
              closeTab(other.id);
            }
            setActive(tab.id);
            router.push(tab.href);
          }}
        >
          Close other tabs
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function OpenTabsMenu() {
  const router = useRouter();
  const tabs = useWorkspaceTabs();
  const activeTabId = useTabsStore((state) => state.activeTabId);
  const setActive = useTabsStore((state) => state.setActive);
  const closeTab = useTabsStore((state) => state.closeTab);
  const togglePin = useTabsStore((state) => state.togglePin);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open tabs">
              <ChevronsUpDown />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Open tabs</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {tabs.length} open tab{tabs.length === 1 ? "" : "s"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tabs.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            No open tabs
          </div>
        ) : (
          tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.kind];
            const active = tab.id === activeTabId;
            return (
              <DropdownMenuItem
                key={tab.id}
                className="gap-2"
                onSelect={() => {
                  setActive(tab.id);
                  router.push(tab.href);
                }}
              >
                {tab.pinned ? (
                  <Pin className="size-3.5 shrink-0" />
                ) : (
                  <Icon className="size-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                {active ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                <button
                  type="button"
                  className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={tab.pinned ? "Unpin tab" : "Pin tab"}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    togglePin(tab.id);
                  }}
                >
                  <Pin className={cn("size-3", tab.pinned && "text-primary")} />
                </button>
                <button
                  type="button"
                  className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close tab"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const nextHref = closeTab(tab.id);
                    if (nextHref && tab.id === activeTabId) {
                      router.push(nextHref);
                    }
                  }}
                >
                  <X className="size-3" />
                </button>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TabBar() {
  const tabs = useWorkspaceTabs();
  const activeTabId = useTabsStore((state) => state.activeTabId);
  const moveTab = useTabsStore((state) => state.moveTab);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b bg-tab-bar">
      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            index={index}
            active={tab.id === activeTabId}
            onDragToIndex={moveTab}
          />
        ))}
      </div>
      <div className="flex items-center gap-0.5 px-1.5">
        <OpenTabsMenu />
        <CreateMenu align="end">
          <Button variant="ghost" size="icon-sm" aria-label="New tab">
            <Plus />
          </Button>
        </CreateMenu>
      </div>
    </div>
  );
}
