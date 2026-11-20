import { useCallback, useContext } from "react";
import { EditorPortalHostContext } from "../../../../../components/editor-panel/editor-root-context";
import { useEditorRootContext } from "../../../../../hooks/editor/use-editor-root-context";
import { useReactPanel } from "../../../../../hooks/editor/use-react-panel";
import { capturePresetPreview } from "./preset-preview";
import type { CapturePresetPreview } from "../types";

/**
 * Captures preview creation for the currently mounted editor occurrence.
 *
 * The native portal host remains at this React browser boundary. Each returned
 * factory retains the exact occurrence observed when it was requested.
 *
 * @returns A callback that captures a preview factory for a tool ID, or undefined when unavailable.
 * @throws If called outside an editor panel or Root ownership checks fail.
 */
export function usePresetPreviewFactory(): CapturePresetPreview {
  const host = useContext(EditorPortalHostContext);
  const { identity } = useEditorRootContext();
  const panel = useReactPanel();
  /**
   * Captures the current occurrence and tool for a single preset press.
   *
   * @param toolId - Tool identity used by the preview marker.
   * @returns A preview factory, or undefined when the occurrence is unavailable.
   * @throws Propagates Root ownership checks.
   */
  const capturePresetPreviewForTool = useCallback(
    (toolId: string) => capturePresetPreview(panel, host, identity, toolId),
    [panel, host, identity],
  );
  return capturePresetPreviewForTool;
}
