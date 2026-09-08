import {
  type BlockSlotProps,
  type ReactEditorExtension,
} from "@chulane/rivto-react";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

const BlockIdsVisibleContext = createContext(true);

/** Makes demo block ID labels visible or hidden without changing editor data. */
export function BlockIdsVisibleProvider({
  visible,
  children,
}: {
  readonly visible: boolean;
  readonly children: ReactNode;
}) {
  return (
    <BlockIdsVisibleContext.Provider value={visible}>
      {children}
    </BlockIdsVisibleContext.Provider>
  );
}

/** Adds a demo-only short ID label after the content of every block row. */
function BlockIdSlot({ block }: BlockSlotProps) {
  const visible = useContext(BlockIdsVisibleContext);
  const shortId = block.id.split("-", 1)[0];
  return visible ? <span className="demo-block-id" title={block.id}>{shortId}</span> : null;
}

/** Demo-only extension showing shortened block IDs in page and edgeless rows. */
export const blockIdExtension = (): ReactEditorExtension => ({
  id: "demo.block-id",
  setup(reactEditor) {
    reactEditor.surfaces.registerBlockSlot({
      position: "end",
      component: BlockIdSlot,
    });
  },
});
