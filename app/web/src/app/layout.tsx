import type { Metadata } from "next";
import { Providers } from "@/providers";
import { getRuntimeConfigScript } from "@/lib/runtime-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rivto",
  description: "AI-first second brain editor",
};

// Runtime config must be resolved per request, not frozen at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script
          // Injected before client JS so runtime config is always available.
          dangerouslySetInnerHTML={{ __html: getRuntimeConfigScript() }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
