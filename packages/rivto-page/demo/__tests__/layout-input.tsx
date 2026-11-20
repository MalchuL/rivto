import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BlockChildren,
  BlockEditor,
  BlockEditorController,
  BlockDropTarget,
  BlockDropLayout,
  BlockView,
  BlockRow,
  BlockSlot,
  type BlockLayoutInputBinding,
  type BlockLayoutProps,
  type BlockSlotProps,
} from "../../src";
import { DemoAdapter } from "../demo-adapter";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { getDropTargetIdentity } from "../../src/presentation/drag-and-drop/browser/drop-target-identity";

const trace: string[] = [];

/**
 * Records a browser input phase in the fixture's visible trace.
 *
 * @param entry - Region and input phase to append.
 * @returns The trace output reflects the new entry.
 */
function record(entry: string): void {
  trace.push(entry);
  const output = document.querySelector<HTMLOutputElement>("#trace");
  if (output) {
    output.value = trace.join(",");
  }
}

/**
 * Registers both input phases on one mounted fixture region.
 *
 * @param name - Region name used in the visible trace.
 * @returns A binding that releases both observations when unmounted.
 */
function bindRegion(name: string): BlockLayoutInputBinding {
  return (identity, events) => {
    const capture = events.observeRegion(identity, "click", "capture", () => {
      record(`${name} capture`);
    });
    const bubble = events.observeRegion(identity, "click", "bubble", () => {
      record(`${name} bubble`);
    });
    return () => {
      capture();
      bubble();
    };
  };
}

const rowInput = bindRegion("row");
const childrenInput = bindRegion("children");
const slotInput = bindRegion("slot");
const shellInput = bindRegion("shell");

/**
 * Renders nested row and child-host input regions for the browser test.
 *
 * @param props - Current block identity provided by Page.
 * @param props.blockId - Identity used to locate the nested control.
 * @returns A row with a control followed by its child host.
 */
function Layout({ blockId }: BlockLayoutProps) {
  return (
    <>
      <BlockDropLayout options={{ axis: "vertical", order: [] }}>
        <BlockRow bindInput={rowInput} slots="manual">
          <BlockSlot position="start" bindInput={slotInput} />
          <button data-control={blockId}>Control {blockId}</button>
        </BlockRow>
      </BlockDropLayout>
      <BlockChildren bindInput={childrenInput} />
    </>
  );
}

/**
 * Supplies an interactive start-slot contribution for the current block.
 *
 * @param props - Block context provided by the slot host.
 * @param props.block - Snapshot identifying the contribution owner.
 * @returns A button used to exercise slot input in a real browser.
 */
function SlotControl({ block }: BlockSlotProps) {
  return <button>Slot {block.id}</button>;
}

const adapter = new DemoAdapter(1);
const editor = new BlockEditorController({ adapter });
editor.slots.register({ position: "start", component: SlotControl });
editor.renderers.register("text", { layout: Layout });

/**
 * Checks a foreign element identity before and after its window is removed.
 *
 * @returns The trace records whether both checks retained the same identity.
 */
function checkForeignTarget(): void {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const element = frame.contentDocument!.createElement("div");
  const identity = getBrowserElementIdentity(element);
  const attached = getDropTargetIdentity(element) === identity;
  frame.remove();
  const detached = getDropTargetIdentity(element) === identity;
  record(attached && detached ? "foreign target ok" : "foreign target failed");
}

/**
 * Allows the test to remount the same editor while keeping its registrations.
 *
 * @returns A remount control, the trace, and the current Page view.
 */
function Fixture() {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button onClick={() => setMounted((value) => !value)}>Toggle editor</button>
      <button onClick={checkForeignTarget}>Check foreign target</button>
      <output id="trace" aria-label="Input order" />
      {mounted && (
        <BlockEditor editor={editor}>
          <BlockDropTarget asChild destination={{ kind: "inside", parentId: "block-1" }}>
            <BlockView block={adapter.blocks.getBlockNode("block-1")!} bindInput={shellInput}>
              <button>Shell control</button>
            </BlockView>
          </BlockDropTarget>
        </BlockEditor>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
