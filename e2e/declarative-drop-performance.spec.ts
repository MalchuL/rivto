import { loseHandleRelease } from "./pointer-release";
import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const placement of ["between", "inside", "control", "bento", "end", "column"] as const) {
  for (const repeat of [0, 200]) {
    test(`declared ${placement} region native pointer cost repeat=${repeat} @performance`, async ({
      page,
      browserName,
    }) => {
      const lostRelease = process.env.DROP_RELEASE_LOST === "1";
      if (lostRelease) {
        await loseHandleRelease(page);
      }
      await page.setViewportSize({ width: 1500, height: 1100 });
      await page.goto(`/?repeat=${repeat}`);
      const document = page.locator('[data-journal-document="today"] > .page-surface');
      await document.waitFor();
      const ids = await page.evaluate((placement) => {
        const blocks = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor.blocks;
        if (placement === "end") {
          const roots = blocks.getRootIds();
          return [roots[0]!, roots[roots.length - 1]!];
        }
        if (placement === "bento") {
          const board = blocks.getBlocks().find((block) => block.type === "bento");
          const children = board && blocks.getBlockNode(board.id)?.childIds;
          if (!board || !children?.[1]) {
            throw new Error("The default Bento needs two tiles for the seam measurement");
          }
          return [blocks.getRootIds()[0]!, children[0]!, children[1], board.id];
        }
        if (placement === "column") {
          const board = blocks.getBlocks().find((block) => block.type === "kanban");
          const lane = board?.children.find((block) => block.children.length > 0);
          if (!lane) {
            throw new Error("The default Kanban fixture needs a populated lane");
          }
          return [blocks.getRootIds()[0]!, lane.id];
        }
        if (placement === "control") {
          const storage = blocks.getBlocks().find((block) => block.type === "todo-storage");
          const children = storage && blocks.getBlockNode(storage.id)?.childIds;
          if (!children?.[1]) {
            throw new Error(
              "The default TODO storage needs two tasks for the control-drop measurement",
            );
          }
          return [children[1], children[0]!];
        }
        return blocks.getRootIds().slice(0, 3);
      }, placement);
      const intoBlock = placement === "inside" || placement === "control" || placement === "column";
      const source = document.locator(`[data-block-id="${ids[0]}"]`);
      const row = source.locator(":scope > .rivto-block-row");
      await row.hover();
      const handle = (await row.locator(".block-handle").boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + 10, handle.y + handle.height / 2, {
        steps: 3,
      });
      await expect(source).toHaveAttribute("data-dragging", "true");
      const baseline = process.env.DROP_BASELINE === "1";
      const targetId = intoBlock || placement === "end" ? ids[1] : ids[2];
      const target = document.locator(`[data-block-id="${targetId}"]`);
      if (placement === "control") {
        await target.evaluate((element) => {
          element.closest('[data-block-type="todo-storage"]')!.setAttribute("data-drop-inert", "");
        });
      }
      let region = target;
      if (placement === "column") {
        region = target.getByRole("button", { name: /^Add card to / });
      } else if (placement === "end") {
        region = baseline
          ? document.locator(":scope > .rivto-virtual-tree > .rivto-block-editor-end")
          : document.locator(":scope > [data-page-end-slot]");
      } else if (placement === "bento") {
        region = target.locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]");
      } else if (placement === "inside") {
        region = target.locator(":scope > .rivto-block-row");
      } else if (placement === "control") {
        region = target.getByRole("textbox", { name: "Description", exact: true });
      }
      await region.scrollIntoViewIfNeeded();
      if (placement === "bento" || placement === "end" || placement === "column") {
        const warm = (await region.boundingBox())!;
        await page.mouse.move(warm.x + warm.width / 2, warm.y + warm.height / 2);
        // Stop drag autoscroll before measuring a seam after the long fixture scroll.
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
      }
      const box = (await region.boundingBox())!;
      let x = box.x + (intoBlock ? box.width / 2 : Math.min(12, box.width / 2));
      let y = intoBlock ? box.y + box.height / 2 : box.y - 2;
      if (placement === "column") {
        x = box.x + box.width / 2;
      }
      if (placement === "end") {
        y = box.y + box.height - 2;
      }
      if (placement === "bento") {
        const preceding = (await document
          .locator(`[data-block-id="${ids[1]}"]`)
          .locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]")
          .boundingBox())!;
        const top = Math.max(box.y, preceding.y);
        const bottom = Math.min(box.y + box.height, preceding.y + preceding.height);
        if (bottom > top) {
          expect(preceding.x + preceding.width).toBeCloseTo(box.x, 1);
          x = box.x - 0.5;
          y = (top + bottom) / 2;
        } else {
          const left = Math.max(box.x, preceding.x);
          const right = Math.min(box.x + box.width, preceding.x + preceding.width);
          expect(right).toBeGreaterThan(left);
          expect(preceding.y + preceding.height).toBeCloseTo(box.y, 1);
          x = (left + right) / 2;
          y = box.y - 0.5;
        }
      }
      await page.mouse.move(x, y, { steps: 10 });

      if (intoBlock) {
        await expect(target).toHaveAttribute("data-block-drop-active", "true");
      } else {
        await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
      }
      await page.evaluate(() => {
        const blocks = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor.blocks;
        const original = blocks.moveBlocks;
        blocks.moveBlocks = (...args) => {
          const started = performance.now();
          const result = original.apply(blocks, args);
          Object.assign(window, { __dropCommand: performance.now() - started });
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              Object.assign(window, { __dropRendered: performance.now() - started });
            }),
          );
          return result;
        };
        const times: number[] = [];
        let last = performance.now();
        let active = true;
        const frame = () => {
          const now = performance.now();
          times.push(now - last);
          last = now;
          if (active) {
            requestAnimationFrame(frame);
          }
        };
        requestAnimationFrame(frame);
        Object.assign(window, {
          __dropFrames: times,
          __stopDropFrames: () => {
            active = false;
            blocks.moveBlocks = original;
          },
        });
      });
      for (let index = 0; index < 90; index += 1) {
        await page.mouse.move(x + (index % 3) * 0.25, y + (index % 2) * 0.25);
      }
      if (lostRelease) {
        await Promise.all([page.mouse.up(), page.mouse.move(0, 0)]);
      } else {
        await page.mouse.up();
      }
      if (intoBlock) {
        await expect
          .poll(() =>
            page.evaluate(
              (id) =>
                (
                  window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
                ).__rivtoDemo.editor.blocks.getParentId(id),
              ids[0]!,
            ),
          )
          .toBe(ids[1]);
      } else if (placement === "end") {
        await expect
          .poll(() =>
            page.evaluate(() => {
              const roots = (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getRootIds();
              return roots[roots.length - 1];
            }),
          )
          .toBe(ids[0]);
      } else {
        await expect
          .poll(() =>
            page.evaluate((parentId) => {
              const blocks = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
                .__rivtoDemo.editor.blocks;
              const children = parentId
                ? blocks.getBlockNode(parentId)?.childIds
                : blocks.getRootIds();
              return children?.slice(0, 3);
            }, ids[3]),
          )
          .toEqual([ids[1], ids[0], ids[2]]);
      }
      await page.waitForFunction(() => "__dropRendered" in window);
      const command = await page.evaluate(() => {
        const timing = window as unknown as { __dropCommand: number; __dropRendered: number };
        return { sync: timing.__dropCommand, rendered: timing.__dropRendered };
      });
      const frames = await page.evaluate(() => {
        const state = window as unknown as { __dropFrames: number[]; __stopDropFrames: () => void };
        state.__stopDropFrames();
        return state.__dropFrames;
      });
      const sorted = frames.slice().sort((a, b) => a - b);
      console.log(
        JSON.stringify({
          browserName,
          placement,
          repeat,
          baseline,
          lostRelease,
          ...command,
          frames: frames.length,
          median: sorted[Math.floor(sorted.length / 2)],
          max: Math.max(...frames),
          longFrames: frames.filter((value) => value > 50).length,
        }),
      );
    });
  }
}
