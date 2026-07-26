"use client";

import { FilePlus2, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import { Button } from "./button";
import { ScrollArea } from "./scroll-area";
import { Separator } from "./separator";
import { cn } from "../lib/utils";
import {
  useCreatePageMutation,
  useDeletePageMutation,
  usePagesQuery,
} from "../hooks/use-pages";
import { useUiStore } from "../stores/ui-store";

export type PageSidebarProps = {
  activePageId?: string;
  onSelectPage: (pageId: string) => void;
  onPageCreated?: (pageId: string) => void;
  onPageDeleted?: (pageId: string) => void;
};

export function PageSidebar({
  activePageId,
  onSelectPage,
  onPageCreated,
  onPageDeleted,
}: PageSidebarProps) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { data: pages = [], isLoading, error } = usePagesQuery();
  const createPage = useCreatePageMutation();
  const deletePage = useDeletePageMutation();

  if (!sidebarOpen) {
    return (
      <aside className="flex w-12 flex-col border-r border-border bg-sidebar p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
        >
          <PanelLeftOpen />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rivto
          </p>
          <h1 className="text-sm font-semibold text-foreground">Pages</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="New page"
            disabled={createPage.isPending}
            onClick={async () => {
              const page = await createPage.mutateAsync({ title: "Untitled" });
              onPageCreated?.(page.id);
              onSelectPage(page.id);
            }}
          >
            <FilePlus2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Close sidebar"
          >
            <PanelLeftClose />
          </Button>
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              Loading…
            </p>
          )}
          {error && (
            <p className="px-2 py-1.5 text-sm text-destructive">
              Failed to load pages
            </p>
          )}
          {!isLoading && pages.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No pages yet. Create one to start.
            </p>
          )}
          {pages.map((page) => (
            <div
              key={page.id}
              className={cn(
                "group flex items-center gap-1 rounded-md",
                activePageId === page.id && "bg-accent",
              )}
            >
              <button
                type="button"
                className={cn(
                  "flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/80",
                  activePageId === page.id && "font-medium",
                )}
                onClick={() => onSelectPage(page.id)}
              >
                {page.title}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100"
                aria-label={`Delete ${page.title}`}
                disabled={deletePage.isPending}
                onClick={async () => {
                  await deletePage.mutateAsync(page.id);
                  onPageDeleted?.(page.id);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
