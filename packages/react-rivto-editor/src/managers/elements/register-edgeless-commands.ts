import type { ReactEditorApi } from '../../editor/types';
import type { ReactPanelApi } from '../../panels/types';
import { EdgelessOperations } from '../../extensions/edgeless/edgeless-operations';
import type { VisualCommandPayload } from '../../extensions/edgeless/visuals/types';
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
/**
 * Installs named commands against an explicit document or supplied panel; never follows DOM focus.
 *
 * Canvas commands use { operations, payload } to retain local tools and defaults.
 * Panel commands use { reactPanel, payload } with fresh creation defaults.
 * Document-only commands use fresh creation defaults. Tool selection requires a
 * supplied canvas operations because there is no document-wide interaction tool.
 */
export function registerEdgelessCommands(editor: ReactEditorApi): () => void {
  const registrations: Array<{ dispose(): void }> = [];
  const register = (name: string, handler: (controller: EdgelessOperations, payload?: unknown) => unknown) => {

    if (!editor.commands.has(name)) registrations.push(editor.commands.register(name, (value) => {
      if (isRecord(value) && "operations" in value && "payload" in value) {
        const operations = value.operations;
        if (!(operations instanceof EdgelessOperations) || operations.runtime !== editor) throw new Error("Canvas operations require a panel from the same React editor");
        return handler(operations, value.payload);
      }
      if (name === "edgeless.tool.set") throw new Error("Tool commands require explicit canvas operations");
      if (isRecord(value) && "reactPanel" in value && "payload" in value) {
        const reactPanel = value.reactPanel as ReactPanelApi;
        if (reactPanel.editor !== editor) throw new Error("Canvas operations require a panel from the same React editor");
        return handler(new EdgelessOperations(editor, reactPanel), value.payload);
      }
      return handler(new EdgelessOperations(editor), value);
    }));
  };
  register("edgeless.visual.create", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.visual.create">;
    return controller.create(data);
  });
  register("edgeless.visual.update", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.visual.update">;
    controller.update(data);
  });
  register("edgeless.visual.duplicate", (controller) => controller.duplicateSelection());
  register("edgeless.visual.delete", (controller) => controller.deleteSelection());
  register("edgeless.selection.get", (controller) => controller.getSelection());
  register("edgeless.selection.set", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.set">;
    controller.select("items" in data ? data.items : data);
  });
  register("edgeless.selection.clear", (controller) => controller.clearSelection());
  register("edgeless.selection.move", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.move">;
    controller.move(Number(data.dx), Number(data.dy));
  });
  register("edgeless.selection.resize", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.resize">;
    controller.resize(Number(data.width), Number(data.height));
  });
  register("edgeless.selection.group", (controller) => controller.group());
  register("edgeless.selection.ungroup", (controller) => controller.ungroup());
  register("edgeless.selection.align", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.align">;
    const mode = typeof data === "string" ? data : data.alignment;
    if (!["left", "center", "right", "top", "middle", "bottom"].includes(mode)) throw new Error("Unsupported alignment");
    controller.align(mode);
  });
  register("edgeless.selection.distribute", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.distribute">;
    const axis = typeof data === "string" ? data : data.axis;
    if (axis !== "horizontal" && axis !== "vertical") throw new Error("Unsupported distribution axis");
    controller.distribute(axis);
  });
  register("edgeless.selection.reorder", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.reorder">;
    const direction = typeof data === "string" ? data : data.direction;
    if (!["front", "forward", "backward", "back"].includes(direction)) throw new Error("Unsupported reorder direction");
    controller.reorder(direction);
  });
  register("edgeless.tool.set", (controller, value) => {
    const data = value as VisualCommandPayload<"edgeless.tool.set">;
    if (!controller.reactPanel) throw new Error("Tool commands require explicit canvas operations");
    controller.setTool(data);
  });
  return () => registrations.reverse().forEach((registration) => registration.dispose());
}

