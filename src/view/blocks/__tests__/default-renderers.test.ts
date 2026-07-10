import { createDefaultBlockRendererRegistry } from "../default-renderers";

describe("default block renderers", () => {
  it("registers built-in block renderers for both surfaces", () => {
    const registry = createDefaultBlockRendererRegistry();

    expect(registry.get("paragraph", "block")).toBeDefined();
    expect(registry.get("paragraph", "edgeless")).toBeDefined();
    expect(registry.get("bulletListItem", "block")).toBeDefined();
    expect(registry.get("checkListItem", "edgeless")).toBeDefined();
  });
});
