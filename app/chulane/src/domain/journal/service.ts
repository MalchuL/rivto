import { SYSTEM_PROJECT_IDS } from "../../lib/mock/db";
import type { Page } from "../page/types";
import { pageService } from "../page/service";
import { formatDayTitle } from "./utils";

export type JournalDay = {
  day: string;
  page: Page;
};

function dayOf(page: Page): string {
  return typeof page.properties.day === "string" ? page.properties.day : "";
}

export const journalService = {
  /** Existing journal days, newest first. */
  async listDays(): Promise<JournalDay[]> {
    const pages = await pageService.list({ kind: "journal" });
    return pages
      .map((page) => ({ day: dayOf(page), page }))
      .filter((entry) => entry.day.length > 0)
      .sort((a, b) => b.day.localeCompare(a.day));
  },

  async getDay(day: string): Promise<Page | null> {
    const pages = await pageService.list({ kind: "journal" });
    return pages.find((page) => dayOf(page) === day) ?? null;
  },

  /** Returns the day's page, creating it on first open. */
  async getOrCreateDay(day: string): Promise<{ page: Page; created: boolean }> {
    const existing = await journalService.getDay(day);
    if (existing) {
      return { page: existing, created: false };
    }
    const page = await pageService.create({
      projectId: SYSTEM_PROJECT_IDS.journal,
      title: formatDayTitle(day),
      kind: "journal",
      properties: { day },
    });
    return { page, created: true };
  },
};
