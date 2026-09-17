"use client";

import { useState } from "react";
import type { LinkSummaryResponse, ApiErrorResponse } from "@/types/api";

export function LinkListItem({
  link,
  onUpdated,
  onDeleted,
}: {
  link: LinkSummaryResponse;
  onUpdated: (updated: LinkSummaryResponse) => void;
  onDeleted: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [alias, setAlias] = useState(link.shortCode);
  const [expiresAt, setExpiresAt] = useState(link.expiresAt ? link.expiresAt.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSave() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/links/${link.shortCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortCode: alias !== link.shortCode ? alias : undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError((data as ApiErrorResponse).error?.message ?? "Failed to update link.");
        return;
      }
      onUpdated(data as LinkSummaryResponse);
      setIsEditing(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this link? This cannot be undone.")) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/links/${link.shortCode}`, { method: "DELETE" });
      if (response.ok) {
        onDeleted();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-accent">{link.shortCode}</span>
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            onClick={() => setIsEditing((value) => !value)}
            className="text-text-muted underline hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {isEditing ? "Cancel" : "Edit"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-danger underline hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="truncate text-sm text-text-muted" title={link.longUrl}>
        {link.longUrl}
      </p>
      <p className="text-xs text-text-muted">
        Created {new Date(link.createdAt).toLocaleDateString()}
        {link.expiresAt ? ` · Expires ${new Date(link.expiresAt).toLocaleDateString()}` : ""}
        {" · "}
        {(link.totalClicks ?? 0).toLocaleString()} click{link.totalClicks === 1 ? "" : "s"}
      </p>

      {isEditing && (
        <div className="flex flex-col gap-3 border border-border bg-surface p-3">
          <label className="text-sm text-text">
            Alias
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              className="mt-1 block w-full rounded border border-border px-2 py-1.5 font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <label className="text-sm text-text">
            Expires
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-1 block w-full rounded border border-border px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="w-fit rounded bg-accent px-4 py-1.5 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {isSubmitting ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </li>
  );
}
