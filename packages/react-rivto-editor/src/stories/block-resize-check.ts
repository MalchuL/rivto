import { expect, waitFor } from "storybook/test";

const FRAME_SELECTOR = "[data-block-resize-frame]";
const SURFACE_SELECTOR = ".page-surface";
/** Page-block padding, collapse toggle, and drag handle that sit in the surface gutter. */
const GUTTER_PX = 56;
const OVERFLOW_TOLERANCE_PX = 1;
const SCROLL_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/**
 * Reads a pixel length from a CSS padding component.
 *
 * @param value - Raw CSS length such as `24px`, or an empty declaration.
 * @returns The pixel amount, or undefined when the value is not a px length.
 */
function parsePx(value: string): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

/**
 * Resolves the horizontal sides of a CSS padding shorthand.
 *
 * @param value - `padding` shorthand, possibly empty.
 * @returns Left and right padding, or undefined when the shorthand cannot be read.
 */
function horizontalPadding(value: string): { left: number; right: number } | undefined {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const side = parsePx(parts[0] ?? "");
    return side === undefined ? undefined : { left: side, right: side };
  }
  if (parts.length === 2 || parts.length === 3) {
    const side = parsePx(parts[1] ?? "");
    return side === undefined ? undefined : { left: side, right: side };
  }
  if (parts.length === 4) {
    const right = parsePx(parts[1] ?? "");
    const left = parsePx(parts[3] ?? "");
    if (left === undefined || right === undefined) {
      return undefined;
    }
    return { left, right };
  }
  return undefined;
}

/**
 * Walks grouped CSS rules, marking declarations inside a max-width 640px query.
 *
 * @param rules - Rules from one stylesheet or grouping rule.
 * @param narrow - True when an ancestor media query is the narrow page breakpoint.
 * @param visit - Callback for each style rule and whether it is inside that breakpoint.
 * @returns Nothing after the rules have been visited.
 */
function visitCssRules(
  rules: CSSRuleList,
  narrow: boolean,
  visit: (rule: CSSStyleRule, narrow: boolean) => void,
): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      visit(rule, narrow);
      continue;
    }
    if (rule instanceof CSSMediaRule) {
      const condition = rule.conditionText;
      const matchesNarrow = condition.includes("max-width") && condition.includes("640px");
      visitCssRules(rule.cssRules, narrow || matchesNarrow, visit);
      continue;
    }
    if (rule instanceof CSSGroupingRule) {
      visitCssRules(rule.cssRules, narrow, visit);
    }
  }
}

/**
 * Requires the narrow page-surface rule to keep horizontal padding for the gutter.
 *
 * A viewport at or below 640px used to shrink horizontal padding to 24px, which
 * is less than the handle and collapse control. The live computed padding is
 * checked only while that media query matches.
 *
 * @param surface - Mounted page surface being measured.
 * @returns Nothing when the gutter still fits.
 * @throws When a narrow `.page-surface` padding rule is below the gutter.
 */
function assertNarrowSurfacePadding(surface: HTMLElement): void {
  let narrowHorizontal = Number.POSITIVE_INFINITY;
  let sawNarrowPadding = false;
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    visitCssRules(rules, false, (rule, narrow) => {
      const selectsSurface = rule.selectorText
        .split(",")
        .some((selector) => selector.trim() === ".page-surface");
      if (!narrow || !selectsSurface) {
        return;
      }
      const inline = horizontalPadding(rule.style.padding);
      const left = parsePx(rule.style.paddingLeft) ?? inline?.left;
      const right = parsePx(rule.style.paddingRight) ?? inline?.right;
      if (left === undefined || right === undefined) {
        return;
      }
      sawNarrowPadding = true;
      narrowHorizontal = Math.min(narrowHorizontal, left, right);
    });
  }
  if (sawNarrowPadding && narrowHorizontal < GUTTER_PX) {
    throw new Error(
      `Narrow .page-surface padding is ${narrowHorizontal}px; the gutter needs ${GUTTER_PX}px`,
    );
  }
  if (!window.matchMedia("(max-width: 640px)").matches) {
    return;
  }
  const style = getComputedStyle(surface);
  const left = Number.parseFloat(style.paddingLeft);
  const right = Number.parseFloat(style.paddingRight);
  if (left < GUTTER_PX || right < GUTTER_PX) {
    throw new Error(`Narrow page padding ${left}/${right}px is below the ${GUTTER_PX}px gutter`);
  }
}

/**
 * Reports whether an element is a horizontal scrollport that may contain wide content.
 *
 * @param element - Candidate scroll container.
 * @returns True when overflow-x is auto, scroll, or overlay.
 */
function isHorizontalScrollport(element: HTMLElement): boolean {
  return SCROLL_OVERFLOW.has(getComputedStyle(element).overflowX);
}

/**
 * Finds a horizontal scrollport between an element and the page surface.
 *
 * @param element - Element whose ancestors are inspected.
 * @param surface - Page surface that ends the walk.
 * @returns The nearest scrollport, or null when the element is in normal column flow.
 */
function scrollportBetween(element: HTMLElement, surface: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current && current !== surface) {
    if (isHorizontalScrollport(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Describes an element for an overflow failure.
 *
 * @param element - Element that crossed the surface.
 * @returns Block type, class, and a short text sample.
 */
function overflowLabel(element: HTMLElement): string {
  const type = element.closest("[data-block-type]")?.getAttribute("data-block-type") ?? element.tagName;
  const className = typeof element.className === "string" ? element.className : "";
  const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 48);
  return `${type} ${className} ${text}`.trim();
}

/**
 * Requires one element's border box to stay inside the page surface horizontally.
 *
 * Absolutely positioned chrome and descendants of an intentional horizontal
 * scrollport are skipped. A scrollport's own box must still lie inside the surface.
 *
 * @param element - Candidate element inside the surface.
 * @param surface - Page surface that forms the column boundary.
 * @param bounds - Border box of that surface.
 * @returns Nothing when the element is allowed to extend or fits horizontally.
 * @throws When the element paints outside the surface, or its own text is wider than its box.
 */
function assertElementWithin(element: HTMLElement, surface: HTMLElement, bounds: DOMRect): void {
  const position = getComputedStyle(element).position;
  if (position === "absolute" || position === "fixed" || scrollportBetween(element, surface)) {
    return;
  }
  const box = element.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) {
    return;
  }
  const overflowLeft = bounds.left - box.left;
  const overflowRight = box.right - bounds.right;
  if (overflowLeft > OVERFLOW_TOLERANCE_PX || overflowRight > OVERFLOW_TOLERANCE_PX) {
    const childSummary = [...element.children]
      .map((child) => {
        const childBox = child.getBoundingClientRect();
        const childPosition = getComputedStyle(child).position;
        const childClass = typeof child.className === "string" ? child.className : child.tagName;
        return `${childClass} ${childPosition} ${Math.round(childBox.width)}x${Math.round(childBox.height)}`;
      })
      .join(" | ");
    throw new Error(
      `${overflowLabel(element)} overflows the page by left ${overflowLeft.toFixed(1)}px, right ${overflowRight.toFixed(1)}px; box ${Math.round(box.width)}x${Math.round(box.height)}; surface ${Math.round(bounds.width)}; children: ${childSummary}`,
    );
  }
  assertLeafContentFits(element);
}

/**
 * Requires a text leaf to keep its content inside its own border box.
 *
 * Parent boxes can stay inside the page while an unbreakable string paints
 * past them. Elements that clip or scroll their own content are left alone.
 * Inline boxes report a client width of 0 in Firefox, so their text is judged
 * by the border box instead of scroll width.
 *
 * @param element - Element whose border box already lies inside the page.
 * @returns Nothing when the element has descendants or its content fits.
 * @throws When visible text is wider than the element.
 */
function assertLeafContentFits(element: HTMLElement): void {
  if (element.childElementCount > 0 || element.clientWidth < 1) {
    return;
  }
  const style = getComputedStyle(element);
  if (style.display === "inline" || style.overflowX !== "visible") {
    return;
  }
  if (element.scrollWidth <= element.clientWidth + OVERFLOW_TOLERANCE_PX) {
    return;
  }
  throw new Error(
    `${overflowLabel(element)} content is ${element.scrollWidth}px in a ${element.clientWidth}px box`,
  );
}

/**
 * Requires every in-flow block and control in the frame to stay inside the page surface.
 *
 * @param frame - Story column whose width was just changed.
 * @param width - Column width in CSS pixels requested for this sample.
 * @returns Nothing when the column contains its blocks.
 * @throws When the surface is missing or a block falls outside it.
 */
function assertFrameContainsBlocks(frame: HTMLElement, width: number): void {
  const surface = frame.querySelector<HTMLElement>(SURFACE_SELECTOR);
  if (!surface) {
    throw new Error("Missing page surface");
  }
  const bounds = surface.getBoundingClientRect();
  const frameBounds = frame.getBoundingClientRect();
  if (bounds.right > frameBounds.right + OVERFLOW_TOLERANCE_PX) {
    throw new Error("Page surface is wider than the story column");
  }
  assertNarrowSurfacePadding(surface);
  const failures: string[] = [];
  for (const element of surface.querySelectorAll<HTMLElement>("*")) {
    try {
      assertElementWithin(element, surface, bounds);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) {
    const used = Math.round(frame.getBoundingClientRect().width);
    throw new Error(
      `column ${width}px used ${used}px, viewport ${window.innerWidth}px, surface ${Math.round(bounds.width)}px\n${failures.slice(0, 8).join("\n")}`,
    );
  }
}

/**
 * Measures the wrapping sample after layout has settled.
 *
 * @param frame - Story column containing the seeded page.
 * @returns Border-box height of the WrapSample preview.
 * @throws When the sample has not rendered.
 */
function wrapSampleHeight(frame: HTMLElement): number {
  const sample = [...frame.querySelectorAll<HTMLElement>(".markdown-preview")].find((preview) =>
    preview.textContent?.includes("WrapSample"),
  );
  if (!sample) {
    throw new Error("Missing WrapSample preview");
  }
  return sample.getBoundingClientRect().height;
}

/**
 * Waits two frames so the browser applies the new column width.
 *
 * @returns Nothing after the second animation frame.
 */
function settleLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Resizes the story column and checks that current blocks adapt instead of falling out.
 *
 * The widest sample must become taller at the narrowest width, which fails if
 * text is clipped to a single line or the column grows with its content.
 *
 * @param canvasElement - Story root that contains the resize frame.
 * @param widths - Column widths in CSS pixels, from widest to narrowest.
 * @returns Nothing after every width has been measured.
 * @throws When the frame or seeded paragraph is missing, or a width overflows.
 */
export async function playBlockResize(
  canvasElement: HTMLElement,
  widths: readonly number[],
): Promise<void> {
  const frame = canvasElement.querySelector<HTMLElement>(FRAME_SELECTOR);
  if (!frame) {
    throw new Error("Missing block resize frame");
  }
  await waitFor(() => {
    if (!frame.querySelector("[data-block-type='paragraph']")) {
      throw new Error("Paragraph block has not rendered");
    }
  });
  let wideHeight = 0;
  for (const [index, width] of widths.entries()) {
    frame.style.width = `${width}px`;
    await settleLayout();
    assertFrameContainsBlocks(frame, width);
    const height = wrapSampleHeight(frame);
    if (index === 0) {
      wideHeight = height;
    }
    const narrowest = index === widths.length - 1;
    const first = widths[0] ?? width;
    if (narrowest && first - width >= 80) {
      await expect(height, "WrapSample height").toBeGreaterThan(wideHeight);
    }
  }
}
