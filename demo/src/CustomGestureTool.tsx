import {
  EdgelessCreationTool,
  type EdgelessToolOptions,
  type EdgelessToolPointer,
  type ReactEditorApi,
} from "@chulane/rivto-react";

/** Fixture identities deliberately unrelated to built-in tool and group names. */
export const CUSTOM_GESTURE = {
  tool: "host:stamp-gesture",
  group: "host:ink-settings",
  element: "badge",
} as const;

/** Host-owned gesture used to verify the public tool contract independently of built-ins. */
class BadgeGestureTool extends EdgelessCreationTool {
  override readonly capturesPointer = true;
  override readonly keepsMenuOpen = true;
  override readonly supportsPlacement = false;
  private sample?: EdgelessToolPointer;

  /**
   * Binds host-specific gesture geometry to the ordinary badge creation contract.
   *
   * @param options - Surface dependencies and the registered host settings group.
   */
  constructor(options: EdgelessToolOptions) {
    super({
      ...options,
      type: CUSTOM_GESTURE.element,
      create: () => ({ type: CUSTOM_GESTURE.element, props: { title: "Host gesture" } }),
    });
  }

  /**
   * Starts a detached badge gesture without invoking element creation.
   *
   * @param input - First pointer sample in canvas coordinates.
   * @returns True for the primary pointer so the surface captures it.
   */
  override pointerDown(input: EdgelessToolPointer): boolean {
    if (input.button !== 0) {
      return false;
    }
    this.sample = input;
    this.changed();
    return true;
  }

  /**
   * Moves the host preview using the common adapter's normalized coordinates.
   *
   * @param input - Current pointer sample.
   * @returns Updates local preview state for the accepted pointer only.
   */
  override pointerMove(input: EdgelessToolPointer): void {
    if (this.sample?.pointerId === input.pointerId) {
      this.sample = input;
      this.changed();
    }
  }

  /**
   * Inserts the fixture element through scoped operations after release.
   *
   * @param input - Final sample from the captured pointer.
   * @returns Commits one element and clears the preview.
   * @throws If element validation rejects creation.
   */
  override pointerUp(input: EdgelessToolPointer): void {
    if (this.sample?.pointerId !== input.pointerId) {
      return;
    }
    try {
      const placement = this.preparePlacement(input);
      this.commitPlacement({ ...placement, frame: { ...input.point, width: 100, height: 60 } });
    } finally {
      this.cancel();
    }
  }

  /**
   * Discards the current preview without modifying the document.
   *
   * @returns Whether a gesture was pending.
   */
  override cancel(): boolean {
    const active = Boolean(this.sample);
    this.sample = undefined;
    super.cancel();
    return active;
  }

  /**
   * Renders ordinary host React content from tool-local state and group settings.
   *
   * @param _zoom - Canvas scale; this fixture's geometry intentionally uses canvas units.
   * @returns A detached marker or null outside a gesture.
   */
  override renderPreview(_zoom: number) {
    if (!this.sample) {
      return null;
    }
    return (
      <div
        data-host-tool-preview
        style={{
          position: "absolute",
          pointerEvents: "none",
          left: this.sample.point.x,
          top: this.sample.point.y,
          width: 100,
          height: 60,
          background: String(this.group?.getSettings().props?.tone),
        }}
      >
        Host preview
      </div>
    );
  }
}

/**
 * Registers a custom gesture using only the public tool factory and group contracts.
 *
 * @param editor - Fixture editor with the ordinary badge element already registered.
 * @returns Cleanup removing the tool and its settings group.
 */
export function registerCustomGesture(editor: ReactEditorApi): () => void {
  const releaseGroup = editor.edgelessToolbar.registerGroup({
    id: CUSTOM_GESTURE.group,
    title: "Host tools",
    creationDefaults: { props: { tone: "#c7d2fe" } },
    rememberedProperties: { props: ["tone"] },
  });
  const releaseTool = editor.edgelessToolbar.registerTool({
    id: CUSTOM_GESTURE.tool,
    group: CUSTOM_GESTURE.group,
    title: "Host stamp",
    createTool: (options) => new BadgeGestureTool(options),
  });
  return () => {
    releaseTool();
    releaseGroup();
  };
}
