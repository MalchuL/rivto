import { collectGarbage } from "./fixtures/collect-garbage";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "@chulane/rivto-react";

/** Demo access to the document editor owning processor registrations. */
interface ProcessorMemoryWindow extends Window {
  readonly __rivtoDemo: {
    readonly editor: DocumentEditorAPI;
    readonly reactEditor: ReactEditorApi;
  };
}

/** Retained processor cleanup used after disposal or editor destruction. */
interface ProcessorCleanupProbe {
  /**
   * Releases the retained processor registration.
   *
   * @returns The registration is disposed if still active.
   */
  dispose(): void;
}

/**
 * Forces Chromium collection and checks one processor payload reference.
 *
 * @param page - Page holding the probe on its window.
 * @param key - Window property containing the probe.
 * @param direct - Whether the property is the weak reference itself.
 * @returns The probe has been checked and the protocol session detached.
 */
async function expectCollected(page: Page, key: string, direct: boolean): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await collectGarbage(page, session);
  const retained = await page.evaluate(
    ({ key, direct }) => {
      const value = Reflect.get(window, key);
      const reference = (direct ? value : value.payload) as WeakRef<object>;
      return Boolean(reference.deref());
    },
    { key, direct },
  );
  expect(retained).toBe(false);
  await session.detach();
}

for (const kind of ["block", "element"] as const) {
  for (const mode of ["dispose", "destroy"] as const) {
    test(`${mode} releases the ${kind} processor callback`, async ({ page, browserName }) => {
      await page.goto("/?test_features=1");
      await expect(page.locator("[data-block-content]").first()).toBeVisible();
      await page.evaluate(
        async ({ kind, mode }) => {
          const { editor, reactEditor } = (window as unknown as ProcessorMemoryWindow).__rivtoDemo;
          const payload = { bytes: new Uint8Array(1_000_000) };
          const dispose =
            kind === "block"
              ? editor.blocks.registerProcessor({
                  id: "memory-probe",
                  priority: 10,
                  processor: (value) => {
                    void payload.bytes.length;
                    return value;
                  },
                })
              : editor.elements.registerProcessor({
                  id: "memory-probe",
                  priority: 10,
                  processor: (value) => {
                    void payload.bytes.length;
                    return value;
                  },
                });
          Reflect.set(window, "processorMemoryProbe", { dispose, payload: new WeakRef(payload) });
          if (mode === "dispose") {
            dispose();
            dispose();
          } else {
            await reactEditor.destroy();
            editor.destroy();
          }
        },
        { kind, mode },
      );
      if (browserName === "chromium") {
        await expectCollected(page, "processorMemoryProbe", false);
      }
      await page.evaluate(() => {
        const probe = Reflect.get(window, "processorMemoryProbe") as ProcessorCleanupProbe;
        probe.dispose();
      });
    });
  }
}

for (const kind of ["block", "element"] as const) {
  test(`replacing a ${kind} processor releases its old callback`, async ({ page, browserName }) => {
    await page.goto("/?test_features=1");
    await expect(page.locator("[data-block-content]").first()).toBeVisible();
    await page.evaluate((kind) => {
      const { editor } = (window as unknown as ProcessorMemoryWindow).__rivtoDemo;
      const payload = { bytes: new Uint8Array(1_000_000) };
      if (kind === "block") {
        editor.blocks.registerProcessor({
          id: "replacement-probe",
          priority: 10,
          processor: (value) => {
            void payload.bytes.length;
            return value;
          },
        });
      } else {
        editor.elements.registerProcessor({
          id: "replacement-probe",
          priority: 10,
          processor: (value) => {
            void payload.bytes.length;
            return value;
          },
        });
      }
      Reflect.set(window, "replacedProcessorProbe", new WeakRef(payload));
    }, kind);
    await page.evaluate((kind) => {
      const { editor } = (window as unknown as ProcessorMemoryWindow).__rivtoDemo;
      if (kind === "block") {
        editor.blocks.registerProcessor({
          id: "replacement-probe",
          priority: 10,
          processor: (value) => value,
        });
      } else {
        editor.elements.registerProcessor({
          id: "replacement-probe",
          priority: 10,
          processor: (value) => value,
        });
      }
    }, kind);
    if (browserName === "chromium") {
      await expectCollected(page, "replacedProcessorProbe", true);
    }
  });
}
