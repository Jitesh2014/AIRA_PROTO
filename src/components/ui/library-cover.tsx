"use client";

import { cn } from "@/lib/utils";
import { coverDisplayText, getCoverStyle } from "@/lib/library-cover";

interface LibraryCoverProps {
  seed: string;
  title: string;
  chapter?: string;
  subject?: string;
  className?: string;
  size?: "card" | "detail";
}

export function LibraryCover({
  seed,
  title,
  chapter,
  subject,
  className,
  size = "card",
}: LibraryCoverProps) {
  const style = getCoverStyle(seed);
  const { primary, secondary } = coverDisplayText({ title, chapter });
  const isDetail = size === "detail";

  return (
    <div
      className={cn(
        "relative flex h-full w-full overflow-hidden",
        className
      )}
      style={{ background: style.gradient }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: style.accent }}
      />
      <div
        className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full opacity-10 blur-xl"
        style={{ backgroundColor: style.accent }}
      />

      {style.variant === 2 && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 8px,
              ${style.accent} 8px,
              ${style.accent} 9px
            )`,
          }}
        />
      )}

      <div
        className={cn(
          "absolute font-bold tracking-tighter opacity-[0.12] text-white select-none",
          isDetail ? "right-4 top-4 text-8xl" : "right-3 top-3 text-5xl"
        )}
      >
        {style.initials}
      </div>

      <div
        className={cn(
          "relative z-10 flex h-full w-full flex-col justify-end p-4",
          style.variant === 1 && "items-end text-right",
          style.variant === 0 && "items-start text-left"
        )}
      >
        {subject && (
          <span
            className={cn(
              "mb-2 rounded-full border px-2 py-0.5 font-medium uppercase tracking-widest opacity-90",
              isDetail ? "text-[11px]" : "text-[9px]"
            )}
            style={{
              borderColor: `${style.accent}55`,
              color: style.accent,
            }}
          >
            {subject}
          </span>
        )}

        <p
          className={cn(
            "font-semibold leading-tight text-white",
            isDetail ? "text-2xl sm:text-3xl" : "text-sm sm:text-base",
            style.variant === 2 && "text-center w-full"
          )}
        >
          {primary}
        </p>

        {secondary && (
          <p
            className={cn(
              "mt-1 line-clamp-2 font-medium text-white/55",
              isDetail ? "text-sm" : "text-[11px]",
              style.variant === 2 && "text-center w-full"
            )}
          >
            {secondary}
          </p>
        )}
      </div>
    </div>
  );
}
