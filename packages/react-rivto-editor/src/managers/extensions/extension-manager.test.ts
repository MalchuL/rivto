import { createTestCoreEditor as createEditor } from "../../test-utils";
import type { ComponentType } from "react";
import { createReactEditor } from "../../react-editor";

const Mounted: ComponentType = () => null;

describe("ExtensionManager", () => {
  test("owns repeated component registrations by registration identity", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.extensions;
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
