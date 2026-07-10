import { createDefaultSurfaceRegistry } from "../default-surfaces";

describe("default surfaces", () => {
  it("registers block and edgeless surfaces", () => {
    const registry = createDefaultSurfaceRegistry();

    expect(registry.get("block")).toBeDefined();
    expect(registry.get("edgeless")).toBeDefined();
  });
});
