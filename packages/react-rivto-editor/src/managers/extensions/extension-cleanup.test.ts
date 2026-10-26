const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import type { ComponentType } from "react";
import { ReactEditor } from "../../editor/react-editor";
import { createTestCoreEditor as createEditor } from "../../test-utils";

const Mounted: ComponentType = () => null;

let core: Awaited<ReturnType<typeof createEditor>>;
let runtime: ReactEditor;

beforeEach(async () => {
  core = await createEditor();
  runtime = new ReactEditor({ editor: core });
});

afterEach(async () => {
  jestApi.restoreAllMocks();
  try {
    runtime.destroy();
  } catch {
    // Failure-injection assertions exercise the errors; still release the fixture model.
  }
  await core.destroy();
});

test("removes an installation once without affecting a later reuse of its ID", () => {
  const cleanup = jestApi.fn();
  const remove = runtime.extensions.install({ id: "reused", setup: () => cleanup });
  remove();
  const replacement = jestApi.fn();
  const removeReplacement = runtime.extensions.install({
    id: "reused",
    setup: () => replacement,
  });
  remove();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(() => runtime.extensions.install({ id: "reused", setup: () => {} })).toThrow(/registered/);
  removeReplacement();
  expect(replacement).toHaveBeenCalledTimes(1);
});

test("captures nested installations and resumes the parent's registration scope", () => {
  const released: string[] = [];
  const remove = runtime.extensions.install({
    id: "parent",
    setup: ({ extensions }) => {
      extensions.registerCleanup(() => released.push("before"));
      extensions.install({
        id: "child",
        setup: () => {
          extensions.mount(Mounted);
          extensions.registerCleanup(() => released.push("child registration"));
          return () => released.push("child cleanup");
        },
      });
      extensions.mount(Mounted);
      extensions.registerCleanup(() => released.push("after"));
      return () => released.push("parent cleanup");
    },
  });
  remove();
  expect(released).toEqual([
    "parent cleanup",
    "after",
    "child cleanup",
    "child registration",
    "before",
  ]);
  expect(runtime.extensions.getComponents()).toEqual([]);
  expect(() => runtime.extensions.install({ id: "child", setup: () => {} })).not.toThrow();
});

test("attempts every owned cleanup and reports custom and registration failures", () => {
  const customError = new Error("custom cleanup");
  const resourceError = new Error("resource cleanup");
  const remaining = jestApi.fn();
  const remove = runtime.extensions.install({
    id: "errors",
    setup: ({ extensions }) => {
      extensions.registerCleanup(remaining);
      extensions.registerCleanup(() => {
        throw resourceError;
      });
      return () => {
        throw customError;
      };
    },
  });
  expect(remove).toThrow(expect.objectContaining({ errors: [customError, resourceError] }));
  expect(remaining).toHaveBeenCalledTimes(1);
  expect(remove).not.toThrow();
});

test("rolls back nested installations and preserves setup and release failures", () => {
  const setupError = new Error("setup failed");
  const releaseError = new Error("release failed");
  const childCleanup = jestApi.fn();
  expect(() =>
    runtime.extensions.install({
      id: "failed parent",
      setup: ({ extensions }) => {
        extensions.install({ id: "nested", setup: () => childCleanup });
        extensions.registerCleanup(() => {
          throw releaseError;
        });
        throw setupError;
      },
    }),
  ).toThrow(expect.objectContaining({ errors: [setupError, releaseError] }));
  expect(childCleanup).toHaveBeenCalledTimes(1);
  expect(() => runtime.extensions.install({ id: "nested", setup: () => {} })).not.toThrow();
  expect(() => runtime.extensions.install({ id: "failed parent", setup: () => {} })).not.toThrow();
});

test("continues destroying shared managers after an earlier manager throws", () => {
  const failure = new Error("slash teardown");
  jestApi.spyOn(runtime.slashCommands, "destroy").mockImplementation(() => {
    throw failure;
  });
  const contextMenu = jestApi.spyOn(runtime.blockContextMenu, "destroy");
  const keyboard = jestApi.spyOn(runtime.keyboard, "destroy");
  const events = jestApi.spyOn(runtime.events, "destroy");
  const panels = jestApi.spyOn(runtime.panels, "destroy");
  expect(() => runtime.destroy()).toThrow(failure);
  for (const cleanup of [contextMenu, keyboard, events, panels]) {
    expect(cleanup).toHaveBeenCalledTimes(1);
  }
});

test("retains constructor setup failure when destruction also fails", () => {
  const setupError = new Error("construction setup");
  const cleanupError = new Error("construction cleanup");
  expect(
    () =>
      new ReactEditor({
        editor: core,
        extensions: [
          {
            id: "first",
            setup: () => () => {
              throw cleanupError;
            },
          },
          {
            id: "second",
            setup: () => {
              throw setupError;
            },
          },
        ],
      }),
  ).toThrow(expect.objectContaining({ errors: [setupError, cleanupError] }));
});

test.each([undefined, false])("reports a falsy thrown cleanup value: %s", (failure) => {
  const remove = runtime.extensions.install({
    id: "falsy",
    setup: () => () => {
      throw failure;
    },
  });
  let thrown = false;
  try {
    remove();
  } catch (error) {
    thrown = true;
    expect(error).toBe(failure);
  }
  expect(thrown).toBe(true);
  expect(remove).not.toThrow();
});

test("permits reentrant removal without rerunning custom cleanup", () => {
  const cleanup = jestApi.fn((): void => remove());
  const remove = runtime.extensions.install({ id: "reentrant", setup: () => cleanup });
  remove();
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test("restores parent ownership after it catches a failed child setup", () => {
  const released: string[] = [];
  const remove = runtime.extensions.install({
    id: "surviving parent",
    setup: ({ extensions }) => {
      expect(() =>
        extensions.install({
          id: "failed child",
          setup: () => {
            extensions.registerCleanup(() => released.push("child"));
            throw new Error("child setup");
          },
        }),
      ).toThrow("child setup");
      extensions.registerCleanup(() => released.push("parent"));
    },
  });
  expect(released).toEqual(["child"]);
  remove();
  expect(released).toEqual(["child", "parent"]);
});

test("rolls back resources when JavaScript setup returns invalid cleanup", () => {
  const released = jestApi.fn();
  expect(() =>
    runtime.extensions.install({
      id: "invalid cleanup",
      // @ts-expect-error Exercise the runtime contract for an untyped extension.
      setup: ({ extensions }) => {
        extensions.registerCleanup(released);
        return false;
      },
    }),
  ).toThrow(/synchronous cleanup/);
  expect(released).toHaveBeenCalledTimes(1);
  expect(() =>
    runtime.extensions.install({ id: "invalid cleanup", setup: () => {} }),
  ).not.toThrow();
});
