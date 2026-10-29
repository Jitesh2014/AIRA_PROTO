"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#09090b] px-4 text-center text-white">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-neutral-400">
          AIRA encountered an unexpected error.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
