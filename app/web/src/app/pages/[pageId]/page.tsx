"use client";

import { PageWorkspace, usePagesQuery } from "@chulane/rivto-app-shared/client";
import { useParams, useRouter } from "next/navigation";

export default function PageEditorRoute() {
  const params = useParams<{ pageId: string }>();
  const router = useRouter();
  const pageId = params.pageId;
  const { data: pages = [] } = usePagesQuery();

  return (
    <div className="h-screen">
      <PageWorkspace
        pageId={pageId}
        onSelectPage={(id) => router.push(`/pages/${id}`)}
        onPageCreated={(id) => router.push(`/pages/${id}`)}
        onPageDeleted={(id) => {
          if (id !== pageId) return;
          const remaining = pages.filter((page) => page.id !== id);
          if (remaining[0]) {
            router.push(`/pages/${remaining[0].id}`);
          } else {
            router.push("/");
          }
        }}
      />
    </div>
  );
}
