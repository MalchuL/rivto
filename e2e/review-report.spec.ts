import { expect, test } from "@playwright/test";
import { readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { blockIdSelector, BLOCK_ID_ATTRIBUTE } from "./dom-markers";

const BLOCK_ANCESTOR_XPATH = `xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`;

test("saves a slash-created Review report and reproduces it with native load", async ({ page }) => {
  const problem = `Playwright review reproduction ${Date.now()}`;
  const slug = problem.toLowerCase().replaceAll(" ", "-");
  const reportDirectory = resolve(process.cwd(), "reports");
  try {
    await page.goto("/");
    const content = page.locator("[data-block-content]").filter({
      hasText: "Type `/` anywhere here",
    });
    const block = content.locator(BLOCK_ANCESTOR_XPATH);
    const blockId = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!blockId) throw new Error("Expected slash target block ID");
    const runtimeState = await page.evaluate((id) => {
      const reactEditor = (
        window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
      }
      ).__rivtoDemo.editor;
      return {
        commands: reactEditor.slashCommands.getAll({ blockId: id }).map(({ id: commandId }) => commandId),
        definition: reactEditor.editor.blocksRegistry.get("demo.review")?.type,
        element: reactEditor.editor.elements.getElement("demo-review-element")?.type,
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

    await expect.poll(async () => (
      await readdir(reportDirectory)
    ).some((name) => name.includes(slug) && name.endsWith(".json"))).toBe(true);
    const filename = (await readdir(reportDirectory)).find(
      (name) => name.includes(slug) && name.endsWith(".json"),
    );
    if (!filename) throw new Error("Expected generated Review report file");
    const reportPath = resolve(reportDirectory, filename);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      problem: string;
      reportBlock: {
        previousReportSiblingId: string | null;
        nextReportSiblingId: string | null;
        parentReportId: string | null;
      };
      snapshot: import("@chulane/rivto").EditorSnapshot;
    };
    expect(report.problem).toContain(problem);
    expect(report.reportBlock).toEqual({
      previousReportSiblingId: expect.any(String),
      nextReportSiblingId: expect.any(String),
      parentReportId: null,
    });

    await page.evaluate((id) => {
      const core = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
      }).__rivtoDemo.editor.editor;
      core.undo();
      const props = core.blocks.getBlock(id)?.props;
      if (props?.snapshot !== null || props.savedAt !== null) {
        throw new Error("Review Save was not reverted as one undo item");
      }
    }, blockId);

    await page.getByLabel("Restore Review report").setInputFiles(reportPath);
    const reproduced = await page.evaluate(() => {
      const core = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
      }).__rivtoDemo.editor.editor;
      return core.dump();
    });
    expect(reproduced).toEqual(report.snapshot);
  } finally {
    const generated = (await readdir(reportDirectory).catch(() => [])).filter(
      (name) => name.includes(slug) && name.endsWith(".json"),
    );
    await Promise.all(generated.map((name) => rm(resolve(reportDirectory, name), { force: true })));
  }
});
