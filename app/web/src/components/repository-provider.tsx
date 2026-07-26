"use client";

import { PageRepositoryProvider } from "@chulane/rivto-app-shared/client";
import type { ReactNode } from "react";
import { getPageRepository } from "@/lib/repository";

export function RepositoryProvider({ children }: { children: ReactNode }) {
  return (
    <PageRepositoryProvider value={getPageRepository()}>
      {children}
    </PageRepositoryProvider>
  );
}
