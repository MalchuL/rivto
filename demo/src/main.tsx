import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@chulane/rivto-react/styles.css";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

// The lifecycle fixture exercises root StrictMode effect replay in development.
const lifecycleTest = new URLSearchParams(window.location.search).has("editorLifecycle");
createRoot(root).render(lifecycleTest ? <StrictMode><App /></StrictMode> : <App />);
