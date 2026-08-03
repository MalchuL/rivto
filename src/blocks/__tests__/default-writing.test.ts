import { DEFAULT_BLOCK_TYPE } from "../constants";
import { defaultBlockDefinitions } from "../default-writing";
import { BlockRegistryManager } from "../../managers/block-registry-manager";

describe("default block definitions", () => {
  it("installs only the shared writing fallback", () => {
    expect(DEFAULT_BLOCK_TYPE).toBe("paragraph");
    expect(defaultBlockDefinitions).toEqual([{ type: DEFAULT_BLOCK_TYPE, title: "Paragraph" }]);
  });

  it("requires applications to register every removed native type", () => {
    const registry = new BlockRegistryManager();
    defaultBlockDefinitions.forEach((definition) => registry.defineBlock(definition));

    expect(registry.prepare({ type: DEFAULT_BLOCK_TYPE }).type).toBe(DEFAULT_BLOCK_TYPE);
    expect(() => registry.prepare({ type: "heading" })).toThrow("Unknown block type heading");
    registry.defineBlock({ type: "heading" });
    expect(registry.prepare({ type: "heading" }).type).toBe("heading");
  });

  it("notifies subscribers when definitions are added and removed", () => {
    const registry = new BlockRegistryManager();
    const listener = jest.fn();
    const unsubscribe = registry.subscribe(listener);

    const remove = registry.defineBlock({ type: "test.subscribed" });
    expect(listener).toHaveBeenCalledTimes(1);

    remove();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registry.defineBlock({ type: "test.unsubscribed" });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
