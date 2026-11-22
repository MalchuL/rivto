import { BlockRegistryManager } from "./block-registry-manager";

test("a failed definition publication releases the type and allows a fresh registration", () => {
  const registry = new BlockRegistryManager();
  const setupError = new Error("Initial publication failed");
  const observed: unknown[] = [];
  const unsubscribe = registry.subscribe(() => {
    const definition = registry.get("owned");
    observed.push(definition?.metadata);
    if (definition) {
      throw setupError;
    }
  });
  const metadata = { owner: "failed" };
  expect(() => registry.defineBlock({ type: "owned", metadata })).toThrow(setupError);
  expect(registry.has("owned")).toBe(false);
  expect(observed).toEqual([metadata, undefined]);
  unsubscribe();
  const replacement = { type: "owned", metadata: { owner: "fresh" } };
  const release = registry.defineBlock(replacement);
  expect(registry.get("owned")).toBe(replacement);
  release();
  release();
  expect(registry.has("owned")).toBe(false);
  registry.destroy();
});

test("failed publication preserves its error and a rollback observer error after releasing the type", () => {
  const registry = new BlockRegistryManager();
  const setupError = new Error("Initial publication failed");
  const rollbackError = new Error("Rollback publication failed");
  const unsubscribe = registry.subscribe(() => {
    throw registry.has("owned") ? setupError : rollbackError;
  });
  let failure: unknown;
  try {
    registry.defineBlock({ type: "owned" });
  } catch (error) {
    failure = error;
  }
  expect(registry.has("owned")).toBe(false);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([setupError, rollbackError]);
  unsubscribe();
  const release = registry.defineBlock({ type: "owned" });
  release();
  registry.destroy();
});

test("behavior registrations retain priority and references without publishing definition changes", () => {
  const registry = new BlockRegistryManager();
  const listener = jest.fn();
  const stop = registry.subscribe(listener);
  const first = { isAvailable: () => true };
  const second = { isAvailable: () => true };
  expect(() => registry.registerBehavior(first, Number.NaN)).toThrow("priority");
  expect(registry.getBehaviorRegistrations()).toEqual([]);
  const firstRelease = registry.registerBehavior(first, 10);
  const sharedRelease = registry.registerBehavior(first, 10);
  const secondRelease = registry.registerBehavior(second, 10);
  expect(registry.getBehaviorRegistrations().map(({ behavior }) => behavior)).toEqual([
    first,
    second,
  ]);
  firstRelease();
  firstRelease();
  expect(registry.getBehaviorRegistrations().map(({ behavior }) => behavior)).toEqual([
    first,
    second,
  ]);
  sharedRelease();
  expect(registry.getBehaviorRegistrations().map(({ behavior }) => behavior)).toEqual([second]);
  expect(listener).not.toHaveBeenCalled();
  registry.destroy();
  expect(registry.getBehaviorRegistrations()).toEqual([]);
  secondRelease();
  stop();
});
