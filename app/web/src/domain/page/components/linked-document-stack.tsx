"use client";

import type { Page } from "@chulane/app";
import { PageEditorBlock } from "@/domain/page/components/page-editor-block";
import { Separator } from "@/components/ui/separator";

export type LinkedDocumentItem = {
  page: Page;
  heading?: string;
  readOnlyTitle?: boolean;
};

export function LinkedDocumentStack({
  items,
  emptyMessage = "Nothing here yet.",
}: {
  items: LinkedDocumentItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="px-8 py-10 text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 pb-20">
      {items.map((item, index) => (
        <div key={item.page.id}>
          {index > 0 ? <Separator className="opacity-60" /> : null}
          <PageEditorBlock
            page={item.page}
            heading={item.heading}
            readOnlyTitle={item.readOnlyTitle}
          />
        </div>
      ))}
    </div>
  );
}
