import { createContext, useContext, useRef } from "react";
import { useBlockNode, type BlockEditorNode, type BlockRendererProps } from "../src";
import { BACKGROUND_COLORS, DemoAdapter, LIST_TYPES } from "./demo-adapter";

/** Concrete demo renderers borrow their host outside Page's bounded context. */
export const DemoAdapterContext = createContext<DemoAdapter | null>(null);

/** Borrowed node whose parent renderer already subscribes to its snapshot. */
interface DemoControlsProps {
  readonly node: BlockEditorNode;
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
      <select
        value={node.listType ?? ""}
        aria-label={`List type ${node.id}`}
        onChange={(event) =>
          node.setListType(LIST_TYPES.find((type) => type === event.target.value) ?? null)
        }
      >
        <option value="">Без списка</option>
        {LIST_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Renders native controls for the node commands currently exported by Page.
 *
 * @param props - Node borrowed from the subscribed concrete renderer.
 * @param props.node - Live getters and commands; identity stays stable until editor destruction.
 * @returns List, checked, collapsed, and color controls without adding editor behavior.
 */
function DemoControls({ node }: DemoControlsProps) {
  return (
    <div className="demo-controls">
      <DemoListType node={node} />
      <label>
        <input
          type="checkbox"
          checked={node.checked ?? false}
          aria-label={`Checked ${node.id}`}
          onChange={(event) => node.setChecked(event.target.checked)}
        />
        Checked
      </label>
      <label>
        <input
          type="checkbox"
          checked={node.collapsed ?? false}
          aria-label={`Collapsed ${node.id}`}
          onChange={(event) => node.setCollapsed(event.target.checked)}
        />
        Collapsed
      </label>
      <label>
        Фон
        <select
          value={node.color ?? ""}
          aria-label={`Фон ${node.id}`}
          onChange={(event) => node.setColor(event.target.value || null)}
        >
          <option value="">По умолчанию</option>
          {BACKGROUND_COLORS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * Renders demo-owned text and exposes live node fields for manual verification.
 *
 * Text is a plain textarea owned by the example host, not the production rich-text
 * editor. Controls exercise commands; list markers and child collapse are not implemented here.
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
    <article
      className="demo-node"
      style={{ backgroundColor: color ? `var(--rivto-block-${color})` : undefined }}
    >
      <header>
        <strong>{blockId}</strong>
        <button onClick={() => adapter.select(blockId)}>Выделить {blockId}</button>
      </header>
      <textarea
        aria-label={`Текст ${blockId}`}
        value={adapter.getText(blockId)}
        onChange={(event) => adapter.setText(blockId, event.target.value)}
      />
      <DemoControls node={node} />
      <output aria-label={`Состояние ${blockId}`}>
        {JSON.stringify({
          listType: node.listType ?? null,
          checked: node.checked ?? null,
          collapsed: node.collapsed ?? null,
          color: node.color ?? null,
        })}
      </output>
      <small data-node-identity={original.current === node ? "stable" : "changed"}>
        Объект узла: {original.current === node ? "переиспользуется" : "заменён"}
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
      <strong>Динамический renderer</strong>
      <DemoBlock blockId={blockId} />
    </aside>
  );
}
