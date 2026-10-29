"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { login, ApiError } from "@/lib/api";
import { setAuthSession } from "@/lib/auth";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(email, password);
      setAuthSession({
        email: result.email,
        token: result.access_token,
        role: result.role,
        name: result.name,
        schoolId: result.school_id,
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Sign in failed. Try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="aira-fade-up w-full max-w-4xl">
      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/80 shadow-2xl backdrop-blur-sm lg:grid lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between border-b border-neutral-800 bg-neutral-950 p-10 lg:flex lg:border-b-0 lg:border-r">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-violet-400">
              AIRA
            </p>
            <h2 className="mt-6 text-3xl font-semibold leading-tight text-white">
              AI-powered assistant for teachers.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-neutral-400">
              Query school materials, prepare lessons, and generate assessments
              from your institution&apos;s uploaded content.
            </p>
          </div>
          <p className="text-xs text-neutral-600">
            Secure · Private · Built for builders
          </p>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-8 lg:mb-10">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 lg:hidden">
              <span className="text-sm font-bold text-violet-400">A</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-neutral-400">
              Sign in to continue to AIRA
            </p>
            <p className="mt-2 text-xs text-amber-400/90">
              Dev mode: use any email — password not required. New emails become
              super admin automatically.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={isLoading}
                  className="aira-auth-input h-11 pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs text-neutral-500 transition-colors hover:text-violet-400"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={isLoading}
                  className="aira-auth-input h-11 pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-white"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className={cn(
                "aira-sign-in-submit h-11 w-full gap-2 bg-violet-500 text-white hover:bg-violet-400",
                isLoading && "opacity-80"
              )}
            >
              {isLoading ? "Signing in..." : "Sign in"}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-8 border-t border-neutral-800 pt-6 text-center text-sm text-neutral-500">
            Teacher accounts are created by your administrator.
          </div>
        </div>
      </div>
    </div>
  );
}
