"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getAuthRole } from "@/lib/auth";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const role = getAuthRole();
    if (role !== "super_admin") {
      router.replace("/");
      setAllowed(false);
      return;
    }
    setAllowed(true);
  }, [router]);

  if (allowed === null) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
