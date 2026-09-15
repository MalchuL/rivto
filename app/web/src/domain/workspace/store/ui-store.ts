"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightSidebarTab = "details" | "outline" | "relations" | "ai";
export type CollectionViewMode = "list" | "linked";
export type ProjectPanelTab = "overview" | "pages" | "tasks" | "activity" | "graph";

const RECENT_LIMIT = 8;
const EMPTY_PROJECT_VIEW_MODES: Record<string, CollectionViewMode> = {};
const EMPTY_EXPANDED: string[] = [];

type UiState = {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  rightSidebarOpen: boolean;
  rightSidebarWidth: number;
  rightSidebarTab: RightSidebarTab;
  /** Multiple projects can be expanded at once (parent + child). */
  expandedProjectIds: string[];
  pinnedProjectIds: string[];
  pinnedPageIds: string[];
  recentPageIds: string[];
  paletteOpen: boolean;
  journalViewMode: CollectionViewMode;
  projectViewModes: Record<string, CollectionViewMode>;
  /** Last selected project panel tab per projectId. */
  projectTabs: Record<string, ProjectPanelTab>;

  toggleSidebarCollapsed: () => void;
  setSidebarWidth: (width: number) => void;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  setRightSidebarWidth: (width: number) => void;
  setRightSidebarTab: (tab: RightSidebarTab) => void;
  toggleExpandedProject: (id: string) => void;
  togglePinnedProject: (id: string) => void;
  togglePinnedPage: (id: string) => void;
  addRecentPage: (id: string) => void;
  removeFromRecentAndPinned: (id: string) => void;
  setPaletteOpen: (open: boolean) => void;
  setJournalViewMode: (mode: CollectionViewMode) => void;
  setProjectViewMode: (projectId: string, mode: CollectionViewMode) => void;
  setProjectTab: (projectId: string, tab: ProjectPanelTab) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => {
      const togglePinnedPage = (id: string) =>
        set((state) => ({
          pinnedPageIds: state.pinnedPageIds.includes(id)
            ? state.pinnedPageIds.filter((it) => it !== id)
            : [...state.pinnedPageIds, id],
        }));

      return {
        sidebarCollapsed: false,
        sidebarWidth: 264,
        rightSidebarOpen: false,
        rightSidebarWidth: 320,
        rightSidebarTab: "details",
        expandedProjectIds: [],
        pinnedProjectIds: [],
        pinnedPageIds: [],
        recentPageIds: [],
        paletteOpen: false,
        journalViewMode: "linked",
        projectViewModes: {},
        projectTabs: {},

        toggleSidebarCollapsed: () =>
          set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
        setSidebarWidth: (width) =>
          set({ sidebarWidth: Math.max(200, Math.min(width, 420)) }),
        toggleRightSidebar: () =>
          set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
        setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
        setRightSidebarWidth: (width) =>
          set({ rightSidebarWidth: Math.max(260, Math.min(width, 480)) }),
        setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
        toggleExpandedProject: (id) =>
          set((state) => ({
            expandedProjectIds: state.expandedProjectIds.includes(id)
              ? state.expandedProjectIds.filter((it) => it !== id)
              : [...state.expandedProjectIds, id],
          })),
        togglePinnedProject: (id) =>
          set((state) => ({
            pinnedProjectIds: state.pinnedProjectIds.includes(id)
              ? state.pinnedProjectIds.filter((it) => it !== id)
              : [...state.pinnedProjectIds, id],
          })),
        togglePinnedPage,
        addRecentPage: (id) =>
          set((state) => ({
            recentPageIds: [
              id,
              ...state.recentPageIds.filter((it) => it !== id),
            ].slice(0, RECENT_LIMIT),
          })),
        removeFromRecentAndPinned: (id) =>
          set((state) => ({
            recentPageIds: state.recentPageIds.filter((it) => it !== id),
            pinnedPageIds: state.pinnedPageIds.filter((it) => it !== id),
          })),
        setPaletteOpen: (open) => set({ paletteOpen: open }),
        setJournalViewMode: (mode) => set({ journalViewMode: mode }),
        setProjectViewMode: (projectId, mode) =>
          set((state) => ({
            projectViewModes: { ...state.projectViewModes, [projectId]: mode },
          })),
        setProjectTab: (projectId, tab) =>
          set((state) => ({
            projectTabs: { ...state.projectTabs, [projectId]: tab },
          })),
      };
    },
    {
      name: "rivto-ui",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarWidth: state.sidebarWidth,
        rightSidebarOpen: state.rightSidebarOpen,
        rightSidebarWidth: state.rightSidebarWidth,
        rightSidebarTab: state.rightSidebarTab,
        expandedProjectIds: state.expandedProjectIds,
        pinnedProjectIds: state.pinnedProjectIds,
        pinnedPageIds: state.pinnedPageIds,
        recentPageIds: state.recentPageIds,
        journalViewMode: state.journalViewMode,
        projectViewModes: state.projectViewModes,
        projectTabs: state.projectTabs,
      }),
    },
  ),
);

export function useProjectViewMode(projectId: string): CollectionViewMode {
  return useUiStore((state) => state.projectViewModes[projectId] ?? "list");
}

export function useProjectTab(projectId: string): ProjectPanelTab {
  return useUiStore((state) => state.projectTabs[projectId] ?? "overview");
}

export function useExpandedProjectIds(): string[] {
  return useUiStore((state) =>
    state.expandedProjectIds.length ? state.expandedProjectIds : EMPTY_EXPANDED,
  );
}

export function useProjectViewModes(): Record<string, CollectionViewMode> {
  return useUiStore((state) =>
    Object.keys(state.projectViewModes).length
      ? state.projectViewModes
      : EMPTY_PROJECT_VIEW_MODES,
  );
}
