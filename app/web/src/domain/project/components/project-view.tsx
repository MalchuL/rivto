"use client";

import type { Page, Project } from "@chulane/app";
import {
  usePagesQuery,
  useProjectQuery,
  useUpdateProjectMutation,
} from "@chulane/app/client";
import { FilePlus, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ViewModeToggle } from "@/components/shared/view-mode-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LinkedDocumentStack } from "@/domain/page/components/linked-document-stack";
import { buildPageTree, stripHtml, type PageTreeNode } from "@/domain/page/utils/page-tree";
import { ProjectTagsPanel } from "@/domain/tag/components/project-tags-panel";
import { useCreateActions } from "@/domain/workspace/hooks/use-create-actions";
import { useSyncTab } from "@/domain/workspace/hooks/use-sync-tab";
import {
  useProjectTab,
  useProjectViewMode,
  useUiStore,
  type ProjectPanelTab,
} from "@/domain/workspace/store/ui-store";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

function PageRow({ page }: { page: Page }) {
  const preview = stripHtml(page.content).slice(0, 100);
  return (
    <Link
      href={FRONTEND_ROUTES.page(page.id)}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{page.title}</div>
        {preview ? (
          <p className="truncate text-xs text-muted-foreground">{preview}</p>
        ) : null}
      </div>
    </Link>
  );
}

function PageTreeRows({
  nodes,
  depth,
  onAddSubpage,
}: {
  nodes: PageTreeNode[];
  depth: number;
  onAddSubpage: (page: Page) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.page.id}>
          <div
            className="group flex items-center gap-1 rounded-md transition-colors hover:bg-muted"
            style={{ paddingLeft: `${12 + depth * 18}px` }}
          >
            <Link
              href={FRONTEND_ROUTES.page(node.page.id)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-sm"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{node.page.title}</span>
            </Link>
            <button
              type="button"
              onClick={() => onAddSubpage(node.page)}
              className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
              aria-label="Add subpage"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {node.children.length > 0 ? (
            <PageTreeRows
              nodes={node.children}
              depth={depth + 1}
              onAddSubpage={onAddSubpage}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}

function ProjectHeader({ project }: { project: Project }) {
  const updateProject = useUpdateProjectMutation();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
  }, [project.id, project.name, project.description]);

  const commit = () => {
    if (name !== project.name || description !== (project.description ?? "")) {
      void updateProject.mutateAsync({ id: project.id, name, description });
    }
  };

  return (
    <header>
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none">{project.icon ?? "•"}</span>
        <Input
          value={name}
          readOnly={Boolean(project.system)}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          className="h-auto border-0 bg-transparent px-0 py-1 text-3xl font-bold shadow-none focus-visible:ring-0"
        />
      </div>
      <Input
        value={description}
        readOnly={Boolean(project.system)}
        placeholder="Add a description…"
        onChange={(event) => setDescription(event.target.value)}
        onBlur={commit}
        className="mt-1 h-auto border-0 bg-transparent px-0 py-0.5 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
      />
      <div className="mt-3 flex items-center gap-2 text-sm">
        {project.status ? <Badge variant="secondary">{project.status}</Badge> : null}
        {project.parentProjectId ? (
          <Badge variant="outline">Subproject</Badge>
        ) : null}
      </div>
    </header>
  );
}

export function ProjectView({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProjectQuery(projectId);
  const { data: pages = [] } = usePagesQuery({ projectId });
  const { newPage } = useCreateActions();
  const viewMode = useProjectViewMode(projectId);
  const panelTab = useProjectTab(projectId);
  const setProjectViewMode = useUiStore((state) => state.setProjectViewMode);
  const setProjectTab = useUiStore((state) => state.setProjectTab);

  useSyncTab({
    id: `project:${projectId}`,
    kind: "project",
    href: FRONTEND_ROUTES.project(projectId),
    title: project?.name ?? "Loading…",
    entityId: projectId,
  });

  const documents = useMemo(
    () => pages.filter((page) => page.kind !== "journal"),
    [pages],
  );
  const recent = useMemo(
    () =>
      [...documents]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5),
    [documents],
  );
  const tree = useMemo(() => buildPageTree(documents), [documents]);
  const linkedItems = useMemo(
    () =>
      [...documents]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((page) => ({ page })),
    [documents],
  );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 pt-12">
        <Skeleton className="mb-4 h-9 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 pt-12 text-sm text-muted-foreground">
        This project does not exist (mock data resets on reload).
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      <ProjectHeader project={project} />
      {!project.system ? <ProjectTagsPanel projectId={projectId} /> : null}

      <Tabs
        value={panelTab}
        onValueChange={(value) => setProjectTab(projectId, value as ProjectPanelTab)}
        className="mt-8"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="tasks" disabled>
            Tasks
          </TabsTrigger>
          <TabsTrigger value="activity" disabled>
            Activity
          </TabsTrigger>
          <TabsTrigger value="graph" disabled>
            Graph
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {project.description ? (
            <p className="mb-4 px-3 text-sm text-muted-foreground">
              {project.description}
            </p>
          ) : null}
          <h2 className="px-3 text-sm font-medium text-muted-foreground">
            Recent pages
          </h2>
          <div className="mt-1 flex flex-col gap-0.5">
            {recent.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No pages in this project yet.
              </p>
            ) : (
              recent.map((page) => <PageRow key={page.id} page={page} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="pages" className="mt-4">
          <div className="flex items-center justify-between gap-3 px-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {documents.length} page{documents.length === 1 ? "" : "s"}
            </h2>
            <div className="flex items-center gap-2">
              <ViewModeToggle
                value={viewMode}
                onChange={(mode) => setProjectViewMode(projectId, mode)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void newPage(projectId)}
              >
                <FilePlus />
                New page
              </Button>
            </div>
          </div>

          {viewMode === "linked" ? (
            <div className="-mx-8 mt-2">
              <LinkedDocumentStack
                items={linkedItems}
                emptyMessage="No pages in this project yet."
              />
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-0.5">
              {tree.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No pages in this project yet.
                </p>
              ) : (
                <PageTreeRows
                  nodes={tree}
                  depth={0}
                  onAddSubpage={(page) => void newPage(page.projectId, page.id)}
                />
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
