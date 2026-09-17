import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-text">Link not found</h1>
      <p className="mt-3 max-w-sm text-text-muted">
        This short link doesn&apos;t exist or has expired. Double-check the URL, or shorten a new
        one.
      </p>
      <Link
        href="/"
        className="mt-6 rounded bg-accent px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Shorten a link
      </Link>
    </main>
  );
}
