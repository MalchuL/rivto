/**
 * Generic priority-ordered processing pipe.
 *
 * @module
 */
import { Pipe } from "./pipe";
import type { PipeProcessor } from "./pipe";

describe("Pipe", () => {
  test("processes in priority order, replaces by id, and unregisters", () => {
    const pipe = new Pipe<number, string>();
    expect(pipe.process(1, "ctx")).toBe(1);

    const addTen: PipeProcessor<number, string> = {
      id: "add-ten",
      priority: 20,
      processor: (value) => value + 10,
    };
    const timesTwo: PipeProcessor<number, string> = {
      id: "times-two",
      priority: 10,
      processor: (value) => value * 2,
    };
    const tag: PipeProcessor<number, string> = {
      id: "tag",
      priority: 30,
      processor: (value, context) => (context === "ctx" ? value : -1),
    };

    const disposeTimesTwo = pipe.register(timesTwo);
    pipe.register(addTen);
    pipe.register(tag);
    expect(pipe.process(3, "ctx")).toBe(16);

    pipe.register({
      id: "add-ten",
      priority: 20,
      processor: (value) => value + 1,
    });
    expect(pipe.process(3, "ctx")).toBe(7);

    expect(pipe.unregister("tag")).toBe(true);
    expect(pipe.unregister("tag")).toBe(false);
    expect(pipe.process(3, "ctx")).toBe(7);

    disposeTimesTwo();
    expect(pipe.process(3, "ctx")).toBe(4);
  });

  test("rejects an empty processor id", () => {
    const pipe = new Pipe<number>();
    expect(() => pipe.register({
      id: "",
      priority: 0,
      processor: (value) => value,
    })).toThrow("Pipe processor id is required");
  });
});
