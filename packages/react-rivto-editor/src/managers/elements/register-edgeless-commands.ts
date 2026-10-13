import type { ReactEditorApi } from '../../editor/types';
import type { ReactPanelApi } from '../../panels/types';
import { EdgelessOperations } from './edgeless-operations';
import type { VisualCommandPayload } from '../../elements/visuals/types';
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
  const register = (name: string, handler: (edgelessOperation: EdgelessOperations, payload?: unknown) => unknown) => {

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
  register("edgeless.visual.create", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.visual.create">;
    return edgelessOperation.create(data);
  });
  register("edgeless.visual.update", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.visual.update">;
    edgelessOperation.update(data);
  });
  register("edgeless.visual.duplicate", (edgelessOperation) => edgelessOperation.duplicateSelection());
  register("edgeless.visual.delete", (edgelessOperation) => edgelessOperation.deleteSelection());
  register("edgeless.selection.get", (edgelessOperation) => edgelessOperation.getSelection());
  register("edgeless.selection.set", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.set">;
    edgelessOperation.select("items" in data ? data.items : data);
  });
  register("edgeless.selection.clear", (edgelessOperation) => edgelessOperation.clearSelection());
  register("edgeless.selection.move", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.move">;
    edgelessOperation.move(Number(data.dx), Number(data.dy));
  });
  register("edgeless.selection.resize", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.resize">;
    edgelessOperation.resize(Number(data.width), Number(data.height));
  });
  register("edgeless.selection.group", (edgelessOperation) => edgelessOperation.group());
  register("edgeless.selection.ungroup", (edgelessOperation) => edgelessOperation.ungroup());
  register("edgeless.selection.align", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.align">;
    const mode = typeof data === "string" ? data : data.alignment;
    if (!["left", "center", "right", "top", "middle", "bottom"].includes(mode)) throw new Error("Unsupported alignment");
    edgelessOperation.align(mode);
  });
  register("edgeless.selection.distribute", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.distribute">;
    const axis = typeof data === "string" ? data : data.axis;
    if (axis !== "horizontal" && axis !== "vertical") throw new Error("Unsupported distribution axis");
    edgelessOperation.distribute(axis);
  });
  register("edgeless.selection.reorder", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.selection.reorder">;
    const direction = typeof data === "string" ? data : data.direction;
    if (!["front", "forward", "backward", "back"].includes(direction)) throw new Error("Unsupported reorder direction");
    edgelessOperation.reorder(direction);
  });
  register("edgeless.tool.set", (edgelessOperation, value) => {
    const data = value as VisualCommandPayload<"edgeless.tool.set">;
    if (!edgelessOperation.reactPanel) throw new Error("Tool commands require explicit canvas operations");
    edgelessOperation.setTool(data);
  });
  return () => registrations.reverse().forEach((registration) => registration.dispose());
}

