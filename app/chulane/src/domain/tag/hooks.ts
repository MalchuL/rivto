"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../lib/query-keys";
import { tagService } from "./service";
import type { CreateTagInput, UpdateTagInput } from "./types";

export function useProjectTagsQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.projectTags(projectId ?? ""),
    queryFn: () => tagService.listForProject(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useCreateTagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => tagService.create(input),
    onSuccess: async (tag) => {
      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.projectTags(tag.projectId),
      });
      // Children inherit — invalidate all tag lists.
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useUpdateTagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTagInput) => tagService.update(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useDeleteTagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tagService.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pages });
    },
  });
}
