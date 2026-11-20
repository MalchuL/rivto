import { useEffect, useId, useLayoutEffect, useSyncExternalStore } from "react";
import type { ElementPropertiesPanelProps } from "./types";
import { useReactPanelContext } from "../../../../hooks/editor/use-react-panel-context";
import { EdgelessPropertiesPanel } from "../../../../components/edgeless/properties-panel";

/**
 * Hosts registered property contents for a same-type selection.
 * Edits are previewed locally and committed as one undo entry on an outside pointer press,
 * selection change, or unmount. Escape cancels the pending preview. The property component
 * receives the owning panel and callbacks backed by shared operations rather than creating another canvas state.
 * @param props - Stable selection identity, title, registered contents, and mounted canvas operations.
 * @param props.ids - Selected element identities whose property previews are edited.
 * @param props.title - Label shown in the properties panel.
 * @param props.component - Registered controls for the selected element type.
 * @param props.operations - Borrowed canvas operations for preview and commit.
 * @returns Right-side property panel with shared chrome and editing lifecycle, or null
 * when there is no receiving React panel or no selected records remain.
 * @throws During preview/commit callbacks if selected targets or their properties fail validation.
 */
export function ElementProperties({
  ids,
  title,
  component: Properties,
  operations,
}: ElementPropertiesPanelProps) {
  const selectionKey = JSON.stringify(ids);
  const { reactPanel: panel } = useReactPanelContext();
  const inputRoot = useSyncExternalStore(
    panel.subscribeAvailability,
    () => panel.inputRoot,
    () => undefined,
  );
  const panelId = useId();
  // Commit before the canvas owner releases its passive subscriptions and previews.
  useLayoutEffect(() => {
    if (!inputRoot || !operations.reactPanel) {
      return;
    }
    const release = inputRoot.observeWindowInput("pointerdown", "capture", (input) => {
      if (input.target?.hasAncestor(`[id=${JSON.stringify(panelId)}]`)) {
        return;
      }
      if (operations.hasPropertyPreview()) {
        operations.commitPropertyPreview();
      }
    });
    return () => {
      try {
        release();
      } finally {
        if (operations.hasPropertyPreview()) {
          operations.commitPropertyPreview();
        }
      }
    };
  }, [inputRoot, operations, panelId, selectionKey]);
  useEffect(
    () =>
      (operations.reactPanel ?? operations.runtime).keyboard.register(
        {
          id: "edgeless.properties.cancel",
          keys: ["Escape"],
          mode: "edgeless",
          priority: 50,
          when: ({ targetHasAncestor }) => targetHasAncestor(`#${CSS.escape(panelId)}`),
        },
        () => {
          operations.discardPropertyPreview();
          return true;
        },
      ),
    [operations, panelId],
  );
  const elements = ids.flatMap((id) => operations.getRenderedElement(id) ?? []);
  const reactPanel = operations.reactPanel;
  if (!reactPanel || !elements.length) {
    return null;
  }
  const common = (key: string) => {
    const value = elements[0]!.props[key];
    return elements.every((element) => Object.is(element.props[key], value)) ? value : undefined;
  };
  return (
    <EdgelessPropertiesPanel
      id={panelId}
      title={title}
      count={elements.length}
      ariaLabel="Visual properties"
      onClose={() => operations.clearSelection()}
    >
      <Properties
        elements={elements}
        reactPanel={reactPanel}
        common={common}
        preview={(patch) => operations.previewProperties(ids, patch)}
        commit={() => operations.commitPropertyPreview()}
        cancel={() => operations.discardPropertyPreview()}
      />
    </EdgelessPropertiesPanel>
  );
}
