import "./crypto-polyfill";
import "@chulane/rivto-page/styles.css";
import { createElement, Fragment, StrictMode } from "react";
import {
  BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
  BLOCK_TEXT_METADATA_KEY,
  blockExtension,
  editorControlProps,
  useBlockEditing,
  useBlockNode,
  useBlockSelectionAnchor,
  usePanel,
} from "@chulane/rivto-react";
import { BlockRow, BlockContent, BlockBody, BlockChildren } from "@chulane/rivto-page";
import { z } from "zod";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@chulane/rivto-react/styles.css";
import "./styles.css";
import { loadDynamicExtensions } from "./dynamic-extensions/loader";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

// Lifecycle and custom element fixtures exercise root StrictMode effect replay in development.
const params = new URLSearchParams(window.location.search);
const lifecycleTest = params.has("editorLifecycle") || params.has("elementRegistration");
// Browser-loaded modules share the exact React and editor instances used by the host.
Object.assign(globalThis, {
  __rivtoDynamicModules: {
    react: { createElement, Fragment },
    editor: {
      BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
      BLOCK_TEXT_METADATA_KEY,
      blockExtension,
      editorControlProps,
      useBlockEditing,
      useBlockNode,
      useBlockSelectionAnchor,
      usePanel,
    },
    page: { BlockRow, BlockContent, BlockBody, BlockChildren },
    zod: { z },
  },
});
void loadDynamicExtensions()
  .then(() =>
    createRoot(root).render(
      lifecycleTest ? (
        <StrictMode>
          <App />
        </StrictMode>
      ) : (
        <App />
      ),
    ),
  )
  .catch((error: unknown) => {
    console.error("Failed to load demo extensions", error);
    root.textContent = "Could not load the demo extensions. Check the browser console.";
  });
