import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`extends both arrowhead tips equally beyond connector endpoints, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await page.locator(".edgeless-viewport").evaluate((element) => element.scrollIntoView());
    const ids = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
      editor.elements.insertElement({
        type: "rectangle",
        frame: { x: 100, y: 100, width: 600, height: 500 },
        props: { fill: "#ffffff" },
        zIndex: 10000,
      });
      return [
        [200, 200, 400, 200],
        [400, 300, 200, 300],
        [550, 200, 550, 450],
        [200, 440, 400, 560],
      ].map(
        ([sx, sy, tx, ty]) =>
          editor.elements.insertElement({
            type: "connector",
            frame: {
              x: Math.min(sx!, tx!),
              y: Math.min(sy!, ty!),
              width: Math.max(1, Math.abs(tx! - sx!)),
              height: Math.max(1, Math.abs(ty! - sy!)),
            },
            props: {
              stroke: "#123456",
              strokeWidth: 4,
              startStyle: "arrow",
              endStyle: "arrow",
              source: { anchor: { x: 0.5, y: 0.5 }, position: { x: sx, y: sy } },
              target: { anchor: { x: 0.5, y: 0.5 }, position: { x: tx, y: ty } },
            },
            zIndex: 10001,
          }).id,
      );
    });
    await expect(page.locator(`[data-edgeless-object-id="${ids.at(-1)}"]`)).toBeVisible();
    const endpoints = await page.evaluate(
      (ids) =>
        ids.flatMap((id) => {
          const path = document.querySelector<SVGPathElement>(
            `[data-edgeless-object-id="${id}"] .edgeless-connector-stroke`,
          )!;
          const length = path.getTotalLength();
          return [0, length].map((distance) => {
            const local = path.getPointAtLength(distance);
            const inner = path.getPointAtLength(distance === 0 ? 1 : length - 1);
            const point = local.matrixTransform(path.getScreenCTM()!);
            const inside = inner.matrixTransform(path.getScreenCTM()!);
            const magnitude = Math.hypot(point.x - inside.x, point.y - inside.y);
            return {
              x: point.x,
              y: point.y,
              dx: (point.x - inside.x) / magnitude,
              dy: (point.y - inside.y) / magnitude,
            };
          });
        }),
      ids,
    );
    const png = (await page.screenshot()).toString("base64");
    const painted = await page.evaluate(
      async ({ png, endpoints }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        return endpoints.map((point) => {
          let outward = -Infinity;
          let offAxis = 0;
          for (let y = Math.floor(point.y - 40); y < point.y + 40; y++) {
            for (let x = Math.floor(point.x - 40); x < point.x + 40; x++) {
              const offset = (y * canvas.width + x) * 4;
              if (
                Math.abs(data[offset]! - 18) < 15 &&
                Math.abs(data[offset + 1]! - 52) < 15 &&
                Math.abs(data[offset + 2]! - 86) < 15
              ) {
                const dx = x + 0.5 - point.x;
                const dy = y + 0.5 - point.y;
                outward = Math.max(outward, dx * point.dx + dy * point.dy);
                if (Math.abs(dx * point.dy - dy * point.dx) > 2.5) {
                  offAxis++;
                }
              }
            }
          }
          return { outward, offAxis };
        });
      },
      { png, endpoints },
    );
    for (const endpoint of painted) {
      expect(endpoint.offAxis).toBeGreaterThan(10);
      // Antialiasing makes the narrow tip lighter than the solid-color pixels measured here.
      expect(endpoint.outward).toBeGreaterThan(0.5);
      expect(endpoint.outward).toBeLessThanOrEqual(5.5);
    }
  });
}
