import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Counts painted connector ink around a path or endpoint position from a real screenshot.
 *
 * The fixture uses #123456 to distinguish its path and arrowheads from the demo
 * background and accent marker. PNG decoding uses the browser's native canvas.
 *
 * @param page - Demo page rendering the connector.
 * @param point - Path or endpoint sample center in viewport pixels.
 * @returns Resolves with the number of pixels matching the fixture's ink color.
 * @throws If screenshot capture, PNG decoding or canvas access fails.
 */
async function countConnectorInkPixels(page: Page, point: { x: number; y: number }) {
  const screenshot = await page.screenshot({
    clip: { x: point.x - 24, y: point.y - 24, width: 48, height: 48 },
  });
  return page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (
        Math.abs(data[index]! - 18) < 15 &&
        Math.abs(data[index + 1]! - 52) < 15 &&
        Math.abs(data[index + 2]! - 86) < 15
      ) {
        pixels++;
      }
    }
    return pixels;
  }, screenshot.toString("base64"));
}

for (const repeat of [0, 200]) {
  test(`keeps connectors painted while highlighting endpoints and reconnecting, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await page.locator(".edgeless-viewport").evaluate((element) => element.scrollIntoView());
    const ids = await page.evaluate(() => {
      const { editor } = (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo;
      const target = editor.elements.insertElement({
        type: "rectangle",
        frame: { x: 300, y: 150, width: 160, height: 100 },
        zIndex: 10000,
      }).id;
      const connector = editor.elements.insertElement({
        type: "connector",
        frame: { x: 100, y: 200, width: 200, height: 1 },
        props: {
          stroke: "#123456",
          startStyle: "arrow",
          source: { anchor: { x: 0.5, y: 0.5 }, position: { x: 100, y: 200 } },
          target: { elementId: target, anchor: { x: 0, y: 0.5 }, position: { x: 300, y: 200 } },
        },
        zIndex: 10001,
      }).id;
      return { target, connector };
    });
    const target = page.locator(`[data-edgeless-object-id="${ids.target}"]`);
    const bounds = (await target.boundingBox())!;
    const outline = page.locator(".edgeless-connector-target-outline");
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Connectors", exact: true }).click();
    await page.getByRole("button", { name: "Straight connector", exact: true }).click();
    // The outside attachment allowance remains usable with a zero-offset border.
    await page.mouse.move(bounds.x - 10, bounds.y + bounds.height / 2);
    await expect(page.locator("[data-edgeless-connector-anchors]")).toHaveAttribute(
      "data-edgeless-connector-anchors",
      ids.target,
    );
    expect.soft(await outline.getAttribute("x")).toBe("300");
    expect.soft(await outline.getAttribute("y")).toBe("150");
    expect.soft(await outline.getAttribute("width")).toBe("160");
    expect.soft(await outline.getAttribute("height")).toBe("100");
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    const connector = page.locator(`[data-edgeless-object-id="${ids.connector}"]`);
    const hit = (await connector.boundingBox())!;
    await page.mouse.click(hit.x + 40, hit.y);
    const endpoint = connector.getByRole("button", { name: "Reconnect target" });
    await expect(endpoint).toBeVisible();
    const middle = { x: hit.x + hit.width / 2, y: hit.y + hit.height / 2 };
    const lineBeforeHover = await countConnectorInkPixels(page, middle);
    expect(lineBeforeHover).toBeGreaterThan(40);
    for (const key of ["source", "target"] as const) {
      const control = connector.getByRole("button", { name: `Reconnect ${key}` });
      await expect(control).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(control).toHaveCSS("border-top-width", "0px");
      const bounds = (await control.boundingBox())!;
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const inkBeforeHover = await countConnectorInkPixels(page, point);
      const highlight = connector.locator(`[data-edgeless-connector-endpoint-highlight="${key}"]`);
      await page.mouse.move(point.x, point.y);
      await expect(highlight).toHaveCSS("opacity", "1");
      await expect(highlight).toHaveCSS("fill", "none");
      await expect(highlight).toHaveAttribute("r", "9");
      await expect(control).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      expect(inkBeforeHover).toBeGreaterThan(40);
      expect(await countConnectorInkPixels(page, point)).toBeGreaterThanOrEqual(
        inkBeforeHover * 0.95,
      );
      expect(await countConnectorInkPixels(page, middle)).toBeGreaterThanOrEqual(
        lineBeforeHover * 0.95,
      );
      await page.mouse.move(hit.x + 40, hit.y);
      await expect(highlight).toHaveCSS("opacity", "0");
    }
    const endpointBounds = (await endpoint.boundingBox())!;
    await page.mouse.move(
      endpointBounds.x + endpointBounds.width / 2,
      endpointBounds.y + endpointBounds.height / 2,
    );
    await expect(endpoint).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.mouse.down();
    await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2);
    await expect(outline).toBeVisible();
    // Temporarily include inert SVG markers in hit testing to inspect actual paint order.
    const painted = await outline.evaluate((element, targetId) => {
      const capture = element.closest("svg")!;
      const markers = [...capture.querySelectorAll<SVGElement>("rect, circle")];
      markers.forEach((marker) => {
        marker.style.pointerEvents = "all";
      });
      const box = capture.querySelector("circle[data-active]")!.getBoundingClientRect();
      const result = document
        .elementsFromPoint(box.x + box.width / 2 + 0.25, box.y + box.height / 2)
        .map((hit) => {
          if (hit.matches(".edgeless-connector-anchor")) {
            return "dot";
          }
          if (hit === element) {
            return "outline";
          }
          if (hit.closest(`[data-edgeless-object-id="${targetId}"]`)) {
            return "target";
          }
          return "other";
        });
      markers.forEach((marker) => {
        marker.style.removeProperty("pointer-events");
      });
      return result;
    }, ids.target);
    expect(painted).toEqual(expect.arrayContaining(["dot", "outline", "target"]));
    expect(painted.indexOf("dot")).toBeLessThan(painted.indexOf("outline"));
    expect(painted.indexOf("outline")).toBeLessThan(painted.indexOf("target"));
    await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2);
    await page.mouse.up();
    await expect(outline).toHaveCount(0);
    const endpointTarget = await page.evaluate((id) => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
      return editor.elements.getElementNode(id)!.props.target;
    }, ids.connector);
    expect(endpointTarget).toMatchObject({ elementId: ids.target, anchor: { x: 1, y: 0.5 } });
  });

  test(`reconnects a grouped curve source without attaching to its own ancestor, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await page.locator(".edgeless-viewport").evaluate((element) => element.scrollIntoView());
    const initial = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
      const connector = editor.elements
        .getElementNodes()
        .find((element) => element.type === "connector" && element.props.route === "curve")!;
      editor.commands.execute("edgeless.selection.set", [connector.id]);
      const source = connector.props.source as { elementId: string };
      return {
        id: connector.id,
        sourceId: source.elementId,
        attachmentId: editor.elements.getParentId(connector.id)!,
        target: connector.props.target,
      };
    });
    const connector = page.locator(`[data-edgeless-object-id="${initial.id}"]`);
    const source = connector.getByRole("button", { name: "Reconnect source" });
    const sourceBounds = (await source.boundingBox())!;
    const ellipse = page.locator(`[data-edgeless-object-id="${initial.sourceId}"]`);
    const bounds = (await ellipse.boundingBox())!;
    await page.mouse.move(
      sourceBounds.x + sourceBounds.width / 2,
      sourceBounds.y + sourceBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 2, { steps: 5 });
    const highlightedId = await page
      .locator("[data-edgeless-connector-anchors]")
      .getAttribute("data-edgeless-connector-anchors");
    await page.mouse.up();
    expect(errors).toEqual([]);
    expect(highlightedId).toBe(initial.attachmentId);
    await expect(page.locator(".edgeless-connector-target-outline")).toHaveCount(0);
    const updated = await page.evaluate((id) => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
      return editor.elements.getElementNode(id)!;
    }, initial.id);
    expect(updated.props.source).not.toHaveProperty("elementId");
    expect(updated.props.target).toEqual(initial.target);
    for (const value of Object.values(updated.frame)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(2000);
    }
    await expect(connector.locator(".edgeless-connector-stroke")).not.toHaveAttribute(
      "d",
      /NaN|Infinity/,
    );
    const count = await page.locator('[data-edgeless-visual-kind="rectangle"]').count();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    const viewport = (await page.locator(".edgeless-viewport").boundingBox())!;
    await page.mouse.click(viewport.x + 800, viewport.y + 300);
    await expect(page.locator('[data-edgeless-visual-kind="rectangle"]')).toHaveCount(count + 1);
    expect(errors).toEqual([]);
  });

  test(`paints visible loops for coincident connector endpoints, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await page.locator(".edgeless-viewport").evaluate((element) => element.scrollIntoView());
    const ids = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
      editor.elements.insertElement({
        type: "rectangle",
        frame: { x: 100, y: 100, width: 600, height: 400 },
        props: { fill: "#ffffff" },
        zIndex: 10000,
      });
      return [0, 1, 2].map(
        (index) =>
          editor.elements.insertElement({
            type: "rectangle",
            frame: { x: 140 + index * 150, y: 180, width: 60, height: 80 },
            zIndex: 10001,
          }).id,
      );
    });
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    const menu = page.getByRole("dialog", { name: "connectors tools" });
    for (const [index, route] of ["straight", "orthogonal", "curve"].entries()) {
      if (!(await menu.isVisible())) {
        await toolbar.getByRole("button", { name: "Connectors", exact: true }).click();
      }
      await menu
        .getByRole("button", {
          name: `${route[0]!.toUpperCase() + route.slice(1)} connector`,
          exact: true,
        })
        .click();
      const source = page.locator(`[data-edgeless-object-id="${ids[index]}"]`);
      const sourceBounds = (await source.boundingBox())!;
      const point = {
        x: sourceBounds.x + sourceBounds.width,
        y: sourceBounds.y + sourceBounds.height / 2,
      };
      const connectors = page.locator('[data-edgeless-visual-kind="connector"]');
      const count = await connectors.count();
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 80, point.y, { steps: 4 });
      await page.mouse.move(point.x, point.y, { steps: 4 });
      await page.mouse.up();
      await expect(connectors).toHaveCount(count + 1);
      const created = page.locator('[data-edgeless-visual-kind="connector"][data-selected="true"]');
      await expect(created.locator("svg.edgeless-connector")).toHaveAttribute(
        "data-edgeless-connector-route",
        route,
      );
      const path = created.locator(".edgeless-connector-stroke");
      await expect(path).not.toHaveAttribute("d", /NaN|Infinity/);
      const bounds = (await path.boundingBox())!;
      expect(bounds.width).toBeGreaterThan(10);
      expect(bounds.height).toBeGreaterThan(10);
      const id = (await created.getAttribute("data-edgeless-object-id"))!;
      await page.evaluate((id) => {
        const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo;
        editor.elements.updateElement(id, { props: { stroke: "#123456" } });
      }, id);
      await expect(path).toHaveAttribute("stroke", "#123456");
      expect(
        await countConnectorInkPixels(page, {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        }),
      ).toBeGreaterThan(40);
    }
    expect(errors).toEqual([]);
  });
}
