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
  /** Persisted key kept for localStorage compat; UI calls these "pinned pages". */
  favoritePageIds: string[];
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
  /** @deprecated alias — use togglePinnedPage */
  toggleFavoritePage: (id: string) => void;
  addRecentPage: (id: string) => void;
  removeFromRecentAndFavorites: (id: string) => void;
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
          favoritePageIds: state.favoritePageIds.includes(id)
            ? state.favoritePageIds.filter((it) => it !== id)
            : [...state.favoritePageIds, id],
        }));

      return {
        sidebarCollapsed: false,
        sidebarWidth: 264,
        rightSidebarOpen: false,
        rightSidebarWidth: 320,
        rightSidebarTab: "details",
        expandedProjectIds: [],
        pinnedProjectIds: [],
        favoritePageIds: [],
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
        toggleFavoritePage: togglePinnedPage,
        addRecentPage: (id) =>
          set((state) => ({
            recentPageIds: [
              id,
              ...state.recentPageIds.filter((it) => it !== id),
            ].slice(0, RECENT_LIMIT),
          })),
        removeFromRecentAndFavorites: (id) =>
          set((state) => ({
            recentPageIds: state.recentPageIds.filter((it) => it !== id),
            favoritePageIds: state.favoritePageIds.filter((it) => it !== id),
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
      version: 2,
      migrate: (persisted) => {
        const state = persisted as Record<string, unknown>;
        // v1 had a single expandedProjectId; lift into the multi-expand array.
        if (state.expandedProjectIds == null && typeof state.expandedProjectId === "string") {
          state.expandedProjectIds = [state.expandedProjectId];
        }
        if (state.expandedProjectIds == null) {
          state.expandedProjectIds = [];
        }
        delete state.expandedProjectId;
        if (state.projectTabs == null) state.projectTabs = {};
        return state as never;
      },
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarWidth: state.sidebarWidth,
        rightSidebarOpen: state.rightSidebarOpen,
        rightSidebarWidth: state.rightSidebarWidth,
        rightSidebarTab: state.rightSidebarTab,
        expandedProjectIds: state.expandedProjectIds,
        pinnedProjectIds: state.pinnedProjectIds,
        favoritePageIds: state.favoritePageIds,
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
