"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
      <p className="text-sm text-neutral-400">
        AIRA hit an error loading this page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400"
      >
        Try again
      </button>
    </main>
  );
}
