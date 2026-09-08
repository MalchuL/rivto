"use client";

import type { Page } from "@chulane/app";
import { usePagesQuery, useProjectsQuery } from "@chulane/app/client";
import {
  BookOpen,
  CalendarDays,
  FilePlus,
  FileText,
  FolderKanban,
  FolderPlus,
  PanelLeft,
  PanelRight,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useCreateActions } from "@/domain/workspace/hooks/use-create-actions";
import { useUiStore } from "@/domain/workspace/store/ui-store";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

function pageHref(page: Page): string {
  if (page.kind === "journal" && typeof page.properties.day === "string") {
    return FRONTEND_ROUTES.journalDay(page.properties.day);
  }
  return FRONTEND_ROUTES.page(page.id);
}

export function CommandPalette() {
  const router = useRouter();
  const paletteOpen = useUiStore((state) => state.paletteOpen);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const toggleRightSidebar = useUiStore((state) => state.toggleRightSidebar);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const { newPage, newProject, openTodayJournal } = useCreateActions();

  const { data: pages = [] } = usePagesQuery();
  const { data: projects = [] } = useProjectsQuery();
  const userProjects = projects.filter((project) => !project.system);

  const run = (action: () => void) => {
    setPaletteOpen(false);
    action();
  };

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Search pages or run a command…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => void newPage())}>
            <FilePlus />
            New page
            <CommandShortcut>Ctrl+N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => void newProject())}>
            <FolderPlus />
            New project
            <CommandShortcut>Ctrl+Shift+N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(openTodayJournal)}>
            <CalendarDays />
            Open today&apos;s journal
          </CommandItem>
          <CommandItem onSelect={() => run(toggleRightSidebar)}>
            <PanelRight />
            Toggle right sidebar
          </CommandItem>
          <CommandItem onSelect={() => run(toggleSidebarCollapsed)}>
            <PanelLeft />
            Toggle left sidebar
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => run(() => router.push(FRONTEND_ROUTES.journal))}>
            <BookOpen />
            Journal
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push(FRONTEND_ROUTES.projects))}>
            <FolderKanban />
            Projects
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push(FRONTEND_ROUTES.search))}>
            <Search />
            Search
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        {userProjects.length > 0 ? (
          <CommandGroup heading="Projects">
            {userProjects.map((project) => (
              <CommandItem
                key={project.id}
                value={`project ${project.name}`}
                onSelect={() =>
                  run(() => router.push(FRONTEND_ROUTES.project(project.id)))
                }
              >
                <FolderKanban />
                {project.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {pages.length > 0 ? (
          <CommandGroup heading="Pages">
            {pages.map((page) => (
              <CommandItem
                key={page.id}
                value={`page ${page.title} ${page.id}`}
                onSelect={() => run(() => router.push(pageHref(page)))}
              >
                {page.kind === "journal" ? <CalendarDays /> : <FileText />}
                {page.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
