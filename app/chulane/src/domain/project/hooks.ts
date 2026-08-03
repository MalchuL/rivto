"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../lib/query-keys";
import { projectService } from "./service";
import type { CreateProjectInput, UpdateProjectInput } from "./types";

export function useProjectsQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.projects,
    queryFn: () => projectService.list(),
  });
}

export function useProjectQuery(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.project(id ?? ""),
    queryFn: () => projectService.get(id!),
    enabled: Boolean(id),
  });
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput = {}) => projectService.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
    },
  });
}

export function useUpdateProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => projectService.update(input),
    onSuccess: async (project) => {
      queryClient.setQueryData(QUERY_KEYS.project(project.id), project);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
    },
  });
}

export function useDeleteProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectService.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pages });
    },
  });
}
