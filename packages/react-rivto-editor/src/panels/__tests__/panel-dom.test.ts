/** @jest-environment jsdom */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";

test("region walks stay within the displayed occurrence, including regions inside a view", () => {
  const surface = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  const card = document.createElement("div");
  const ownContent = document.createElement("div");
  ownContent.dataset.content = "own";
  const nestedSurface = document.createElement("div");
  nestedSurface.dataset.rivtoPanel = "";
  const nestedContent = document.createElement("div");
  nestedContent.dataset.content = "nested";
  nestedSurface.append(nestedContent);
  card.append(ownContent, nestedSurface);
  surface.append(card);
  const occurrence = new BrowserInputRoot(surface);
  const nested = new BrowserInputRoot(nestedSurface);
  try {
    const region = occurrence.captureRegionByIdentity(getBrowserElementIdentity(card))!;
    const own = getBrowserElementIdentity(ownContent);
    expect(
      occurrence
        .findRegions("[data-content]", "[data-rivto-panel]")
        .map((item) => item.getIdentity()),
    ).toEqual([own]);
    expect(
      region.findRegions("[data-content]", "[data-rivto-panel]").map((item) => item.getIdentity()),
    ).toEqual([own]);
    expect(
      nested.findRegions("[data-content]", "[data-rivto-panel]").map((item) => item.getIdentity()),
    ).toEqual([getBrowserElementIdentity(nestedContent)]);
  } finally {
    occurrence.detach();
    nested.detach();
  }
});
