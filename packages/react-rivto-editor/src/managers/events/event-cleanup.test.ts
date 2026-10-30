/** @jest-environment jsdom */
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { EventManager } from "./event-manager";
import type { RegistrationOwner } from "../extensions/types";

it("attempts native, root subscription and every registration cleanup after failures", () => {
  const root = document.createElement("div");
  const seen: string[] = [];
  const nativeFailure = new Error("native removal failed");
  const rootFailure = new Error("root subscription failed");
  const registrationFailure = new Error("registration release failed");
  const unsubscribe = jestApi.fn(() => {
    throw rootFailure;
  });
  const manager = new EventManager(
    {
      subscribeRoots: () => unsubscribe,
      getRoots: () => new Set([root]),
      resolveEventRoot: () => root,
      getApi: () => undefined,
      getSurfaceType: () => "block",
    },
    createFailingOwner(seen, registrationFailure),
  );
  manager.register({ id: "first", type: "click" }, () => {});
  manager.register({ id: "second", type: "mousedown" }, () => {});
  const remove = root.removeEventListener.bind(root);
  jestApi.spyOn(root, "removeEventListener").mockImplementation((...args) => {
    remove(...args);
    if (args[0] === "click") {
      throw nativeFailure;
    }
  });
  try {
    let failure: unknown;
    try {
      manager.destroy();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).toHaveProperty("errors", [
      expect.objectContaining({ errors: [nativeFailure] }),
      rootFailure,
      registrationFailure,
    ]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["registered 0", "registered 1", "released 1", "released 0"]);
    expect(manager.delete("first")).toBe(false);
    expect(manager.delete("second")).toBe(false);
    expect(() => manager.destroy()).not.toThrow();
  } finally {
    jestApi.restoreAllMocks();
  }
});

/**
 * Creates a resource owner that fails after releasing its second registration.
 *
 * @param seen - Registration and cleanup trace appended by the owner.
 * @param registrationFailure - Error thrown after the second real cleanup completes.
 * @returns Owner exposing release order and allowing remaining-cleanup assertions.
 */
function createFailingOwner(seen: string[], registrationFailure: Error): RegistrationOwner {
  return {
    /**
     * Retains a test registration whose first release deliberately fails.
     *
     * @param release - Real manager cleanup to execute before the injected error.
     * @returns Cleanup recording reverse registration order.
     */
    registerCleanup(release) {
      const id = seen.length;
      seen.push(`registered ${id}`);
      return () => {
        seen.push(`released ${id}`);
        release();
        if (id === 1) {
          throw registrationFailure;
        }
      };
    },
    /**
     * Keeps the test owner available during registration.
     *
     * @returns Registration remains allowed.
     */
    assertActive() {},
  };
}
