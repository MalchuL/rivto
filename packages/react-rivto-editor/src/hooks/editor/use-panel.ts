import type { PanelAPI } from '@chulane/rivto';
import { useReactPanel } from './use-react-panel';

/**
 * Returns the framework-neutral panel for the nearest EditorPanel or EditorEmbed.
 * Returns the same object as useReactPanel, narrowed to the framework-neutral contract.
 * The panel retains its original document and boundaries when another view gains focus.
 * @returns Bounded block and element operations; browser interaction is available through useReactPanel.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function usePanel(): PanelAPI { return useReactPanel(); }
