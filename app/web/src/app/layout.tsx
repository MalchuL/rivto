import type { Metadata } from "next";
import { AppProviders } from "@chulane/rivto-app-shared/client";
import { RepositoryProvider } from "@/components/repository-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rivto",
  description: "AI-first second brain editor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <RepositoryProvider>{children}</RepositoryProvider>
        </AppProviders>
      </body>
    </html>
  );
}
