"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentEditor } from "../editor/TipTapEditor";
import {
  usePageQuery,
  useUpdatePageMutation,
} from "../hooks/use-pages";
import { useUiStore } from "../stores/ui-store";
import { Input } from "./input";
import { PageSidebar } from "./page-sidebar";

export type PageWorkspaceProps = {
  pageId?: string;
  onSelectPage: (pageId: string) => void;
  onPageCreated?: (pageId: string) => void;
  onPageDeleted?: (pageId: string) => void;
};

export function PageWorkspace({
  pageId,
  onSelectPage,
  onPageCreated,
  onPageDeleted,
}: PageWorkspaceProps) {
  const { data: page, isLoading, error } = usePageQuery(pageId);
  const updatePage = useUpdatePageMutation();
  const setCurrentPageId = useUiStore((s) => s.setCurrentPageId);
  const setEditorDirty = useUiStore((s) => s.setEditorDirty);
  const editorDirty = useUiStore((s) => s.editorDirty);

  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("<p></p>");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCurrentPageId(pageId ?? null);
  }, [pageId, setCurrentPageId]);

  useEffect(() => {
    if (!page) return;
    setTitle(page.title);
    setHtml(page.content || "<p></p>");
    setEditorDirty(false);
  }, [page, setEditorDirty]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const scheduleSave = (next: {
    title?: string;
    content?: string;
  }) => {
    if (!pageId) return;
    setEditorDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await updatePage.mutateAsync({ id: pageId, ...next });
      setEditorDirty(false);
    }, 500);
  };

  return (
    <div className="flex h-full min-h-0 w-full bg-background text-foreground">
      <PageSidebar
        activePageId={pageId}
        onSelectPage={onSelectPage}
        onPageCreated={onPageCreated}
        onPageDeleted={onPageDeleted}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
          <Input
            value={title}
            disabled={!page}
            placeholder="Untitled"
            className="border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
            onChange={(event) => {
              const nextTitle = event.target.value;
              setTitle(nextTitle);
              scheduleSave({ title: nextTitle || "Untitled" });
            }}
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {!pageId
              ? "Select or create a page"
              : editorDirty || updatePage.isPending
                ? "Saving…"
                : "Saved"}
          </span>
        </header>
        <div className="flex-1 overflow-auto px-6 py-4">
          {!pageId && (
            <p className="text-sm text-muted-foreground">
              Create a page from the sidebar to begin writing.
            </p>
          )}
          {pageId && isLoading && (
            <p className="text-sm text-muted-foreground">Loading page…</p>
          )}
          {pageId && error && (
            <p className="text-sm text-destructive">Failed to load page.</p>
          )}
          {page && (
            <DocumentEditor
              value={{ html }}
              onChange={(value) => {
                setHtml(value.html);
                scheduleSave({ content: value.html });
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
