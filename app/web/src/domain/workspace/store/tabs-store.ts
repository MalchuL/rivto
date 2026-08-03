"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TabKind =
  | "page"
  | "journal"
  | "journal-day"
  | "project"
  | "projects"
  | "search";

export type WorkspaceTab = {
  /** Route-derived, e.g. "page:<id>", "journal:2026-08-03", "journal". */
  id: string;
  kind: TabKind;
  href: string;
  title: string;
  entityId?: string;
  pinned: boolean;
};

export type OpenTabInput = Omit<WorkspaceTab, "pinned">;

type TabsState = {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  /** Upsert a tab for the current route and activate it. */
  openTab: (input: OpenTabInput) => void;
  /** Closes a tab; returns the href to navigate to when the active tab was closed. */
  closeTab: (id: string) => string | null;
  togglePin: (id: string) => void;
  moveTab: (id: string, toIndex: number) => void;
  setActive: (id: string) => void;
};

function sortPinnedFirst(tabs: WorkspaceTab[]): WorkspaceTab[] {
  const pinned = tabs.filter((tab) => tab.pinned);
  const rest = tabs.filter((tab) => !tab.pinned);
  return [...pinned, ...rest];
}

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openTab: (input) => {
        set((state) => {
          const existing = state.tabs.find((tab) => tab.id === input.id);
          if (existing) {
            return {
              tabs: state.tabs.map((tab) =>
                tab.id === input.id ? { ...tab, ...input } : tab,
              ),
              activeTabId: input.id,
            };
          }
          return {
            tabs: [...state.tabs, { ...input, pinned: false }],
            activeTabId: input.id,
          };
        });
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const index = tabs.findIndex((tab) => tab.id === id);
        if (index === -1) return null;
        const nextTabs = tabs.filter((tab) => tab.id !== id);
        if (activeTabId !== id) {
          set({ tabs: nextTabs });
          return null;
        }
        const fallback = nextTabs[Math.min(index, nextTabs.length - 1)] ?? null;
        set({ tabs: nextTabs, activeTabId: fallback?.id ?? null });
        return fallback?.href ?? "/journal";
      },

      togglePin: (id) => {
        set((state) => ({
          tabs: sortPinnedFirst(
            state.tabs.map((tab) =>
              tab.id === id ? { ...tab, pinned: !tab.pinned } : tab,
            ),
          ),
        }));
      },

      moveTab: (id, toIndex) => {
        set((state) => {
          const from = state.tabs.findIndex((tab) => tab.id === id);
          if (from === -1) return state;
          const tabs = [...state.tabs];
          const [moved] = tabs.splice(from, 1);
          tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, moved);
          return { tabs: sortPinnedFirst(tabs) };
        });
      },

      setActive: (id) => {
        set({ activeTabId: id });
      },
    }),
    {
      name: "rivto-tabs",
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
    },
  ),
);

const EMPTY_TABS: WorkspaceTab[] = [];

export function useWorkspaceTabs(): WorkspaceTab[] {
  return useTabsStore((state) => (state.tabs.length ? state.tabs : EMPTY_TABS));
}

export function useActiveTab(): WorkspaceTab | null {
  return useTabsStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeTabId) ?? null,
  );
}
