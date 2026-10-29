"use client";

import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { AuthButton } from "@/components/auth-button";

const AUTH_PATHS = ["/sign-in", "/sign-up"];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.some((path) => pathname.startsWith(path));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <AuthButton />
      <SiteNav />
      <div className="flex flex-1 flex-col pt-0 sm:pt-20 pb-24 sm:pb-0">
        {children}
      </div>
    </>
  );
}
