import {
  BlockElementRefProvider,
  type BlockWrapperProps,
  type ReactEditorExtension,
} from "@chulane/rivto-react";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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

/** Adds a demo-only short ID label to the right edge of every block row. */
function BlockIdWrapper({ block, children }: BlockWrapperProps) {
  const visible = useContext(BlockIdsVisibleContext);
  const [blockElement, setBlockElement] = useState<HTMLDivElement | null>(null);
  const row = blockElement?.querySelector<HTMLElement>(":scope > .page-block-row");
  const shortId = block.id.split("-", 1)[0];

  return (
    <BlockElementRefProvider elementRef={setBlockElement}>
      {children}
      {visible && row && createPortal(
        <span className="demo-block-id" title={block.id}>{shortId}</span>,
        row,
      )}
    </BlockElementRefProvider>
  );
}

/** Demo-only extension showing shortened block IDs in page and edgeless rows. */
export const blockIdExtension = (): ReactEditorExtension => ({
  id: "demo.block-id",
  setup(reactEditor) {
    reactEditor.surfaces.registerBlockWrapper("block", BlockIdWrapper);
    reactEditor.surfaces.registerBlockWrapper("edgeless", BlockIdWrapper);
  },
});
