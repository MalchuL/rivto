import { createContext, useContext, useRef } from "react";
import {
  useBlockNode,
  type BlockEditorNodeApi,
  type BlockRendererProps,
  type BlockSlotProps,
} from "../src";
import { Badge } from "../src/presentation/components/ui/badge";
import { Button } from "../src/presentation/components/ui/button";
import { Checkbox } from "../src/presentation/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "../src/presentation/components/ui/native-select";
import { Textarea } from "../src/presentation/components/ui/textarea";
import type { DemoAdapter } from "./demo-adapter";
import { BACKGROUND_COLORS, LIST_TYPES } from "./constants";

/** Concrete demo renderers borrow their host outside Page's bounded context. */
export const DemoAdapterContext = createContext<DemoAdapter | null>(null);

/** Borrowed node whose parent renderer already subscribes to its snapshot. */
interface DemoControlsProps {
  readonly node: BlockEditorNodeApi;
}

/**
 * Selects a supported list mode without altering checkbox state.
 *
 * @param props - Borrowed live node.
 * @param props.node - Node whose listType command receives a supported value or null.
 * @returns A native selector for every built-in mode and no decoration.
 */
function DemoListType({ node }: DemoControlsProps) {
  return (
    <label>
      List type
      <NativeSelect
        value={node.listType ?? ""}
        aria-label={`List type ${node.id}`}
        onChange={(event) =>
          node.setListType(LIST_TYPES.find((type) => type === event.target.value) ?? null)
        }
      >
        <NativeSelectOption value="">No list</NativeSelectOption>
        {LIST_TYPES.map((type) => (
          <NativeSelectOption key={type} value={type}>
            {type}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  );
}

/**
 * Renders shadcn controls for the node commands currently exported by Page.
 *
 * @param props - Node borrowed from the subscribed concrete renderer.
 * @param props.node - Live getters and commands; identity stays stable until editor destruction.
 * @returns List, checked, collapsed, and color controls without adding editor behavior.
 */
function DemoControls({ node }: DemoControlsProps) {
  const background = node.color;
  return (
    <div className="demo-controls">
      <DemoListType node={node} />
      <label>
        Background
        <NativeSelect
          value={BACKGROUND_COLORS.find((color) => color.value === background)?.name ?? ""}
          aria-label={`Background ${node.id}`}
          onChange={(event) =>
            node.setColor(
              BACKGROUND_COLORS.find((color) => color.name === event.target.value)?.value ?? null,
            )
          }
        >
          <NativeSelectOption value="">Default</NativeSelectOption>
          {BACKGROUND_COLORS.map((color) => (
            <NativeSelectOption key={color.name} value={color.name}>
              {color.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label>
        <Checkbox
          checked={node.checked ?? false}
          aria-label={`Checked ${node.id}`}
          onCheckedChange={(checked) => node.setChecked(checked === true)}
        />
        Checked
      </label>
      <label>
        <Checkbox
          checked={node.collapsed ?? false}
          aria-label={`Collapsed ${node.id}`}
          onCheckedChange={(checked) => node.setCollapsed(checked === true)}
        />
        Collapsed
      </label>
    </div>
  );
}

/**
 * Renders demo-owned text and exposes live node fields for manual verification.
 *
 * Text is a plain textarea owned by the example host, not the production rich-text
 * editor. Controls exercise commands; structural slots provide list markers and child collapse.
 *
 * @param props - Standard content renderer inputs from Page.
 * @param props.blockId - Stable ID inside the demo fixture.
 * @returns Text, command controls, snapshot values, and a node-identity indicator.
 * @throws If rendered outside the demo host provider or delegated node operations fail.
 */
export function DemoBlock({ blockId }: BlockRendererProps) {
  const adapter = useContext(DemoAdapterContext);
  const node = useBlockNode(blockId);
  const original = useRef(node);
  const color = node.color;
  if (!adapter) {
    throw new Error("DemoBlock requires DemoAdapterContext");
  }
  return (
    <article className="demo-node">
      <header>
        <div className="demo-node-heading">
          <span>Text block</span>
          <strong>{blockId}</strong>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Select ${blockId}`}
          onClick={() => adapter.select(blockId)}
        >
          Select
        </Button>
      </header>
      <Textarea
        aria-label={`Text ${blockId}`}
        value={adapter.getText(blockId)}
        onChange={(event) => adapter.setText(blockId, event.target.value)}
      />
      <DemoControls node={node} />
      <output aria-label={`State ${blockId}`}>
        {JSON.stringify({
          listType: node.listType ?? null,
          checked: node.checked ?? null,
          collapsed: node.collapsed ?? null,
          color: color ?? null,
        })}
      </output>
      <small data-node-identity={original.current === node ? "stable" : "changed"}>
        Node object: {original.current === node ? "reused" : "replaced"}
      </small>
    </article>
  );
}

/**
 * Provides the dynamically registered concrete renderer for custom demo blocks.
 *
 * @param props - Standard renderer inputs supplied by Page.
 * @param props.blockId - Existing custom block identity; its persisted type is unchanged.
 * @returns A highlighted wrapper around the same demo-owned editing controls.
 */
export function DemoCustomBlock({ blockId }: BlockRendererProps) {
  return (
    <aside className="demo-custom">
      <strong>Dynamic renderer</strong>
      <DemoBlock blockId={blockId} />
    </aside>
  );
}

/**
 * Displays current selection through a dynamically installed bounded slot context.
 *
 * @param props - Current structural owner, without access to the whole editor.
 * @param props.block - Owner whose ID labels the badge.
 * @param props.selected - Current whole-block selection membership.
 * @returns An end-slot badge reflecting updates without subscribing separately.
 */
export function DemoSlot({ block, selected }: BlockSlotProps) {
  return (
    <Badge variant="secondary" data-demo-slot={block.id}>
      {selected ? "Selected" : "Slot"}
    </Badge>
  );
}
