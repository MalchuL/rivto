"use client";

import {
  formatDayLabel,
  formatMonthLabel,
  journalService,
  QUERY_KEYS,
  todayKey,
  type Page,
} from "@chulane/app";
import { useJournalDaysQuery } from "@chulane/app/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, PenLine } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { ViewModeToggle } from "@/components/shared/view-mode-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkedDocumentStack } from "@/domain/page/components/linked-document-stack";
import { stripHtml } from "@/domain/page/utils/page-tree";
import { useSyncTab } from "@/domain/workspace/hooks/use-sync-tab";
import { useUiStore } from "@/domain/workspace/store/ui-store";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

function useLinkedJournalPages() {
  const queryClient = useQueryClient();
  const { data: days = [], isLoading: daysLoading } = useJournalDaysQuery();
  const today = todayKey();

  const linkedQuery = useQuery({
    queryKey: [...QUERY_KEYS.journalDays, "linked-stack"] as const,
    queryFn: async () => {
      const { page: todayPage, created } = await journalService.getOrCreateDay(today);
      if (created) {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pages });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.journalDays });
      }
      const existing = await journalService.listDays();
      const byDay = new Map(existing.map((entry) => [entry.day, entry.page]));
      byDay.set(today, todayPage);
      return [...byDay.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([day, page]) => ({ day, page }));
    },
  });

  return {
    items: linkedQuery.data ?? [],
    isLoading: daysLoading || linkedQuery.isLoading,
    days,
  };
}

export function JournalView() {
  const journalViewMode = useUiStore((state) => state.journalViewMode);
  const setJournalViewMode = useUiStore((state) => state.setJournalViewMode);
  const { data: days = [], isLoading: listLoading } = useJournalDaysQuery();
  const { items: linkedItems, isLoading: linkedLoading } = useLinkedJournalPages();

  useSyncTab({
    id: "journal",
    kind: "journal",
    href: FRONTEND_ROUTES.journal,
    title: "Journal",
  });

  const today = todayKey();
  const rows = useMemo(() => {
    const existing = days.map((entry) => ({
      day: entry.day,
      preview: stripHtml(entry.page.content).slice(0, 140),
    }));
    if (!existing.some((entry) => entry.day === today)) {
      existing.unshift({ day: today, preview: "" });
    }
    return existing;
  }, [days, today]);

  const isLoading = journalViewMode === "linked" ? linkedLoading : listLoading;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex w-full max-w-3xl items-end justify-between gap-4 px-8 pt-10 pb-2">
        <div>
          <p className="text-sm text-muted-foreground">{formatMonthLabel(today)}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Journal</h1>
        </div>
        <ViewModeToggle value={journalViewMode} onChange={setJournalViewMode} />
      </div>

      {journalViewMode === "linked" ? (
        isLoading ? (
          <div className="mx-auto w-full max-w-3xl space-y-4 px-8 pt-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <LinkedDocumentStack
            items={linkedItems.map(({ day, page }: { day: string; page: Page }) => ({
              page,
              heading: formatDayLabel(day),
              readOnlyTitle: true,
            }))}
            emptyMessage="No journal entries yet."
          />
        )
      ) : (
        <div className="mx-auto w-full max-w-3xl px-8 pb-10">
          <div className="mt-6 flex flex-col gap-1">
            {isLoading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : (
              rows.map((row) => (
                <Link
                  key={row.day}
                  href={FRONTEND_ROUTES.journalDay(row.day)}
                  className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {formatDayLabel(row.day)}
                      {row.day === today && row.preview === "" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <PenLine className="size-3" /> start writing
                        </span>
                      ) : null}
                    </div>
                    {row.preview ? (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {row.preview}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
