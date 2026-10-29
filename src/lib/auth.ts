import {
  AUTH_COOKIE,
  AUTH_NAME_COOKIE,
  AUTH_ROLE_COOKIE,
  AUTH_SCHOOL_COOKIE,
  AUTH_TOKEN_COOKIE,
} from "@/lib/auth-cookie";

export {
  AUTH_COOKIE,
  AUTH_TOKEN_COOKIE,
  AUTH_ROLE_COOKIE,
  AUTH_SCHOOL_COOKIE,
  AUTH_NAME_COOKIE,
};

export type UserRole = "super_admin" | "teacher";

export interface AuthSession {
  email: string;
  token: string;
  role: UserRole;
  name: string;
  schoolId: string | null;
}

const MAX_AGE = 60 * 60 * 24 * 7;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

export function setAuthSession(session: AuthSession) {
  setCookie(AUTH_TOKEN_COOKIE, session.token);
  setCookie(AUTH_COOKIE, session.email.trim());
  setCookie(AUTH_ROLE_COOKIE, session.role);
  setCookie(AUTH_NAME_COOKIE, session.name);
  setCookie(AUTH_SCHOOL_COOKIE, session.schoolId ?? "");
}

export function clearAuthSession() {
  const clear = (name: string) => {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  };
  clear(AUTH_TOKEN_COOKIE);
  clear(AUTH_COOKIE);
  clear(AUTH_ROLE_COOKIE);
  clear(AUTH_NAME_COOKIE);
  clear(AUTH_SCHOOL_COOKIE);
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.split("=").slice(1).join("="));
}

export function getAuthEmail(): string | null {
  return readCookie(AUTH_COOKIE);
}

export function getAuthToken(): string | null {
  return readCookie(AUTH_TOKEN_COOKIE);
}

export function getAuthRole(): UserRole | null {
  const role = readCookie(AUTH_ROLE_COOKIE);
  if (role === "super_admin" || role === "teacher") return role;
  return null;
}

export function getAuthName(): string | null {
  return readCookie(AUTH_NAME_COOKIE);
}

export function getAuthSchoolId(): string | null {
  const value = readCookie(AUTH_SCHOOL_COOKIE);
  return value || null;
}

export function isSuperAdmin(): boolean {
  return getAuthRole() === "super_admin";
}
