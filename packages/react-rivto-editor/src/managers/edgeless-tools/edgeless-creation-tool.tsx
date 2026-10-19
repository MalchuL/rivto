import type { VisualFrame } from "../../elements/visuals/types";
import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
import type { CreateElementInput } from "../elements/types";
import type { ElementCreationDefaults } from "../elements/creation-defaults-types";
import type { CanvasPoint } from "../../elements/visuals/utils/canvas-point";
import type { SnapGuide } from "../../elements/visuals/utils/geometry";
import {
  centeredPlaceFrame,
  DEFAULT_PLACE_SIZE,
  snapPlacedFrame,
  snapDraggedFrame,
} from "../../elements/visuals/utils/creation-geometry";
import { ElementCreationPreview } from "../../elements/visuals/element-creation-preview";
import { useEditorRoot } from "../../hooks/editor/use-editor-root";
import { showSnapGuides } from "../../extensions/edgeless/visuals/utils/snap-guides";
import { EdgelessTool, type EdgelessToolOptions, type EdgelessToolPointer } from "./edgeless-tool";

/** Detached placement shown by toolbar drag; no persisted identity exists yet. */
export interface EdgelessCreationPlacement {
  readonly input: CreateElementInput;
  readonly frame: VisualFrame;
  readonly guides?: readonly SnapGuide[];
}

/** Parameters for the ordinary element-placement tool, including the unchanged element factory. */
export interface EdgelessCreationToolOptions extends EdgelessToolOptions {
  readonly type: string;
  /**
   * Prepares raw creation data once for the next prospective element.
   *
   * @returns Detached input of the configured type; must not write document records.
   */
  readonly create: () => CreateElementInput;
}

/** Click, canvas drag and toolbar placement using the element's registered renderer. */
export class EdgelessCreationTool extends EdgelessTool {
  override readonly capturesPointer: boolean = true;
  override readonly keepsMenuOpen: boolean = true;
  /** Enables toolbar drag through this creation tool’s placement contract. */
  readonly supportsPlacement: boolean = true;
  protected pointer?: { readonly id: number; readonly start: CanvasPoint };
  protected draft?: EdgelessCreationPlacement;
  protected guides: readonly SnapGuide[] = [];
  private input?: CreateElementInput;

  /**
   * Binds placement to an element registration without evaluating its input factory.
   *
   * @param creation - Surface dependencies, persisted type and prospective-input factory.
   */
  constructor(protected readonly creation: EdgelessCreationToolOptions) {
    super(creation);
  }

  /**
   * Resolves type-local and group settings for the next element.
   *
   * @returns Detached effective settings; explicit factory properties remain higher priority.
   */
  getSettings(): ElementCreationDefaults {
    return this.options.defaults.get({ type: this.creation.type });
  }

  /**
   * Captures the first point and previews the remembered placement size.
   *
   * @param input - Primary pointer sample in canvas coordinates.
   * @returns Whether this tool accepted the pointer.
   */
  override pointerDown(input: EdgelessToolPointer): boolean {
    if (input.button !== 0) {
      return false;
    }
    this.pointer = { id: input.pointerId, start: input.point };
    this.pointerMove(input);
    return true;
  }

  /**
   * Previews factory content with snapped click or drag geometry, without persistence.
   *
   * @param input - Current pointer position, viewport scale and snapping modifiers.
   * @returns Publishes changed local preview geometry.
   */
  override pointerMove(input: EdgelessToolPointer): void {
    if (this.pointer && this.pointer.id !== input.pointerId) {
      return;
    }
    const placement = this.preparePlacement(input);
    if (
      this.pointer &&
      Math.hypot(input.point.x - this.pointer.start.x, input.point.y - this.pointer.start.y) >= 4
    ) {
      const snapped = snapDraggedFrame(
        this.pointer.start,
        input.point,
        this.candidates(),
        input.snapping,
        input.shiftKey,
      );
      this.draft = { ...placement, frame: snapped.frame };
      this.guides = snapped.guides;
    } else {
      this.draft = placement;
    }
    this.changed();
  }

  /**
   * Commits the final placement once through the element manager.
   *
   * @param input - Pointer release from the accepted pointer.
   * @returns Inserts the prepared element; cleanup also runs if creation fails.
   * @throws If preparation or document validation rejects creation.
   */
  override pointerUp(input: EdgelessToolPointer): void {
    if (this.pointer?.id !== input.pointerId) {
      return;
    }
    try {
      this.pointerMove(input);
      if (this.draft) {
        this.commitPlacement(this.draft);
      }
    } finally {
      this.cancel();
    }
  }

  /**
   * Hides hover placement when the pointer leaves without cancelling a captured drag.
   *
   * @returns Clears the hover preview while retaining prospective factory data.
   */
  override pointerLeave(): void {
    if (!this.pointer) {
      this.draft = undefined;
      this.guides = [];
      this.changed();
    }
  }

  /**
   * Discards raw factory input and every uncommitted placement preview.
   *
   * @returns Whether an active pointer gesture was cancelled.
   */
  override cancel(): boolean {
    const active = Boolean(this.pointer);
    this.pointer = undefined;
    this.input = undefined;
    this.draft = undefined;
    this.guides = [];
    this.changed();
    return active;
  }

  /**
   * Resolves a detached toolbar or hover placement with shared remembered dimensions.
   *
   * @param input - Target canvas point and snapping options.
   * @returns Raw factory input and final snapped frame; validation is deferred to preview/commit.
   * @throws If the factory returns an element of a different type.
   */
  preparePlacement(input: EdgelessToolPointer): EdgelessCreationPlacement {
    const raw = this.placementInput();
    const snapped = snapPlacedFrame(
      centeredPlaceFrame(input.point, {
        ...DEFAULT_PLACE_SIZE,
        ...raw.frame,
        ...this.getSettings().frame,
      }),
      this.candidates(),
      input.snapping,
    );
    this.guides = snapped.guides;
    return { input: raw, frame: snapped.frame, guides: snapped.guides };
  }

  /**
   * Inserts a toolbar draft using its original raw input and final geometry.
   *
   * @param placement - Draft returned by this tool, never a normalized preview record.
   * @returns Creates and selects the element, then discards its prospective input.
   * @throws If the receiving manager rejects the element.
   */
  commitPlacement(placement: EdgelessCreationPlacement): void {
    try {
      this.options.operations.createElement({ ...placement.input, frame: placement.frame });
    } finally {
      this.cancel();
    }
  }

  /**
   * Renders the registered element content and snapping feedback.
   *
   * @param zoom - Current canvas scale.
   * @returns Detached preview content, or null outside hover/placement.
   */
  override renderPreview(zoom: number): ReactNode {
    if (!this.draft) {
      return null;
    }
    return (
      <>
        <ElementCreationPreview
          input={this.draft.input}
          frame={this.draft.frame}
          operations={this.options.operations}
          zoom={zoom}
        />
        <CreationSnapGuides guides={this.guides} />
      </>
    );
  }

  /**
   * Resolves eligible frame candidates without inspecting built-in type names.
   *
   * @returns Current leaf frames excluding registered absolute-geometry elements.
   */
  protected candidates() {
    return this.options.operations.elements
      .getElementNodes()
      .filter(
        (element) =>
          !element.childIds.length &&
          !this.options.reactPanel.editor.elementTypes.get(element.type)?.behavior
            ?.absoluteGeometry,
      )
      .map((element) => element.frame);
  }

  /**
   * Evaluates the factory once until commit or cancellation.
   *
   * @returns Retained raw creation data whose explicit properties override remembered settings.
   * @throws If the factory returns a different persisted type.
   */
  private placementInput(): CreateElementInput {
    if (!this.input) {
      const input = this.creation.create();
      if (input.type !== this.creation.type) {
        throw new Error("Element creation factory returned a different type");
      }
      this.input = input;
    }
    return this.input;
  }
}

/**
 * Displays current placement guides and clears them when the preview unmounts.
 *
 * @param props - Guides in canvas coordinates owned by the current placement.
 * @returns No React DOM; the existing guide renderer owns its overlay.
 */
function CreationSnapGuides({ guides }: { readonly guides: readonly SnapGuide[] }) {
  const { element: root } = useEditorRoot();
  useLayoutEffect(() => {
    if (!root) {
      return;
    }
    showSnapGuides(root, guides);
    return () => showSnapGuides(root, []);
  }, [root, guides]);
  return null;
}
