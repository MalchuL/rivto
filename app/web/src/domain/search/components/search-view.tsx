"use client";

import type { Page } from "@chulane/app";
import {
  usePagesQuery,
  useProjectsQuery,
  useSearchPagesQuery,
} from "@chulane/app/client";
import { CalendarDays, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { stripHtml } from "@/domain/page/utils/page-tree";
import { useSyncTab } from "@/domain/workspace/hooks/use-sync-tab";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

function pageHref(page: Page): string {
  if (page.kind === "journal" && typeof page.properties.day === "string") {
    return FRONTEND_ROUTES.journalDay(page.properties.day);
  }
  return FRONTEND_ROUTES.page(page.id);
}

export function SearchView() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  useSyncTab({
    id: "search",
    kind: "search",
    href: FRONTEND_ROUTES.search,
    title: trimmed ? `Search: ${trimmed}` : "Search",
  });

  const { data: allPages = [] } = usePagesQuery();
  const { data: results = [] } = useSearchPagesQuery(trimmed);
  const { data: projects = [] } = useProjectsQuery();

  const projectName = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const rows = trimmed ? results : allPages;

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      <h1 className="text-3xl font-bold tracking-tight">
        {trimmed ? "Search" : "Pages"}
      </h1>

      <div className="relative mt-6">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages by title or content…"
          className="pl-9"
        />
      </div>

      <div className="mt-6 flex flex-col gap-0.5">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted-foreground">
            {trimmed ? "Nothing found." : "No pages yet."}
          </p>
        ) : (
          rows.map((page) => {
            const preview = stripHtml(page.content).slice(0, 120);
            return (
              <Link
                key={page.id}
                href={pageHref(page)}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
              >
                {page.kind === "journal" ? (
                  <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{page.title}</div>
                  {preview ? (
                    <p className="truncate text-xs text-muted-foreground">{preview}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {projectName.get(page.projectId) ?? ""}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
