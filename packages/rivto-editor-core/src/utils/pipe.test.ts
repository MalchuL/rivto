/** Verifies editor-owned processor ordering, replacement, and disposal. */
import { Pipe } from "./pipe";

describe("editor Pipe", () => {
  test("orders processors and disposes only the active same-id registration", () => {
    const pipe = new Pipe<number>();
    const disposeDouble = pipe.register({ id: "double", priority: 0, processor: (value) => value * 2 });
    const disposeAdd = pipe.register({ id: "add", priority: 10, processor: (value) => value + 1 });
    const disposeReplacement = pipe.register({ id: "add", priority: 10, processor: (value) => value + 2 });

    expect(pipe.process(2, undefined)).toBe(6);
    disposeAdd();
    expect(pipe.process(2, undefined)).toBe(6);
    disposeReplacement();
    expect(pipe.process(2, undefined)).toBe(4);
    disposeDouble();
    expect(pipe.process(2, undefined)).toBe(2);
  });

  test("rejects empty processor identifiers", () => {
    const pipe = new Pipe<number>();
    expect(() => pipe.register({ id: "", priority: 0, processor: (value) => value }))
      .toThrow("Pipe processor id is required");
  });

  test("gets and deletes processors by id", () => {
    const pipe = new Pipe<number>();
    const processor = { id: "double", priority: 0, processor: (value: number) => value * 2 };
    const dispose = pipe.register(processor);

    expect(pipe.get("double")).toBe(processor);
    expect(pipe.get("missing")).toBeUndefined();
    expect(pipe.delete("double")).toBe(true);
    expect(pipe.delete("double")).toBe(false);
    expect(pipe.process(2, undefined)).toBe(2);
    dispose();
  });
});
