/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { PanelInputRegistration } from "../../../panels/types";
import { createTestCoreEditor } from "../../../test-utils";
import { PanelRegistry } from "../../../panels/panel-registry";

it("restores the previous root capability when replacement notification fails", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const root = document.createElement("div");
  const mountedRoot = new BrowserInputRoot(root);
  const failure = new Error("listener failed");
  let failedRegistration: PanelInputRegistration | undefined;
  try {
    let previousRegistration: PanelInputRegistration | undefined;
    const release = registry.registerPanel(mountedRoot, {
      receiveInput: (registration) => {
        previousRegistration = registration;
      },
    });
    const previous = mountedRoot;
    registry.subscribeRoots(() => {
      if (failedRegistration?.isCurrent()) {
        expect(previousRegistration?.isCurrent()).toBe(false);
        throw failure;
      }
    });
    expect(() =>
      registry.registerPanel(mountedRoot, {
        receiveInput: (registration) => {
          failedRegistration = registration;
        },
      }),
    ).toThrow(failure);
    expect(registry.getInputRoots().has(previous)).toBe(true);
    expect(previousRegistration?.isCurrent()).toBe(true);
    expect(failedRegistration?.isCurrent()).toBe(false);
    release();
    expect(previousRegistration?.isCurrent()).toBe(false);
  } finally {
    registry.destroy();
    mountedRoot.detach();
    await core.destroy();
  }
});

it("invalidates a failed first registration and retains rollback failures", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const root = document.createElement("div");
  const mountedRoot = new BrowserInputRoot(root);
  const failure = new Error("listener failed");
  let failedRegistration: PanelInputRegistration | undefined;
  registry.subscribeRoots(() => {
    throw failure;
  });
  try {
    let caught: unknown;
    try {
      registry.registerPanel(mountedRoot, {
        receiveInput: (registration) => {
          failedRegistration = registration;
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect(caught).toHaveProperty("errors", [failure, failure]);
    expect(registry.getInputRoots().has(mountedRoot)).toBe(false);
    expect(failedRegistration?.isCurrent()).toBe(false);
  } finally {
    registry.destroy();
    mountedRoot.detach();
    await core.destroy();
  }
});
