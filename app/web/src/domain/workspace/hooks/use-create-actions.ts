"use client";

import { todayKey } from "@chulane/app";
import {
  useCreatePageMutation,
  useCreateProjectMutation,
} from "@chulane/app/client";
import { useRouter } from "next/navigation";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

/** Shared create/navigate actions for the palette, create menu and shortcuts. */
export function useCreateActions() {
  const router = useRouter();
  const createPage = useCreatePageMutation();
  const createProject = useCreateProjectMutation();

  return {
    newPage: async (projectId?: string, parentPageId?: string | null) => {
      const page = await createPage.mutateAsync({
        projectId,
        parentPageId: parentPageId ?? null,
      });
      router.push(FRONTEND_ROUTES.page(page.id));
      return page;
    },
    newProject: async () => {
      const project = await createProject.mutateAsync({});
      router.push(FRONTEND_ROUTES.project(project.id));
      return project;
    },
    openTodayJournal: () => {
      router.push(FRONTEND_ROUTES.journalDay(todayKey()));
    },
  };
}
