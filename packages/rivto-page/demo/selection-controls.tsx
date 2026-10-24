import { useState, useSyncExternalStore } from "react";
import { type BlockSelectionFeature } from "../src";
import { Checkbox } from "../src/presentation/components/ui/checkbox";
import { Textarea } from "../src/presentation/components/ui/textarea";
import type { DemoSession } from "./demo-session";

/** Host-only configuration for the independently installed selection capabilities. */
interface SelectionControlsProps {
  readonly session: DemoSession;
}

/**
 * Displays live coverage only while explicitly enabled, avoiding diagnostic work in benchmarks.
 *
 * @param props - Demo session with host selection subscriptions.
 * @param props.session - Host-owned adapter and editor.
 * @returns Current portable selection as diagnostic JSON.
 */
function SelectionSnapshot({ session }: SelectionControlsProps) {
  const snapshot = useSyncExternalStore(
    (listener) => session.adapter.subscribeSelection(listener),
    () => session.adapter.selection.get(),
  );
  return (
    <pre className="demo-selection-snapshot" data-demo-selection>
      {JSON.stringify(snapshot ?? null, null, 2)}
    </pre>
  );
}

/**
 * Edits semantic keymap overrides and independently toggles optional selection behavior.
 *
 * @param props - Host configuration session.
 * @param props.session - Owner of optional feature installations.
 * @returns Demo-only configuration and optional selection diagnostics.
 */
export function SelectionControls({ session }: SelectionControlsProps) {
  const [inspect, setInspect] = useState(false);
  const [error, setError] = useState("");
  return (
    <details>
      <summary>Selection settings</summary>
      {(["toggle", "range", "exact"] as const).map((action) => (
        <label key={action}>
          {action} binding
          <Textarea
            rows={1}
            aria-label={`${action} binding`}
            defaultValue={session.editor.keyboard
              .list()
              .find((entry) => entry.id === `selection.${action}`)
              ?.keys.join(", ")}
            onChange={(event) => {
              try {
                const keys = event.currentTarget.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean);
                session.editor.keyboard.setKeymapOverride(`selection.${action}`, keys);
                setError("");
              } catch (failure) {
                setError(String(failure));
              }
            }}
          />
        </label>
      ))}
      <output role="status">{error}</output>
      {(
        [
          "native",
          "click",
          "toggle",
          "range",
          "pointer",
          "feedback",
        ] satisfies BlockSelectionFeature[]
      ).map((feature) => (
        <label key={feature}>
          <Checkbox
            defaultChecked
            aria-label={`${feature} selection`}
            onCheckedChange={(checked) => session.setSelectionFeature(feature, checked === true)}
          />
          {feature} selection
        </label>
      ))}
      <label>
        <Checkbox checked={inspect} onCheckedChange={(checked) => setInspect(checked === true)} />
        Inspect selection
      </label>
      {inspect && <SelectionSnapshot session={session} />}
    </details>
  );
}
