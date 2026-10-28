import { expect, test } from "@playwright/test";
import { readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { BLOCK_ID_ATTRIBUTE, blockIdSelector } from "./dom-markers";
import type { EditorSnapshot, DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditor } from "@chulane/rivto-react";

const BLOCK_ANCESTOR_XPATH = `xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`;

test("saves a slash-created Review report and reproduces it with native load", async ({ page }) => {
  const problem = `Playwright review reproduction ${Date.now()}`;
  const slug = problem.toLowerCase().replaceAll(" ", "-");
  const reportDirectory = resolve(process.cwd(), "reports");
  try {
    await page.goto("/?test_features=1");
    const content = page.locator("[data-block-content]").filter({
      hasText: "Type `/` anywhere here",
    });
    const block = content.locator(BLOCK_ANCESTOR_XPATH);
    const blockId = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!blockId) {
      throw new Error("Expected slash target block ID");
    }
    const runtimeState = await page.evaluate((id) => {
      const reactEditor = (
        window as unknown as {
          __rivtoDemo: { reactEditor: ReactEditor };
        }
      ).__rivtoDemo.reactEditor;
      return {
        commands: (reactEditor.panels.getActive() ?? reactEditor.panels.getDefault())!.slashCommands
          .getAll({ blockId: id })
          .map(({ id: commandId }) => commandId),
        definition: reactEditor.blockTypes.getDefinition("demo.review")?.type,
        element: reactEditor.elements.getElementNode("demo-review-element")?.type,
      };
    }, blockId);
    expect(runtimeState).toMatchObject({
      definition: "demo.review",
      element: "demo.review",
    });
    expect(runtimeState.commands.join("\n")).toContain("type.demo.review");

    await content.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" /review");
    await page.locator('[data-slash-command="type.demo.review"]').click();
    const reviewBlock = page.locator(blockIdSelector(blockId));
    await expect(reviewBlock).toHaveAttribute("data-block-type", "demo.review");

    await reviewBlock.getByRole("textbox", { name: "Review problem" }).fill(problem);
    await reviewBlock.getByRole("button", { name: "Save context" }).click();
    await expect(reviewBlock).toContainText("Saved");
    await expect(reviewBlock.getByRole("button", { name: "Restore snapshot" })).toBeVisible();

    await expect
      .poll(async () =>
        (await readdir(reportDirectory)).some(
          (name) => name.includes(slug) && name.endsWith(".json"),
        ),
      )
      .toBe(true);
    const filename = (await readdir(reportDirectory)).find(
      (name) => name.includes(slug) && name.endsWith(".json"),
    );
    if (!filename) {
      throw new Error("Expected generated Review report file");
    }
    const reportPath = resolve(reportDirectory, filename);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      problem: string;
      reportBlock: {
        previousReportSiblingId: string | null;
        nextReportSiblingId: string | null;
        parentReportId: string | null;
      };
      snapshot: EditorSnapshot;
    };
    expect(report.problem).toContain(problem);
    expect(report.reportBlock).toEqual({
      previousReportSiblingId: expect.any(String),
      nextReportSiblingId: expect.any(String),
      parentReportId: null,
    });

    await page.evaluate((id) => {
      const core = (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo.editor;
      core.history.undo();
      const props = core.blocks.getBlock(id)?.props;
      if (props?.snapshot !== null || props.savedAt !== null) {
        throw new Error("Review Save was not reverted as one undo item");
      }
    }, blockId);

    await page.getByLabel("Restore Review report").setInputFiles(reportPath);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const core = (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor;
          return core.dump();
        }),
      )
      .toEqual(report.snapshot);
  } finally {
    const generated = (await readdir(reportDirectory).catch(() => [])).filter(
      (name) => name.includes(slug) && name.endsWith(".json"),
    );
    await Promise.all(generated.map((name) => rm(resolve(reportDirectory, name), { force: true })));
  }
});

for (const repeat of [0, 200]) {
  test(`edgeless Review controls accept native input without dragging the card, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.route("**/__review-reports", (route) => route.fulfill({ json: { ok: true } }));
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    await today.locator("[data-block-content]").first().waitFor();
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    // Long auto-height cards overlap the demo report; expose the form for native pointer input.
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.elements.updateElement("demo-review-element", { zIndex: 1000 });
    });
    const report = today.locator('[data-review-report="demo-review-element"]');
    const problem = report.getByRole("textbox", { name: "Review problem" });
    await problem.scrollIntoViewIfNeeded();
    const readReport = () =>
      page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return {
          node: editor.elements.getElementNode("demo-review-element")!,
          count: editor.elements.getElementNodes().length,
        };
      });
    const initial = await readReport();
    await problem.click();
    await expect(problem).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Review input");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+c");
    await page.keyboard.press("End");
    await page.keyboard.press("Control+v");
    await expect(problem).toHaveValue("Review inputReview input");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+x");
    await expect(problem).toHaveValue("");
    await page.keyboard.press("Control+v");
    await expect(problem).toHaveValue("Review inputReview input");
    await expect
      .poll(async () => (await readReport()).node.props.problem)
      .toBe("Review inputReview input");
    const above = report.getByRole("spinbutton", { name: "Review items above" });
    await above.click();
    await expect(above).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(async () => (await readReport()).node.props.elementsAbove)
      .toBe(Number(initial.node.props.elementsAbove) + 1);
    const saveButton = report.getByRole("button", { name: "Save context" });
    await saveButton.scrollIntoViewIfNeeded();
    const buttonBox = await saveButton.boundingBox();
    const reportBox = await report.boundingBox();
    if (!buttonBox || !reportBox) {
      throw new Error("Expected Review form geometry");
    }
    // A missed button click must not start native selection across the document.
    await page.mouse.move(reportBox.x + reportBox.width - 24, buttonBox.y + buttonBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(reportBox.x + 24, reportBox.y + 24, { steps: 6 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
    await expect(today.locator(".edgeless-viewport")).not.toHaveAttribute(
      "data-transforming",
      "move",
    );
    const saved = page.waitForRequest("**/__review-reports");
    await report.getByRole("button", { name: "Save context" }).click();
    expect((await saved).postDataJSON().problem).toBe("Review inputReview input");
    await expect(report).toContainText("Saved");
    await report.getByText("Snapshot JSON", { exact: true }).click();
    await expect(report.locator("details")).toHaveAttribute("open", "");
    await report.getByText("Snapshot JSON", { exact: true }).click();
    const edited = await readReport();
    expect(edited.count).toBe(initial.count);
    expect(edited.node.frame).toEqual(initial.node.frame);
    // The card's padding remains a drag target while the form owns native input.
    await report.scrollIntoViewIfNeeded();
    const box = await report.boundingBox();
    if (!box) {
      throw new Error("Expected Review card geometry");
    }
    await page.keyboard.down("Alt");
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 45, box.y + 25, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect
      .poll(async () => (await readReport()).node.frame)
      .toEqual({
        ...initial.node.frame,
        x: initial.node.frame.x + 40,
        y: initial.node.frame.y + 20,
      });
    await report.getByRole("button", { name: "Restore snapshot" }).click();
    await expect.poll(async () => (await readReport()).node.frame).toEqual(initial.node.frame);
    await expect(problem).toHaveValue("Review inputReview input");
  });
}

for (const mode of ["Page", "Edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`Review block keeps text editing in ${mode}, repeat=${repeat}`, async ({ page }) => {
      await page.goto(`/?test_features=1&repeat=${repeat}`);
      const today = page.locator('[data-journal-document="today"]');
      const content = today.locator("[data-block-content]").first();
      const blockId = await content.locator(BLOCK_ANCESTOR_XPATH).getAttribute(BLOCK_ID_ATTRIBUTE);
      if (!blockId) {
        throw new Error("Expected a writing block to convert into a Review report");
      }
      await content.click();
      await page.keyboard.press("End");
      await page.keyboard.type(" /review");
      await page.locator('[data-slash-command="type.demo.review"]').click();
      if (mode === "Edgeless") {
        await today.getByRole("button", { name: mode, exact: true }).click();
      }
      const block = today.locator(blockIdSelector(blockId));
      const problem = block.getByRole("textbox", { name: "Review problem" });
      const blockCount = await today.locator(`[${BLOCK_ID_ATTRIBUTE}]`).count();
      await problem.fill("Report text");
      await problem.click();
      await page.keyboard.press("End");
      await page.keyboard.press("Backspace");
      await expect(problem).toHaveText("Report tex");
      await page.keyboard.press("Home");
      await page.keyboard.press("Delete");
      await expect(problem).toHaveText("eport tex");
      await page.keyboard.press("Shift+End");
      await page.keyboard.press("Control+c");
      await page.keyboard.press("End");
      await page.keyboard.press("Control+v");
      await expect(problem).toHaveText("eport texeport tex");
      await expect(today.locator(`[${BLOCK_ID_ATTRIBUTE}]`)).toHaveCount(blockCount);
      await expect
        .poll(() =>
          page.evaluate((id) => {
            const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
              .__rivtoDemo.editor;
            return editor.blocks.getBlock(id)?.content;
          }, blockId),
        )
        .toBe("eport texeport tex");
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
      await page.keyboard.press("Backspace");
      await expect(problem).toHaveText("");
      await expect(block).toHaveAttribute("data-block-type", "demo.review");
    });
  }
}
