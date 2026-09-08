"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../lib/query-keys";
import { pageService } from "./service";
import type { CreatePageInput, PageFilter, UpdatePageInput } from "./types";

export function usePagesQuery(filter: PageFilter = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.pageList(filter),
    queryFn: () => pageService.list(filter),
  });
}

export function usePageQuery(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.page(id ?? ""),
    queryFn: () => pageService.get(id!),
    enabled: Boolean(id),
  });
}

export function useSearchPagesQuery(query: string) {
  return useQuery({
    queryKey: QUERY_KEYS.pageSearch(query),
    queryFn: () => pageService.search(query),
    enabled: query.trim().length > 0,
  });
}

export function useCreatePageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePageInput = {}) => pageService.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pages });
    },
  });
}

export function useUpdatePageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePageInput) => pageService.update(input),
    onSuccess: async (page) => {
      queryClient.setQueryData(QUERY_KEYS.page(page.id), page);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pages });
    },
  });
}

export function useDeletePageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pageService.delete(id),
    onSuccess: async (_void, id) => {
      queryClient.removeQueries({ queryKey: QUERY_KEYS.page(id) });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pages });
    },
  });
}
