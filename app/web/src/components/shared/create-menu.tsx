"use client";

import {
  BookOpen,
  Database,
  FilePlus,
  FolderPlus,
  Import,
  Shapes,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateActions } from "@/domain/workspace/hooks/use-create-actions";

export function CreateMenu({
  children,
  align = "start",
}: {
  children: React.ReactNode;
  align?: "start" | "end" | "center";
}) {
  const { newPage, newProject, openTodayJournal } = useCreateActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuItem onSelect={() => void newPage()}>
          <FilePlus />
          New page
          <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void newProject()}>
          <FolderPlus />
          New project
          <DropdownMenuShortcut>Ctrl+Shift+N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openTodayJournal}>
          <BookOpen />
          Journal entry
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Database />
          Database
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Shapes />
          Canvas
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Import />
          Import
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
