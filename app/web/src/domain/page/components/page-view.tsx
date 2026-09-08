"use client";

import type { Page } from "@chulane/app";
import { usePageQuery, usePagesQuery, useProjectQuery } from "@chulane/app/client";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageDocument } from "@/domain/page/components/page-document";
import { useSyncTab } from "@/domain/workspace/hooks/use-sync-tab";
import { useUiStore } from "@/domain/workspace/store/ui-store";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

function Breadcrumbs({ page }: { page: Page }) {
  const { data: project } = useProjectQuery(page.projectId);
  const { data: siblings = [] } = usePagesQuery({ projectId: page.projectId });

  const parents = useMemo(() => {
    const byId = new Map(siblings.map((it) => [it.id, it]));
    const chain: Page[] = [];
    let current = page.parentPageId ? byId.get(page.parentPageId) : undefined;
    while (current && chain.length < 5) {
      chain.unshift(current);
      current = current.parentPageId ? byId.get(current.parentPageId) : undefined;
    }
    return chain;
  }, [siblings, page.parentPageId]);

  return (
    <span className="flex min-w-0 items-center gap-1 truncate">
      {project ? (
        <Link
          href={FRONTEND_ROUTES.project(project.id)}
          className="shrink-0 hover:text-foreground"
        >
          {project.name}
        </Link>
      ) : null}
      {parents.map((parent) => (
        <span key={parent.id} className="flex min-w-0 items-center gap-1">
          <span className="text-border">/</span>
          <Link
            href={FRONTEND_ROUTES.page(parent.id)}
            className="truncate hover:text-foreground"
          >
            {parent.title}
          </Link>
        </span>
      ))}
      <span className="text-border">/</span>
      <span className="truncate text-foreground">{page.title}</span>
    </span>
  );
}

export function PageView({ pageId }: { pageId: string }) {
  const { data: page, isLoading } = usePageQuery(pageId);
  const addRecentPage = useUiStore((state) => state.addRecentPage);

  useSyncTab({
    id: `page:${pageId}`,
    kind: "page",
    href: FRONTEND_ROUTES.page(pageId),
    title: page?.title ?? "Loading…",
    entityId: pageId,
  });

  useEffect(() => {
    if (page) addRecentPage(page.id);
  }, [page?.id, addRecentPage, page]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 pt-12">
        <Skeleton className="mb-4 h-8 w-1/2" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 pt-12 text-sm text-muted-foreground">
        This page does not exist (mock data resets on reload).
      </div>
    );
  }

  return <PageDocument page={page} breadcrumbs={<Breadcrumbs page={page} />} />;
}
