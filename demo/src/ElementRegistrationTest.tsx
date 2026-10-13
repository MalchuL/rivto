import { useMemo, useRef, useState } from 'react';
import { YjsDoc } from '@chulane/crdt-doc';
import { DocumentModelImpl } from '@chulane/document-model';
import { EditorPanel, EdgelessSurface, edgelessPreset, standardPreset, useReactEditor, usePanel, useReactPanel, useElements, type ReactEditorExtension } from '@chulane/rivto-react';

/** Demonstrates a host-defined canvas type using only the public registration and panel APIs. */
export function ElementRegistrationTest() {
  const [document] = useState(() => {
    const model = new DocumentModelImpl(new YjsDoc('registered-elements'));
    for (const id of ['first', 'second']) model.elements.insertElement({ id, type: 'group', frame: { x: 0, y: 0, width: 10, height: 10 }, zIndex: 0 });
    return model;
  });
  const [mounted, setMounted] = useState(true);
  const unregister = useRef<(() => void) | undefined>(undefined);
  const extension = useMemo<ReactEditorExtension>(() => ({
    id: 'demo.badge',
    setup(editor) {
      const dispose = editor.elementTypes.register({
        definition: { type: 'badge', defaults: { title: 'Badge', units: 1 }, validate(props) {
          if (typeof props.title !== 'string' || typeof props.units !== 'number' || !Number.isFinite(props.units) || props.units <= 0) throw new Error('Invalid badge');
          return props;
        } },
        render: ({ element }) => <div data-custom-badge style={{ width: '100%', height: '100%', background: '#c7d2fe', border: '2px solid #4338ca' }}>{String(element.props.title)}</div>,
        behavior: { resize: (element, frame) => ({ units: Number(element.props.units) * frame.width / element.frame.width }) },
        creation: { title: 'Badge', create: () => ({ type: 'badge', frame: { x: 0, y: 0, width: 160, height: 120 }, zIndex: 1 }) },
        properties: ({ elements, reactPanel }) => <label {...{ 'data-edgeless-ui': '' }} style={{ position: 'absolute', top: 4, left: 4, background: 'white' }}>Badge text<input aria-label="Badge text" value={String(elements[0]?.props.title ?? '')} onChange={event => reactPanel.elements.updateElements(elements.map(element => ({ id: element.id, patch: { props: { title: event.target.value } } })))} /></label>,
        clipboard: { copy: element => ({ props: { ...element.props, copied: true } }) },
      });
      unregister.current = dispose;
      return dispose;
    },
  }), []);
  const state = useReactEditor({ document, extensions: [standardPreset(), ...edgelessPreset(), extension] });
  if (state.status !== 'ready') return <p>{state.status}</p>;
  return <>
    <button onClick={() => setMounted(value => !value)}>Toggle canvases</button>
    <button onClick={() => unregister.current?.()}>Unregister badge</button>
    <button onClick={() => state.editor.history.undo()}>Undo</button>
    <button onClick={() => state.editor.history.redo()}>Redo</button>
    {mounted && <div style={{ display: 'flex', gap: 16 }}>{['first', 'second'].map(id => <section key={id} data-canvas={id} style={{ width: 600, height: 500 }}>
      <EditorPanel editor={state.editor} rootElementId={id}><EdgelessSurface /><Inspect /></EditorPanel>
    </section>)}</div>}
  </>;
}

/** Reads the core panel and performs canvas actions through its separate React counterpart. */
function Inspect() {
  const panel = usePanel();
  const reactPanel = useReactPanel();
  const elements = useElements();
  return <>
    <output data-custom-state>{JSON.stringify(elements.filter(element => element.type === 'badge'))}</output>
    <button onClick={() => {
      const node = panel.elements.getElementNodes().find(element => element.type === 'badge');
      if (!node) return;
      panel.document.history.stopCapturing();
      panel.elements.updateElement(node.id, { frame: { width: node.frame.width * 2 } });
    }}>Double width</button>
    <button onClick={() => reactPanel.edgeless.duplicateSelection()}>Duplicate</button>
  </>;
}
