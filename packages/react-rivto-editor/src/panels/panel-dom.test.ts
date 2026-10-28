import { isInPanel } from "./panel-dom";

test("DOM walks stay within the displayed document occurrence, including regions inside a view", () => {
  const surface = { closest: () => surface } as unknown as HTMLElement;
  const card = { closest: () => surface } as unknown as HTMLElement;
  const ownContent = { closest: () => surface } as unknown as Element;
  const nestedSurface = { closest: () => nestedSurface } as unknown as HTMLElement;
  const nestedContent = { closest: () => nestedSurface } as unknown as Element;
  expect(isInPanel(surface, ownContent)).toBe(true);
  expect(isInPanel(card, ownContent)).toBe(true);
  expect(isInPanel(card, nestedContent)).toBe(false);
  expect(isInPanel(surface, nestedContent)).toBe(false);
  expect(isInPanel(nestedSurface, nestedContent)).toBe(true);
});
