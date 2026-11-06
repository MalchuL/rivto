import { animate } from "motion";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Geometry needed to convert a scroll height into a CSS height. */
interface ExpansionGeometry {
  readonly padding: number;
  readonly borders: number;
  readonly borderBox: boolean;
}

/** Expansion animation and its content-size subscriptions. */
interface ExpansionHeightAnimation {
  readonly finished: Promise<unknown>;
  /**
   * Stops the height animation and releases its observers.
   *
   * @returns The animation and observers no longer update the host.
   */
  cancel(): void;
}

/**
 * Keeps a collapsing subtree mounted until its transition completes.
 *
 * @param elementRef - Host whose descendants are revealed and hidden.
 * @param collapsed - Current model collapse state.
 * @param duration - Transition duration in seconds; zero disables motion.
 * @returns Whether the collapsed subtree is retained for its exit transition.
 */
export function useBlockChildrenAnimation(
  elementRef: RefObject<HTMLDivElement | null>,
  collapsed: boolean,
  duration: number,
): boolean {
  const previousCollapsed = useRef(collapsed);
  const [retained, setRetained] = useState(!collapsed);
  useLayoutEffect(() => {
    const wasCollapsed = previousCollapsed.current;
    previousCollapsed.current = collapsed;
    const element = elementRef.current;
    if (collapsed) {
      if (wasCollapsed || !element || !duration) {
        setRetained(false);
        return;
      }
      return animateCollapse(element, duration, () => setRetained(false));
    }
    setRetained(true);
    if (wasCollapsed && element && duration) {
      return animateExpansion(element, duration);
    }
  }, [collapsed, duration, elementRef]);
  return retained;
}

/**
 * Closes a mounted child host and reports completion to its owner.
 *
 * @param element - Child host to close.
 * @param duration - Configured duration in seconds.
 * @param onComplete - Called after the close transition completes.
 * @returns Cleanup that cancels the transition and restores inline height.
 */
function animateCollapse(
  element: HTMLElement,
  duration: number,
  onComplete: () => void,
): () => void {
  const view = element.ownerDocument.defaultView;
  const reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const height = element.style.height;
  const measuredHeight = Number.parseFloat(view?.getComputedStyle(element).height ?? "");
  const startHeight = Number.isFinite(measuredHeight) ? measuredHeight : element.offsetHeight;
  const animation = animate(
    element,
    { height: [startHeight, 0] },
    {
      duration: reduced ? duration / 2 : duration,
      ease: "linear",
    },
  );
  let active = true;
  void animation.finished.then(() => {
    if (active) {
      onComplete();
    }
  });
  return () => {
    active = false;
    animation.cancel();
    element.style.height = height;
  };
}

/**
 * Reveals a child host while tracking content that changes size during the transition.
 *
 * @param element - Child host to reveal.
 * @param duration - Configured duration in seconds.
 * @returns Cleanup restoring geometry and cancelling the transition, or undefined without a window.
 */
function animateExpansion(element: HTMLElement, duration: number): (() => void) | undefined {
  const view = element.ownerDocument.defaultView;
  if (!view) {
    return;
  }
  const computed = view.getComputedStyle(element);
  const transitionDuration =
    duration / (view.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 2 : 1);
  const geometry: ExpansionGeometry = {
    padding:
      Number.parseFloat(computed.paddingTop || "0") +
      Number.parseFloat(computed.paddingBottom || "0"),
    borders:
      Number.parseFloat(computed.borderTopWidth || "0") +
      Number.parseFloat(computed.borderBottomWidth || "0"),
    borderBox: computed.boxSizing === "border-box",
  };
  const opacity = Number(computed.opacity || 1);
  const { height, overflow } = element.style;
  element.style.overflow = "hidden";
  element.style.height = "0px";
  const expansion = animateExpansionHeight(element, geometry, transitionDuration);
  const fade = animate(
    element,
    { opacity: [opacity * 0.6, opacity] },
    {
      duration: transitionDuration,
      ease: "linear",
    },
  );
  let active = true;
  /**
   * Restores the host's inline geometry after the reveal is finished.
   *
   * @returns The previous height and overflow styles are restored once.
   */
  const restore = () => {
    if (active) {
      active = false;
      expansion.cancel();
      element.style.height = height;
      element.style.overflow = overflow;
    }
  };
  void Promise.all([expansion.finished, fade.finished]).then(restore, restore);
  return () => {
    fade.cancel();
    restore();
  };
}

/**
 * Animates height toward a target that can change as descendants load.
 *
 * @param element - Host whose children determine its natural height.
 * @param geometry - Box-model values captured before the transition.
 * @param duration - Transition duration in seconds.
 * @returns The animation and a disposer for its content observers.
 */
function animateExpansionHeight(
  element: HTMLElement,
  geometry: ExpansionGeometry,
  duration: number,
): ExpansionHeightAnimation {
  let targetHeight = expansionHeight(element, geometry);
  let currentHeight = 0;
  let currentProgress = 0;
  let segmentHeight = 0;
  let segmentProgress = 0;
  let active = true;
  const releaseObservers = observeExpansionChildren(element, () => {
    const nextHeight = expansionHeight(element, geometry);
    if (nextHeight !== targetHeight && currentProgress < 1) {
      segmentHeight = currentHeight;
      segmentProgress = currentProgress;
      targetHeight = nextHeight;
    }
  });
  const animation = animate(0, 1, {
    duration,
    ease: "linear",
    onUpdate: (progress) => {
      if (active) {
        currentProgress = progress;
        const ratio = (progress - segmentProgress) / (1 - segmentProgress);
        currentHeight = segmentHeight + (targetHeight - segmentHeight) * ratio;
        element.style.height = `${currentHeight}px`;
      }
    },
  });
  return {
    finished: animation.finished,
    /**
     * Cancels height updates and disconnects the content observers.
     *
     * @returns The transition no longer changes the element.
     */
    cancel() {
      active = false;
      animation.cancel();
      releaseObservers();
    },
  };
}

/**
 * Converts the host's content height into the height used by its box model.
 *
 * @param element - Child host whose content may overflow while expanding.
 * @param geometry - Captured padding, borders, and box sizing.
 * @returns Target CSS height in pixels.
 */
function expansionHeight(element: HTMLElement, geometry: ExpansionGeometry): number {
  return geometry.borderBox
    ? element.scrollHeight + geometry.borders
    : element.scrollHeight - geometry.padding;
}

/**
 * Watches direct child sizes and newly mounted descendants during expansion.
 *
 * @param element - Child host whose natural content size is tracked.
 * @param onChange - Refreshes the target after content changes.
 * @returns Disposer disconnecting both observers.
 */
function observeExpansionChildren(element: HTMLElement, onChange: () => void): () => void {
  const resizeObserver = new ResizeObserver(onChange);
  /**
   * Observes newly mounted direct children and refreshes the target height.
   *
   * @returns Current children are observed until the transition ends.
   */
  const observe = () => {
    for (const child of element.children) {
      resizeObserver.observe(child);
    }
    onChange();
  };
  const mutationObserver = new MutationObserver(observe);
  mutationObserver.observe(element, { childList: true, subtree: true });
  observe();
  return () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}
