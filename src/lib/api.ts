import { getAuthToken } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  auth = true
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let message = "Request failed. Please try again.";
    if (typeof data.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data.detail) && data.detail[0]?.msg) {
      message = data.detail[0].msg;
    }
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export interface AuthResult {
  access_token: string;
  token_type: string;
  email: string;
  name: string;
  role: UserRole;
  school_id: string | null;
  school_name: string | null;
}

export interface ChatSource {
  book_title: string;
  chapter: string;
  pages: string;
  snippet: string;
}

export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ChatResult {
  reply: string;
  sources: ChatSource[];
  web_sources?: WebSource[];
  web_supplemented?: boolean;
  model_used: string;
  cached: boolean;
  llm_generated?: boolean;
}

export function formatModelLabel(model: string | null | undefined): string {
  switch (model) {
    case "phi":
      return "Phi-4-mini";
    case "qwen35":
      return "Qwen3.5-9B";
    case "qwen":
      return "Qwen3-4B";
    case "deepseek":
      return "DeepSeek";
    default:
      return model ?? "";
  }
}

export interface School {
  id: string;
  name: string;
  code: string;
  active: boolean;
  content_version: string;
  created_at?: string;
}

export interface Teacher {
  id: string;
  email: string;
  name: string;
  school_id: string | null;
  school_name: string | null;
  active: boolean;
  created_at?: string;
}

export interface Book {
  id: string;
  school_id: string;
  title: string;
  subject: string;
  class: string;
  chapter: string;
  content_type: string;
  file_name: string;
  file_size: number;
  index_status: string;
  index_error: string | null;
  extraction_method: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelUsageStats {
  name: string;
  requests: number;
  credits: number;
  /** False when large model API is not configured */
  integrated?: boolean;
}

export interface AnalyticsStorage {
  total_bytes: number;
  server_bytes: number;
  server_label: string;
  cache_bytes: number;
  cache_keys: number;
  cache_available: boolean;
  database_bytes: number | null;
  database_available: boolean;
  materials_bytes: number | null;
  materials_available: boolean;
}

export interface InfrastructureStatus {
  mongodb: {
    connected: boolean;
    type: string;
    label: string;
    uri: string;
  };
  redis: { connected: boolean; label: string };
  qdrant: { connected: boolean; label: string };
  llm: {
    connected: boolean;
    label: string;
    status_hint?: string;
    ollama_running?: boolean;
    ollama_model_ready?: boolean;
  };
}

export interface Analytics {
  infrastructure: InfrastructureStatus;
  global: {
    schools: number;
    teachers: number;
    admins: number;
    users_total: number;
    users_inactive_teachers: number;
    books: number;
    books_ready: number;
    questions: number;
    citation_links: number;
    materials_storage_bytes: number;
    storage: AnalyticsStorage;
    model_usage: {
      small_model: ModelUsageStats;
      large_model: ModelUsageStats;
      cached_requests: number;
      total_credits: number;
    };
  };
  per_school: Array<{
    school_id: string;
    school_name: string;
    teachers: number;
    books: number;
    questions: number;
    citation_links: number;
    storage_bytes: number;
    model_usage: {
      small_model: ModelUsageStats;
      large_model: ModelUsageStats;
      cached_requests: number;
      total_credits: number;
    };
  }>;
}

export function login(email: string, password: string) {
  return apiFetch<AuthResult>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    false
  );
}

export function getMe() {
  return apiFetch<AuthResult>("/api/auth/me");
}

export function sendChat(
  message: string,
  mode?: string,
  filters?: { subject?: string; class?: string; book_id?: string; school_id?: string }
) {
  return apiFetch<ChatResult>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, mode, filters }),
  });
}

export function reviewCode(code: string, language?: string) {
  return apiFetch<{ result: string }>("/api/rag/code-review", {
    method: "POST",
    body: JSON.stringify({ code, language }),
  });
}

export function listSchools() {
  return apiFetch<{ schools: School[] }>("/api/schools");
}

export function createSchool(name: string, code: string) {
  return apiFetch<School>("/api/schools", {
    method: "POST",
    body: JSON.stringify({ name, code }),
  });
}

export function listTeachers(schoolId?: string) {
  const query = schoolId ? `?school_id=${encodeURIComponent(schoolId)}` : "";
  return apiFetch<{ teachers: Teacher[] }>(`/api/teachers${query}`);
}

export function createTeacher(data: {
  email: string;
  password: string;
  name: string;
  school_id: string;
}) {
  return apiFetch<Teacher>("/api/teachers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface LibraryBook {
  id: string;
  school_id: string;
  title: string;
  subject: string;
  class: string;
  chapter: string;
  content_type: string;
  file_name: string;
  index_status: string;
}

export interface RagCatalogChapter {
  chapter: string;
  title: string;
  subject: string;
  class: string;
  source_file: string;
  chunks: number;
}

export interface LibraryResponse {
  books: LibraryBook[];
  rag: {
    collection: string;
    total_chunks: number;
    chapters: RagCatalogChapter[];
  };
}

export function listLibrary() {
  return apiFetch<LibraryResponse>("/api/library");
}

export function listBooks(params?: {
  school_id?: string;
  subject?: string;
  class?: string;
}) {
  const search = new URLSearchParams();
  if (params?.school_id) search.set("school_id", params.school_id);
  if (params?.subject) search.set("subject", params.subject);
  if (params?.class) search.set("class", params.class);
  const query = search.toString();
  return apiFetch<{ books: Book[] }>(`/api/books${query ? `?${query}` : ""}`);
}

export function uploadBook(formData: FormData) {
  return apiFetch<Book>("/api/books/upload", {
    method: "POST",
    body: formData,
  });
}

export function deleteBook(bookId: string) {
  return apiFetch<{ ok: boolean }>(`/api/books/${bookId}`, {
    method: "DELETE",
  });
}

export function reindexBook(bookId: string) {
  return apiFetch<Book>(`/api/books/${bookId}/reindex`, {
    method: "POST",
  });
}

export function getAnalytics(schoolId?: string) {
  const query = schoolId ? `?school_id=${encodeURIComponent(schoolId)}` : "";
  return apiFetch<Analytics>(`/api/analytics${query}`);
}
