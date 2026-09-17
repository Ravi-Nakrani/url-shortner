"use client";

import { useState, type FormEvent } from "react";
import { ShortLinkResult } from "@/components/ShortLinkResult";
import type { CreateLinkResponse, ApiErrorResponse } from "@/types/api";

export function CreateLinkForm() {
  const [longUrl, setLongUrl] = useState("");
  const [result, setResult] = useState<CreateLinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ longUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as ApiErrorResponse;
        setError(errorData.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setResult(data as CreateLinkResponse);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setResult(null);
    setLongUrl("");
    setError(null);
  }

  if (result) {
    return <ShortLinkResult shortUrl={result.shortUrl} onReset={handleReset} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="longUrl" className="text-sm font-medium text-text">
        Paste a URL to shorten
      </label>
      <input
        id="longUrl"
        type="url"
        required
        placeholder="https://example.com/a-very-long-url"
        value={longUrl}
        onChange={(event) => setLongUrl(event.target.value)}
        className="rounded border border-border bg-surface px-4 py-3 text-text placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-accent px-4 py-3 font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {isSubmitting ? "Shortening…" : "Shorten"}
      </button>
    </form>
  );
}
