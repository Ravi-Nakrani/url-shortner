import { CreateLinkForm } from "@/components/CreateLinkForm";

const FEATURES = [
  {
    label: "Collision-safe short codes",
    description:
      "Random base62 codes, backed by a unique database index — a collision is retried, not just assumed away.",
  },
  {
    label: "Durable click tracking",
    description:
      "Every redirect writes to a durable event log before responding, so a crash can't silently drop a click.",
  },
  {
    label: "Asynchronous analytics",
    description:
      "Click rollups are computed by a background worker, decoupled from the redirect path. Analytics may lag behind real clicks by a few minutes.",
  },
  {
    label: "Rate limiting",
    description:
      "An atomic, database-backed fixed-window limiter protects link creation from abuse.",
  },
  {
    label: "Authenticated ownership",
    description: "Sign in with GitHub — your links and their analytics are private to you.",
  },
  {
    label: "Input validation",
    description: "URLs are validated and restricted to http/https before a link is ever created.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-16">
      <div className="w-full max-w-[480px]">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-text">
            Shorten a link. Track every click.
          </h1>
          <p className="mt-3 text-text-muted">
            Paste a URL to get a short, shareable link. Sign in to keep your links and see click
            analytics.
          </p>
        </div>
        <CreateLinkForm />
      </div>

      <div className="mt-20 w-full max-w-2xl">
        <h2 className="mb-6 text-center text-sm font-medium tracking-wide text-text-muted uppercase">
          Under the hood
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.label} className="border-t border-border pt-3">
              <dt className="font-medium text-text">{feature.label}</dt>
              <dd className="mt-1 text-sm text-text-muted">{feature.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
