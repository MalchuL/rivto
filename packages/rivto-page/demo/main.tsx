import { DemoBlockWrapper } from "./demo-wrapper";
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor, BlockEditorThemeProvider, type BlockEditorTheme } from "../src";
import { Button } from "../src/presentation/components/ui/button";
import { Checkbox } from "../src/presentation/components/ui/checkbox";
import type { DemoAdapter } from "./demo-adapter";
import { DemoAdapterContext, DemoBlock, DemoCustomBlock, DemoSlot } from "./demo-block";
import "../src/presentation/styles.css";
import { DemoSession } from "./demo-session";
import { DropInspector } from "./drop-inspector";
import demoStyles from "./style.css?inline";

/** Example customization through public parameters, without structural demo CSS. */
const COMPACT_THEME: BlockEditorTheme = {
  "--rivto-block-padding": "4px",
  "--rivto-block-gap": "4px",
  "--rivto-block-children-gap": "4px",
  "--rivto-block-indent": "12px",
  "--rivto-slot-gap": "2px",
  "--rivto-block-control-size": "16px",
  "--rivto-block-marker-width": "18px",
};

/** Stable example host borrowed by independent toolbar components. */
interface DemoHostProps {
  readonly adapter: DemoAdapter;
}

/** Host lifecycle shared by editor presentation and optional feature controls. */
interface DemoSessionProps {
  readonly session: DemoSession;
}

/**
 * Displays manual counters without rerendering the editor when they are refreshed.
 *
 * @param props - Stable example host.
 * @param props.adapter - Counter source; reading it installs no subscription.
 * @returns Reset/refresh buttons and the last explicitly captured metrics.
 */
function DemoStatistics({ adapter }: DemoHostProps) {
  const [metrics, setMetrics] = useState(() => adapter.getMetrics());
  return (
    <section aria-label="Statistics">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          adapter.resetMetrics();
          setMetrics(adapter.getMetrics());
        }}
      >
        Reset counters
      </Button>
      <Button variant="outline" size="sm" onClick={() => setMetrics(adapter.getMetrics())}>
        Refresh statistics
      </Button>
      <details>
        <summary>Adapter statistics</summary>
        <pre data-demo-metrics>{JSON.stringify(metrics, null, 2)}</pre>
      </details>
    </section>
  );
}

/**
 * Toggles editor-owned renderer and extension registrations independently of view mount state.
 *
 * @param props - Stable demo host.
 * @param props.session - Host session retaining its editor across view remounts.
 * @returns Checkboxes installing or disposing concrete example contributions.
 */
function DemoRegistrations({ session }: DemoSessionProps) {
  const [custom, setCustom] = useState(false);
  const [extraSlot, setExtraSlot] = useState(false);
  return (
    <>
      <label>
        <Checkbox
          checked={custom}
          onCheckedChange={(checked) => {
            setCustom(checked === true);
            session.setCustomRenderer(checked === true ? DemoCustomBlock : undefined);
          }}
        />
        Custom renderer
      </label>
      <label>
        <Checkbox
          checked={extraSlot}
          onCheckedChange={(checked) => {
            setExtraSlot(checked === true);
            session.setExtraSlot(checked === true ? DemoSlot : undefined);
          }}
        />
        Demo slot
      </label>
    </>
  );
}

/**
 * Toggles a registered block decorator independently of data, renderers, and slots.
 *
 * @param props - Demo session owning the editor and dynamic extension disposer.
 * @param props.session - Host retaining registrations while the view is unmounted.
 * @returns A checkbox adding or removing the example decorator.
 */
function DemoWrapperControl({ session }: DemoSessionProps) {
  const [enabled, setEnabled] = useState(false);
  return (
    <label>
      <Checkbox
        checked={enabled}
        onCheckedChange={(checked) => {
          setEnabled(checked === true);
          session.setWrapper(checked === true ? DemoBlockWrapper : undefined);
        }}
      />
      Demo wrapper
    </label>
  );
}

/** Example editor subtree receiving public theme parameters. */
interface DemoThemeProps {
  readonly children: ReactNode;
}

/**
 * Demonstrates geometry customization without modifying structural selectors.
 *
 * @param props - Example editor subtree.
 * @param props.children - Editor content retained while only inherited parameters change.
 * @returns A compact-mode control and the public theme provider around the editor.
 */
function DemoTheme({ children }: DemoThemeProps) {
  const [compact, setCompact] = useState(false);
  return (
    <>
      <label className="demo-density">
        <Checkbox checked={compact} onCheckedChange={(checked) => setCompact(checked === true)} />
        Compact layout
      </label>
      <BlockEditorThemeProvider theme={compact ? COMPACT_THEME : undefined}>
        {children}
      </BlockEditorThemeProvider>
    </>
  );
}

/**
 * Introduces the standalone playground and makes its current implementation scope explicit.
 *
 * @returns Demo branding, a concise description, and expandable migration limitations.
 */
function DemoHeader() {
  return (
    <header className="demo-heading">
      <span className="demo-eyebrow">Rivto / Component playground</span>
      <h1>
        Rivto Page<span>Blocks, your way.</span>
      </h1>
      <p>One adapter. Independent layouts. A playground for the next editor surface.</p>
      <details className="demo-scope">
        <summary>About this demo</summary>
        <p>
          Standalone BlockEditor demo: one adapter, targeted subscriptions, and reusable nodes. Data
          is stored in memory. Text uses a plain textarea. Checkboxes, list markers, and collapse
          controls are registered through slots. Rich text, drag and drop, and undo have not been
          migrated yet; this demo exercises structural rendering and API commands.
        </p>
      </details>
    </header>
  );
}

/**
 * Shows the autonomous package with a stable, in-memory example host.
 *
 * repeat=200 renders 1000 displayed blocks and 200 children without virtualization. Reloading
 * resets the fixture; editor remounts preserve host data and registrations.
 *
 * @param props - Session created and disposed by the demo root.
 * @param props.session - Stable host data and configurable editor instance.
 * @returns The demo toolbar, explicit scope description, and bounded BlockEditor.
 */
function Demo({ session }: DemoSessionProps) {
  const { adapter, editor } = session;
  const [mounted, setMounted] = useState(true);
  const [inspectDropTargets, setInspectDropTargets] = useState(false);
  return (
    <main className="demo-page">
      <style data-demo-chrome="true">{demoStyles}</style>
      <DemoHeader />
      <nav aria-label="Demo controls">
        <label>
          <Checkbox checked={mounted} onCheckedChange={(checked) => setMounted(checked === true)} />
          Editor mounted
        </label>
        <DemoRegistrations session={session} />
        <DemoWrapperControl session={session} />
        <Button variant="outline" size="sm" onClick={() => adapter.reverseBlockIds()}>
          Reverse block order
        </Button>
        <Button variant="outline" size="sm" onClick={() => adapter.select(undefined)}>
          Clear selection
        </Button>
        <div className="demo-examples">
          <span>Explore layouts</span>
          <a href="?repeat=1">Small document</a>
          <a href="?repeat=200">Large document</a>
          <a href="?example=kanban">Kanban</a>
          <a href="?example=bento">Bento</a>
        </div>
      </nav>
      <DemoStatistics adapter={adapter} />
      <DropInspector
        editor={editor}
        enabled={inspectDropTargets}
        onEnabledChange={setInspectDropTargets}
      />
      <DemoAdapterContext.Provider value={adapter}>
        <DemoTheme>{mounted && <BlockEditor editor={editor} />}</DemoTheme>
      </DemoAdapterContext.Provider>
    </main>
  );
}

/**
 * Creates the host session after commit and destroys it when this root is removed.
 *
 * StrictMode replay creates a fresh session after releasing the previous one.
 * Editor visibility toggles happen below this owner and only detach its view.
 *
 * @returns Configured demo once the session exists, otherwise no content.
 */
function DemoRoot() {
  const [session, setSession] = useState<DemoSession>();
  useEffect(() => {
    const value = Number(new URLSearchParams(location.search).get("repeat") ?? 1);
    const repeat = Number.isFinite(value) ? Math.max(1, Math.min(200, Math.floor(value))) : 1;
    const example = new URLSearchParams(location.search).get("example");
    const current = new DemoSession(
      repeat,
      example === "kanban" || example === "bento" ? example : "outline",
    );
    setSession(current);
    return () => current.destroy();
  }, []);
  return session && <Demo session={session} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoRoot />
  </StrictMode>,
);
