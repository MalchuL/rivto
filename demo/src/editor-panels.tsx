import { BlockHandleContext } from "@chulane/rivto-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ModeManager } from "@chulane/rivto";
import type { Panel } from "./panel-types";
import { EditorPanel, type ReactEditorApi, type EditorPanelProps } from "@chulane/rivto-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../../packages/react-rivto-editor/src/components/ui/breadcrumb";

interface DemoPanel {
  panel: Panel;
  mode: ModeManager;
}

/**
 * Application navigation example with a separate element group for each opened block.
 * Panel records and modes are retained while the demo is mounted; element groups
 * belong to the document and are reused when returning through breadcrumbs.
 *
 * Opening a new block creates its persisted element group without an undo entry.
 * The caller retains ownership of the supplied editor.
 *
 * @param props - Navigation host configuration; remaining options pass to EditorPanel.
 * @param props.editor - Editor shared by the retained panel records.
 * @param props.documentTitle - Journal date displayed as the document title and root breadcrumb.
 * @param props.children - Renders panel content with navigation and its current heading.
 * @returns Breadcrumb navigation and active panel with handle-driven block opening.
 */
export function DemoEditorPanels({
  editor,
  children,
  documentTitle,
  ...props
}: Omit<EditorPanelProps, "editor" | "panel" | "mode" | "children"> & {
  editor: ReactEditorApi;
  documentTitle: ReactNode;
  /**
   * Places navigation and the heading within the active panel chrome.
   *
   * @param header - Breadcrumb navigation and the current page heading.
   * @returns Toolbar, supplied header, and editor surface in display order.
   */
  children: (header: ReactNode) => ReactNode;
}) {
  const [state, setState] = useState(() => {
    const root: DemoPanel = {
      panel: {
        id: crypto.randomUUID(),
        documentId: editor.getDocument().id,
        rootBlockId: null,
        rootElementId: null,
      },
      mode: new ModeManager(),
    };
    return { entries: new Map<string | null, DemoPanel>([[null, root]]), active: root };
  });
  const openBlock = useCallback(
    (blockId: string | null) => {
      let next = state.entries.get(blockId);
      if (!next) {
        // Navigation creates a container without adding an undo step for opening a Panel.
        const group = editor.history.batchUpdatesWithoutHistory(() =>
          editor.elements.insertElement({
            type: "group",
            frame: { x: 0, y: 0, width: 1, height: 1 },
            zIndex: 0,
          }),
        );
        next = {
          panel: {
            id: crypto.randomUUID(),
            documentId: editor.getDocument().id,
            rootBlockId: blockId,
            rootElementId: group.id,
          },
          mode: new ModeManager(state.active.mode.get()),
        };
      }
      const destination = next;
      setState((previous) => {
        if (previous.active === destination) {
          return previous;
        }
        const entries = new Map(previous.entries);
        entries.set(blockId, destination);
        return { entries, active: destination };
      });
    },
    [editor, state],
  );
  const { active } = state;
  const blockId = active.panel.rootBlockId;
  const path = usePanelPath(editor, blockId);
  useEffect(() => {
    if (blockId && !editor.blocks.getBlockNode(blockId)) {
      openBlock(null);
    }
  }, [editor, blockId, path, openBlock]);
  const header = (
    <header
      className="demo-panel-header"
      data-panel-root={blockId ?? ""}
      data-panel-element-root={active.panel.rootElementId ?? ""}
    >
      {blockId && (
        <Breadcrumb aria-label="Panel breadcrumbs" className="rivto-ui demo-panel-breadcrumb">
          <BreadcrumbList>
            {[null, ...(JSON.parse(path) as string[])].map((id, index, ids) => (
              <Fragment key={id ?? "document"}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {index === ids.length - 1 ? (
                    <BreadcrumbPage>
                      <PanelTitle editor={editor} blockId={id} />
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <button type="button" onClick={() => openBlock(id)}>
                        {id ? <PanelTitle editor={editor} blockId={id} /> : documentTitle}
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <h1 className="journal-date">
        {blockId ? <PanelTitle editor={editor} blockId={blockId} /> : documentTitle}
      </h1>
    </header>
  );
  return (
    <EditorPanel
      {...props}
      key={active.panel.id}
      editor={editor}
      rootBlockId={blockId ?? undefined}
      rootElementId={active.panel.rootElementId}
      mode={active.mode}
    >
      <BlockHandleContext.Provider value={{ onOpen: openBlock }}>
        {children(header)}
      </BlockHandleContext.Provider>
    </EditorPanel>
  );
}

/**
 * Observes the active block's ancestor IDs without reading the document forest.
 *
 * The serialized snapshot remains equal across unrelated structure changes.
 *
 * @param editor - Editor whose live hierarchy supplies the path.
 * @param blockId - Open block ID, or null for the document.
 * @returns Serialized ancestor IDs in document-to-block order, including the block.
 */
function usePanelPath(editor: ReactEditorApi, blockId: string | null): string {
  const subscribe = useCallback(
    (listener: () => void) => editor.blocks.subscribeStructure(listener),
    [editor],
  );
  const snapshot = useCallback(() => {
    const ids: string[] = [];
    let id = blockId;
    while (id && editor.blocks.getBlockNode(id)) {
      ids.unshift(id);
      id = editor.blocks.getParentId(id) ?? null;
    }
    return JSON.stringify(ids);
  }, [editor, blockId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Observes a block's own content for a live heading or breadcrumb label.
 *
 * @param props - Label source.
 * @param props.editor - Editor containing the block.
 * @param props.blockId - Persisted block ID, or null for the document fallback.
 * @returns Block content, its type when empty, or a missing-block label.
 */
function PanelTitle({ editor, blockId }: { editor: ReactEditorApi; blockId: string | null }) {
  const subscribe = useCallback(
    (listener: () => void) =>
      blockId ? editor.blocks.subscribeBlockNode(blockId, listener) : () => undefined,
    [editor, blockId],
  );
  const snapshot = useCallback(
    () => (blockId ? editor.blocks.getBlockNode(blockId) : undefined),
    [editor, blockId],
  );
  const block = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!blockId) {
    return "Document";
  }
  return block ? block.content || block.type : "Deleted block";
}
