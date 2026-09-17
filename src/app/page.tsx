import { CreateLinkForm } from "@/components/CreateLinkForm";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-[480px]">
        <h1 className="sr-only">URL Shortener</h1>
        <CreateLinkForm />
      </div>
    </main>
  );
}
