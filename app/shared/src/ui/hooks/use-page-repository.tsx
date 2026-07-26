"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PageRepository } from "../../domain/page/page-repository";

const PageRepositoryContext = createContext<PageRepository | null>(null);

export function PageRepositoryProvider({
  value,
  children,
}: {
  value: PageRepository;
  children: ReactNode;
}) {
  return (
    <PageRepositoryContext.Provider value={value}>
      {children}
    </PageRepositoryContext.Provider>
  );
}

export function usePageRepository(): PageRepository {
  const repo = useContext(PageRepositoryContext);
  if (!repo) {
    throw new Error("PageRepositoryProvider is missing");
  }
  return repo;
}
