"use client";

import { useEffect } from "react";
import { useCreateActions } from "./use-create-actions";
import { useUiStore } from "../store/ui-store";

/** Ctrl/Cmd+K and Ctrl/Cmd+P open the palette; Ctrl/Cmd+N creates. */
export function useGlobalShortcuts(): void {
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const { newPage, newProject } = useCreateActions();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "k" || key === "p") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (key === "n") {
        // Browsers may reserve Ctrl+N; preventDefault works where allowed.
        event.preventDefault();
        if (event.shiftKey) {
          void newProject();
        } else {
          void newPage();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPaletteOpen]);
}
