import { BLOCK_HANDLE_METADATA_KEY } from "../../extensions/built-ins/block-handle/metadata";
import { PAGE_DRAG_METADATA_KEY } from "../../extensions/block-drag/block-drag-options";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { z } from "zod";

test("registers the exact complete definition and publishes metadata through core lifecycle", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const opaque = new Map([["owner", "extension"]]);
  const metadata = {
    [PAGE_DRAG_METADATA_KEY]: { fixed: true, dropAxis: "horizontal" },
    [BLOCK_HANDLE_METADATA_KEY]: { showOnContainerHover: true },
    custom: { values: [1, 2], opaque },
  };
  const definition = { type: "complete", metadata };
  const observed: unknown[] = [];
  const unsubscribe = panel.editor.blockTypes.subscribe(() => {
    observed.push(panel.editor.blockTypes.getDefinition("complete")?.metadata);
  });
  try {
    const release = panel.editor.blockTypes.register({
      definition,
      render: () => null,
    });
    expect(core.blockRegistry.get("complete")).toBe(definition);
    expect(panel.editor.blockTypes.getDefinition("complete")?.metadata).toBe(metadata);
    expect(observed).toEqual([metadata]);
    expect(metadata.custom.opaque).toBe(opaque);
    expect(metadata.custom.values).toEqual([1, 2]);
    release();
    release();
    expect(core.blockRegistry.has("complete")).toBe(false);
    expect(panel.editor.renderers.has("complete")).toBe(false);
    expect(observed).toEqual([metadata, undefined]);
    expect(definition.metadata).toBe(metadata);
  } finally {
    unsubscribe();
    panel.editor.destroy();
    await core.destroy();
  }
});

test("rejects a definition already owned by core without installing presentation or changing metadata", async () => {
  const core = await createTestCoreEditor();
  const metadata = { custom: { values: [1, 2] } };
  const definition = { type: "existing", title: "Existing", metadata };
  core.blockRegistry.defineBlock(definition);
  const panel = createTestReactEditor({ editor: core });
  try {
    expect(() =>
      panel.editor.blockTypes.register({
        definition: { type: "existing", metadata: { custom: { values: [3] } } },
        render: () => null,
        slashCommand: { title: "Conflict" },
        separatesBlockElements: true,
      }),
    ).toThrow("Block type existing is already registered");
    expect(core.blockRegistry.get("existing")).toBe(definition);
    expect(definition.metadata).toBe(metadata);
    expect(metadata).toEqual({ custom: { values: [1, 2] } });
    expect(panel.editor.renderers.has("existing")).toBe(false);
    expect(panel.editor.blockTypes.separatesBlockElements("existing")).toBe(false);
    expect(panel.editor.slashCommands.get("type.existing")).toBeUndefined();
    panel.editor.destroy();
    expect(core.blockRegistry.get("existing")).toBe(definition);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

test("rejects another runtime registering the same type and allows a new owner after release", async () => {
  const core = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: core });
  const second = createTestReactEditor({ editor: core });
  const definition = { type: "owned", metadata: { owner: "first" } };
  try {
    const release = first.editor.blockTypes.register({
      definition,
      render: () => null,
    });
    expect(() =>
      second.editor.blockTypes.register({
        definition: { type: "owned", metadata: { owner: "second" } },
        render: () => null,
      }),
    ).toThrow("Block type owned is already registered");
    expect(core.blockRegistry.get("owned")).toBe(definition);
    expect(first.editor.renderers.has("owned")).toBe(true);
    expect(second.editor.renderers.has("owned")).toBe(false);
    release();
    second.editor.blockTypes.register({
      definition: { type: "owned", metadata: { owner: "second" } },
      render: () => null,
    });
    release();
    first.editor.destroy();
    expect(core.blockRegistry.get("owned")?.metadata).toEqual({
      owner: "second",
    });
  } finally {
    first.editor.destroy();
    second.editor.destroy();
    await core.destroy();
  }
});

test("failed slash registration removes its complete definition and leaves other types active", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.editor.blockTypes.register({
    definition: { type: "active", metadata: { owner: "active" } },
    render: () => null,
  });
  panel.editor.slashCommands.register({
    id: "conflict",
    title: "Conflict",
    execute: () => undefined,
  });
  try {
    expect(() =>
      panel.editor.blockTypes.register({
        definition: { type: "failed", metadata: { owner: "failed" } },
        render: () => null,
        slashCommand: { id: "conflict", title: "Duplicate" },
        separatesBlockElements: true,
      }),
    ).toThrow();
    expect(core.blockRegistry.has("failed")).toBe(false);
    expect(panel.editor.renderers.has("failed")).toBe(false);
    expect(panel.editor.blockTypes.separatesBlockElements("failed")).toBe(false);
    expect(core.blockRegistry.get("active")?.metadata).toEqual({
      owner: "active",
    });
    panel.editor.blockTypes.register({
      definition: { type: "failed" },
      render: () => null,
    });
    expect(core.blockRegistry.has("failed")).toBe(true);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

test("a stale registration disposer does not remove a replacement definition", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  try {
    const release = panel.editor.blockTypes.register({
      definition: { type: "replace", metadata: { owner: "old" } },
      render: () => null,
    });
    expect(panel.editor.blockTypes.delete("replace")).toBe(true);
    const replacement = { type: "replace", metadata: { owner: "new" } };
    core.blockRegistry.defineBlock(replacement);
    release();
    panel.editor.destroy();
    expect(core.blockRegistry.get("replace")).toBe(replacement);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

test.each(["dispose", "delete", "destroy"] as const)(
  "%s releases its definition when a lifecycle observer throws and permits fresh model rules",
  async (operation) => {
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const release = panel.editor.blockTypes.register({
      definition: {
        type: "owned",
        metadata: { owner: "old" },
        defaultProps: { value: false },
        propSchema: z.object({ value: z.boolean() }),
      },
      render: () => null,
    });
    const observerError = new Error("Definition observer failed");
    const unsubscribe = panel.editor.blockTypes.subscribe(() => {
      throw observerError;
    });
    const cleanup = {
      dispose: release,
      delete: () => panel.editor.blockTypes.delete("owned"),
      destroy: () => panel.editor.destroy(),
    };
    try {
      expect(cleanup[operation]).toThrow(observerError);
      expect(panel.editor.renderers.has("owned")).toBe(false);
      expect(core.blockRegistry.has("owned")).toBe(false);
      expect(release).not.toThrow();
      unsubscribe();
      const replacement = createTestReactEditor({ editor: core });
      try {
        replacement.editor.blockTypes.register({
          definition: {
            type: "owned",
            defaultProps: { value: "fresh" },
            propSchema: z.object({ value: z.string() }),
          },
          render: () => null,
        });
        expect(core.blockRegistry.prepare({ type: "owned" }).props).toEqual({
          value: "fresh",
        });
        expect(() => core.blockRegistry.validate("owned", { value: false })).toThrow();
      } finally {
        replacement.editor.destroy();
      }
    } finally {
      unsubscribe();
      panel.editor.destroy();
      await core.destroy();
    }
  },
);

test("an observer rejecting the initial definition publication leaves no installed resources", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const observerError = new Error("Initial observer failed");
  const unsubscribe = panel.editor.blockTypes.subscribe(() => {
    if (core.blockRegistry.get("owned")?.metadata) {
      throw observerError;
    }
  });
  try {
    expect(() =>
      panel.editor.blockTypes.register({
        definition: { type: "owned", metadata: { owner: "failed" } },
        render: () => null,
      }),
    ).toThrow(observerError);
    expect(core.blockRegistry.has("owned")).toBe(false);
    expect(panel.editor.renderers.has("owned")).toBe(false);
  } finally {
    unsubscribe();
    panel.editor.destroy();
    await core.destroy();
  }
});

test("rollback releases definitions and preserves setup and observer errors", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.editor.slashCommands.register({
    id: "conflict",
    title: "Conflict",
    execute: () => undefined,
  });
  const observerError = new Error("Definition observer failed");
  let published = false;
  const unsubscribe = panel.editor.blockTypes.subscribe(() => {
    if (published) {
      throw observerError;
    }
    published = true;
  });
  let failure: unknown;
  try {
    panel.editor.blockTypes.register({
      definition: { type: "owned", metadata: { owner: "test" } },
      render: () => null,
      slashCommand: { id: "conflict", title: "Duplicate" },
    });
  } catch (error) {
    failure = error;
  } finally {
    unsubscribe();
    panel.editor.destroy();
    await core.destroy();
  }
  expect(core.blockRegistry.has("owned")).toBe(false);
  expect(panel.editor.renderers.has("owned")).toBe(false);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([
    expect.objectContaining({ message: expect.stringContaining("conflict") }),
    observerError,
  ]);
});

test.each([1, 200])(
  "destroy releases all %s complete definitions despite observer failures",
  async (count) => {
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const types = Array.from({ length: count }, (_, index) => `owned-${index}`);
    for (const type of types) {
      panel.editor.blockTypes.register({
        definition: { type, metadata: { owner: "test" } },
        render: () => null,
      });
    }
    let notifications = 0;
    const unsubscribe = panel.editor.blockTypes.subscribe(() => {
      notifications++;
      throw new Error("Observer failed");
    });
    try {
      expect(() => panel.editor.destroy()).toThrow();
      expect(types.filter((type) => core.blockRegistry.has(type))).toEqual([]);
      expect(types.filter((type) => panel.editor.renderers.has(type))).toEqual([]);
      expect(notifications).toBe(count);
      expect(() => panel.editor.destroy()).not.toThrow();
      expect(notifications).toBe(count);
    } finally {
      unsubscribe();
      panel.editor.destroy();
      await core.destroy();
    }
  },
);

test.each([1, 200])(
  "destroy removes subscriptions from %s closed presentations without disconnecting a survivor",
  async (count) => {
    const core = await createTestCoreEditor();
    const survivor = createTestReactEditor({ editor: core });
    let closedNotifications = 0;
    let liveNotifications = 0;
    const releases: Array<() => void> = [];
    const releaseSurvivor = survivor.editor.blockTypes.subscribe(() => {
      liveNotifications++;
    });
    try {
      for (let index = 0; index < count; index++) {
        const closed = createTestReactEditor({ editor: core });
        releases.push(
          closed.editor.blockTypes.subscribe(() => {
            closedNotifications++;
          }),
        );
        closed.editor.destroy();
      }
      survivor.editor.blockTypes.register({
        definition: { type: "shared", metadata: { owner: "survivor" } },
        render: () => null,
      });
      expect(core.blockRegistry.get("shared")?.metadata).toEqual({
        owner: "survivor",
      });
      expect(liveNotifications).toBe(1);
      expect(closedNotifications).toBe(0);
      core.blockRegistry.defineBlock({ type: "later" });
      expect(liveNotifications).toBe(2);
      expect(closedNotifications).toBe(0);
    } finally {
      for (const release of releases) {
        release();
        release();
      }
      releaseSurvivor();
      survivor.editor.destroy();
      await core.destroy();
    }
  },
);

test("destroy rejects new block-type subscriptions while the borrowed core remains active", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.editor.destroy();
  try {
    expect(() => panel.editor.blockTypes.subscribe(() => undefined)).toThrow(
      "React editor is destroyed",
    );
    expect(core.blockRegistry.has("paragraph")).toBe(true);
  } finally {
    await core.destroy();
  }
});

test("destroy keeps another presentation's subscription to the same callback active", async () => {
  const core = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: core });
  const second = createTestReactEditor({ editor: core });
  let notifications = 0;
  /**
   * Counts changes observed through either presentation.
   *
   * @returns After recording one notification.
   */
  const listener = () => {
    notifications++;
  };
  const releaseFirst = first.editor.blockTypes.subscribe(listener);
  const releaseSecond = second.editor.blockTypes.subscribe(listener);
  try {
    first.editor.destroy();
    second.editor.blockTypes.register({
      definition: { type: "shared", metadata: { owner: "second" } },
      render: () => null,
    });
    expect(notifications).toBe(1);
    core.blockRegistry.defineBlock({ type: "later" });
    expect(notifications).toBe(2);
  } finally {
    releaseFirst();
    releaseSecond();
    first.editor.destroy();
    second.editor.destroy();
    await core.destroy();
  }
});

test("failed destruction still disconnects metadata and definition observers", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.editor.blockTypes.register({
    definition: { type: "shared", metadata: { owner: "closed" } },
    render: () => null,
  });
  const observerError = new Error("Observer failed");
  const release = panel.editor.blockTypes.subscribe(() => {
    throw observerError;
  });
  try {
    expect(() => panel.editor.destroy()).toThrow(observerError);
    expect(core.blockRegistry.get("shared")?.metadata).toBeUndefined();
    expect(() => core.blockRegistry.defineBlock({ type: "later" })).not.toThrow();
    const survivor = createTestReactEditor({ editor: core });
    try {
      expect(() =>
        survivor.editor.blockTypes.register({
          definition: { type: "shared", metadata: { owner: "live" } },
          render: () => null,
        }),
      ).not.toThrow();
      expect(core.blockRegistry.get("shared")?.metadata).toEqual({
        owner: "live",
      });
    } finally {
      survivor.editor.destroy();
    }
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
  }
});
