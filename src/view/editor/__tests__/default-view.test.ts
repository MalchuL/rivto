import { createDefaultViewRegistries } from "../default-view";

describe("default view registries", () => {
  it("creates default surface and block renderer registries", () => {
    const view = createDefaultViewRegistries();

    expect(view.surfaces.get("block")).toBeDefined();
    expect(view.surfaces.get("edgeless")).toBeDefined();
    expect(view.renderers.get("paragraph", "block")).toBeDefined();
    expect(view.renderers.get("paragraph", "edgeless")).toBeDefined();
  });
});
