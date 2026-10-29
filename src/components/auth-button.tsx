"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clearAuthSession,
  getAuthEmail,
  getAuthName,
  getAuthRole,
} from "@/lib/auth";

export function AuthButton() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setEmail(getAuthEmail());
    setName(getAuthName());
    setRole(getAuthRole());
  }, []);

  const handleSignOut = () => {
    clearAuthSession();
    setEmail(null);
    router.push("/sign-in");
    router.refresh();
  };

  if (email) {
    return (
      <div className="fixed right-4 top-6 z-50 flex items-center gap-2 sm:right-6">
        <div className="hidden text-right sm:block">
          <p className="max-w-[160px] truncate text-xs font-medium text-neutral-300">
            {name ?? email}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-neutral-600">
            {role === "super_admin" ? "Super Admin" : "Teacher"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(
            "aira-sign-in-btn flex items-center gap-2",
            "rounded-lg border border-neutral-800 bg-neutral-900/90 px-3 py-2 text-sm font-medium text-neutral-300 backdrop-blur-sm sm:px-4"
          )}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    );
  }

  return null;
}
