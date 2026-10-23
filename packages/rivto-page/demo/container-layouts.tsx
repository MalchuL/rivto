import { useContext } from "react";
import {
  BlockRow,
  BlockContent,
  BlockBody,
  BlockChildren,
  BlockItem,
  BlockDropWrapper,
  BlockDropTarget,
  BlockDropGap,
  useBlockNode,
  type BlockLayoutProps,
  type BlockChildrenItemProps,
  type BlockChildrenGapProps,
} from "../src";
import { Badge } from "../src/presentation/components/ui/badge";
import { Button } from "../src/presentation/components/ui/button";
import { NativeSelect, NativeSelectOption } from "../src/presentation/components/ui/native-select";
import { DemoAdapterContext } from "./demo-block";

/**
 * Places an actual child-list gap along a column row's horizontal flow.
 *
 * @param props - Canonical neighbors supplied by the shared child iterator.
 * @returns A package-owned gap target with horizontal hit-area geometry.
 */
function HorizontalGap(props: BlockChildrenGapProps) {
  return <BlockDropGap {...props} axis="horizontal" />;
}

/**
 * Gives one column a host-selected width without replacing its content renderer.
 *
 * @param props - Already-rendered column and its stable ID.
 * @param props.children - The single Page-owned block node.
 * @returns A placement wrapper with geometry passed through public native style.
 */
function ColumnItem({ children }: BlockChildrenItemProps) {
  return <BlockItem style={{ width: 360, flexShrink: 0 }}>{children}</BlockItem>;
}

/**
 * Configures a tile's placement independently of the renderer of its nested block.
 *
 * Width includes the four package-owned insertion boundaries; the center contains
 * the existing node and width control. No overlay or activation flag is required.
 *
 * @param props - Stable child ID and the already-rendered Page node.
 * @param props.blockId - Host node carrying preferred width outside the Page schema.
 * @param props.children - Content and descendants supplied by the shared iterator.
 * @returns A tile wrapper and width control using the existing host data source.
 * @throws If the demo's host provider is missing.
 */
function TileItem({ blockId, children }: BlockChildrenItemProps) {
  const adapter = useContext(DemoAdapterContext)!;
  useBlockNode(blockId);
  return (
    <BlockDropWrapper
      data-demo-tile={blockId}
      style={{ width: adapter.getTileWidth(blockId), flexShrink: 0 }}
    >
      {children}
      <NativeSelect
        aria-label={`Tile width ${blockId}`}
        value={adapter.getTileWidth(blockId)}
        onChange={(event) => adapter.setTileWidth(blockId, Number(event.target.value))}
      >
        {[240, 280, 360].map((width) => (
          <NativeSelectOption key={width} value={width}>
            {width}px
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </BlockDropWrapper>
  );
}

/**
 * Renders host-specific labels without exposing host text in Page's structural contract.
 *
 * @param props - Existing demo container identity.
 * @param props.blockId - Host node to observe for its label and child count.
 * @returns The example container title and its immediate child count.
 */
export function ContainerTitle({ blockId }: BlockLayoutProps) {
  const adapter = useContext(DemoAdapterContext)!;
  const node = useBlockNode(blockId);
  return (
    <div className="demo-container-title">
      <strong>{adapter.getText(blockId)}</strong>
      <Badge variant="secondary">{node.childIds?.length ?? 0}</Badge>
    </div>
  );
}

/**
 * Composes columns, controls, body contributions, and drop regions entirely through JSX.
 *
 * @param props - Stable board identity used only for host callbacks and destinations.
 * @param props.blockId - Real board accepting columns through its explicit child region.
 * @returns A header followed by a horizontally scrollable shared child list.
 */
export function KanbanLayout({ blockId }: BlockLayoutProps) {
  const adapter = useContext(DemoAdapterContext)!;
  return (
    <>
      <BlockRow>
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        <BlockChildren
          item={ColumnItem}
          gap={HorizontalGap}
          style={{ flexDirection: "row", overflowX: "auto" }}
        >
          <Button onClick={() => adapter.appendChild(blockId)}>Add column {blockId}</Button>
        </BlockChildren>
      </BlockDropTarget>
    </>
  );
}

/**
 * Places cards and an add control inside an explicitly registered column body.
 *
 * @param props - Stable column identity for host insertion and targeting.
 * @param props.blockId - Real column; an empty one retains its add control and drop area.
 * @returns Standard row controls followed by a vertical child region and body slots.
 */
export function ColumnLayout({ blockId }: BlockLayoutProps) {
  const adapter = useContext(DemoAdapterContext)!;
  return (
    <>
      <BlockRow>
        <BlockContent />
      </BlockRow>
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        <BlockChildren gap={BlockDropGap}>
          <Button onClick={() => adapter.appendChild(blockId)}>Add card {blockId}</Button>
        </BlockChildren>
      </BlockDropTarget>
      <BlockBody />
    </>
  );
}

/**
 * Demonstrates a different JSX order with wrapping tiles before the board's own row.
 *
 * @param props - Stable board identity used for the explicit inside destination.
 * @param props.blockId - Real parent of the ordinary text tiles.
 * @returns Wrapping children, body contributions, and then the board content row.
 */
export function BentoLayout({ blockId }: BlockLayoutProps) {
  return (
    <>
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        <BlockChildren item={TileItem} style={{ flexDirection: "row", flexWrap: "wrap", gap: 0 }} />
      </BlockDropTarget>
      <BlockBody />
      <BlockRow>
        <BlockContent />
      </BlockRow>
    </>
  );
}

/**
 * Adds an explicit nesting destination to the demo's ordinary outline rows.
 *
 * Drop geometry reuses the row; ordinary controls retain their pointer behavior.
 * The host chooses this policy rather than making every Page block a container.
 *
 * @param props - Stable host block identity.
 * @param props.blockId - Actual parent receiving a dropped group as its last children.
 * @returns Standard outline geometry with a registered row destination.
 */
export function DemoOutlineLayout({ blockId }: BlockLayoutProps) {
  return (
    <>
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        <BlockRow>
          <BlockContent />
        </BlockRow>
      </BlockDropTarget>
      <BlockBody />
      <BlockChildren className="rivto-block-outline" renderEmpty={false} />
    </>
  );
}
