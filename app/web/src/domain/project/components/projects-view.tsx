"use client";

import { usePagesQuery, useProjectsQuery } from "@chulane/app/client";
import { FolderPlus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateActions } from "@/domain/workspace/hooks/use-create-actions";
import { useSyncTab } from "@/domain/workspace/hooks/use-sync-tab";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

export function ProjectsView() {
  const { data: projects = [], isLoading } = useProjectsQuery();
  const { data: pages = [] } = usePagesQuery();
  const { newProject } = useCreateActions();

  useSyncTab({
    id: "projects",
    kind: "projects",
    href: FRONTEND_ROUTES.projects,
    title: "Projects",
  });

  const userProjects = useMemo(
    () => projects.filter((project) => !project.system && !project.parentProjectId),
    [projects],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, typeof projects>();
    for (const project of projects) {
      if (project.system || !project.parentProjectId) continue;
      const list = map.get(project.parentProjectId) ?? [];
      list.push(project);
      map.set(project.parentProjectId, list);
    }
    return map;
  }, [projects]);
  const pageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const page of pages) {
      if (page.kind === "journal") continue;
      counts.set(page.projectId, (counts.get(page.projectId) ?? 0) + 1);
    }
    return counts;
  }, [pages]);

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <Button variant="outline" size="sm" onClick={() => void newProject()}>
          <FolderPlus />
          New project
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-1">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : (
          userProjects.map((project) => {
            const children = childrenByParent.get(project.id) ?? [];
            return (
              <div key={project.id} className="flex flex-col">
                <Link
                  href={FRONTEND_ROUTES.project(project.id)}
                  className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted"
                >
                  <span className="text-2xl leading-none">{project.icon ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{project.name}</span>
                      {project.status ? (
                        <Badge variant="secondary">{project.status}</Badge>
                      ) : null}
                    </div>
                    {project.description ? (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {project.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {pageCount.get(project.id) ?? 0} pages
                  </span>
                </Link>
                {children.map((child) => (
                  <Link
                    key={child.id}
                    href={FRONTEND_ROUTES.project(child.id)}
                    className="group ml-6 flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <span className="text-lg leading-none">{child.icon ?? "•"}</span>
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">{child.name}</span>
                      {child.description ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {child.description}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {pageCount.get(child.id) ?? 0} pages
                    </span>
                  </Link>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
