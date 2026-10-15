import { BlockHandleContext } from "@chulane/rivto-react";
import { Fragment, useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
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
 * @param props.children - Content rendered within the active panel.
 * @returns Breadcrumb navigation and active panel with handle-driven block opening.
 */
export function DemoEditorPanels({
  editor,
  children,
  ...props
}: Omit<EditorPanelProps, "editor" | "panel" | "mode"> & {
  editor: ReactEditorApi;
  children: ReactNode;
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
    return { entries: new Map<string | null, DemoPanel>([[null, root]]), history: [root] };
  });
  const openBlock = useCallback(
    (blockId: string) => {
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
          mode: new ModeManager(state.history.at(-1)!.mode.get()),
        };
      }
      const destination = next;
      setState((previous) => {
        if (previous.history.at(-1) === destination) {
          return previous;
        }
        const entries = new Map(previous.entries);
        entries.set(blockId, destination);
        return { entries, history: [...previous.history, destination] };
      });
    },
    [editor, state],
  );
  const active = state.history.at(-1)!;
  return (
    <>
      <header
        data-panel-root={active.panel.rootBlockId ?? ""}
        data-panel-element-root={active.panel.rootElementId ?? ""}
      >
        {state.history.length > 1 && (
          <Breadcrumb aria-label="Panel breadcrumbs">
            <BreadcrumbList>
              {state.history.map((entry, index) => (
                <Fragment key={`${entry.panel.id}:${index}`}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {index === state.history.length - 1 ? (
                      <BreadcrumbPage>
                        <PanelTitle editor={editor} blockId={entry.panel.rootBlockId} />
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <button
                          type="button"
                          onClick={() =>
                            setState((previous) => ({
                              ...previous,
                              history: previous.history.slice(0, index + 1),
                            }))
                          }
                        >
                          <PanelTitle editor={editor} blockId={entry.panel.rootBlockId} />
                        </button>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
        {active.panel.rootBlockId && (
          <h2>
            <PanelTitle editor={editor} blockId={active.panel.rootBlockId} />
          </h2>
        )}
      </header>
      <EditorPanel
        {...props}
        key={active.panel.id}
        editor={editor}
        rootBlockId={active.panel.rootBlockId ?? undefined}
        rootElementId={active.panel.rootElementId}
        mode={active.mode}
      >
        <BlockHandleContext.Provider value={{ onOpen: openBlock }}>
          {children}
        </BlockHandleContext.Provider>
      </EditorPanel>
    </>
  );
}

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
