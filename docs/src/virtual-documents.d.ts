/** Declares Markdown content emitted by the local Vite content plugin. */

declare module "virtual:rivto-documents" {
  import type { DocumentationPage } from "./documents";

  export const bundledDocuments: DocumentationPage[];
}
