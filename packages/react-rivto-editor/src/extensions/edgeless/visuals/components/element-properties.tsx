import { useEffect, useLayoutEffect, useRef, type ComponentType } from 'react';
import type { ElementPropertiesProps } from '../../../../managers/elements/types';
import type { EdgelessOperations } from '../../../../managers/elements/edgeless-operations';
import { isNodeLike } from '../../../../managers/events/dom-nodes';
import { EdgelessPropertiesPanel } from '../../../../components/edgeless/properties-panel';

/**
 * Hosts registered property contents for a same-type selection.
 * Edits are previewed locally and committed as one undo entry on an outside pointer press,
 * selection change, or unmount. Escape cancels the pending preview. The property component
 * receives the owning panel and callbacks backed by shared operations rather than creating another canvas state.
 * @param props - Stable selection identity, title, registered contents, and mounted canvas operations.
 * @returns Right-side property panel with shared chrome and editing lifecycle, or null
 * when there is no receiving React panel or no selected records remain.
 * @throws During preview/commit callbacks if selected targets or their properties fail validation.
 */
export function ElementProperties({ ids, title, component: Properties, operations }: {
  readonly ids: readonly string[];
  readonly title: string;
  readonly component: ComponentType<ElementPropertiesProps>;
  readonly operations: EdgelessOperations;
}) {
  const selectionKey = JSON.stringify(ids);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Commit before the canvas owner releases its passive subscriptions and previews.
  useLayoutEffect(() => {
    const view = panelRef.current?.ownerDocument.defaultView;
    if (!view) return;
    const commit = (event: PointerEvent) => {
      if (isNodeLike(event.target) && panelRef.current?.contains(event.target)) return;
      if (operations.hasPropertyPreview()) operations.commitPropertyPreview();
    };
    view.addEventListener('pointerdown', commit, true);
    return () => {
      view.removeEventListener('pointerdown', commit, true);
      if (operations.hasPropertyPreview()) operations.commitPropertyPreview();
    };
  }, [operations, selectionKey]);
  useEffect(() => (operations.reactPanel ?? operations.runtime).keyboard.register({
    id: 'edgeless.properties.cancel', keys: ['Escape'], mode: 'edgeless', priority: 50,
    when: ({ raw }) => isNodeLike(raw.target) && Boolean(panelRef.current?.contains(raw.target)),
  }, () => { operations.discardPropertyPreview(); return true; }), [operations]);
  const elements = ids.flatMap(id => operations.getRenderedElement(id) ?? []);
  const reactPanel = operations.reactPanel;
  if (!reactPanel || !elements.length) return null;
  const common = (key: string) => {
    const value = elements[0]!.props[key];
    return elements.every(element => Object.is(element.props[key], value)) ? value : undefined;
  };
  return <EdgelessPropertiesPanel title={title} count={elements.length} ariaLabel="Visual properties"
    panelRef={panelRef} onClose={() => operations.clearSelection()}>
    <Properties elements={elements} reactPanel={reactPanel} common={common}
      preview={patch => operations.previewProperties(ids, patch)}
      commit={() => operations.commitPropertyPreview()} cancel={() => operations.discardPropertyPreview()} />
  </EdgelessPropertiesPanel>;
}
