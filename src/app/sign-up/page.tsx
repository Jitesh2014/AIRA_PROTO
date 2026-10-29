import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/80 p-8 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-violet-400">
          AIRA
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-white">
          Account required
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          Teacher accounts are created by the platform administrator. Contact
          your admin if you need access.
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-block text-sm font-medium text-violet-400 hover:text-violet-300"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
