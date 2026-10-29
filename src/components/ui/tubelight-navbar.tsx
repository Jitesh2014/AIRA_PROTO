"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  url: string;
  icon: LucideIcon;
}

interface NavBarProps {
  items: NavItem[];
  className?: string;
}

export function NavBar({ items, className }: NavBarProps) {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(items[0]?.name ?? "");

  useEffect(() => {
    const matched = items.find((item) =>
      item.url === "/"
        ? pathname === "/"
        : item.url.startsWith("/") && pathname.startsWith(item.url)
    );
    if (matched) {
      setActiveTab(matched.name);
    }
  }, [pathname, items]);

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "aira-navbar fixed z-50 left-1/2 -translate-x-1/2",
        "bottom-6 sm:bottom-auto sm:top-6",
        "flex items-center gap-1 w-max max-w-[calc(100vw-2rem)]",
        "rounded-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-sm",
        "py-1.5 px-1.5",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.name;

        return (
          <Link
            key={item.name}
            href={item.url}
            onClick={() => setActiveTab(item.name)}
            className={cn(
              "aira-nav-link relative rounded-lg text-sm font-medium px-4 py-2",
              "text-neutral-400 hover:text-white hover:bg-neutral-800/50",
              isActive && "aira-nav-link-active"
            )}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-violet-400 rounded-full"
              />
            )}
            <span className="hidden md:inline">{item.name}</span>
            <span className="md:hidden">
              <Icon size={18} strokeWidth={2.5} />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
