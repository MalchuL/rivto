"use client";

import { formatDayLabel, isValidDayKey } from "@chulane/app";
import { useJournalDayQuery } from "@chulane/app/client";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { PageDocument } from "@/domain/page/components/page-document";
import { useSyncTab } from "@/domain/workspace/hooks/use-sync-tab";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

export function JournalDayView({ day }: { day: string }) {
  const valid = isValidDayKey(day);
  const { data: page, isLoading } = useJournalDayQuery(valid ? day : undefined);

  useSyncTab({
    id: `journal:${day}`,
    kind: "journal-day",
    href: FRONTEND_ROUTES.journalDay(day),
    title: valid ? formatDayLabel(day) : "Journal",
    entityId: page?.id,
  });

  if (!valid) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 pt-12 text-sm text-muted-foreground">
        Invalid journal date.
      </div>
    );
  }

  if (isLoading || !page) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 pt-12">
        <Skeleton className="mb-4 h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  return (
    <PageDocument
      page={page}
      readOnlyTitle
      allowManage={false}
      breadcrumbs={
        <span className="flex items-center gap-1">
          <Link href={FRONTEND_ROUTES.journal} className="hover:text-foreground">
            Journal
          </Link>
          <span className="text-border">/</span>
          <span className="text-foreground">{formatDayLabel(day)}</span>
        </span>
      }
    />
  );
}
