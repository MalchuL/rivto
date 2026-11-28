import { useEffect, useMemo, useState } from "react";
import { HtmlFrame } from "../frame/html-frame";
import { useHtmlWidgetContext } from "../frame/use-html-widget-context";
import { parseWidgetProps } from "../model/widget-props";
import type { HtmlNodeData } from "../types";
import type { HtmlSourceEditorProps } from "./html-source-editor";

type AcceptedDraft = { html: string; props: Record<string, unknown> };
type DraftText = { html: string; propsText: string };

/**
 * Accepts one pair of HTML and parsed properties after an idle period.
 *
 * Invalid JSON leaves the last valid pair available until the next edit.
 * Closing the preview releases it, and each edit cancels the preceding timer.
 *
 * @param enabled - Whether the user is previewing the draft.
 * @param draft - Current HTML and editable JSON text.
 * @param delay - Required quiet time in milliseconds.
 * @returns The last accepted pair and whether the latest parse failed.
 */
function useAcceptedDraft(enabled: boolean, { html, propsText }: DraftText, delay: number) {
  const [accepted, setAccepted] = useState<AcceptedDraft>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setAccepted(undefined);
      setError(false);
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        setAccepted({ html, props: parseWidgetProps(propsText) });
        setError(false);
      } catch {
        setError(true);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, html, propsText, delay]);
  return { accepted, error };
}

/**
 * Shows the current draft in a sandbox with the live occurrence's metadata.
 *
 * Keeps the accepted pair across layout switches. Each mounted frame owns
 * its connection and receives only the capabilities of a preview.
 *
 * @param enabled - Whether to render the preview pane.
 * @param draft - Current text in the editable fields.
 * @param owner - Node metadata, selection, hidden property keys and frame limits.
 * @returns The preview with validation feedback, or null while hidden.
 */
export function useDraftPreview(
  enabled: boolean,
  draft: DraftText,
  {
    node,
    selected,
    limits,
    hiddenProps,
  }: Pick<HtmlSourceEditorProps, "node" | "selected" | "limits" | "hiddenProps">,
) {
  const context = useHtmlWidgetContext(selected, true);
  const { accepted, error } = useAcceptedDraft(enabled, draft, limits.previewDelayMs);
  const snapshot = useMemo(
    () => accepted && previewNode(node, accepted, hiddenProps),
    [accepted, node, hiddenProps],
  );
  if (!enabled) {
    return null;
  }
  return (
    <section aria-label="HTML preview" className="html-draft-preview">
      {error && <p role="alert">Preview paused. Enter a valid JSON object in Props.</p>}
      {accepted && snapshot && (
        <div
          style={
            node.kind === "element"
              ? { width: node.frame.width, height: node.frame.height }
              : undefined
          }
        >
          <HtmlFrame
            source={accepted.html}
            node={snapshot}
            context={context}
            limits={limits}
            fit={node.kind === "element" ? "fill" : "auto"}
            interactive={false}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Projects the draft source and editable properties onto an occurrence snapshot.
 *
 * @param node - Block or element supplying geometry, identity and structural metadata.
 * @param accepted - Source and JSON accepted together after typing paused.
 * @param hiddenProps - Host-owned element properties omitted from the JSON field.
 * @returns A detached view with the source in its persisted location.
 */
function previewNode(
  node: HtmlNodeData,
  accepted: AcceptedDraft,
  hiddenProps?: readonly string[],
): HtmlNodeData {
  if (node.kind === "block") {
    return { ...node, props: accepted.props, content: accepted.html };
  }
  const props = { ...accepted.props };
  for (const key of hiddenProps ?? []) {
    delete props[key];
    if (Object.hasOwn(node.props, key)) {
      props[key] = node.props[key];
    }
  }
  return { ...node, props: { ...props, html: accepted.html } };
}
