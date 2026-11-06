import { useState, type ReactNode } from "react";
import { EditorFontsProvider, type EdgelessFontOption } from "@chulane/rivto-react";

/** The application owns the complete catalog and loads any non-system font files. */
const fonts: readonly EdgelessFontOption[] = [
  { label: "Sans", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Editorial serif", fontFamily: "Georgia, Cambria, serif" },
  { label: "Mono", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

/**
 * Shares application font settings across demo panels and embeds.
 *
 * Starts with the complete demo catalog and Sans default. Settings are local React
 * state and reset when this owner unmounts; they are not saved as document or user
 * preferences. The fonts query parameter enables controls for live verification.
 * Removing the active serif default selects Sans so the catalog remains valid.
 *
 * @param props - Demo contents; the fonts query parameter enables configuration controls for verification.
 * @param props.children - Demo routes whose panels and embeds share this application configuration.
 * @returns The application font provider and optional live configuration controls;
 * font assets are neither loaded nor uploaded by this component.
 */
export function DemoFontsProvider({ children }: { readonly children: ReactNode }) {
  const [defaultFontFamily, setDefaultFontFamily] = useState(fonts[0]!.fontFamily);
  const [includeSerif, setIncludeSerif] = useState(true);
  const available = includeSerif ? fonts : [fonts[0]!, fonts[2]!];
  return (
    <EditorFontsProvider fonts={available} defaultFontFamily={defaultFontFamily}>
      {new URLSearchParams(window.location.search).has("fonts") && (
        <div>
          <label>
            Application font
            <select
              value={defaultFontFamily}
              onChange={(event) => setDefaultFontFamily(event.target.value)}
            >
              {available.map((font) => (
                <option key={font.fontFamily} value={font.fontFamily}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeSerif}
              onChange={(event) => {
                setIncludeSerif(event.target.checked);
                if (!event.target.checked && defaultFontFamily === fonts[1]!.fontFamily) {
                  setDefaultFontFamily(fonts[0]!.fontFamily);
                }
              }}
            />
            Offer serif font
          </label>
        </div>
      )}
      {children}
    </EditorFontsProvider>
  );
}
