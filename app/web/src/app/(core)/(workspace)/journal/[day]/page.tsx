"use client";

import { useParams } from "next/navigation";
import { JournalDayView } from "@/domain/journal/components/journal-day-view";

export default function JournalDayPage() {
  const params = useParams<{ day: string }>();
  return <JournalDayView day={params.day} />;
}
