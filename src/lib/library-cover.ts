export interface CoverStyle {
  gradient: string;
  accent: string;
  variant: 0 | 1 | 2;
  initials: string;
}

const PALETTES = [
  { from: "#4c1d95", to: "#0f0a1a", accent: "#c4b5fd" },
  { from: "#831843", to: "#0c0a09", accent: "#f9a8d4" },
  { from: "#1e3a5f", to: "#09090b", accent: "#7dd3fc" },
  { from: "#14532d", to: "#09090b", accent: "#86efac" },
  { from: "#713f12", to: "#0c0a09", accent: "#fcd34d" },
  { from: "#581c87", to: "#18181b", accent: "#e879f9" },
  { from: "#0e4f6e", to: "#09090b", accent: "#67e8f9" },
  { from: "#7f1d1d", to: "#0c0a09", accent: "#fca5a5" },
  { from: "#312e81", to: "#09090b", accent: "#a5b4fc" },
  { from: "#134e4a", to: "#09090b", accent: "#5eead4" },
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function initialsFrom(text: string): string {
  const words = text
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "AR";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getCoverStyle(seed: string): CoverStyle {
  const hash = hashString(seed);
  const palette = PALETTES[hash % PALETTES.length];
  const angle = 120 + (hash % 120);

  return {
    gradient: `linear-gradient(${angle}deg, ${palette.from} 0%, ${palette.to} 100%)`,
    accent: palette.accent,
    variant: (hash % 3) as 0 | 1 | 2,
    initials: initialsFrom(seed),
  };
}

export function coverDisplayText(item: {
  title: string;
  chapter?: string;
}): { primary: string; secondary?: string } {
  const chapter = item.chapter?.trim();
  if (chapter) {
    return { primary: chapter, secondary: item.title };
  }

  const words = item.title.trim().split(/\s+/);
  if (words.length <= 3) {
    return { primary: item.title };
  }

  return {
    primary: words.slice(0, 3).join(" "),
    secondary: words.slice(3).join(" "),
  };
}
