/**
 * Installs deterministic geometry for every measured text offset.
 *
 * @param left - Computes the horizontal coordinate from text and UTF-16 offset.
 * @param top - Computes the visual-line coordinate from the text offset.
 * @returns Restores the browser range geometry method.
 */
export function mockCaretGeometry(
  left: (text: string, offset: number) => number,
  top: (offset: number) => number = () => 0,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    /**
     * Supplies the requested visual coordinates for the measured range start.
     *
     * @returns A nonempty rectangle with deterministic line and horizontal positions.
     */
    value(this: Range) {
      return {
        left: left(this.startContainer.textContent ?? "", this.startOffset),
        top: top(this.startOffset),
        height: 20,
      };
    },
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(Range.prototype, "getBoundingClientRect", descriptor);
    } else {
      Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    }
  };
}
