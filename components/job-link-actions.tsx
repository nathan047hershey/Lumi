"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function JobLinkActions({ id }: { id: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function refetch(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setPending(true);
    await fetch(`/api/job-links/${id}/refetch`, { method: "POST" });
    setPending(false);
    router.refresh();
  }

  return (
    <Button variant="ghost" type="button" className="h-8 px-3 text-xs" onClick={refetch} disabled={pending}>
      {pending ? "Scraping…" : "Scrape now"}
    </Button>
  );
}
