import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";

export async function Navbar() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold text-neutral-900">
          🌎 Resilience<span className="text-brand-600">Platform</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-neutral-600 hover:text-neutral-900">
            Pricing
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" className="text-neutral-600 hover:text-neutral-900">
                Dashboard
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-neutral-600 hover:text-neutral-900">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
