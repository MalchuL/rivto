"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../lib/query-keys";
import { journalService } from "./service";
import { isValidDayKey } from "./utils";

export function useJournalDaysQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.journalDays,
    queryFn: () => journalService.listDays(),
  });
}

/** Loads the journal page for a day, creating it on first open. */
export function useJournalDayQuery(day: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: QUERY_KEYS.journalDay(day ?? ""),
    queryFn: async () => {
      const { page, created } = await journalService.getOrCreateDay(day!);
      if (created) {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pages });
      }
      return page;
    },
    enabled: Boolean(day) && isValidDayKey(day ?? ""),
  });
}
