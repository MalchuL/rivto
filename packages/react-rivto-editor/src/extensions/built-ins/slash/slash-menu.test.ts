/**
 * Slash popup placement checks for host-adjustable dimensions.
 *
 * The menu's caret anchor and side choice must use the options supplied by
 * the host, so changing the height or spacing has a visible effect.
 *
 * @module
 */
import { popupPosition } from "./slash-menu";

test("uses configured dimensions to choose the side and clamp horizontal placement", () => {
  const content = {
    ownerDocument: {
      getSelection: () => null,
      defaultView: { innerWidth: 500, innerHeight: 300 },
    },
    getBoundingClientRect: () => ({ top: 180, bottom: 200, left: 450 }),
  } as unknown as HTMLElement;
  const options = { width: 200, maxHeight: 120, gap: 10, viewportPadding: 20 };

  expect(popupPosition(content, options)).toEqual({ left: 280, top: 170, above: true });
  expect(popupPosition(content, { ...options, maxHeight: 50 })).toEqual({
    left: 280,
    top: 210,
    above: false,
  });
});
