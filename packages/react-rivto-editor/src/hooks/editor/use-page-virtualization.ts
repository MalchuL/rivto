import { useContext } from "react";
import { PageVirtualizationContext } from "../../surfaces/page/page-virtualization-context";
import type { PageVirtualizationSettings } from "../../surfaces/page/types";

/**
 * Reads the page display choice from its nearest EditorPanel.
 *
 * @returns The page's windowing choice and root-count limits.
 */
export function usePageVirtualization(): PageVirtualizationSettings {
  return useContext(PageVirtualizationContext);
}
