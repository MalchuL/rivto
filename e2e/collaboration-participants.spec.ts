import { expect, test } from "@playwright/test";
import type { CollaborationParticipant, DocumentEditorAPI } from "@chulane/rivto";

declare global {
  interface Window {
    __participantTest: { first: CollaborationParticipant; second: CollaborationParticipant };
  }
}

for (const repeat of [0, 200]) {
  for (const mode of ["Page", "Edgeless"] as const) {
    test(`human and two local agents keep independent presence in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      await page.goto(`/?sync=1&repeat=${repeat}&room=agents-${crypto.randomUUID()}`);
      const left = page.locator('[data-editor-sync="left"]');
      const right = page.locator('[data-editor-sync="right"]');
      await expect(right.locator("[data-block-content]")).toHaveCount(2 + repeat);
      if (mode === "Edgeless") {
        await left.getByRole("button", { name: mode, exact: true }).click();
        await right.getByRole("button", { name: mode, exact: true }).click();
      }
      await left.locator("[data-block-content]").first().click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("Shift+ArrowRight");
      await page.evaluate(() => {
        const { left } = (
          window as unknown as { __rivtoSync: { left: { editor: DocumentEditorAPI } } }
        ).__rivtoSync;
        const editor = left.editor;
        const first = editor.collaboration.registerParticipant({
          id: "reviewer",
          user: { id: "ai", name: "Reviewer", color: "#16a34a" },
        });
        const second = editor.collaboration.registerParticipant({
          id: "writer",
          user: { id: "ai", name: "Writer", color: "#2563eb" },
        });
        const ids = editor.blocks.getRootIds();
        first.setSelection({ type: "selection", blocks: [{ id: ids[0]!, start: 0, end: 2 }] });
        second.setSelection({ type: "selection", blocks: [{ id: ids[1]!, start: 0, end: 2 }] });
        window.__participantTest = { first, second };
      });
      const carets = page.locator('[data-collaboration-kind="caret"]');
      await expect(carets.filter({ hasText: "Reviewer" })).toHaveCount(2);
      await expect(carets.filter({ hasText: "Writer" })).toHaveCount(2);
      await expect(carets.filter({ hasText: "Vlad" })).toHaveCount(1);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const samples: { synchronous: number; rendered: number; writes: number }[] = [];
      for (let index = 0; index < 6; index++) {
        samples.push(
          await page.evaluate(
            async ({ mode, index }) => {
              const peers = (
                window as unknown as { __rivtoSync: Record<string, { editor: DocumentEditorAPI }> }
              ).__rivtoSync;
              let writes = 0;
              const stops = Object.values(peers).map(({ editor }) =>
                editor.getDocument().subscribe(() => writes++),
              );
              const started = performance.now();
              const first = window.__participantTest.first;
              if (mode === "Edgeless") {
                first.setPointer({ type: "canvas", x: 80 + index * 10, y: 40 });
              } else {
                first.setPointer({
                  type: "block",
                  blockId: peers.left!.editor.blocks.getRootIds()[0]!,
                  x: 0.1 + index * 0.05,
                  y: 0.5,
                });
              }
              const synchronous = performance.now() - started;
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              );
              stops.forEach((stop) => stop());
              return { synchronous, rendered: performance.now() - started, writes };
            },
            { mode, index },
          ),
        );
        await expect(
          page.locator('[data-collaboration-kind="pointer"]').filter({ hasText: "Reviewer" }),
        ).toHaveCount(2);
        await expect(carets.filter({ hasText: "Writer" })).toHaveCount(2);
      }
      expect(samples.every((sample) => sample.writes === 0)).toBe(true);
      console.log(JSON.stringify({ participants: 3, mode, repeat, samples: samples.slice(1) }));

      await right.locator("[data-block-content]").nth(1).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("Shift+ArrowRight");
      await expect(carets).toHaveCount(6);
      // Native focus loss withdraws only the human registrations, not headless agents.
      await page.evaluate(() => {
        Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false });
        window.dispatchEvent(new Event("blur"));
      });
      await expect(carets).toHaveCount(4);
      await page.evaluate(() => window.__participantTest.first.dispose());
      await expect(carets.filter({ hasText: "Reviewer" })).toHaveCount(0);
      await expect(carets.filter({ hasText: "Writer" })).toHaveCount(2);
      await page.evaluate(() => window.__participantTest.second.clear());
      await expect(carets).toHaveCount(0);
      await page.evaluate(() => {
        const { left } = (
          window as unknown as { __rivtoSync: { left: { editor: DocumentEditorAPI } } }
        ).__rivtoSync;
        window.__participantTest.second.setSelection({
          type: "selection",
          blocks: [{ id: left.editor.blocks.getRootIds()[1]!, start: 2, end: 4 }],
        });
      });
      await expect(carets.filter({ hasText: "Writer" })).toHaveCount(2);
      await page.evaluate(() => window.__participantTest.second.dispose());
      await expect(page.locator("[data-collaboration-kind]")).toHaveCount(0);
      await expect(page.locator("[data-collaboration-text]")).toHaveCount(0);
    });
  }
}
