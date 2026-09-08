/**
 * Mounts the Rivto documentation application into its browser host element.
 * Strict mode remains enabled so lifecycle mistakes are visible during development.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Rivto documentation root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
