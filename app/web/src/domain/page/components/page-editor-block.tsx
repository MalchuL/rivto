"use client";

import type { Page } from "@chulane/app";
import { DocumentEditor, EditorModeToggle, useUpdatePageMutation } from "@chulane/app/client";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "dirty" | "saving";

/** Compact in-stack linked editor without surrounding chrome or sidebars. */
export function PageEditorBlock({
  page,
  heading,
  readOnlyTitle = false,
}: {
  page: Page;
  /** Overrides page.title in the heading (e.g. journal day label). */
  heading?: string;
  readOnlyTitle?: boolean;
}) {
  const updatePage = useUpdatePageMutation();
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(page.title);
    setContent(page.content);
    setSaveState("saved");
  }, [page.id, page.title, page.content]);

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

  return (
    <article className="scroll-mt-4 py-6">
      <DocumentEditor
        documentId={page.id}
        content={content}
        onChange={(next) => {
          setContent(next);
          scheduleSave({ content: next });
        }}
        showModeSwitch={false}
      >
        <div className="mb-2 flex items-center gap-2">
          {heading || readOnlyTitle ? (
            <h2 className="min-w-0 flex-1 text-xl font-semibold tracking-tight">
              {heading ?? title}
            </h2>
          ) : (
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                scheduleSave({ title: event.target.value });
              }}
              placeholder="Untitled"
              className="h-auto flex-1 border-0 bg-transparent px-0 py-0 text-xl font-semibold shadow-none focus-visible:ring-0"
            />
          )}
          <EditorModeToggle />
          <span
            aria-label={saveState === "saved" ? "Saved" : "Unsaved changes"}
            title={saveState === "saved" ? "Saved" : "Saving…"}
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              saveState === "saved" ? "bg-border" : "bg-primary",
            )}
          />
        </div>
      </DocumentEditor>
    </article>
  );
}
