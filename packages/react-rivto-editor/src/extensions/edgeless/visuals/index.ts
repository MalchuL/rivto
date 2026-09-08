import type { ReactEditorExtension } from "../../../managers";
import { createElement } from "react";
import { EdgelessVisualController } from "./controller";
import { EdgelessVisualLayer } from "./visual-layer";
import type {
  CreateVisualPayload,
  EdgelessAlignment,
  EdgelessReorder,
  EdgelessSelectionRef,
  EdgelessVisualsOptions,
  EdgelessVisualTool,
  UpdateVisualPayload,
} from "./types";

type PayloadForKind<Payload, Kind> = Payload extends { kind: infer Kinds }
  ? Kind extends Kinds ? Omit<Payload, "kind"> : never
  : never;
type VisualPayload<Kind extends CreateVisualPayload["kind"]> =
  PayloadForKind<CreateVisualPayload, Kind>;

/** Installable edgeless extension with a typed imperative API for host code. */
export class EdgelessVisualsExtension implements ReactEditorExtension {
  readonly id = "edgeless.visuals";
  private controller?: EdgelessVisualController;

  constructor(private readonly options: EdgelessVisualsOptions = {}) {}

  setup(reactEditor: Parameters<ReactEditorExtension["setup"]>[0]): () => void {
    if (this.controller) throw new Error("Edgeless visuals extension is already installed");
    const controller = new EdgelessVisualController(reactEditor, this.options);
    this.controller = controller;
    reactEditor.extensions.mount(() => createElement(EdgelessVisualLayer, {
      controller,
      options: this.options,
    }));
    return () => {
      if (this.controller === controller) this.controller = undefined;
      controller.destroy();
    };
  }

  /** Creates any supported visual and returns its first-class element ID. */
  create(payload: CreateVisualPayload): string { return this.api.create(payload); }
  createSticker(payload: VisualPayload<"sticker"> = {}): string {
    return this.create({ kind: "sticker", ...payload });
  }
  createRectangle(payload: VisualPayload<"rectangle"> = {}): string {
    return this.create({ kind: "rectangle", ...payload });
  }
  createEllipse(payload: VisualPayload<"ellipse"> = {}): string {
    return this.create({ kind: "ellipse", ...payload });
  }
  createText(payload: VisualPayload<"text"> = {}): string {
    return this.create({ kind: "text", ...payload });
  }
  createDrawing(payload: VisualPayload<"drawing">): string {
    return this.create({ kind: "drawing", ...payload });
  }
  createConnector(payload: VisualPayload<"connector">): string {
    return this.create({ kind: "connector", ...payload });
  }

  /** Patches one visual while preserving its ID and kind. */
  update(payload: UpdateVisualPayload): void { this.api.update(payload); }
  /** @returns Detached active canvas selection. */
  getSelection() { return this.api.getSelection(); }
  /** Replaces the active canvas selection. */
  select(items: readonly EdgelessSelectionRef[]): void { this.api.select(items); }
  /** Duplicates the active selection and selects the copies. */
  duplicateSelection(): EdgelessSelectionRef[] { return this.api.duplicateSelection(); }
  /** Deletes the active selection. */
  deleteSelection(): void { this.api.deleteSelection(); }
  /** Groups the current selection and returns the group ID. */
  group(): string { return this.api.group(); }
  /** Replaces selected groups with their direct children. */
  ungroup(): void { this.api.ungroup(); }
  /** Clears the active canvas selection. */
  clearSelection(): void { this.api.clearSelection(); }
  /** Moves the active selection by a canvas delta. */
  move(dx: number, dy: number): void { this.api.move(dx, dy); }
  /** Resizes the active selection to an exact outer size. */
  resize(width: number, height: number): void { this.api.resize(width, height); }
  /** Aligns selected objects along one edge or center line. */
  align(alignment: EdgelessAlignment): void { this.api.align(alignment); }
  /** Distributes at least three selected objects over their current span. */
  distribute(axis: "horizontal" | "vertical"): void { this.api.distribute(axis); }
  /** Changes the layer order of selected visual leaves. */
  reorder(direction: EdgelessReorder): void { this.api.reorder(direction); }
  /** Activates one canvas interaction tool. */
  setTool(tool: EdgelessVisualTool | "select"): void { this.api.setTool(tool); }

  private get api(): EdgelessVisualController {
    if (!this.controller) throw new Error("Edgeless visuals extension is not installed");
    return this.controller;
  }
}

/**
 * Creates the opt-in visual-object extension for the standard edgeless surface.
 *
 * The extension registers commands on the supplied editor but stores every
 * visual-specific props on generic first-class document elements.
 *
 * @param options - Optional sticker catalog and toolbar visibility.
 * @returns Creation-time React editor extension.
 */
export function edgelessVisualsExtension(options: EdgelessVisualsOptions = {}): EdgelessVisualsExtension {
  return new EdgelessVisualsExtension(options);
}

export * from "./types";
