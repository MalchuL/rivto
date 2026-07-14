import type { Surface } from "../../react/editor/types";
import { SurfaceRegistry } from "../../react/managers/surface-registry";

function surface(type: "block" | "edgeless" = "block"): Surface {
  return {
    type,
    component: () => null,
  };
}

describe("SurfaceRegistry", () => {
  it("returns surfaces by type", () => {
    const registry = new SurfaceRegistry();
    const blockSurface = surface("block");
    const edgelessSurface = surface("edgeless");

    registry.register(blockSurface);
    registry.register(edgelessSurface);

    expect(registry.get("block")).toBe(blockSurface);
    expect(registry.get("edgeless")).toBe(edgelessSurface);
  });

  it("unregisters surfaces idempotently", () => {
    const registry = new SurfaceRegistry();
    const unregister = registry.register(surface("block"));

    unregister();
    unregister();

    expect(registry.get("block")).toBeUndefined();
  });

  it("rejects duplicate surfaces for the same type", () => {
    const registry = new SurfaceRegistry();

    registry.register(surface("block"));

    expect(() => registry.register(surface("block"))).toThrow("Surface already registered");
  });
});
