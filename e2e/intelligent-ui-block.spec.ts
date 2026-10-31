/**
 * Runs a stored Intelligent UI program inside the journal demo.
 *
 * The shopping list is the first program. Its guest stepper updates the
 * drawing without writing a new program. Edit and Draw replace the source.
 *
 * @module
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Returns the first running program in today's journal.
 *
 * @param page - Demo page whose journal has already loaded.
 * @returns The shopping-list block locator.
 */
function shoppingList(page: Page): Locator {
  return page.locator('[data-journal-document="today"] [data-block-type="intelligent-ui"]').first();
}

test("runs a stored program and updates it from a control", async ({ page }) => {
  await page.goto("/");
  const list = shoppingList(page);
  await expect(list.getByText("Pasta night for 4 guests")).toBeVisible();
  await list.getByRole("button", { name: "More", exact: true }).click();
  await expect(list.getByText("Pasta night for 5 guests")).toBeVisible();
  await expect(list.getByText("500 g spaghetti")).toBeVisible();
});

test("draws a replacement program and reports a program the library cannot run", async ({
  page,
}) => {
  await page.goto("/");
  const list = shoppingList(page);
  await list.getByRole("button", { name: "Edit intelligent UI source" }).click();
  const source = list.getByRole("textbox", { name: "Intelligent UI source" });
  await source.fill('root = Title("Replaced program", "lg")');
  await list.getByRole("button", { name: "Draw intelligent UI source" }).click();
  await expect(list.getByText("Replaced program")).toBeVisible();

  await list.getByRole("button", { name: "Edit intelligent UI source" }).click();
  await source.fill("root = MissingWidget()");
  await list.getByRole("button", { name: "Draw intelligent UI source" }).click();
  await expect(list.getByRole("alert")).toBeVisible();
});

test("keeps a drawn control responsive in a large document", async ({ browserName, page }) => {
  test.skip(
    browserName !== "chromium",
    "The timing budget is calibrated for Chromium; the same control is covered in both browsers above.",
  );
  await page.goto("/?repeat=200");
  const list = shoppingList(page);
  await list.scrollIntoViewIfNeeded();
  await expect(list.getByText("Pasta night for 4 guests")).toBeVisible();
  await list.getByRole("button", { name: "More", exact: true }).click();
  await expect(list.getByText("Pasta night for 5 guests")).toBeVisible();
  await list.getByRole("button", { name: "Fewer", exact: true }).click();
  await expect(list.getByText("Pasta night for 4 guests")).toBeVisible();

  const samples: number[] = [];
  const steps = [
    { name: "More", guests: "5 guests", line: "500 g spaghetti" },
    { name: "Fewer", guests: "4 guests", line: "400 g spaghetti" },
  ] as const;
  for (let index = 0; index < 5; index += 1) {
    for (const step of steps) {
      const sample = await list.getByRole("button", { name: step.name, exact: true }).evaluate(
        async (element, expected) => {
          const block = element.closest("[data-block-type='intelligent-ui']");
          const start = performance.now();
          (element as HTMLButtonElement).click();
          await new Promise<void>((resolve, reject) => {
            const finish = () => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            };
            if (block?.textContent?.includes(expected.guests)) {
              finish();
              return;
            }
            if (!block) {
              reject(new Error("Intelligent UI block is missing"));
              return;
            }
            const observer = new MutationObserver(() => {
              if (block.textContent?.includes(expected.guests)) {
                observer.disconnect();
                window.clearTimeout(timeout);
                finish();
              }
            });
            const timeout = window.setTimeout(() => {
              observer.disconnect();
              reject(new Error(`Timed out waiting for ${expected.guests}`));
            }, 2000);
            observer.observe(block, { subtree: true, characterData: true, childList: true });
          });
          return {
            ms: performance.now() - start,
            text: block?.textContent ?? "",
          };
        },
        { guests: step.guests },
      );
      expect(sample.text).toContain(step.guests);
      expect(sample.text).toContain(step.line);
      samples.push(sample.ms);
    }
  }

  samples.sort((left, right) => left - right);
  const median = samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
  console.log(
    `intelligent-ui guest stepper samples=${samples.join(",")} median=${median.toFixed(1)}`,
  );
  // Chromium preview, repeat=200, one warm pair then five More/Fewer pairs.
  // Two serial runs: medians 26.7ms and 24.3ms, slowest sample 34.1ms.
  // 100ms leaves headroom for environment noise and still fails if the
  // stepper waits on the document.
  expect(median).toBeLessThan(100);
});
