/**
 * Reports route rendering failures through the application's toast service.
 * The parent layout keeps the toast host mounted while this fallback offers a
 * retry of the failed route without discarding persisted application state.
 */
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { notifications } from "@/lib/notifications";

const errorClasses = "mx-auto flex min-h-svh max-w-3xl flex-col items-start justify-center gap-4 px-6";

/**
 * Presents a recoverable route failure and reports it once per error value.
 * @param props - Next.js route error and retry operation.
 * @returns Recovery controls while the route cannot render.
 */
export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { notifications.error(error); }, [error]);
  return (
    <main className={errorClasses}>
      <h1>Something went wrong.</h1>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
