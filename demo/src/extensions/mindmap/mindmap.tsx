import { useMemo } from "react";
import { Button } from "../../../../packages/react-rivto-editor/src/components/ui/button";
import { Input } from "../../../../packages/react-rivto-editor/src/components/ui/input";
import { Label } from "../../../../packages/react-rivto-editor/src/components/ui/label";
import { elementControlProps } from "@chulane/rivto-react/authoring";
import type {
  ElementRenderProps,
  ElementPropertiesProps,
  ReactEditorExtension,
} from "@chulane/rivto-react/authoring";
import {
  layoutMindmap,
  readMindmapNodes,
  NODE_WIDTH,
  NODE_HEIGHT,
  type MindmapNode,
} from "./model";

/** Style keys remembered independently of authored mindmap nodes. */
const MINDMAP_REMEMBERED_PROPERTIES = ["color", "fontSize"] as const;
/** Hidden dimensions shared by creation tools in the diagrams group. */
const DIAGRAM_REMEMBERED_FRAME_FIELDS = ["width", "height"] as const;

const INITIAL_NODES: readonly MindmapNode[] = [{ id: "root", parentId: null, label: "Mindmap" }];
const INITIAL_LAYOUT = layoutMindmap(INITIAL_NODES);

interface MindmapEditingPanel {
  readonly elements: Pick<
    ElementRenderProps["reactPanel"]["elements"],
    "getElementNode" | "updateElement"
  >;
  readonly batchUpdates: ElementRenderProps["reactPanel"]["batchUpdates"];
}

/**
 * Applies a node change and optionally resizes the persisted element to fit.
 *
 * Detached creation previews never write to the document. The current nodes are
 * read when the change is invoked and the update is committed as one batch.
 *
 * @param reactPanel - Borrowed panel providing element reads and updates.
 * @param elementId - Persisted mindmap element ID.
 * @param preview - Whether this is a detached creation preview.
 * @param update - Transformation applied to the current validated nodes.
 * @param resize - Whether to update the frame to the new natural bounds.
 * @returns The node change is committed, or skipped for a preview or missing element.
 * @throws If the current nodes are invalid or a delegated update fails.
 */
function updateMindmapNodes(
  reactPanel: MindmapEditingPanel,
  elementId: string,
  preview: boolean | undefined,
  update: (nodes: readonly MindmapNode[]) => readonly MindmapNode[],
  resize: boolean,
): void {
  if (preview) {
    return;
  }
  const current = reactPanel.elements.getElementNode(elementId);
  if (!current) {
    return;
  }
  const next = update(readMindmapNodes(current.props.nodes));
  const bounds = layoutMindmap(next);
  const frame = resize ? { width: bounds.width, height: bounds.height } : undefined;
  reactPanel.batchUpdates(() =>
    reactPanel.elements.updateElement(elementId, { props: { nodes: next }, frame }),
  );
}

/**
 * Renders a host-defined tree whose nodes can grow branches without a depth limit.
 *
 * The shared element host owns geometry and selection. Detached creation
 * previews render the same content without writing to the document.
 *
 * @param props - Persisted or preview element and its borrowed panel.
 * @param props.element - Mindmap element containing the node tree and style.
 * @param props.reactPanel - Panel used for selection and node updates.
 * @param props.preview - Whether editing and selection must be suppressed.
 * @returns Responsive SVG content for the mindmap element.
 */
function MindmapElement({ element, reactPanel, preview }: ElementRenderProps) {
  const nodes = readMindmapNodes(element.props.nodes);
  const layout = useMemo(() => layoutMindmap(nodes), [nodes]);
  const positions = new Map(layout.nodes.map((node) => [node.id, node]));
  const color = String(element.props.color);
  const fontSize = Number(element.props.fontSize);
  const select = () => {
    if (!preview) {
      reactPanel.editor.commands.execute("edgeless.selection.set", {
        reactPanel,
        payload: [element.id],
      });
    }
  };
  const change: MindmapChange = (update, resize) =>
    updateMindmapNodes(reactPanel, element.id, preview, update, resize);
  return (
    <div
      className="rivto-ui"
      data-mindmap
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {/* The viewport follows the host's DOM resize preview; no state or document write is needed during the gesture. */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <MindmapEdges nodes={layout.nodes} positions={positions} color={color} />
        {layout.nodes.map((node) => (
          <MindmapNodeView
            key={node.id}
            node={node}
            color={color}
            fontSize={fontSize}
            select={select}
            change={change}
          />
        ))}
      </svg>
    </div>
  );
}
type PositionedMindmapNode = ReturnType<typeof layoutMindmap>["nodes"][number];
type MindmapChange = (
  update: (nodes: readonly MindmapNode[]) => readonly MindmapNode[],
  resize: boolean,
) => void;

interface MindmapNodeViewProps {
  node: PositionedMindmapNode;
  color: string;
  fontSize: number;
  select: () => void;
  change: MindmapChange;
}

interface MindmapEdgesProps {
  nodes: readonly PositionedMindmapNode[];
  positions: ReadonlyMap<string, PositionedMindmapNode>;
  color: string;
}

/**
 * Renders the connecting curves between positioned mindmap nodes.
 *
 * @param props - Positioned nodes, lookup and branch color.
 * @returns SVG paths for nodes with a visible parent.
 */
function MindmapEdges({ nodes, positions, color }: MindmapEdgesProps) {
  return (
    <>
      {nodes.map((node) => {
        const parent = node.parentId && positions.get(node.parentId);
        if (!parent) {
          return null;
        }
        const x = parent.x + NODE_WIDTH;
        const y = parent.y + NODE_HEIGHT / 2;
        const endY = node.y + NODE_HEIGHT / 2;
        return (
          <path
            key={node.id}
            d={`M ${x} ${y} C ${x + COLUMN_BEND} ${y}, ${node.x - COLUMN_BEND} ${endY}, ${node.x} ${endY}`}
            stroke={color}
            strokeWidth={2}
            fill="none"
            pointerEvents="none"
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}

/**
 * Renders a positioned mindmap node and its editing controls.
 *
 * @param props - Node geometry, appearance and editor callbacks.
 * @returns A foreignObject containing the node's native controls.
 */
function MindmapNodeView({ node, color, fontSize, select, change }: MindmapNodeViewProps) {
  return (
    <foreignObject x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEIGHT}>
      <div
        data-mindmap-node={node.id}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          border: `2px solid ${color}`,
          borderRadius: 10,
          background: "var(--rivto-background, white)",
          boxSizing: "border-box",
        }}
      >
        <MindmapNodeInput node={node} fontSize={fontSize} select={select} change={change} />
        <MindmapAddBranch node={node} color={color} select={select} change={change} />
      </div>
    </foreignObject>
  );
}

/**
 * Renders the controlled node label input.
 *
 * @param props - Node, font size and editor callbacks.
 * @returns A selection-aware input for the node label.
 */
function MindmapNodeInput({
  node,
  fontSize,
  select,
  change,
}: Pick<MindmapNodeViewProps, "node" | "fontSize" | "select" | "change">) {
  return (
    <Input
      {...elementControlProps<HTMLInputElement>(() => select())}
      aria-label={`Mindmap node ${node.id}`}
      value={node.label}
      style={{
        minWidth: 0,
        width: "100%",
        border: 0,
        background: "transparent",
        padding: "4px 8px",
        color: "var(--rivto-foreground, #222)",
        fontSize,
      }}
      onChange={(event) =>
        change(
          (current) =>
            current.map((item) =>
              item.id === node.id ? { ...item, label: event.target.value } : item,
            ),
          false,
        )
      }
    />
  );
}

/**
 * Renders the control that appends a child branch.
 *
 * @param props - Parent node, branch color and editor callbacks.
 * @returns A selection-aware button that appends a branch.
 */
function MindmapAddBranch({
  node,
  color,
  select,
  change,
}: Pick<MindmapNodeViewProps, "node" | "color" | "select" | "change">) {
  return (
    <Button
      type="button"
      {...elementControlProps<HTMLButtonElement>(() => select())}
      aria-label={`Add branch to ${node.label || "node"}`}
      style={{
        flexShrink: 0,
        padding: 0,
        width: 26,
        height: 26,
        border: 0,
        borderRadius: "50%",
        color: "white",
        background: color,
        cursor: "pointer",
        marginRight: 4,
      }}
      onClick={(event) => {
        event.stopPropagation();
        change(
          (current) => [
            ...current,
            { id: crypto.randomUUID(), parentId: node.id, label: "Branch" },
          ],
          true,
        );
      }}
    >
      +
    </Button>
  );
}

const COLUMN_BEND = 32;

/**
 * Renders the mindmap color and font-size property controls.
 *
 * Only property contents are supplied here; the editor owns the sidebar and
 * the preview and undo lifecycle.
 *
 * @param props - Shared property values and preview operations.
 * @param props.common - Reads a value common to the selected elements.
 * @param props.preview - Applies a temporary property patch.
 * @returns Controls for previewing mindmap style changes.
 */
function MindmapProperties({ common, preview }: ElementPropertiesProps) {
  return (
    <div className="rivto-ui" style={{ display: "grid", gap: 12, padding: 12 }}>
      <Label>
        Branch color{" "}
        <Input
          aria-label="Mindmap branch color"
          type="color"
          value={String(common("color") ?? "#64748b")}
          onChange={(event) => preview({ color: event.target.value })}
        />
      </Label>
      <Label>
        Font size{" "}
        <Input
          aria-label="Mindmap font size"
          type="number"
          min={10}
          max={32}
          value={Number(common("fontSize") ?? 14)}
          onChange={(event) => {
            const fontSize = Number(event.target.value);
            if (fontSize >= 10 && fontSize <= 32) {
              preview({ fontSize });
            }
          }}
        />
      </Label>
    </div>
  );
}

const mindmapIcon = (
  <svg
    viewBox="0 0 24 24"
    width={20}
    height={20}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    style={{ display: "inline-block", verticalAlign: "middle", pointerEvents: "none" }}
  >
    <path d="M8 12h4V5h4M12 12v7h4" />
    <rect x={2} y={9} width={6} height={6} rx={1.5} />
    <rect x={16} y={2} width={6} height={6} rx={1.5} />
    <rect x={16} y={16} width={6} height={6} rx={1.5} />
  </svg>
);

/**
 * Validates mindmap nodes, a six-digit hex color, and a finite font size between 10 and 32.
 *
 * @param props - Element properties to validate.
 * @returns The unchanged properties.
 * @throws If nodes, color, or font size are invalid.
 */
function validateMindmapProperties(props: Record<string, unknown>): Record<string, unknown> {
  readMindmapNodes(props.nodes);
  if (typeof props.color !== "string" || !/^#[0-9a-f]{6}$/i.test(props.color)) {
    throw new Error("Invalid mindmap color");
  }
  if (
    typeof props.fontSize !== "number" ||
    !Number.isFinite(props.fontSize) ||
    props.fontSize < 10 ||
    props.fontSize > 32
  ) {
    throw new Error("Invalid mindmap font size");
  }
  return props;
}

/**
 * Installs a custom canvas element using the same public registration contract as built-in shapes.
 * The renderer scales its SVG viewport during host transform previews; branch additions
 * write through panel operations, while detached placement previews suppress editing.
 * @returns Extension installing the mindmap definition, renderer, properties and creation tool
 * during setup; registration cleanup follows the extension lifecycle.
 */
export function mindmapExtension(): ReactEditorExtension {
  return {
    id: "demo.mindmap",
    /**
     * Registers the diagrams toolbar group and the validated mindmap element type.
     *
     * @param editor - Editor that owns this operation and its registrations.
     * @returns Cleanup for the mindmap element registration.
     */
    setup(editor) {
      editor.edgelessToolbar.registerGroup({
        id: "diagrams",
        rememberedProperties: { frame: DIAGRAM_REMEMBERED_FRAME_FIELDS },
        title: "Diagrams",
        icon: mindmapIcon,
      });
      return editor.elementTypes.register({
        title: "Mindmap",
        definition: {
          type: "mindmap",
          defaults: { nodes: INITIAL_NODES, color: "#6366f1", fontSize: 14 },
          validate: validateMindmapProperties,
        },
        render: MindmapElement,
        properties: MindmapProperties,
        rememberedProperties: { props: MINDMAP_REMEMBERED_PROPERTIES },
        creation: {
          title: "Mindmap",
          group: "diagrams",
          icon: mindmapIcon,
          create: () => ({
            type: "mindmap",
            frame: { x: 0, y: 0, width: INITIAL_LAYOUT.width, height: INITIAL_LAYOUT.height },
          }),
        },
      });
    },
  };
}
