/**
 * Owns the single-root Rivto documentation shell, nested page navigation,
 * dirty state, and persistence behavior. Folder hierarchy is derived directly
 * from Markdown paths so adding nested documentation needs no app configuration.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DocumentationEditor, type PastedDocumentationImage } from "./DocumentationEditor";
import {
  buildDocumentationTree,
  createDocumentationPagePath,
  type DocumentationPagePlacement,
  type DocumentationNavigationNode,
} from "./document-tree";
import {
  createDocumentationPage,
  downloadDocumentationPage,
  getDocumentationPageTitle,
  loadDocumentationPages,
  saveDocumentationPage,
  uploadDocumentationImage,
  type DocumentationPage,
} from "./documents";
import { resolvePastedImageForEditor } from "./image-paths";

const DOCUMENTATION_ROOT_TITLE = "Rivto";
const UNSAVED_CHANGES_MESSAGE = "Discard unsaved changes to this document?";

/**
 * Renders the documentation workspace beneath its single Rivto root.
 *
 * @returns Complete browser application shell.
 */
export function App(): React.JSX.Element {
  const [pages, setPages] = useState<DocumentationPage[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState("Loading documentation…");
  const [getMarkdown, setGetMarkdown] = useState<(() => string) | null>(null);
  const selectedPage = useMemo(
    function findSelectedPage() {
      return pages.find(function matchesSelectedPath(page) { return page.path === selectedPath; }) ?? null;
    },
    [pages, selectedPath],
  );
  const navigationTree = useMemo(
    function createNavigationTree() { return buildDocumentationTree(pages); },
    [pages],
  );

  useEffect(function loadPagesOnMount() {
    let isCurrent = true;
    loadDocumentationPages()
      .then(function showPages(loadedPages) {
        if (isCurrent) {
          setPages(loadedPages);
          setSelectedPath(loadedPages[0]?.path ?? null);
          setStatus(loadedPages.length > 0 ? "Ready" : "No Markdown files found.");
        }
      })
      .catch(function showLoadError(error: unknown) {
        if (isCurrent) {
          setStatus(error instanceof Error ? error.message : "Unable to load documentation.");
        }
      });
    return function cancelPageLoad() {
      isCurrent = false;
    };
  }, []);

  useEffect(function warnBeforeClosing() {
    /** Prevents accidental loss when a dirty browser tab is closed. */
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (isDirty) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return function removeBeforeUnloadListener() {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const handleEditorReady = useCallback(function handleEditorReadyCallback(
    reader: (() => string) | null,
  ): void {
    setGetMarkdown(function storeReader() { return reader; });
  }, []);

  const handleDirtyChange = useCallback(function handleDirtyChangeCallback(nextDirty: boolean): void {
    setIsDirty(nextDirty);
  }, []);

  const handleSave = useCallback(async function saveSelectedPage(): Promise<void> {
    if (!selectedPage || !getMarkdown) {
      return;
    }
    const markdown = getMarkdown();
    try {
      if (import.meta.env.DEV) {
        const savedPage = await saveDocumentationPage(selectedPage, markdown);
        setPages(function replaceSavedPage(currentPages) {
          return currentPages.map(function replaceMatchingPage(page) {
            return page.path === savedPage.path ? savedPage : page;
          });
        });
        setStatus(`Saved ${savedPage.path}`);
      } else {
        downloadDocumentationPage(selectedPage.path, markdown);
        setStatus(`Downloaded ${selectedPage.path}`);
      }
      setIsDirty(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save document.");
    }
  }, [getMarkdown, selectedPage]);

  const handleCreate = useCallback(async function createPage(
    placement: DocumentationPagePlacement,
  ): Promise<void> {
    if (!selectedPage || !import.meta.env.DEV) {
      setStatus("Page creation is available while running pnpm docs:dev.");
      return;
    }
    if (isDirty && !window.confirm(UNSAVED_CHANGES_MESSAGE)) {
      return;
    }
    const title = window.prompt(placement === "child" ? "Nested page title" : "Page title")?.trim();
    if (!title) {
      return;
    }

    const path = createDocumentationPagePath(pages, selectedPage.path, placement, title);
    try {
      const createdPage = await createDocumentationPage(path, title);
      setPages(function appendCreatedPage(currentPages) { return [...currentPages, createdPage]; });
      setSelectedPath(createdPage.path);
      setIsDirty(false);
      setStatus(`Created ${createdPage.path}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create document.");
    }
  }, [isDirty, pages, selectedPage]);

  const handlePasteImage = useCallback(async function savePastedImage(
    image: File,
  ): Promise<PastedDocumentationImage> {
    if (!selectedPage || !import.meta.env.DEV) {
      const message = "Pasted images can be saved while running pnpm docs:dev.";
      setStatus(message);
      throw new Error(message);
    }
    try {
      const uploaded = await uploadDocumentationImage(selectedPage, image);
      setStatus(`Saved image in ${uploaded.markdownSource}`);
      return {
        source: resolvePastedImageForEditor(uploaded.markdownSource, selectedPage.path),
        alt: image.name || "Pasted image",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save pasted image.";
      setStatus(message);
      throw error;
    }
  }, [selectedPage]);

  useEffect(function registerSaveShortcut() {
    /** Saves the active Markdown file for the standard platform shortcut. */
    function handleSaveShortcut(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener("keydown", handleSaveShortcut);
    return function removeSaveShortcut() {
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [handleSave]);

  /** Selects another page after protecting current unsaved work. */
  function selectPage(nextPath: string): void {
    if (!isDirty || window.confirm(UNSAVED_CHANGES_MESSAGE)) {
      setSelectedPath(nextPath);
      setIsDirty(false);
      setStatus("Ready");
    }
  }

  return (
    <div data-app-shell>
      <aside data-sidebar>
        <header data-brand>
          <span data-brand-mark aria-hidden="true">R</span>
          <div><strong>{DOCUMENTATION_ROOT_TITLE}</strong><small>Documentation</small></div>
        </header>
        <nav aria-label="Documentation pages">
          <p data-root-label>{DOCUMENTATION_ROOT_TITLE}</p>
          <ul data-navigation-list>
            {renderNavigationNodes(navigationTree, selectedPath, selectPage)}
          </ul>
        </nav>
      </aside>
      <main data-main-content>
        <header data-document-toolbar>
          <div>
            <small>{selectedPage?.path ?? DOCUMENTATION_ROOT_TITLE}</small>
            <strong>{selectedPage ? getDocumentationPageTitle(selectedPage) : "Documentation"}</strong>
          </div>
          <div data-document-actions>
            <button type="button" data-create-button disabled={!selectedPage || !import.meta.env.DEV} title={import.meta.env.DEV ? "Create a page beside the current page" : "Available with pnpm docs:dev"} onClick={function createSibling() { void handleCreate("sibling"); }}>
              New sibling
            </button>
            <button type="button" data-create-button disabled={!selectedPage || !import.meta.env.DEV} title={import.meta.env.DEV ? "Create a nested page under the current page" : "Available with pnpm docs:dev"} onClick={function createChild() { void handleCreate("child"); }}>
              New child
            </button>
            <button type="button" data-save-button disabled={!selectedPage || !getMarkdown} onClick={function saveFromButton() { void handleSave(); }}>
              {import.meta.env.DEV ? "Save Markdown" : "Download Markdown"}{isDirty ? " •" : ""}
            </button>
          </div>
        </header>
        <div data-status role="status">{status}</div>
        {selectedPage ? (
          <DocumentationEditor
            content={selectedPage.content}
            pagePath={selectedPage.path}
            onDirtyChange={handleDirtyChange}
            onEditorReady={handleEditorReady}
            onPasteImage={handlePasteImage}
          />
        ) : <p data-empty-state>{status}</p>}
      </main>
    </div>
  );
}

/**
 * Recursively renders page buttons and collapsible directory groups.
 *
 * @param nodes Navigation nodes at the current folder level.
 * @param selectedPath Currently active Markdown path.
 * @param onSelect Callback used to protect dirty work before navigation.
 * @returns React list items for this navigation level.
 */
function renderNavigationNodes(
  nodes: readonly DocumentationNavigationNode[],
  selectedPath: string | null,
  onSelect: (path: string) => void,
): ReactNode[] {
  return nodes.map(function renderNavigationNode(node) {
    if (node.kind === "folder") {
      return (
        <li key={node.path} data-navigation-folder>
          <details open>
            <summary>{node.name}</summary>
            <ul data-navigation-list>
              {renderNavigationNodes(node.children, selectedPath, onSelect)}
            </ul>
          </details>
        </li>
      );
    }

    const isSelected = node.page.path === selectedPath;
    return (
      <li key={node.page.path} data-navigation-page>
        <button
          type="button"
          data-selected={isSelected || undefined}
          aria-current={isSelected ? "page" : undefined}
          onClick={function choosePage() { onSelect(node.page.path); }}
        >
          <span>{getDocumentationPageTitle(node.page)}</span>
          <small>{node.page.path}</small>
        </button>
        {node.children.length > 0 ? (
          <ul data-navigation-list data-page-children>
            {renderNavigationNodes(node.children, selectedPath, onSelect)}
          </ul>
        ) : null}
      </li>
    );
  });
}
