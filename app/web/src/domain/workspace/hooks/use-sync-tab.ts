"use client";

import { useEffect } from "react";
import { useTabsStore, type OpenTabInput } from "../store/tabs-store";

/** Keeps a workspace tab in sync with the currently rendered route. */
export function useSyncTab(input: OpenTabInput): void {
  const openTab = useTabsStore((state) => state.openTab);
  useEffect(() => {
    openTab(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.id, input.title, input.href, openTab]);
}
