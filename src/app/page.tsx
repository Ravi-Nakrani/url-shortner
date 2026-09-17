import { CreateLinkForm } from "@/components/CreateLinkForm";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-[480px]">
        <h1 className="mb-6 text-2xl font-semibold text-text">URL Shortener</h1>
        <CreateLinkForm />
      </div>
    </main>
  );
}
