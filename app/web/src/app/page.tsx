"use client";

import { PageWorkspace, usePagesQuery } from "@chulane/rivto-app-shared/client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const router = useRouter();
  const { data: pages, isLoading } = usePagesQuery();

  useEffect(() => {
    if (isLoading) return;
    if (pages && pages.length > 0) {
      router.replace(`/pages/${pages[0].id}`);
    }
  }, [isLoading, pages, router]);

  return (
    <div className="h-screen">
      <PageWorkspace
        onSelectPage={(pageId) => router.push(`/pages/${pageId}`)}
        onPageCreated={(pageId) => router.push(`/pages/${pageId}`)}
      />
    </div>
  );
}
