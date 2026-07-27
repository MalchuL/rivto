import { createRivtoEditor } from "@chulane/rivto";
import type { ComponentType } from "react";
import { createReactEditor } from "../../../react-editor";

const Mounted: ComponentType = () => null;

describe("PluginManager", () => {
  test("owns repeated component registrations by registration identity", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.plugins;
    const first = manager.mount(Mounted);
    manager.mount(Mounted);

    first();
    first();
    expect(manager.getComponents()).toEqual([Mounted]);

    reactEditor.destroy();
    expect(manager.getComponents()).toEqual([]);
    expect(() => manager.mount(Mounted)).toThrow(/destroyed/);
    editor.destroy();
  });
});
