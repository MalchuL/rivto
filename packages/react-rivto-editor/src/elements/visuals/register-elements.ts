import { createEdgelessDefaults } from '../../managers/elements/tool-state';
import type { ReactEditorApi } from '../../editor/types';
import { connectorClipboardConverter, textElementClipboardConverter } from '../clipboard-converters';
import { BuiltinVisualContent } from './builtin-visual-content';
import { drawingResizeProps } from './utils/drawing-frame';
import { prepareBuiltinElement } from './prepare-builtin-element';

/** Registers built-in figure definitions, renderers, geometry and clipboard as ordinary element types. */
export function registerVisualElements(editor: ReactEditorApi): () => void {
  const defaults = createEdgelessDefaults();
  const disposers: Array<() => void> = [];
  try {
    for (const type of ['rectangle', 'ellipse', 'text', 'sticker', 'drawing', 'connector']) {
      const category = type === 'rectangle' || type === 'ellipse' ? 'shape' : type as 'text' | 'sticker' | 'drawing' | 'connector';
      disposers.push(editor.elementTypes.register({
        definition: {
          type,
          defaults: { ...defaults[category], ...(type === 'text' || type === 'sticker' ? { text: '' } : {}) },
          validate(props) {
            if (props.text !== undefined && typeof props.text !== 'string') throw new Error(`${type}.text must be a string`);
            for (const key of ['rotation', 'fontSize', 'strokeWidth', 'opacity']) {
              if (props[key] !== undefined && (typeof props[key] !== 'number' || !Number.isFinite(props[key]))) throw new Error(`${type}.${key} must be finite`);
            }
            if (type === 'drawing' && (!Array.isArray(props.points) || props.points.length < 2 || props.points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)))) throw new Error('Drawing requires at least two finite points');
            if (type === 'connector') {
              for (const key of ['source', 'target']) {
                const endpoint = props[key] as { anchor?: { x: number; y: number }; position?: { x: number; y: number } } | undefined;
                if (!endpoint?.anchor || !endpoint.position || ![endpoint.anchor.x, endpoint.anchor.y, endpoint.position.x, endpoint.position.y].every(Number.isFinite)) throw new Error('Connector endpoint requires finite coordinates');
              }
            }
            return props;
          },
        },
        render: BuiltinVisualContent,
        behavior: { create: (input, panel) => prepareBuiltinElement(input, panel), ...(type === 'drawing' ? { resize: drawingResizeProps } : {}) },
        clipboard: type === 'connector' ? { ...textElementClipboardConverter(type), ...connectorClipboardConverter } : textElementClipboardConverter(type),
      }));
    }
  } catch (error) {
    disposers.reverse().forEach(dispose => dispose());
    throw error;
  }
  return () => { disposers.splice(0).reverse().forEach(dispose => dispose()); };
}
