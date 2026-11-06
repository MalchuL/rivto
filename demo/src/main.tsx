import "./crypto-polyfill";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DemoFontsProvider } from "./fonts";
import "@chulane/rivto-react/styles.css";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

// Lifecycle and custom element fixtures exercise root StrictMode effect replay in development.
const params = new URLSearchParams(window.location.search);
const lifecycleTest = params.has("editorLifecycle") || params.has("elementRegistration");
createRoot(root).render(
  lifecycleTest ? (
    <StrictMode>
      <DemoFontsProvider>
        <App />
      </DemoFontsProvider>
    </StrictMode>
  ) : (
    <DemoFontsProvider>
      <App />
    </DemoFontsProvider>
  ),
);
