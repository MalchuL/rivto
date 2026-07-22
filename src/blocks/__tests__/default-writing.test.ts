import { DEFAULT_BLOCK_TYPE } from "../constants";
import { BlockRegistry } from "../block-registry";
import { defaultBlockDefinitions } from "../default-writing";

describe("default block definitions", () => {
  it("installs only the shared writing fallback", () => {
    expect(DEFAULT_BLOCK_TYPE).toBe("paragraph");
    expect(defaultBlockDefinitions).toEqual([{ type: DEFAULT_BLOCK_TYPE, title: "Paragraph" }]);
  });

  it("requires applications to register every removed native type", () => {
    const registry = new BlockRegistry();
    defaultBlockDefinitions.forEach((definition) => registry.register(definition));

    expect(registry.prepare({ type: DEFAULT_BLOCK_TYPE }).type).toBe(DEFAULT_BLOCK_TYPE);
    expect(() => registry.prepare({ type: "heading" })).toThrow("Unknown block type heading");
    registry.register({ type: "heading" });
    expect(registry.prepare({ type: "heading" }).type).toBe("heading");
  });
});
