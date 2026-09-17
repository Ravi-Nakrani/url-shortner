"use client";

import { useState } from "react";
import { LinkListItem } from "@/components/LinkListItem";
import type { LinkSummaryResponse } from "@/types/api";

export function LinkList({ initialLinks }: { initialLinks: LinkSummaryResponse[] }) {
  const [links, setLinks] = useState(initialLinks);

  function handleUpdated(oldShortCode: string, updated: LinkSummaryResponse) {
    setLinks((prev) => prev.map((link) => (link.shortCode === oldShortCode ? updated : link)));
  }

  function handleDeleted(shortCode: string) {
    setLinks((prev) => prev.filter((link) => link.shortCode !== shortCode));
  }

  if (links.length === 0) {
    return <p className="text-text-muted">You haven&apos;t created any links yet.</p>;
  }

  return (
    <ul className="divide-y divide-border border-t border-border">
      {links.map((link) => (
        <LinkListItem
          key={link.shortCode}
          link={link}
          onUpdated={(updated) => handleUpdated(link.shortCode, updated)}
          onDeleted={() => handleDeleted(link.shortCode)}
        />
      ))}
    </ul>
  );
}
