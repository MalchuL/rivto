import { useLayoutEffect, type ReactNode } from "react";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import { PageSelectionExtension, type PageSelectionKind } from "./page-selection-extension";

/** Existing surface wrapper content and its optional selection feature group. */
interface PageSelectionBoundaryProps {
  readonly children?: ReactNode;
  readonly kind: PageSelectionKind;
}

/**
 * Registers the host's text selection feature group on Page while borrowing its existing subtree.
 *
 * @param props - Already composed surface subtree.
 * @returns The same subtree with occurrence-local Page selection registration.
 */
export function PageTextSelectionBoundary(props: Pick<PageSelectionBoundaryProps, "children">) {
  return <PageSelectionBoundary {...props} kind="text" />;
}

/**
 * Registers the host's block selection feature group without replacing text feature ownership.
 *
 * @param props - Already composed surface subtree.
 * @returns The same subtree with occurrence-local toggle and feedback registration.
 */
export function PageBlockSelectionBoundary(props: Pick<PageSelectionBoundaryProps, "children">) {
  return <PageSelectionBoundary {...props} kind="block" />;
}

/**
 * Attaches optional features to the existing panel-owned Page controller after commit.
 *
 * Removing a host extension unmounts this wrapper and cancels its block features.
 * Both writing pages and canvas block content use this same input owner.
 *
 * @param props - Surface content and the owning host feature group.
 * @param props.kind - Text or block capabilities to register independently.
 * @param props.children - Already rendered surface subtree, returned without another DOM root.
 * @returns The supplied children; the layout effect owns only feature registration.
 */
function PageSelectionBoundary({ kind, children }: PageSelectionBoundaryProps) {
  const { reactPanel } = useReactPanelContext();
  useLayoutEffect(() => {
    return reactPanel.page.extensions.register(
      `host.selection.${kind}`,
      new PageSelectionExtension(
        reactPanel.pageSelectionFeatures,
        reactPanel.editor.keyboard,
        kind,
      ),
    );
  }, [reactPanel, kind]);
  return children;
}
