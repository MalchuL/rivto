"use client";

import type { Page } from "@chulane/app";
import {
  DocumentEditor,
  useDeletePageMutation,
  usePagesQuery,
  useProjectsQuery,
  useUpdatePageMutation,
} from "@chulane/app/client";
import {
  CornerDownRight,
  FilePlus,
  FolderInput,
  MoreHorizontal,
  PanelRight,
  Pin,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageTagPicker } from "@/domain/tag/components/page-tag-picker";
import { useCreateActions } from "@/domain/workspace/hooks/use-create-actions";
import { useTabsStore } from "@/domain/workspace/store/tabs-store";
import { useUiStore } from "@/domain/workspace/store/ui-store";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils";

function collectDescendantIds(rootId: string, pages: Page[]): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const p of pages) {
    if (!p.parentPageId) continue;
    const list = byParent.get(p.parentPageId) ?? [];
    list.push(p.id);
    byParent.set(p.parentPageId, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

type SaveState = "saved" | "dirty" | "saving";

export function PageDocument({
  page,
  breadcrumbs,
  readOnlyTitle = false,
  allowManage = true,
}: {
  page: Page;
  breadcrumbs: React.ReactNode;
  readOnlyTitle?: boolean;
  allowManage?: boolean;
}) {
  const router = useRouter();
  const { newPage } = useCreateActions();
  const updatePage = useUpdatePageMutation();
  const deletePage = useDeletePageMutation();
  const { data: projects = [] } = useProjectsQuery();
  const { data: projectPages = [] } = usePagesQuery({ projectId: page.projectId });
  const closeTab = useTabsStore((state) => state.closeTab);
  const toggleRightSidebar = useUiStore((state) => state.toggleRightSidebar);
  const favoritePageIds = useUiStore((state) => state.favoritePageIds);
  const togglePinnedPage = useUiStore((state) => state.togglePinnedPage);
  const removeFromRecentAndFavorites = useUiStore(
    (state) => state.removeFromRecentAndFavorites,
  );

  const [title, setTitle] = useState(page.title);
  const [html, setHtml] = useState(page.content || "<p></p>");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(page.title);
    setHtml(page.content || "<p></p>");
    setSaveState("saved");
  }, [page.id]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const scheduleSave = (next: { title?: string; content?: string }) => {
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      await updatePage.mutateAsync({ id: page.id, ...next });
      setSaveState("saved");
    }, 500);
  };

  const isPinned = favoritePageIds.includes(page.id);
  const moveTargets = projects.filter(
    (project) =>
      project.id !== page.projectId && (!project.system || project.system === "inbox"),
  );
  const nestTargets = useMemo(() => {
    const blocked = collectDescendantIds(page.id, projectPages);
    blocked.add(page.id);
    return projectPages.filter(
      (candidate) =>
        candidate.kind !== "journal" &&
        !blocked.has(candidate.id) &&
        candidate.id !== page.parentPageId,
    );
  }, [page.id, page.parentPageId, projectPages]);

  const handleDelete = async () => {
    await deletePage.mutateAsync(page.id);
    removeFromRecentAndFavorites(page.id);
    const nextHref = closeTab(`page:${page.id}`);
    router.push(nextHref ?? FRONTEND_ROUTES.journal);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-8">
      <header className="flex items-center justify-between gap-3 pb-1 pt-5">
        <div className="min-w-0 text-sm text-muted-foreground">{breadcrumbs}</div>
        <div className="flex shrink-0 items-center gap-0.5">
          <span
            aria-label={saveState === "saved" ? "Saved" : "Unsaved changes"}
            title={saveState === "saved" ? "Saved" : "Saving…"}
            className={cn(
              "mx-1.5 size-1.5 rounded-full transition-colors",
              saveState === "saved" ? "bg-border" : "bg-primary",
            )}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => togglePinnedPage(page.id)}
            aria-label={isPinned ? "Unpin page" : "Pin page"}
          >
            <Pin className={isPinned ? "fill-current text-primary" : ""} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleRightSidebar}
            aria-label="Toggle context sidebar"
          >
            <PanelRight />
          </Button>
          {allowManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Page menu">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onSelect={() => void newPage(page.projectId, page.id)}
                >
                  <FilePlus />
                  Add subpage
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CornerDownRight />
                    Move under page
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {page.parentPageId ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          void updatePage.mutateAsync({
                            id: page.id,
                            parentPageId: null,
                          })
                        }
                      >
                        Move to project root
                      </DropdownMenuItem>
                    ) : null}
                    {nestTargets.length === 0 ? (
                      <DropdownMenuItem disabled>No other pages</DropdownMenuItem>
                    ) : (
                      nestTargets.map((candidate) => (
                        <DropdownMenuItem
                          key={candidate.id}
                          onSelect={() =>
                            void updatePage.mutateAsync({
                              id: page.id,
                              parentPageId: candidate.id,
                            })
                          }
                        >
                          {candidate.title}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput />
                    Move to project
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {moveTargets.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onSelect={() =>
                          void updatePage.mutateAsync({
                            id: page.id,
                            projectId: project.id,
                            parentPageId: null,
                          })
                        }
                      >
                        <span className="text-sm leading-none">
                          {project.icon ?? (project.system === "inbox" ? "•" : "•")}
                        </span>
                        {project.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void handleDelete()}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 />
                  Delete page
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <Input
        value={title}
        readOnly={readOnlyTitle}
        placeholder="Untitled"
        onChange={(event) => {
          setTitle(event.target.value);
          scheduleSave({ title: event.target.value });
        }}
        className="h-auto border-0 bg-transparent px-0 py-1 text-3xl font-bold shadow-none focus-visible:ring-0"
      />

      {allowManage ? (
        <div className="mt-2">
          <PageTagPicker
            pageId={page.id}
            projectId={page.projectId}
            tagIds={page.tagIds}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 pb-16 pt-2">
        <DocumentEditor
          value={{ html }}
          onChange={(value) => {
            setHtml(value.html);
            scheduleSave({ content: value.html });
          }}
        />
      </div>
    </div>
  );
}
