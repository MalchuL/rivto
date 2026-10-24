import { useEffect, useRef } from "react";
import type { BlockEditorApi, ResolvedBlockDropTarget } from "../src";
import { Checkbox } from "../src/presentation/components/ui/checkbox";

/** Host-only inspector; it does not install drag sensors or change document data. */
export interface DropInspectorProps {
  readonly editor: BlockEditorApi;
  /** Host-controlled feedback state; targets remain hit-testable independently. */
  readonly enabled: boolean;
  /**
   * Requests a change to pointer-transparent inspection feedback.
   *
   * @param enabled - Whether the host should enable inspection.
   * @returns The requested state has been forwarded to the host.
   */
  readonly onEnabledChange: (enabled: boolean) => void;
}

/**
 * Samples explicit regions at most once per frame without rerendering editor nodes.
 *
 * Only the debug overlay/output is updated imperatively. The native hit test and
 * selected target's rectangle are read once per frame; no block-tree scan occurs.
 *
 * @param props - Configured editor whose current attachment may change on remount.
 * @param props.editor - Instance owning the target registry and current DOM boundary.
 * @param props.enabled - Host-controlled inspection state.
 * @param props.onEnabledChange - Requests toggling inspection feedback without changing editor hit areas.
 * @returns An opt-in inspector toggle, destination output, and pointer-transparent overlay.
 */
export function DropInspector({ editor, enabled, onEnabledChange }: DropInspectorProps) {
  const overlay = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const inspector = new DropInspectorController(editor, overlay.current!, output.current!);
    return inspector.attach();
  }, [editor, enabled]);
  return (
    <section className="demo-inspector">
      <label>
        <Checkbox checked={enabled} onCheckedChange={(value) => onEnabledChange(value === true)} />
        Inspect drop zones
      </label>
      <output ref={output} data-demo-drop-output aria-live="polite" />
      <div
        ref={overlay}
        data-demo-drop-overlay
        hidden
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 1000,
          outline: "2px solid #4868d8",
          background: "rgb(72 104 216 / 12%)",
          top: 0,
          left: 0,
        }}
      />
    </section>
  );
}

/** Frame-throttled inspector state belongs to demo chrome rather than the editor's React tree. */
class DropInspectorController {
  private frame: number | undefined;
  private x = 0;
  private y = 0;
  private selected: ResolvedBlockDropTarget | undefined;

  /**
   * Captures existing debug elements without registering any event listeners.
   *
   * @param editor - Instance resolving geometry candidates without mutation.
   * @param overlay - Pointer-transparent debug geometry marker.
   * @param output - Debug destination and resolver timing output.
   */
  constructor(
    private readonly editor: BlockEditorApi,
    private readonly overlay: HTMLElement,
    private readonly output: HTMLElement,
  ) {}

  /**
   * Installs one window listener and releases it with any pending frame on cleanup.
   *
   * @returns Idempotent-safe cleanup hiding stale feedback and cancelling pending work.
   */
  attach(): () => void {
    window.addEventListener("pointermove", this.move);
    return () => {
      window.removeEventListener("pointermove", this.move);
      if (this.frame !== undefined) {
        cancelAnimationFrame(this.frame);
      }
      this.overlay.hidden = true;
      this.output.textContent = "";
    };
  }

  /**
   * Retains the latest viewport coordinates and schedules at most one frame.
   *
   * @param event - Native pointer movement from the visible demo window.
   * @returns A frame is pending without a React state publication.
   */
  private readonly move = (event: PointerEvent): void => {
    this.x = event.clientX;
    this.y = event.clientY;
    if (this.frame === undefined) {
      this.frame = requestAnimationFrame(this.paint);
    }
  };

  /**
   * Resolves the latest hit and updates only the demo's feedback elements.
   *
   * @returns The selected region is outlined, or feedback is cleared outside valid targets.
   */
  private readonly paint = (): void => {
    this.frame = undefined;
    const start = performance.now();
    const next = this.editor.dropTargets.resolve(this.x, this.y);
    const resolveMs = performance.now() - start;
    this.output.dataset.resolveMs = String(resolveMs);
    this.overlay.hidden = !next;
    if (next) {
      const rect = next.element.getBoundingClientRect();
      Object.assign(this.overlay.style, {
        transform: `translate(${rect.left}px, ${rect.top}px)`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }
    if (
      next?.element !== this.selected?.element ||
      next?.destination !== this.selected?.destination
    ) {
      this.output.textContent = next ? JSON.stringify(next.destination) : "";
    }
    this.selected = next;
  };
}
