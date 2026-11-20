import { act } from "react";
import { createRoot } from "react-dom/client";
import type { RegionIdentity } from "@chulane/rivto-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../../../editor/block-editor-controller";
import { TestBlockEditorAdapter } from "../../../../test-utils/test-block-editor-adapter";
import { BlockEditorContext } from "../../block-editor/block-editor-context";
import { useBlockRegion } from "../use-block-region";
import { BlockRegionRef } from "../browser/block-region-ref";
import { useBlockViewRef } from "../browser/use-block-view-ref";

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});

it("releases a stale shell ref cleanup after a reentrant replacement", () => {
  const host = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  const view = createRoot(host);
  const firstCleanup = jest.fn();
  const secondCleanup = jest.fn();
  let commit: ((element: HTMLDivElement | null) => void) | undefined;
  /**
   * Replaces the first shell while its identity is being delivered.
   *
   * @param identity - The current shell identity, or null on unmount.
   * @returns The cleanup belonging to the delivered shell.
   */
  function replace(identity: RegionIdentity | null): (() => void) | undefined {
    if (identity === getBrowserElementIdentity(first)) {
      commit!(second);
      return firstCleanup;
    }
    return identity === getBrowserElementIdentity(second) ? secondCleanup : undefined;
  }
  /**
   * Exposes the shell ref for direct lifecycle testing.
   *
   * @returns No rendered DOM; the test owns both shells.
   */
  function Fixture() {
    commit = useBlockViewRef(replace, undefined, undefined);
    return null;
  }
  try {
    act(() => view.render(<Fixture />));
    commit!(first);
    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).not.toHaveBeenCalled();
    commit!(null);
    expect(secondCleanup).toHaveBeenCalledTimes(1);
  } finally {
    act(() => view.unmount());
  }
});

it("rolls back a mounted region when the caller's identity ref throws", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const host = document.createElement("div");
  const element = document.createElement("div");
  document.body.append(host, element);
  const view = createRoot(host);
  let commit: ((element: HTMLDivElement | null) => void) | undefined;
  /**
   * Rejects the mounted identity while accepting cleanup notification.
   *
   * @param identity - Mounted region identity, or null during cleanup.
   * @returns Cleanup notification is accepted when no region is mounted.
   * @throws If a mounted identity is supplied.
   */
  function reject(identity: RegionIdentity | null): void {
    if (identity) {
      throw new Error("identity ref failed");
    }
  }
  /**
   * Captures the commit callback so the failing ref can be exercised directly.
   *
   * @returns No rendered DOM; the test owns the supplied element.
   */
  function Fixture() {
    commit = useBlockRegion("a", "row", reject);
    return null;
  }
  try {
    act(() =>
      view.render(
        <BlockEditorContext.Provider value={editor}>
          <Fixture />
        </BlockEditorContext.Provider>,
      ),
    );
    expect(() => commit!(element)).toThrow("identity ref failed");
    expect(editor.regions.getIdentities("a", "row")).toEqual([]);
  } finally {
    commit?.(null);
    act(() => view.unmount());
    editor.destroy();
    element.remove();
    host.remove();
  }
});

it("releases a stale ref cleanup when the ref replaces its own mounted region", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const host = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(host, first, second);
  const view = createRoot(host);
  const firstCleanup = jest.fn();
  const secondCleanup = jest.fn();
  let commit: ((element: HTMLDivElement | null) => void) | undefined;
  const firstIdentity = getBrowserElementIdentity(first);
  const secondIdentity = getBrowserElementIdentity(second);
  /**
   * Replaces the first mounted region while its identity is being delivered.
   *
   * @param identity - Current region identity, or null after cleanup.
   * @returns Cleanup belonging to the supplied identity, when mounted.
   */
  function replace(identity: RegionIdentity | null): (() => void) | undefined {
    if (identity === firstIdentity) {
      commit!(second);
      return firstCleanup;
    }
    if (identity === secondIdentity) {
      return secondCleanup;
    }
    return undefined;
  }
  /**
   * Exposes the commit callback for the reentrant replacement.
   *
   * @returns No rendered DOM; the test owns both regions.
   */
  function Fixture() {
    commit = useBlockRegion("a", "row", replace);
    return null;
  }
  try {
    act(() =>
      view.render(
        <BlockEditorContext.Provider value={editor}>
          <Fixture />
        </BlockEditorContext.Provider>,
      ),
    );
    commit!(first);
    expect(editor.regions.getIdentities("a", "row")).toEqual([secondIdentity]);
    expect(editor.regions.getIdentities("a", "row")[0]).toBe(secondIdentity);
    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).not.toHaveBeenCalled();
    commit!(null);
    expect(secondCleanup).toHaveBeenCalledTimes(1);
    expect(editor.regions.getIdentities("a", "row")).toEqual([]);
  } finally {
    commit?.(null);
    act(() => view.unmount());
    editor.destroy();
    first.remove();
    second.remove();
    host.remove();
  }
});

it("attempts both region and caller ref cleanup when both fail", () => {
  const releaseRegion = jest.fn(() => {
    throw new Error("region cleanup failed");
  });
  const releaseRef = jest.fn(() => {
    throw new Error("ref cleanup failed");
  });
  const regions = { register: jest.fn(() => releaseRegion) };
  const commit = new BlockRegionRef(regions, "a", "row", () => releaseRef).commit;
  commit(document.createElement("div"));
  expect(() => commit(null)).toThrow(AggregateError);
  expect(releaseRegion).toHaveBeenCalledTimes(1);
  expect(releaseRef).toHaveBeenCalledTimes(1);
  commit(null);
  expect(releaseRegion).toHaveBeenCalledTimes(1);
  expect(releaseRef).toHaveBeenCalledTimes(1);
});

it("retains both ref setup and registration rollback failures", () => {
  const release = jest.fn(() => {
    throw new Error("registration rollback failed");
  });
  const regions = { register: jest.fn(() => release) };
  const commit = new BlockRegionRef(regions, "a", "row", () => {
    throw new Error("identity ref failed");
  }).commit;
  let failure: unknown;
  try {
    commit(document.createElement("div"));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) {
    throw new Error("Expected aggregated setup and rollback failures");
  }
  expect(
    failure.errors.map((error: unknown) => (error instanceof Error ? error.message : error)),
  ).toEqual(["identity ref failed", "registration rollback failed"]);
  expect(release).toHaveBeenCalledTimes(1);
});
