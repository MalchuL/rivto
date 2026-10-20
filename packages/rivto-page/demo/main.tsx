import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "../src";
import { DemoAdapter } from "./demo-adapter";
import { DemoAdapterContext, DemoBlock, DemoCustomBlock } from "./demo-block";
import "./style.css";

/** Host whose counters are read on demand, independently of editor rendering. */
interface DemoStatisticsProps {
  readonly adapter: DemoAdapter;
}

/**
 * Displays manual counters without rerendering the editor when they are refreshed.
 *
 * @param props - Stable example host.
 * @param props.adapter - Counter source; reading it installs no subscription.
 * @returns Reset/refresh buttons and the last explicitly captured metrics.
 */
function DemoStatistics({ adapter }: DemoStatisticsProps) {
  const [metrics, setMetrics] = useState(() => adapter.getMetrics());
  return (
    <section aria-label="Статистика">
      <button
        onClick={() => {
          adapter.resetMetrics();
          setMetrics(adapter.getMetrics());
        }}
      >
        Сбросить счётчики
      </button>
      <button onClick={() => setMetrics(adapter.getMetrics())}>Обновить статистику</button>
      <details>
        <summary>Статистика адаптера</summary>
        <pre data-demo-metrics>{JSON.stringify(metrics, null, 2)}</pre>
      </details>
    </section>
  );
}

/**
 * Shows the autonomous package with a stable, in-memory example host.
 *
 * repeat=200 renders 1000 roots and 200 children without virtualization. Reloading
 * resets the fixture; editor remounts preserve host data and registrations.
 *
 * @returns The demo toolbar, explicit scope description, and bounded BlockEditor.
 */
function Demo() {
  const [adapter] = useState(() => {
    const value = Number(new URLSearchParams(location.search).get("repeat") ?? 1);
    const repeat = Number.isFinite(value) ? Math.max(1, Math.min(200, Math.floor(value))) : 1;
    return new DemoAdapter(repeat, DemoBlock);
  });
  const [mounted, setMounted] = useState(true);
  const [custom, setCustom] = useState(false);
  return (
    <main>
      <h1>Rivto Page</h1>
      <p>Автономное демо BlockEditor: один адаптер, адресные подписки и переиспользуемые узлы.</p>
      <p>
        Данные живут в памяти. Текст редактируется обычным textarea. Маркеры списков, скрытие
        потомков, rich text, DnD и undo пока не перенесены: здесь проверяются поля и команды API.
      </p>
      <nav aria-label="Управление демо">
        <label>
          <input
            type="checkbox"
            checked={mounted}
            onChange={(event) => setMounted(event.target.checked)}
          />
          Редактор смонтирован
        </label>
        <label>
          <input
            type="checkbox"
            checked={custom}
            onChange={(event) => {
              setCustom(event.target.checked);
              adapter.setCustomRenderer(event.target.checked ? DemoCustomBlock : undefined);
            }}
          />
          Custom renderer
        </label>
        <button onClick={() => adapter.reverseRoots()}>Обратить порядок корней</button>
        <button onClick={() => adapter.select(undefined)}>Снять выделение</button>
        <a href="?repeat=1">Обычный документ</a>
        <a href="?repeat=200">Большой документ</a>
      </nav>
      <DemoStatistics adapter={adapter} />
      <DemoAdapterContext.Provider value={adapter}>
        {mounted && <BlockEditor adapter={adapter} className="demo-editor" />}
      </DemoAdapterContext.Provider>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
