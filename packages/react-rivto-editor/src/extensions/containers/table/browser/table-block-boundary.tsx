import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { useReactPanelContext } from "../../../../hooks/editor/use-react-panel-context";
import { PANEL_SELECTOR } from "../../../../panels/panel-dom";
import type { TableBlockBoundaryHost, TableBlockBoundaryProps } from "./types";
import type { ReactPanelSurfaceApi } from "../../../../panels/types";

/**
 * Renders an existing table marker and portals controls to its owning block shell.
 *
 * The native portal host stays inside this mounting adapter. A replaced or
 * detached panel Root cannot reuse a host captured by an earlier occurrence.
 * The block shell anchors controls to the entire row or cell, including
 * recursively rendered child blocks.
 *
 * @param props - Marker styling, marker content, and boundary controls.
 * @param props.className - Existing marker class used by table presentation.
 * @param props.children - Content rendered inside the existing marker.
 * @param props.controls - Controls portaled to the enclosing block shell.
 * @returns Marker and current occurrence's boundary controls.
 * @throws Propagates Root ownership and React portal failures.
 */
export function TableBlockBoundary({ className, children, controls }: TableBlockBoundaryProps) {
  const marker = useRef<HTMLDivElement>(null);
  const [captured, setCaptured] = useState<TableBlockBoundaryHost>();
  const { reactPanel } = useReactPanelContext();
  const subscribe = useCallback(
    (listener: () => void) => reactPanel.subscribeAvailability(listener),
    [reactPanel],
  );
  const mountedRoot = useSyncExternalStore(
    subscribe,
    () => reactPanel.mountedRoot,
    () => undefined,
  );
  const identity = mountedRoot?.getElementIdentity?.();
  useLayoutEffect(() => {
    const element = marker.current;
    setCaptured(
      element && mountedRoot && identity
        ? captureTableBlockHost(element, mountedRoot, identity, reactPanel)
        : undefined,
    );
  }, [mountedRoot, identity, reactPanel]);
  const available =
    captured &&
    captured.root === mountedRoot &&
    captured.root === reactPanel.mountedRoot &&
    captured.marker === marker.current &&
    captured.region.getIdentity() === captured.identity;
  return (
    <>
      <div ref={marker} className={className}>
        {children}
      </div>
      {available && createPortal(controls, captured.host)}
    </>
  );
}

/**
 * Captures the marker's block shell only while it belongs to this mounted panel.
 *
 * @param marker - Existing table marker inside the block shell.
 * @param root - Mounted occurrence providing region capture.
 * @param surfaceIdentity - Opaque identity of the rendered panel surface.
 * @param panel - Owner exposing its current mounted occurrence.
 * @returns Portal host bound to this marker and occurrence, or undefined when unavailable.
 * @throws Propagates Root ownership and selector failures.
 */
function captureTableBlockHost(
  marker: HTMLElement,
  root: TableBlockBoundaryHost["root"],
  surfaceIdentity: object,
  panel: Pick<ReactPanelSurfaceApi, "mountedRoot">,
): TableBlockBoundaryHost | undefined {
  const host = marker.closest<HTMLElement>("[data-block-id]");
  if (!host) {
    return undefined;
  }
  const identity = getBrowserElementIdentity(host);
  const current = () => {
    const boundary = marker.closest(PANEL_SELECTOR);
    return (
      marker.isConnected &&
      host.isConnected &&
      marker.closest("[data-block-id]") === host &&
      !!boundary &&
      getBrowserElementIdentity(boundary) === surfaceIdentity &&
      panel.mountedRoot === root &&
      root.isAttached() &&
      root.getElementIdentity?.() === surfaceIdentity &&
      panel.mountedRoot === root &&
      marker.isConnected &&
      marker.closest("[data-block-id]") === host &&
      marker.closest(PANEL_SELECTOR) === boundary
    );
  };
  const region = root.captureRegionByIdentity(identity, current);
  return region && current() ? { marker, host, root, identity, region } : undefined;
}
