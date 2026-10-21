import { expect, test, type Locator } from "@playwright/test";
import type { DemoMetrics } from "./demo-adapter";
import { BACKGROUND_COLORS } from "./constants";

test("updates all list modes and node fields without changing node identity", async ({ page }) => {
  await page.goto("/");
  const row = page.locator('[data-block-id="block-1"]');
  await page.getByRole("textbox", { name: "Text block-1", exact: true }).fill("New text");
  await page.getByRole("checkbox", { name: "Checked block-1", exact: true }).check();
  await page.getByRole("checkbox", { name: "Collapsed block-1", exact: true }).check();
  await page.getByLabel("Background block-1", { exact: true }).selectOption("red");
  const state = page.getByLabel("State block-1", { exact: true });
  for (const mode of [
    "list",
    "checkbox",
    "numbered_list",
    "start_numbered_list",
    "continue_numbered_list",
    "",
  ]) {
    await page.getByLabel("List type block-1", { exact: true }).selectOption(mode);
    await expect(state).toHaveText(
      JSON.stringify({
        listType: mode || null,
        checked: true,
        collapsed: true,
        color: BACKGROUND_COLORS.find((color) => color.name === "red")!.value,
      }),
    );
  }
  await expect(row).toHaveAttribute(
    "data-block-background",
    BACKGROUND_COLORS.find((color) => color.name === "red")!.value,
  );
  await expect(row.locator('[data-node-identity="changed"]')).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Text child-0", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand block-1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Text child-0", exact: true })).toBeVisible();
  await page.getByLabel("Background block-1", { exact: true }).selectOption("");
  await expect(state).toContainText('"color":null');
  await expect(row).not.toHaveAttribute("data-block-background");
});

test("changes block background while preserving text and child backgrounds", async ({ page }) => {
  await page.goto("/");
  const block = page.locator('[data-block-id="block-1"]');
  const child = page.locator('[data-block-id="child-0"]');
  const originalTextColor = await block.evaluate((element) => getComputedStyle(element).color);
  const originalChildBackground = await child.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  for (const color of BACKGROUND_COLORS) {
    await page.getByLabel("Background block-1", { exact: true }).selectOption(color.name);
    await expect(block).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(block).toHaveCSS("color", originalTextColor);
    await expect(child).toHaveCSS("background-color", originalChildBackground);
  }
  await page.getByLabel("Background block-1", { exact: true }).selectOption("");
  await expect(block).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("uses the base background when the host clears the resolved color", async ({ page }) => {
  await page.goto("/");
  const block = page.locator('[data-block-id="block-1"]');
  await page.getByLabel("Background block-1", { exact: true }).selectOption("red");
  await expect(block).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.locator("[data-rivto-block-editor]").evaluate((element) => {
    element.style.setProperty("--rivto-background", "rgb(10, 20, 30)");
  });
  await page.getByLabel("Background block-1", { exact: true }).selectOption("");
  await expect(block).not.toHaveAttribute("data-block-background");
  await expect(block).toHaveCSS("background-color", "rgb(10, 20, 30)");
  await expect(page.locator('[data-block-id="child-0"]')).toHaveCSS(
    "background-color",
    "rgb(10, 20, 30)",
  );
});

test("applies host CSS expressions and the common background override independently", async ({
  page,
}) => {
  await page.goto("/");
  const block = page.locator('[data-block-id="block-1"]');
  const child = page.locator('[data-block-id="child-0"]');
  await page.getByLabel("Background block-1", { exact: true }).selectOption("red");
  await page.locator("[data-rivto-block-editor]").evaluate((element) => {
    element.style.setProperty("--demo-color-red", "rgb(10, 20, 30)");
  });
  await expect(block).toHaveCSS("background-color", "rgb(10, 20, 30)");
  await expect(child).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByLabel("Background child-0", { exact: true }).selectOption("red");
  await child.evaluate((element) =>
    element.style.setProperty("--demo-color-red", "rgb(40, 50, 60)"),
  );
  await expect(child).toHaveCSS("background-color", "rgb(40, 50, 60)");
  await expect(block).toHaveCSS("background-color", "rgb(10, 20, 30)");
  await page.locator("[data-rivto-block-editor]").evaluate((element) => {
    element.style.setProperty("--rivto-block-background", "rgb(70, 80, 90)");
  });
  await expect(block).toHaveCSS("background-color", "rgb(70, 80, 90)");
  await expect(child).toHaveCSS("background-color", "rgb(70, 80, 90)");
  await page.locator("[data-rivto-block-editor]").evaluate((element) => {
    element.style.removeProperty("--rivto-block-background");
  });
  await expect(block).toHaveCSS("background-color", "rgb(10, 20, 30)");
  await expect(child).toHaveCSS("background-color", "rgb(40, 50, 60)");
  await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
});

test("keeps host state through reorder, renderer registration, and editor remount", async ({
  page,
}) => {
  await page.goto("/");
  const text = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await text.fill("Preserved across remount");
  await page.getByRole("button", { name: "Select block-1", exact: true }).click();
  await expect(page.locator('[data-block-id="block-1"]')).toHaveAttribute(
    "data-block-selected",
    "true",
  );
  await expect(page.getByRole("textbox", { name: "Text block-5", exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Custom renderer", exact: true }).check();
  await expect(page.getByRole("textbox", { name: "Text block-5", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reverse block order", exact: true }).click();
  await expect(page.locator("[data-rivto-block-editor] > [data-block-id]").first()).toHaveAttribute(
    "data-block-id",
    "block-5",
  );
  await expect(text).toHaveValue("Preserved across remount");
  await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  await expect(page.locator("[data-rivto-block-editor]")).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
  const metrics: DemoMetrics = JSON.parse(
    (await page.locator("[data-demo-metrics]").textContent())!,
  );
  expect(metrics.subscriptions).toBe(0);
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).check();
  await expect(text).toHaveValue("Preserved across remount");
  await expect(page.getByRole("textbox", { name: "Text block-5", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(page.locator('[data-block-selected="true"]')).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Custom renderer", exact: true }).uncheck();
  await expect(page.getByRole("textbox", { name: "Text block-5", exact: true })).toHaveCount(0);
});

test("runs structural checkbox and collapse slots and disposes a dynamic contribution", async ({
  page,
}) => {
  await page.goto("/");
  const parent = page.locator('[data-block-id="block-1"]');
  await page.getByRole("checkbox", { name: "Check block-2", exact: true }).check();
  await expect(page.getByLabel("State block-2", { exact: true })).toContainText('"checked":true');
  const collapse = page.getByRole("button", { name: "Collapse block-1", exact: true });
  const childrenId = await collapse.getAttribute("aria-controls");
  await collapse.click();
  await expect(page.getByRole("textbox", { name: "Text child-0", exact: true })).toHaveCount(0);
  await expect(page.locator(`[id="${childrenId}"]`)).toBeHidden();
  await page.getByRole("button", { name: "Expand block-1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Text child-0", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Demo slot", exact: true }).check();
  await expect(parent.locator('[data-slot-position="end"] [data-demo-slot="block-1"]')).toHaveText(
    "Slot",
  );
  await page.getByRole("button", { name: "Select block-1", exact: true }).click();
  await expect(parent.locator('[data-demo-slot="block-1"]')).toHaveText("Selected");
  await page.getByRole("checkbox", { name: "Demo slot", exact: true }).uncheck();
  await expect(page.locator("[data-demo-slot]")).toHaveCount(0);
  await expect(parent.locator('[data-node-identity="changed"]')).toHaveCount(0);
});

test("keeps list counter rules scoped to sibling groups after type changes and root moves", async ({
  page,
}) => {
  await page.goto("/");
  const third = page.locator('[data-block-id="block-3"]');
  const fourth = page.locator('[data-block-id="block-4"]');
  const fifth = page.locator('[data-block-id="block-5"]');
  await expect(third).toHaveCSS("counter-set", "rivto-list-number 1");
  await expect(third).toHaveCSS("counter-increment", "none");
  await expect(fourth).toHaveCSS("counter-set", "rivto-list-number 1");
  await expect(fifth).toHaveCSS("counter-increment", "rivto-list-number 1");
  await expect(fifth.locator("[data-list-marker]")).toHaveCount(1);
  await page.getByLabel("List type block-4", { exact: true }).selectOption("");
  await expect(fourth.locator("[data-list-marker]")).toHaveCount(0);
  await expect(fifth).toHaveCSS("counter-set", "none");
  await page.getByRole("checkbox", { name: "Custom renderer", exact: true }).check();
  await page.getByLabel("List type block-5", { exact: true }).selectOption("numbered_list");
  await expect(fifth).toHaveCSS("counter-set", "rivto-list-number 1");
  await page.getByRole("button", { name: "Reverse block order", exact: true }).click();
  await expect(fifth).toHaveCSS("counter-set", "rivto-list-number 1");
  await page.getByLabel("List type child-0", { exact: true }).selectOption("numbered_list");
  const child = page.locator('[data-block-id="child-0"]');
  await expect(child).toHaveCSS("counter-set", "rivto-list-number 1");
  await expect(child.locator("..")).toHaveCSS("counter-reset", "rivto-list-number 0");
});

test("retains package geometry and colors with demo chrome CSS disabled", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Text block-1", exact: true })).toBeVisible();
  await page.locator("style[data-demo-chrome]").evaluate((element) => {
    (element as HTMLStyleElement).sheet!.disabled = true;
  });
  const editor = page.locator("[data-rivto-block-editor]");
  const row = page.locator('[data-block-id="block-1"] > .rivto-block-row');
  await expect(row).toHaveCSS("padding", "16px");
  await expect(editor).toHaveCSS("row-gap", "16px");
  await expect(page.locator('[data-block-id="block-1"] > .rivto-block-children')).toHaveCSS(
    "margin-inline-start",
    "28px",
  );
  await expect(page.getByRole("button", { name: "Collapse block-1", exact: true })).toHaveCSS(
    "width",
    "20px",
  );
  const parentContent = await page
    .locator('[data-block-id="block-1"] > .rivto-block-row > .rivto-block-content')
    .boundingBox();
  const childContent = await page
    .locator('[data-block-id="child-0"] > .rivto-block-row > .rivto-block-content')
    .boundingBox();
  expect(childContent!.x - parentContent!.x).toBeCloseTo(28, 1);
  await page.getByLabel("List type block-1", { exact: true }).selectOption("numbered_list");
  const numberedContent = await page
    .locator('[data-block-id="block-1"] > .rivto-block-row > .rivto-block-content')
    .boundingBox();
  expect(numberedContent!.x).toBeCloseTo(parentContent!.x, 1);
  await page.getByLabel("Background block-1", { exact: true }).selectOption("red");
  await expect(page.locator('[data-block-id="block-1"]')).not.toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator('[data-block-id="block-1"]')).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});

test("keeps host controls unchanged and supports keyboard activation of shadcn slots", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("checkbox", { name: "Check block-2", exact: true })).toBeVisible();
  const hostStyles = await page.evaluate(() => {
    const host = document.createElement("section");
    host.innerHTML =
      "<h2>Host heading</h2><button>Host button</button><textarea>Host text</textarea>";
    document.body.append(host);
    const properties = ["margin", "padding", "border-width", "font-size", "box-sizing"];
    const read = () =>
      Array.from(host.children, (element) => {
        const style = getComputedStyle(element);
        return properties.map((property) => style.getPropertyValue(property));
      });
    const styled = read();
    const stylesheets = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    );
    for (const link of stylesheets) {
      link.sheet!.disabled = true;
    }
    const unstyled = read();
    for (const link of stylesheets) {
      link.sheet!.disabled = false;
    }
    host.remove();
    return { styled, unstyled, stylesheetCount: stylesheets.length };
  });
  expect(hostStyles.stylesheetCount).toBeGreaterThan(0);
  expect(hostStyles.styled).toEqual(hostStyles.unstyled);
  const checkbox = page.getByRole("checkbox", { name: "Check block-2", exact: true });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(page.getByLabel("State block-2", { exact: true })).toContainText('"checked":true');
  const text = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await text.focus();
  await page.getByRole("button", { name: "Collapse block-1", exact: true }).click();
  await expect(text).toBeFocused();
});

test("keeps demo forms usable within a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const text = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await expect(text).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const controls = [
    text,
    page.getByLabel("List type block-1", { exact: true }),
    page.getByLabel("Background block-1", { exact: true }),
    page.getByRole("button", { name: "Select block-1", exact: true }),
  ];
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await text.fill("Edited on a narrow screen");
  await expect(text).toHaveValue("Edited on a narrow screen");
  await page.getByLabel("List type block-1", { exact: true }).selectOption("checkbox");
  await page.getByRole("checkbox", { name: "Check block-1", exact: true }).check();
  await expect(page.getByLabel("State block-1", { exact: true })).toContainText('"checked":true');
});

test("applies typed layout parameters without replacing node objects", async ({ page }) => {
  await page.goto("/");
  const row = page.locator('[data-block-id="block-1"] > .rivto-block-row');
  await expect(row).toHaveCSS("padding", "16px");
  await page.getByRole("checkbox", { name: "Compact layout", exact: true }).check();
  await expect(row).toHaveCSS("padding", "4px");
  await expect(page.locator("[data-rivto-block-editor]")).toHaveCSS("row-gap", "4px");
  await expect(page.getByRole("button", { name: "Collapse block-1", exact: true })).toHaveCSS(
    "width",
    "16px",
  );
  await expect(page.locator('[data-block-id="block-1"] > .rivto-block-children')).toHaveCSS(
    "margin-inline-start",
    "12px",
  );
  await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Compact layout", exact: true }).uncheck();
  await expect(row).toHaveCSS("padding", "16px");
  const controlSize = await page.locator("[data-rivto-block-editor]").evaluate((element) => {
    element.style.setProperty("--rivto-block-control-size", "14px");
    return getComputedStyle(element.querySelector('[data-block-control="collapse"]')!).width;
  });
  expect(controlSize).toBe("14px");
});

/**
 * Captures one native control event through two animation frames in the browser.
 *
 * @param select - Real selector or editable whose next native event is driven by Playwright.
 * @param eventName - Native event to measure; defaults to select change.
 * @returns Resolves after the one-shot measurement listener is installed.
 */
async function captureControlTiming(
  select: Locator,
  eventName: "change" | "click" | "input" = "change",
): Promise<void> {
  await select.evaluate((element, type) => {
    element.removeAttribute("data-dom-ms");
    element.addEventListener(
      type,
      () => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            element.setAttribute("data-dom-ms", String(performance.now() - start));
          }),
        );
      },
      { once: true, capture: true },
    );
  }, eventName);
}

for (const repeat of [1, 200]) {
  test(`bounds real list changes with repeat=${repeat} @performance`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?repeat=${repeat}`);
    await expect(page.locator("[data-block-id]")).toHaveCount(repeat * 6);
    const select = page.getByLabel("List type block-1", { exact: true });
    await select.selectOption("checkbox");
    const samples: { commandMs: number; domMs: number; nodeReads: number }[] = [];
    for (const mode of [
      "numbered_list",
      "start_numbered_list",
      "continue_numbered_list",
      "",
      "list",
    ]) {
      await page.getByRole("button", { name: "Reset counters", exact: true }).click();
      await select.focus();
      await captureControlTiming(select);
      await page.keyboard.press(mode === "" ? "Home" : "ArrowDown");
      await expect(page.getByLabel("State block-1", { exact: true })).toContainText(
        `"listType":${JSON.stringify(mode || null)}`,
      );
      await expect(select).toHaveAttribute("data-dom-ms", /\d/);
      await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
      const metrics: DemoMetrics = JSON.parse(
        (await page.locator("[data-demo-metrics]").textContent())!,
      );
      expect(metrics.blockIdsReads).toBe(0);
      expect(metrics.nodeReads).toBeLessThanOrEqual(24);
      expect(metrics.notifications).toBe(2);
      await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
      samples.push({
        commandMs: metrics.commandMs,
        domMs: Number(await select.getAttribute("data-dom-ms")),
        nodeReads: metrics.nodeReads,
      });
    }
    await testInfo.attach(`list-change-repeat-${repeat}`, {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    console.log(`${testInfo.project.name} repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}

for (const repeat of [1, 200]) {
  test(`bounds real background changes with repeat=${repeat} @performance`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?repeat=${repeat}`);
    await expect(page.locator("[data-block-id]")).toHaveCount(repeat * 6);
    const row = page.locator('[data-block-id="block-1"]');
    const block = row;
    const originalTextColor = await block.evaluate((element) => getComputedStyle(element).color);
    const select = page.getByLabel("Background block-1", { exact: true });
    await select.selectOption("gray");
    const samples: { commandMs: number; domMs: number; nodeReads: number }[] = [];
    for (const color of ["red", "orange", "yellow", "green", "blue"]) {
      await page.getByRole("button", { name: "Reset counters", exact: true }).click();
      await select.focus();
      await captureControlTiming(select);
      await page.keyboard.press("ArrowDown");
      await expect(row).toHaveAttribute(
        "data-block-background",
        BACKGROUND_COLORS.find((background) => background.name === color)!.value,
      );
      await expect(block).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(block).toHaveCSS("color", originalTextColor);
      await expect(select).toHaveAttribute("data-dom-ms", /\d/);
      await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
      const metrics: DemoMetrics = JSON.parse(
        (await page.locator("[data-demo-metrics]").textContent())!,
      );
      expect(metrics.blockIdsReads).toBe(0);
      expect(metrics.nodeReads).toBeLessThanOrEqual(24);
      expect(metrics.notifications).toBe(2);
      await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
      samples.push({
        commandMs: metrics.commandMs,
        domMs: Number(await select.getAttribute("data-dom-ms")),
        nodeReads: metrics.nodeReads,
      });
    }
    await testInfo.attach(`background-change-repeat-${repeat}`, {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    console.log(`${testInfo.project.name} background repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}

for (const repeat of [1, 200]) {
  test(`bounds pointer slot commands with repeat=${repeat} @performance`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?repeat=${repeat}`);
    await expect(page.locator("[data-block-id]")).toHaveCount(repeat * 6);
    const collapse = page.locator(
      '[data-block-id="block-1"] > .rivto-block-row [data-block-control="collapse"]',
    );
    const checkbox = page.getByRole("checkbox", { name: "Check block-2", exact: true });
    const samples: { control: string; commandMs: number; domMs: number; nodeReads: number }[] = [];
    for (const control of [collapse, checkbox]) {
      await control.click();
      await control.click();
      for (let sample = 0; sample < 4; sample++) {
        await page.getByRole("button", { name: "Reset counters", exact: true }).click();
        await captureControlTiming(control, "click");
        await control.click();
        if (control === collapse) {
          await expect(control).toHaveAttribute("aria-expanded", String(sample % 2 !== 0));
          await expect(page.locator('[data-block-id="child-0"]')).toHaveCount(sample % 2);
        } else {
          await expect(control).toBeChecked({ checked: sample % 2 === 0 });
        }
        await expect(control).toHaveAttribute("data-dom-ms", /\d/);
        await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
        const metrics: DemoMetrics = JSON.parse(
          (await page.locator("[data-demo-metrics]").textContent())!,
        );
        expect(metrics.blockIdsReads).toBe(0);
        expect(metrics.nodeReads).toBeLessThanOrEqual(control === collapse ? 48 : 24);
        expect(metrics.notifications).toBe(2);
        await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
        samples.push({
          control: control === collapse ? "collapse" : "checkbox",
          commandMs: metrics.commandMs,
          domMs: Number(await control.getAttribute("data-dom-ms")),
          nodeReads: metrics.nodeReads,
        });
      }
    }
    await testInfo.attach(`slot-commands-repeat-${repeat}`, {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    console.log(
      `${testInfo.project.name} slot commands repeat=${repeat}: ${JSON.stringify(samples)}`,
    );
  });
}

test("observes focus crossing the editor boundary through an installed extension", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.locator("[data-rivto-block-editor]");
  await page.getByRole("textbox", { name: "Text block-1", exact: true }).focus();
  await expect(editor).toHaveAttribute("data-demo-focused", "true");
  await page.getByRole("textbox", { name: "Text block-2", exact: true }).focus();
  await expect(editor).toHaveAttribute("data-demo-focused", "true");
  await page.getByRole("button", { name: "Clear selection", exact: true }).focus();
  await expect(editor).not.toHaveAttribute("data-demo-focused");
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Demo slot", exact: true }).check();
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).check();
  await expect(page.locator('[data-slot-position="end"]')).toHaveCount(6);
  await page.getByRole("textbox", { name: "Text block-1", exact: true }).focus();
  await expect(editor).toHaveAttribute("data-demo-focused", "true");
  await page.getByRole("checkbox", { name: "Demo slot", exact: true }).uncheck();
  await expect(page.locator('[data-slot-position="end"]')).toHaveCount(0);
});

test("registers an element-owning wrapper dynamically and retains it across editor remounts", async ({
  page,
}) => {
  await page.goto("/");
  const text = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await text.fill("Retained through wrapper changes");
  await page.getByRole("checkbox", { name: "Demo wrapper", exact: true }).check();
  const blocks = page.locator("[data-block-id]");
  await expect(blocks).toHaveCount(6);
  await expect(page.locator("[data-demo-wrapper]")).toHaveCount(6);
  const wrapper = page.locator('[data-demo-wrapper="block-1"]');
  await expect(wrapper.locator(':scope > [data-block-id="block-1"]')).toHaveCount(1);
  await expect(
    page.locator('[data-demo-wrapper="child-0"] > [data-block-id="child-0"]'),
  ).toHaveCount(1);
  await expect(page.locator("[data-rivto-block-editor] > [data-demo-wrapper]")).toHaveCount(5);
  await text.click();
  await expect(wrapper).toHaveAttribute("data-demo-wrapper-pointer", "true");
  await expect(text).toHaveValue("Retained through wrapper changes");
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).check();
  await expect(page.locator("[data-demo-wrapper]")).toHaveCount(6);
  await expect(text).toHaveValue("Retained through wrapper changes");
  await page.getByRole("checkbox", { name: "Demo wrapper", exact: true }).uncheck();
  await expect(page.locator("[data-demo-wrapper]")).toHaveCount(0);
  await expect(text).toHaveValue("Retained through wrapper changes");
  await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Demo wrapper", exact: true }).check();
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).check();
  await expect(page.locator("[data-demo-wrapper]")).toHaveCount(6);
});

for (const repeat of [1, 200]) {
  test(`bounds native text input with a registered wrapper repeat=${repeat} @performance`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.getByRole("checkbox", { name: "Demo wrapper", exact: true }).check();
    await expect(page.locator("[data-demo-wrapper]")).toHaveCount(repeat * 6);
    const text = page.getByRole("textbox", { name: "Text block-1", exact: true });
    await text.fill("Warm");
    const samples: { commandMs: number; domMs: number; nodeReads: number }[] = [];
    for (let sample = 0; sample < 5; sample++) {
      await page.getByRole("button", { name: "Reset counters", exact: true }).click();
      await text.press("End");
      await captureControlTiming(text, "input");
      await text.press("x");
      await expect(text).toHaveValue(`Warm${"x".repeat(sample + 1)}`);
      await expect(text).toHaveAttribute("data-dom-ms", /\d/);
      await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
      const metrics: DemoMetrics = JSON.parse(
        (await page.locator("[data-demo-metrics]").textContent())!,
      );
      expect(metrics.blockIdsReads).toBe(0);
      expect(metrics.nodeReads).toBeLessThanOrEqual(24);
      expect(metrics.notifications).toBe(2);
      await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
      samples.push({
        commandMs: metrics.commandMs,
        domMs: Number(await text.getAttribute("data-dom-ms")),
        nodeReads: metrics.nodeReads,
      });
    }
    await expect(page.locator("[data-demo-wrapper]")).toHaveCount(repeat * 6);
    console.log(
      `${testInfo.project.name} registered wrapper repeat=${repeat}: ${JSON.stringify(samples)}`,
    );
  });
}

test("keeps list counter ownership on wrapper elements and existing tile placements", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Demo wrapper", exact: true }).check();
  for (const id of ["block-3", "block-4"]) {
    await expect(page.locator(`[data-demo-wrapper="${id}"]`)).toHaveCSS(
      "counter-set",
      "rivto-list-number 1",
    );
    await expect(page.locator(`[data-block-id="${id}"]`)).toHaveCSS("counter-increment", "none");
  }
  await page.getByRole("checkbox", { name: "Demo wrapper", exact: true }).uncheck();
  await expect(page.locator('[data-block-id="block-3"]')).toHaveCSS(
    "counter-set",
    "rivto-list-number 1",
  );
  await page.goto("/?example=bento");
  await page.getByRole("checkbox", { name: "Demo wrapper", exact: true }).check();
  await page.getByLabel("List type board-1-item-1", { exact: true }).selectOption("numbered_list");
  const wrapper = page.locator('[data-demo-wrapper="board-1-item-1"]');
  await expect(wrapper).toHaveCSS("counter-increment", "none");
  await expect(page.locator('[data-demo-tile="board-1-item-1"]')).toHaveCSS(
    "counter-set",
    "rivto-list-number 1",
  );
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
  await page
    .locator(
      '[data-demo-tile="board-1-item-1"] > [data-drop-placement="before"][data-drop-edge="block"]',
    )
    .hover();
  await expect(page.locator("[data-demo-drop-output]")).toContainText('"nextId":"board-1-item-1"');
});
