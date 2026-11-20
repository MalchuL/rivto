import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { InputRegion, InputRoot } from "@chulane/rivto-root";
import type { CanvasToolbarLayout } from "../types/toolbar";
import type {
  CanvasToolbarDismissalTools,
  CanvasToolbarInputAttachment,
} from "../components/types";

/**
 * Observes document input for a mounted toolbar's open menu.
 *
 * A toolbar inside the viewport borrows its Root; a standalone or external
 * toolbar owns a Root only until this binding is released.
 *
 * @param element - Mounted toolbar used to classify inside pointer input.
 * @param layers - Current viewport attachment, or null outside a viewport.
 * @param setMenu - Publishes menu dismissal.
 * @param tools - Supplies the active tool and fallback action.
 * @returns Cleanup releasing the observations and any toolbar-owned Root.
 * @throws Propagates Root capture, observation, rollback, and cleanup failures.
 */
export function attachCanvasToolbarDismissal(
  element: HTMLElement,
  layers: CanvasToolbarInputAttachment | null,
  setMenu: CanvasToolbarLayout["setMenu"],
  tools: CanvasToolbarDismissalTools,
): () => void {
  let active = true;
  const candidate = layers?.inputRoot;
  const region = candidate?.captureRegionByIdentity(
    getBrowserElementIdentity(element),
    () => active && (layers?.coordinates.isAttached() ?? false),
  );
  const ownedRoot = region ? undefined : new BrowserInputRoot(element, () => active);
  const occurrence = ownedRoot ?? candidate;
  const releases: Array<() => void> = [];
  try {
    if (!occurrence) {
      throw new Error("Toolbar input Root is unavailable");
    }
    const toolbar =
      region ?? occurrence.captureRegionByIdentity(getBrowserElementIdentity(element));
    if (!toolbar) {
      active = false;
      releaseToolbarInput(releases, ownedRoot);
      return () => {};
    }
    const isCurrent = () => active && (!region || Boolean(layers?.coordinates.isAttached()));
    observeToolbarInput(occurrence, toolbar, isCurrent, setMenu, tools, releases);
    if (!isCurrent()) {
      active = false;
      releaseToolbarInput(releases, ownedRoot);
    }
  } catch (error) {
    active = false;
    try {
      releaseToolbarInput(releases, ownedRoot);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Toolbar input setup failed");
    }
    throw error;
  }
  return () => {
    if (!active) {
      return;
    }
    active = false;
    releaseToolbarInput(releases, ownedRoot);
  };
}

/**
 * Installs Escape and outside-pointer observations for a toolbar menu.
 *
 * @param root - Root providing document-phase input.
 * @param toolbar - Captured region used to identify inside pointer input.
 * @param isCurrent - Checks this exact toolbar binding.
 * @param setMenu - Publishes menu dismissal.
 * @param tools - Supplies fallback and menu-retention policy.
 * @param releases - Retains each installed listener's disposer.
 * @returns Installed listeners are retained for cleanup.
 * @throws Propagates observation setup failures.
 */
function observeToolbarInput(
  root: Pick<InputRoot, "observeDocumentInput">,
  toolbar: InputRegion | undefined,
  isCurrent: () => boolean,
  setMenu: CanvasToolbarLayout["setMenu"],
  tools: CanvasToolbarDismissalTools,
  releases: Array<() => void>,
): void {
  releases.push(
    root.observeDocumentInput("keydown", "bubble", (input) => {
      if (isCurrent() && input.key === "Escape" && !input.defaultPrevented) {
        tools.reset();
        if (isCurrent()) {
          setMenu(null);
        }
      }
    }),
  );
  releases.push(
    root.observeDocumentInput("pointerdown", "bubble", (input) => {
      if (
        isCurrent() &&
        !toolbar?.containsTarget(input.target) &&
        !tools.active?.keepsMenuOpen &&
        isCurrent()
      ) {
        setMenu(null);
      }
    }),
  );
}

/**
 * Releases document observations and any Root created for a standalone toolbar.
 *
 * @param releases - Document listener disposers consumed by this cleanup.
 * @param ownedRoot - Toolbar-owned Root when no canvas occurrence contained it.
 * @returns All listeners and the optional Root have been offered cleanup.
 * @throws AggregateError when one or more cleanup operations fail.
 */
function releaseToolbarInput(releases: Array<() => void>, ownedRoot?: BrowserInputRoot): void {
  const errors: unknown[] = [];
  const cleanup = [...releases.splice(0), ...(ownedRoot ? [() => ownedRoot.detach()] : [])];
  for (const release of cleanup) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Toolbar input cleanup failed");
  }
}
