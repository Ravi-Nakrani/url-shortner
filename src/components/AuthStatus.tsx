import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

export async function AuthStatus() {
  const session = await auth();

  if (!session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("github");
        }}
      >
        <button
          type="submit"
          className="rounded border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Sign in with GitHub
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/dashboard" className="text-text-muted underline hover:text-accent">
        My Links
      </Link>
      <span className="text-text-muted">{session.user.name}</span>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button
          type="submit"
          className="rounded border border-border px-3 py-1.5 font-medium text-text transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
