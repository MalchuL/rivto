import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import { useSyncExternalStore } from 'react';
import { useReactPanelContext } from '../../../../hooks/editor/use-react-panel-context';
import { useVisualTool } from '../../../../hooks/elements/use-visual-tool';
import { editorControlProps } from '../../../../constants';

/** Adds registered creation contributions to the standard toolbar; all types use the existing placement gesture. */
export function RegisteredElementTools({ edgelessOperation }: { readonly edgelessOperation: EdgelessOperations }) {
  const reactPanel = useReactPanelContext().reactPanel;
  const registry = reactPanel.editor.elementTypes;
  useSyncExternalStore(listener => registry.subscribe(listener), () => registry.revision, () => registry.revision);
  const tool = useVisualTool(edgelessOperation);
  return <>{registry.getAll().filter(entry => entry.creation).map(({ definition, creation }) =>
    <button {...editorControlProps} type="button" key={definition.type} aria-pressed={tool.tool === 'element' && tool.type === definition.type} onClick={() => edgelessOperation.setTool({ tool: 'element', type: definition.type })}>{creation!.icon}{creation!.title}</button>
  )}</>;
}
