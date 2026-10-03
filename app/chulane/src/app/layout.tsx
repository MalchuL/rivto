/**
 * Owns the root HTML document and shared metadata for web and desktop.
 * Next.js renders this shell on the server; browser-only capabilities belong
 * in client components mounted beneath it rather than in this layout.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chulane",
  description: "A local-first knowledge workspace.",
};

/**
 * Wraps every application route in the shared document shell.
 * @param props - Content of the active nested route.
 * @returns The document rendered by both browser and Electron clients.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
