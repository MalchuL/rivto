import type { BlockRenderer } from "../../react/blocks/types";
import { BlockRendererRegistry } from "../../react/managers/block-renderer-registry";

function renderer(blockType: string, surface: "block" | "edgeless" = "block"): BlockRenderer {
  return {
    blockType,
    surface,
    component: () => null,
  };
}

describe("BlockRendererRegistry", () => {
  it("returns renderers by block type and surface", () => {
    const registry = new BlockRendererRegistry();
    const blockRenderer = renderer("paragraph", "block");
    const edgelessRenderer = renderer("paragraph", "edgeless");

    registry.register(blockRenderer);
    registry.register(edgelessRenderer);

    expect(registry.get("paragraph", "block")).toBe(blockRenderer);
    expect(registry.get("paragraph", "edgeless")).toBe(edgelessRenderer);
    expect(registry.get("heading", "block")).toBeUndefined();
  });

  it("unregisters renderers idempotently", () => {
    const registry = new BlockRendererRegistry();
    const unregister = registry.register(renderer("paragraph"));

    unregister();
    unregister();

    expect(registry.get("paragraph", "block")).toBeUndefined();
  });

  it("rejects duplicate renderers for the same key", () => {
    const registry = new BlockRendererRegistry();

    registry.register(renderer("paragraph"));

    expect(() => registry.register(renderer("paragraph"))).toThrow("Renderer already registered");
  });

  it("rejects empty block types", () => {
    const registry = new BlockRendererRegistry();

    expect(() => registry.register(renderer(" "))).toThrow("Renderer block type must be a non-empty string");
    expect(() => registry.get("", "block")).toThrow("Renderer block type must be a non-empty string");
  });
});
