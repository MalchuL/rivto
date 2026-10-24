import { CanvasEditor, CanvasSource } from "@chulane/rivto-edgeless";
import type { CanvasApi, CanvasElement, CanvasTransform, Rect } from "@chulane/rivto-edgeless";
import { CanvasDemoTools } from "./canvas-demo-tools";

/** Application-owned geometry source demonstrating an editor without Rivto dependencies. */
class CanvasDemoSource extends CanvasSource {
  private readonly elements = new Map<string, CanvasElement>();
  private canvas?: CanvasApi;
  private next = 10000;

  /**
   * Prepares a large source fixture without mounting or subscribing to a view.
   *
   * @param onCommit - Reports a completed source mutation to the demo chrome.
   */
  constructor(private readonly onCommit: () => void) {
    super();
    for (let i = 0; i < this.next; i++) {
      this.elements.set(String(i), {
        id: String(i),
        frame: {
          x: 40 + (i % 100) * 220,
          y: 40 + Math.floor(i / 100) * 180,
          width: 150,
          height: 100,
        },
        rotation: 0,
        zIndex: i,
      });
    }
  }

  /**
   * Reads the complete source geometry without mounting a browser surface.
   *
   * @returns Source rectangles in insertion order, including offscreen elements.
   */
  override getElements(): readonly CanvasElement[] {
    return [...this.elements.values()];
  }

  /**
   * Projects the current source for one mounted editor connection.
   *
   * @param canvas - Scene receiving source updates while connected.
   * @returns Cleanup detaching this scene while retaining source content for remount.
   * @throws If the source already belongs to a connected scene.
   */
  override connect(canvas: CanvasApi): () => void {
    if (this.canvas) {
      throw new Error("Demo source is already connected");
    }
    canvas.setElements(this.getElements());
    this.canvas = canvas;
    return () => {
      this.canvas = undefined;
    };
  }

  /**
   * Updates one rectangle's transform policy in the application-owned source.
   *
   * @param id - Existing rectangle identity.
   * @param capabilities - Independently enabled movement, resize and rotation.
   * @returns The live projection and subsequent source reads use the new policy.
   * @throws If disconnected or the rectangle does not exist.
   */
  setCapabilities(
    id: string,
    capabilities: Pick<CanvasElement, "movable" | "resizable" | "rotatable">,
  ): void {
    const element = this.elements.get(id);
    if (!element) {
      throw new Error("Unknown demo rectangle");
    }
    const updated = { ...element, ...capabilities };
    this.connectedCanvas.updateElements([updated]);
    this.elements.set(id, updated);
  }

  /**
   * Inserts one finished rectangle into the source and selects its projected instance.
   *
   * @param frame - Final world geometry from the application creation tool.
   * @returns Source and scene contain the rectangle and the commit counter advances once.
   * @throws If called without a connected scene.
   */
  insert(frame: Rect): void {
    const canvas = this.connectedCanvas;
    const node = { id: String(this.next++), frame, rotation: 0, zIndex: this.next };
    canvas.updateElements([node]);
    this.elements.set(node.id, node);
    canvas.select([node.id]);
    this.onCommit();
  }

  /**
   * Applies one completed transform batch to the application-owned source.
   *
   * @param gesture - Final geometry of captured source elements.
   * @returns Source and projection reflect the batch; the commit counter advances once.
   * @throws If disconnected or projected geometry is invalid.
   */
  commitTransform(gesture: CanvasTransform): void {
    const canvas = this.connectedCanvas;
    const updates = gesture.changes.map((change) => ({
      ...this.elements.get(change.id)!,
      ...change,
    }));
    canvas.updateElements(updates);
    updates.forEach((node) => this.elements.set(node.id, node));
    this.onCommit();
  }

  /**
   * Requires a receiving scene before mutating application content.
   *
   * @returns The scene connected to this source.
   * @throws If no editor currently observes this source.
   */
  private get connectedCanvas(): CanvasApi {
    if (!this.canvas) {
      throw new Error("Demo source is not connected");
    }
    return this.canvas;
  }
}

/** Independent example composing application registrations, storage and canvas lifecycle. */
export class CanvasDemoEditor extends CanvasEditor<CanvasDemoTools["tools"]> {
  declare readonly source: CanvasDemoSource;
  readonly registry: CanvasDemoTools["registry"];

  /**
   * Binds the demo's source and tools without importing a document editor.
   *
   * @param onCommit - Notification used by the visible commit counter.
   */
  constructor(onCommit: () => void) {
    const source = new CanvasDemoSource(onCommit);
    const registered = new CanvasDemoTools((frame) => source.insert(frame));
    super({
      source,
      tools: registered.tools,
      canvas: {
        /**
         * Commits completed geometry through the application source.
         *
         * @param gesture - Final transform batch, not intermediate pointer previews.
         * @returns The source and projection have synchronously accepted the gesture.
         */
        onTransformCommit: (gesture) => source.commitTransform(gesture),
      },
    });
    this.registry = registered.registry;
  }
}
