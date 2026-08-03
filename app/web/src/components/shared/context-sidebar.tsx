"use client";

import type { Page, Project } from "@chulane/app";
import {
  usePageQuery,
  useProjectQuery,
  useProjectTagsQuery,
} from "@chulane/app/client";
import { PanelRightClose, Pin, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizeHandle } from "@/components/shared/resize-handle";
import { PageTagPicker } from "@/domain/tag/components/page-tag-picker";
import { TagChip } from "@/domain/tag/components/tag-chip";
import { useActiveTab } from "@/domain/workspace/store/tabs-store";
import {
  useUiStore,
  type RightSidebarTab,
} from "@/domain/workspace/store/ui-store";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PageDetails({ page }: { page: Page }) {
  const { data: project } = useProjectQuery(page.projectId);
  const favoritePageIds = useUiStore((state) => state.favoritePageIds);
  const togglePinnedPage = useUiStore((state) => state.togglePinnedPage);
  const isPinned = favoritePageIds.includes(page.id);

  return (
    <div className="flex flex-col px-4 py-2">
      <DetailRow label="Project" value={project?.name ?? "—"} />
      <DetailRow label="Kind" value={page.kind} />
      <div className="py-2">
        <p className="mb-1.5 text-sm text-muted-foreground">Tags</p>
        <PageTagPicker
          pageId={page.id}
          projectId={page.projectId}
          tagIds={page.tagIds}
        />
      </div>
      <DetailRow label="Created" value={formatDate(page.createdAt)} />
      <DetailRow label="Updated" value={formatDate(page.updatedAt)} />
      <DetailRow
        label="Pinned"
        value={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => togglePinnedPage(page.id)}
            aria-label={isPinned ? "Unpin page" : "Pin page"}
          >
            <Pin className={isPinned ? "fill-current text-primary" : ""} />
          </Button>
        }
      />
    </div>
  );
}

function ProjectDetails({ project }: { project: Project }) {
  const { data: tags = [] } = useProjectTagsQuery(project.id);

  return (
    <div className="flex flex-col px-4 py-2">
      <DetailRow label="Status" value={project.status ?? "—"} />
      {project.description ? (
        <p className="py-2 text-sm text-muted-foreground">{project.description}</p>
      ) : null}
      <div className="py-2">
        <p className="mb-1.5 text-sm text-muted-foreground">Tags</p>
        {tags.length === 0 ? (
          <span className="text-sm">—</span>
        ) : (
          <div className="flex flex-wrap justify-end gap-1">
            {tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>
      <DetailRow label="Created" value={formatDate(project.createdAt)} />
      <DetailRow label="Updated" value={formatDate(project.updatedAt)} />
    </div>
  );
}

type OutlineItem = { level: number; text: string };

function parseOutline(html: string): OutlineItem[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("h1, h2, h3")].map((el) => ({
    level: Number(el.tagName[1]),
    text: el.textContent?.trim() ?? "",
  }));
}

function PageOutline({ page }: { page: Page }) {
  const outline = useMemo(() => parseOutline(page.content), [page.content]);
  if (outline.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        No headings on this page yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2">
      {outline.map((item, index) => (
        <div
          key={`${item.text}-${index}`}
          className="truncate py-0.5 text-sm text-sidebar-foreground"
          style={{ paddingLeft: `${(item.level - 1) * 14}px` }}
        >
          {item.text || "Untitled heading"}
        </div>
      ))}
    </div>
  );
}

function ComingSoon({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      {icon}
      <span>{label} — coming soon</span>
    </div>
  );
}

function SidebarBody({ tab }: { tab: RightSidebarTab }) {
  const activeTab = useActiveTab();
  const pageId =
    activeTab && (activeTab.kind === "page" || activeTab.kind === "journal-day")
      ? activeTab.entityId
      : undefined;
  const projectId =
    activeTab && activeTab.kind === "project" ? activeTab.entityId : undefined;
  const { data: page } = usePageQuery(pageId);
  const { data: project } = useProjectQuery(projectId);

  if (tab === "relations") {
    return <ComingSoon label="Backlinks and related pages" />;
  }
  if (tab === "ai") {
    return (
      <ComingSoon
        label="AI chat about this page"
        icon={<Sparkles className="size-5" />}
      />
    );
  }
  if (page) {
    return tab === "details" ? (
      <PageDetails page={page} />
    ) : (
      <PageOutline page={page} />
    );
  }
  if (project) {
    return tab === "details" ? (
      <ProjectDetails project={project} />
    ) : (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        Outline is available for pages.
      </p>
    );
  }
  return (
    <p className="px-4 py-3 text-sm text-muted-foreground">
      Open a page or project to see its context.
    </p>
  );
}

export function ContextSidebar() {
  const {
    rightSidebarOpen,
    rightSidebarWidth,
    rightSidebarTab,
    setRightSidebarTab,
    setRightSidebarOpen,
    setRightSidebarWidth,
  } = useUiStore();

  if (!rightSidebarOpen) return null;

  return (
    <div className="flex h-full shrink-0 duration-200 animate-in slide-in-from-right-4">
      <ResizeHandle
        onDrag={(clientX) => setRightSidebarWidth(window.innerWidth - clientX)}
      />
      <aside
        className="flex h-full flex-col border-l border-sidebar-border bg-sidebar"
        style={{ width: rightSidebarWidth }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-2 py-1.5">
          <Tabs
            value={rightSidebarTab}
            onValueChange={(value) => setRightSidebarTab(value as RightSidebarTab)}
          >
            <TabsList className="h-8 bg-sidebar-accent/60">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="outline">Outline</TabsTrigger>
              <TabsTrigger value="relations">Relations</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setRightSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <PanelRightClose />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <SidebarBody tab={rightSidebarTab} />
        </ScrollArea>
      </aside>
    </div>
  );
}
