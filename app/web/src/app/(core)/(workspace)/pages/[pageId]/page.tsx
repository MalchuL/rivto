"use client";

import { useParams } from "next/navigation";
import { PageView } from "@/domain/page/components/page-view";

export default function PageRoute() {
  const params = useParams<{ pageId: string }>();
  return <PageView pageId={params.pageId} />;
}
