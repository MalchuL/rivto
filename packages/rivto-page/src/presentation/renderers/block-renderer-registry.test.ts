import { BlockEditorController } from "../../editor/block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";

it("retains component identity, isolates duplicate callbacks, and protects replacement ownership", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const registry = editor.renderers;
  const changed = jest.fn();
  const stop = registry.subscribe(changed);
  const stopDuplicate = registry.subscribe(changed);
  const Component = () => null;
  const first = registry.register("text", { content: Component });
  expect(registry.get("text")?.content).toBe(Component);
  expect(registry.get("unknown")).toBeUndefined();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(() => registry.register("text", { content: Component })).toThrow("duplicate");
  expect(() => registry.register(" ", { content: Component })).toThrow("Invalid");
  stop();
  first();
  expect(changed).toHaveBeenCalledTimes(3);
  const second = registry.register("text", { content: Component });
  first();
  expect(registry.get("text")?.content).toBe(Component);
  expect(changed).toHaveBeenCalledTimes(4);
  stopDuplicate();
  second();
  expect(registry.get("text")).toBeUndefined();
  expect(changed).toHaveBeenCalledTimes(4);
  editor.destroy();
  expect(() => registry.subscribe(changed)).toThrow("destroyed");
});

it("rolls back direct installation when an observer fails and still notifies healthy observers", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const stop = editor.renderers.subscribe(() => {
    throw new Error("observer failed");
  });
  const healthy = jest.fn();
  editor.renderers.subscribe(healthy);
  expect(() => editor.renderers.register("text", { content: () => null })).toThrow(AggregateError);
  expect(editor.renderers.get("text")).toBeUndefined();
  expect(healthy).toHaveBeenCalledTimes(2);
  stop();
  editor.renderers.register("text", { content: () => null });
  editor.destroy();
});

it("captures content and layout identities without exposing caller mutation or allocating lookup records", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const Content = () => null;
  const Layout = () => null;
  const registration = { content: Content, layout: Layout };
  editor.renderers.register("text", registration);
  const captured = editor.renderers.get("text");
  registration.content = () => null;
  registration.layout = () => null;
  expect(editor.renderers.get("text")).toBe(captured);
  expect(captured).toEqual({ content: Content, layout: Layout });
  expect(Object.isFrozen(captured)).toBe(true);
  editor.destroy();
});
