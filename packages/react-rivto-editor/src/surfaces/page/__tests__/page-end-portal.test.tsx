/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server.node";
import {
  EditorPortalHostContext,
  EditorRootContext,
} from "../../../components/editor-panel/editor-root-context";
import { PageEndPortal } from "../browser/page-end-portal";

it("mounts page-end content only in the current occurrence's slot", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  first.dataset.rivtoBlockEditor = "true";
  second.dataset.rivtoBlockEditor = "true";
  first.innerHTML = '<div data-page-end-slot="true"></div>';
  second.innerHTML = '<div data-rivto-block-editor><div data-page-end-slot="true"></div></div>';
  document.body.append(first, second);
  const firstOccurrence = new BrowserInputRoot(first);
  const secondOccurrence = new BrowserInputRoot(second);
  const occurrences = new Map<HTMLElement, BrowserInputRoot>([
    [first, firstOccurrence],
    [second, secondOccurrence],
  ]);
  const root = createRoot(container);
  const content = (
    <PageEndPortal>
      <span>Trailing</span>
    </PageEndPortal>
  );
  /**
   * Provides the current test occurrence to the portal.
   *
   * @param element - Mounted root or null before attachment.
   * @returns The portal inside its occurrence context.
   */
  const render = (element: HTMLElement | null) => (
    <EditorRootContext.Provider
      value={{
        identity: element ? getBrowserElementIdentity(element) : undefined,
        ref: () => {},
        mountedRoot: element ? occurrences.get(element) : undefined,
      }}
    >
      <EditorPortalHostContext.Provider value={element}>{content}</EditorPortalHostContext.Provider>
    </EditorRootContext.Provider>
  );
  try {
    expect(renderToStaticMarkup(render(null))).toBe("");
    act(() => root.render(render(first)));
    expect(first.querySelector("[data-page-end-slot]")?.textContent).toBe("Trailing");
    act(() => root.render(render(second)));
    expect(first.querySelector("[data-page-end-slot]")?.textContent).toBe("");
    expect(second.querySelector("[data-page-end-slot]")?.textContent).toBe("");
    second.insertAdjacentHTML("beforeend", '<div data-page-end-slot="true"></div>');
    act(() => root.render(render(second)));
    expect(second.querySelector(":scope > [data-page-end-slot]")?.textContent).toBe("Trailing");
  } finally {
    act(() => root.unmount());
    firstOccurrence.detach();
    secondOccurrence.detach();
    first.remove();
    second.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("withdraws the portal when the captured mounted Root detaches", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const surface = document.createElement("div");
  surface.dataset.rivtoBlockEditor = "true";
  surface.innerHTML = '<div data-page-end-slot="true"></div>';
  document.body.append(surface);
  const occurrence = new BrowserInputRoot(surface);
  const view = createRoot(document.createElement("div"));
  const content = () => (
    <EditorRootContext.Provider
      value={{
        identity: getBrowserElementIdentity(surface),
        ref: () => {},
        mountedRoot: occurrence,
      }}
    >
      <EditorPortalHostContext.Provider value={surface}>
        <PageEndPortal>Trailing</PageEndPortal>
      </EditorPortalHostContext.Provider>
    </EditorRootContext.Provider>
  );
  try {
    act(() => view.render(content()));
    expect(surface.querySelector("[data-page-end-slot]")?.textContent).toBe("Trailing");
    occurrence.detach();
    act(() => view.render(content()));
    expect(surface.querySelector("[data-page-end-slot]")?.textContent).toBe("");
  } finally {
    act(() => view.unmount());
    occurrence.detach();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
