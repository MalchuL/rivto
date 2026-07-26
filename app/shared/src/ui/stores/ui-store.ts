import { create } from "zustand";

type UiState = {
  sidebarOpen: boolean;
  currentPageId: string | null;
  editorDirty: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCurrentPageId: (id: string | null) => void;
  setEditorDirty: (dirty: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  currentPageId: null,
  editorDirty: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setCurrentPageId: (id) => set({ currentPageId: id }),
  setEditorDirty: (dirty) => set({ editorDirty: dirty }),
}));
