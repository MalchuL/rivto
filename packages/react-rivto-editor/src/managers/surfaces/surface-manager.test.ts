import { createRivtoEditor as createEditor } from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import type { BlockWrapperProps } from "../../blocks";
import { createReactEditor } from "../../react-editor";

const Surface: ComponentType = () => null;
const Wrapper: ComponentType<BlockWrapperProps> = () => null;
const EditorWrapper: ComponentType<{ readonly children?: ReactNode }> = ({ children }) => children;

describe("SurfaceManager", () => {
  test("keeps surfaces unique and filters defensive wrapper reads by mode", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.surfaces;
    manager.register("block", Surface);
    manager.registerBlockWrapper("block", Wrapper);
    manager.registerEditorWrapper(EditorWrapper, "edgeless");

    expect(manager.get("block")).toBe(Surface);
    expect(() => manager.register("block", Surface)).toThrow(/already registered/);
    const wrappers = manager.getBlockWrappers("block") as ComponentType<BlockWrapperProps>[];
    wrappers.length = 0;
    expect(manager.getBlockWrappers("block")).toEqual([Wrapper]);
    expect(manager.getEditorWrappers("block")).toEqual([]);
    expect(manager.getEditorWrappers("edgeless")).toEqual([EditorWrapper]);
    expect(manager.delete("block")).toBe(true);
    expect(manager.delete("block")).toBe(false);
    expect(manager.get("block")).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });
});
