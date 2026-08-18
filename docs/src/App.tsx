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
  deleteDocumentationPage,
  downloadDocumentationPage,
  getDocumentationPageTitle,
  loadDocumentationPages,
  saveDocumentationPage,
  uploadDocumentationImage,
  type DocumentationPage,
} from "./documents";
import { resolvePastedImageForEditor } from "./image-paths";
import {
  createDocumentationUrl,
  decodeAnchor,
  getDocumentationPath,
  resolveDocumentationLink,
} from "./navigation";

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
  const [selectedAnchor, setSelectedAnchor] = useState("");
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
          const urlPath = getDocumentationPath(window.location.pathname);
          const initialPage = loadedPages.find(function matchesUrl(page) { return page.path === urlPath; })
            ?? loadedPages[0]
            ?? null;
          setSelectedPath(initialPage?.path ?? null);
          setSelectedAnchor(initialPage?.path === urlPath ? decodeAnchor(window.location.hash) : "");
          if (initialPage && initialPage.path !== urlPath) {
            window.history.replaceState(null, "", createDocumentationUrl(initialPage.path));
          }
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

  useEffect(function followBrowserHistory() {
    function handlePopState(): void {
      const nextPath = getDocumentationPath(window.location.pathname);
      if (!pages.some(function pageExists(page) { return page.path === nextPath; })) {
        return;
      }
      if (isDirty && !window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        window.history.pushState(null, "", selectedPath ? createDocumentationUrl(selectedPath, selectedAnchor) : "/");
        return;
      }
      setSelectedPath(nextPath);
      setSelectedAnchor(decodeAnchor(window.location.hash));
      setIsDirty(false);
      setStatus("Ready");
    }
    window.addEventListener("popstate", handlePopState);
    return function removePopStateListener() {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isDirty, pages, selectedAnchor, selectedPath]);

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
      setSelectedAnchor("");
      window.history.pushState(null, "", createDocumentationUrl(createdPage.path));
      setIsDirty(false);
      setStatus(`Created ${createdPage.path}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create document.");
    }
  }, [isDirty, pages, selectedPage]);

  const handleDelete = useCallback(async function deleteSelectedPage(): Promise<void> {
    if (!selectedPage || !import.meta.env.DEV) {
      setStatus("Page deletion is available while running pnpm docs:dev.");
      return;
    }
    const ownedFolderPrefix = selectedPage.path.replace(/\.md$/i, "/");
    const hasNestedPages = pages.some(function isNestedPage(page) {
      return page.path.startsWith(ownedFolderPrefix);
    });
    const retainedContent = hasNestedPages
      ? " Nested pages and its image folder will remain."
      : " Its image folder will remain.";
    if (!window.confirm(`Delete ${selectedPage.path}? Unsaved edits will be lost.${retainedContent}`)) {
      return;
    }

    try {
      await deleteDocumentationPage(selectedPage);
      const selectedIndex = pages.findIndex(function findDeletedPage(page) {
        return page.path === selectedPage.path;
      });
      const remainingPages = pages.filter(function retainOtherPages(page) {
        return page.path !== selectedPage.path;
      });
      const nextPage = remainingPages[Math.min(selectedIndex, remainingPages.length - 1)] ?? null;
      setPages(remainingPages);
      setSelectedPath(nextPage?.path ?? null);
      setSelectedAnchor("");
      window.history.replaceState(null, "", nextPage ? createDocumentationUrl(nextPage.path) : "/");
      setIsDirty(false);
      setStatus(`Deleted ${selectedPage.path}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete document.");
    }
  }, [pages, selectedPage]);

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
  function selectPage(nextPath: string, anchor = ""): void {
    if (!isDirty || window.confirm(UNSAVED_CHANGES_MESSAGE)) {
      setSelectedPath(nextPath);
      setSelectedAnchor(anchor);
      setIsDirty(false);
      setStatus("Ready");
      window.history.pushState(null, "", createDocumentationUrl(nextPath, anchor));
    }
  }

  /** Handles links to documentation pages and heading fragments inside the editor. */
  function navigateLink(href: string): boolean {
    if (!selectedPage) {
      return false;
    }
    const target = resolveDocumentationLink(href, selectedPage.path);
    if (!target || !pages.some(function targetExists(page) { return page.path === target.path; })) {
      return false;
    }
    selectPage(target.path, target.anchor);
    return true;
  }

  return (
    <div data-app-shell>
      <aside data-sidebar>
        <header data-brand>
          <span data-brand-mark aria-hidden="true">R</span>
          <div><strong>{DOCUMENTATION_ROOT_TITLE}</strong><small>Documentation</small></div>
        </header>
        <nav aria-label="Documentation pages">
          <details open data-navigation-root>
            <summary data-root-label>{DOCUMENTATION_ROOT_TITLE}</summary>
            <ul data-navigation-list>
              {renderNavigationNodes(navigationTree, selectedPath, selectPage)}
            </ul>
          </details>
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
            <button type="button" data-delete-button disabled={!selectedPage || !import.meta.env.DEV} title={import.meta.env.DEV ? "Delete only the current Markdown page" : "Available with pnpm docs:dev"} onClick={function deletePage() { void handleDelete(); }}>
              Delete
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
            anchor={selectedAnchor}
            onDirtyChange={handleDirtyChange}
            onEditorReady={handleEditorReady}
            onPasteImage={handlePasteImage}
            onNavigateLink={navigateLink}
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
    const pageButton = (
      <button
        type="button"
        data-selected={isSelected || undefined}
        aria-current={isSelected ? "page" : undefined}
        onClick={function choosePage(event) {
          event.stopPropagation();
          onSelect(node.page.path);
        }}
      >
        <span>{getDocumentationPageTitle(node.page)}</span>
        <small>{node.page.path}</small>
      </button>
    );
    return (
      <li key={node.page.path} data-navigation-page>
        {node.children.length > 0 ? (
          <details open data-navigation-page-group>
            <summary aria-label={`Toggle ${getDocumentationPageTitle(node.page)}`}>
              {pageButton}
            </summary>
            <ul data-navigation-list data-page-children>
              {renderNavigationNodes(node.children, selectedPath, onSelect)}
            </ul>
          </details>
        ) : pageButton}
      </li>
    );
  });
}
