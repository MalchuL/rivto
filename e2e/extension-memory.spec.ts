import { collectGarbage } from "./fixtures/collect-garbage";
import { expect, test } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";

/** Weak references held alongside completed extension cleanups. */
interface ExtensionMemoryProbe {
  readonly registrationPayload: WeakRef<object>;
  readonly extensionPayload: WeakRef<object>;
}

/** Demo access to the live React editor. */
interface ExtensionMemoryWindow extends Window {
  readonly __rivtoDemo: { readonly reactEditor: ReactEditorApi };
}

/**
 * Retains completed cleanups separately from their callback data.
 *
 * @returns The active editor's extension revision after repeated cleanup calls.
 */
function createExtensionMemoryProbe(): number {
  const editor = (window as unknown as ExtensionMemoryWindow).__rivtoDemo.reactEditor;
  const registrationData = { bytes: new Uint8Array(1_000_000) };
  let registrationCleanup: (() => void) | undefined;
  const parentCleanup = editor.extensions.install({
    id: "browser-memory-parent",
    setup: ({ extensions }) => {
      registrationCleanup = extensions.registerCleanup(() => void registrationData.bytes.length);
    },
  });
  registrationCleanup!();
  const extensionData = { bytes: new Uint8Array(1_000_000) };
  const extensionCleanup = editor.extensions.install({
    id: "browser-memory-extension",
    setup: ({ extensions }) => {
      extensions.registerCleanup(() => void extensionData.bytes.length);
    },
  });
  extensionCleanup();
  Reflect.set(window, "extensionMemoryProbe", {
    parentCleanup,
    registrationCleanup,
    extensionCleanup,
    registrationPayload: new WeakRef(registrationData),
    extensionPayload: new WeakRef(extensionData),
  });
  registrationCleanup!();
  extensionCleanup();
  return editor.extensions.revision;
}

test("completed extension cleanups release their callback data", async ({ page, browserName }) => {
  await page.goto("/?test_features=1");
  await expect(page.locator("[data-block-content]").first()).toBeVisible();
  const result = await page.evaluate(createExtensionMemoryProbe);
  expect(result).toBeGreaterThanOrEqual(0);
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await collectGarbage(page, session);
    const retained = await page.evaluate(() => {
      const probe = Reflect.get(window, "extensionMemoryProbe") as ExtensionMemoryProbe;
      return {
        registration: Boolean(probe.registrationPayload.deref()),
        extension: Boolean(probe.extensionPayload.deref()),
      };
    });
    expect(retained).toEqual({ registration: false, extension: false });
    await session.detach();
  }
});

for (const owner of ["runtime", "panel"] as const) {
  test(`completed ${owner} cleanup releases its callback data`, async ({ page, browserName }) => {
    await page.goto("/?test_features=1");
    await expect(page.locator("[data-block-content]").first()).toBeVisible();
    await page.evaluate((owner) => {
      const editor = (window as unknown as ExtensionMemoryWindow).__rivtoDemo.reactEditor;
      const payload = { bytes: new Uint8Array(1_000_000) };
      const target = owner === "runtime" ? editor : editor.panels.getDefault()!;
      const cleanup = target.registerCleanup(() => void payload.bytes.length);
      cleanup();
      cleanup();
      Reflect.set(window, "runtimeMemoryProbe", { cleanup, payload: new WeakRef(payload) });
    }, owner);
    if (browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      await collectGarbage(page, session);
      const retained = await page.evaluate(() => {
        const probe = Reflect.get(window, "runtimeMemoryProbe") as { payload: WeakRef<object> };
        return Boolean(probe.payload.deref());
      });
      expect(retained).toBe(false);
      await session.detach();
    }
  });
}

test("completed revision subscription releases its listener data", async ({
  page,
  browserName,
}) => {
  await page.goto("/?test_features=1");
  await expect(page.locator("[data-block-content]").first()).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as ExtensionMemoryWindow).__rivtoDemo.reactEditor;
    const payload = { bytes: new Uint8Array(1_000_000) };
    const unsubscribe = editor.extensions.subscribe(() => void payload.bytes.length);
    unsubscribe();
    unsubscribe();
    Reflect.set(window, "revisionMemoryProbe", { unsubscribe, payload: new WeakRef(payload) });
  });
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await collectGarbage(page, session);
    const retained = await page.evaluate(() => {
      const probe = Reflect.get(window, "revisionMemoryProbe") as { payload: WeakRef<object> };
      return Boolean(probe.payload.deref());
    });
    expect(retained).toBe(false);
    await session.detach();
  }
});

test("destroyed runtime releases a retained revision subscription", async ({
  page,
  browserName,
}) => {
  await page.goto("/?test_features=1");
  await expect(page.locator("[data-block-content]").first()).toBeVisible();
  await page.evaluate(async () => {
    const editor = (window as unknown as ExtensionMemoryWindow).__rivtoDemo.reactEditor;
    const payload = { bytes: new Uint8Array(1_000_000) };
    const unsubscribe = editor.extensions.subscribe(() => void payload.bytes.length);
    Reflect.set(window, "revisionMemoryProbe", { unsubscribe, payload: new WeakRef(payload) });
    await editor.destroy();
  });
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await collectGarbage(page, session);
    const retained = await page.evaluate(() => {
      const probe = Reflect.get(window, "revisionMemoryProbe") as { payload: WeakRef<object> };
      return Boolean(probe.payload.deref());
    });
    expect(retained).toBe(false);
    await session.detach();
  }
});

test("duplicate revision subscriptions do not retain abandoned handles", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Heap measurement requires the Chromium protocol");
  await page.goto("/?test_features=1");
  await expect(page.locator("[data-block-content]").first()).toBeVisible();
  const session = await page.context().newCDPSession(page);
  await session.send("HeapProfiler.collectGarbage");
  const before = await session.send("Runtime.getHeapUsage");
  await page.evaluate(() => {
    const editor = (window as unknown as ExtensionMemoryWindow).__rivtoDemo.reactEditor;
    const listener = () => {};
    for (let index = 0; index < 100_000; index++) {
      editor.extensions.subscribe(listener);
    }
  });
  await page.waitForTimeout(0);
  await session.send("HeapProfiler.collectGarbage");
  const after = await session.send("Runtime.getHeapUsage");
  expect(after.usedSize - before.usedSize).toBeLessThan(3_000_000);
  await session.detach();
});

test("a live revision subscription remains callable after garbage collection", async ({
  page,
  browserName,
}) => {
  await page.goto("/?test_features=1");
  await expect(page.locator("[data-block-content]").first()).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as ExtensionMemoryWindow).__rivtoDemo.reactEditor;
    Reflect.set(window, "revisionCalls", 0);
    const unsubscribe = editor.extensions.subscribe(() => {
      Reflect.set(window, "revisionCalls", Number(Reflect.get(window, "revisionCalls")) + 1);
    });
    Reflect.set(window, "revisionUnsubscribe", unsubscribe);
  });
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await page.waitForTimeout(0);
    await session.send("HeapProfiler.collectGarbage");
    await session.detach();
  }
  const calls = await page.evaluate(() => {
    const editor = (window as unknown as ExtensionMemoryWindow).__rivtoDemo.reactEditor;
    const remove = editor.extensions.mount(() => null);
    const count = Number(Reflect.get(window, "revisionCalls"));
    remove();
    (Reflect.get(window, "revisionUnsubscribe") as () => void)();
    return count;
  });
  expect(calls).toBe(1);
});
