import { CreateLinkForm } from "@/components/CreateLinkForm";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
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
    </main>
  );
}
