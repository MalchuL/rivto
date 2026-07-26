"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPage } from "../../application/page/create-page";
import { deletePage } from "../../application/page/delete-page";
import { getPage } from "../../application/page/get-page";
import { listPages } from "../../application/page/list-pages";
import { updatePage } from "../../application/page/update-page";
import type {
  CreatePageRequest,
  UpdatePageRequest,
} from "../../application/page/page-dto";
import { usePageRepository } from "./use-page-repository";

const pagesKey = ["pages"] as const;
const pageKey = (id: string) => ["pages", id] as const;

export function usePagesQuery() {
  const repo = usePageRepository();
  return useQuery({
    queryKey: pagesKey,
    queryFn: () => listPages(repo),
  });
}

export function usePageQuery(id: string | undefined) {
  const repo = usePageRepository();
  return useQuery({
    queryKey: pageKey(id ?? ""),
    queryFn: () => getPage(repo, id!),
    enabled: Boolean(id),
  });
}

export function useCreatePageMutation() {
  const repo = usePageRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePageRequest = {}) => createPage(repo, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pagesKey });
    },
  });
}

export function useUpdatePageMutation() {
  const repo = usePageRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePageRequest & { id: string }) =>
      updatePage(repo, id, input),
    onSuccess: async (page) => {
      await queryClient.invalidateQueries({ queryKey: pagesKey });
      queryClient.setQueryData(pageKey(page.id), page);
    },
  });
}

export function useDeletePageMutation() {
  const repo = usePageRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePage(repo, id),
    onSuccess: async (_void, id) => {
      await queryClient.invalidateQueries({ queryKey: pagesKey });
      queryClient.removeQueries({ queryKey: pageKey(id) });
    },
  });
}
