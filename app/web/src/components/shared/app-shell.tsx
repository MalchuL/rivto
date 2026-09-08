"use client";

import { CommandPalette } from "@/components/shared/command-palette";
import { ContextSidebar } from "@/components/shared/context-sidebar";
import { LeftSidebar } from "@/components/shared/left-sidebar";
import { TabBar } from "@/components/shared/tab-bar";
import { useGlobalShortcuts } from "@/domain/workspace/hooks/use-global-shortcuts";

export function AppShell({ children }: { children: React.ReactNode }) {
  useGlobalShortcuts();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <LeftSidebar />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <TabBar />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <ContextSidebar />
      <CommandPalette />
    </div>
  );
}
