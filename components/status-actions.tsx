"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function StatusActions({ id }: { id: number }) {
  const router = useRouter();

  async function setStatus(status: string) {
    await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" onClick={() => setStatus("applied")}>Applied</Button>
      <Button variant="ghost" onClick={() => setStatus("interview")}>Interview</Button>
      <Button variant="ghost" onClick={() => setStatus("rejected")}>Rejected</Button>
    </div>
  );
}
