"use client";

import { useParams } from "next/navigation";
import { ProjectView } from "@/domain/project/components/project-view";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  return <ProjectView projectId={params.projectId} />;
}
