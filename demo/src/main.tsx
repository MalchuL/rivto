import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@chulane/rivto-react/styles.css";
import "@openuidev/react-ui/components.css";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(<App />);
