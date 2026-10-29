"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createSchool,
  createTeacher,
  deleteBook,
  getAnalytics,
  listBooks,
  listSchools,
  listTeachers,
  reindexBook,
  uploadBook,
  type Analytics,
  type Book,
  type School,
  type Teacher,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "overview" | "schools" | "teachers" | "uploads";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-800 bg-neutral-900/80 p-4",
        className
      )}
    >
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [books, setBooks] = useState<Book[]>([]);

  const [schoolName, setSchoolName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherSchoolId, setTeacherSchoolId] = useState("");

  const [uploadSchoolId, setUploadSchoolId] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadSubject, setUploadSubject] = useState("");
  const [uploadClass, setUploadClass] = useState("");
  const [uploadChapter, setUploadChapter] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [analyticsRes, schoolsRes, teachersRes, booksRes] = await Promise.all([
        getAnalytics(),
        listSchools(),
        listTeachers(),
        listBooks(),
      ]);
      setAnalytics(analyticsRes);
      setSchools(schoolsRes.schools);
      setTeachers(teachersRes.teachers);
      setBooks(booksRes.books);
      if (!uploadSchoolId && schoolsRes.schools[0]) {
        setUploadSchoolId(schoolsRes.schools[0].id);
        setTeacherSchoolId(schoolsRes.schools[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [uploadSchoolId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createSchool(schoolName, schoolCode);
      setSchoolName("");
      setSchoolCode("");
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create school");
    }
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createTeacher({
        email: teacherEmail,
        password: teacherPassword,
        name: teacherName,
        school_id: teacherSchoolId,
      });
      setTeacherEmail("");
      setTeacherPassword("");
      setTeacherName("");
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create teacher");
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadSchoolId) return;

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("school_id", uploadSchoolId);
      formData.append("title", uploadTitle);
      formData.append("subject", uploadSubject);
      formData.append("class", uploadClass);
      formData.append("chapter", uploadChapter);
      formData.append("content_type", "book");

      await uploadBook(formData);
      setUploadTitle("");
      setUploadSubject("");
      setUploadClass("");
      setUploadChapter("");
      setUploadFile(null);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "schools", label: "Schools" },
    { id: "teachers", label: "Teachers" },
    { id: "uploads", label: "Uploads" },
  ];

  return (
    <div className="w-full max-w-5xl px-4 pb-16 pt-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Manage schools, teachers, and uploaded materials
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              tab === t.id
                ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : (
        <>
          {tab === "overview" && analytics && (
            <div className="space-y-6">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                <h2 className="mb-3 text-sm font-medium text-neutral-300">
                  What&apos;s connected
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["mongodb", analytics.infrastructure.mongodb],
                      ["redis", analytics.infrastructure.redis],
                      ["qdrant", analytics.infrastructure.qdrant],
                      ["llm", analytics.infrastructure.llm],
                    ] as const
                  ).map(([key, svc]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs"
                    >
                      <span className="text-neutral-400">
                        {"label" in svc && "uri" in svc && key === "mongodb"
                          ? `${svc.label} · ${svc.uri}`
                          : svc.label}
                      </span>
                      <span
                        className={
                          svc.connected
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }
                      >
                        {svc.connected ? "Connected" : "Not linked"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-neutral-600">
                  Stats below come only from services that are connected. Server
                  disk usage is always measured locally. MongoDB Atlas, Redis
                  Cloud, and Qdrant are not linked until you add them in{" "}
                  <code className="text-neutral-500">server/.env</code>.
                </p>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-medium text-violet-300">
                  AI credits
                </h2>
                {!analytics.infrastructure.llm.connected &&
                  analytics.infrastructure.llm.status_hint && (
                    <p className="mb-3 text-xs leading-relaxed text-amber-200/80">
                      {analytics.infrastructure.llm.status_hint}
                    </p>
                  )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label={`Small model (${analytics.global.model_usage.small_model.name})`}
                    value={analytics.global.model_usage.small_model.credits}
                    sub={`${analytics.global.model_usage.small_model.requests} requests`}
                  />
                  <StatCard
                    label={`Large model (${analytics.global.model_usage.large_model.name.replace(" (not integrated)", "")})`}
                    value={
                      analytics.global.model_usage.large_model.integrated ===
                      false
                        ? "—"
                        : analytics.global.model_usage.large_model.credits
                    }
                    sub={
                      analytics.global.model_usage.large_model.integrated ===
                      false
                        ? "Not integrated — add cloud QWEN/PHI keys or DEEPSEEK_API_KEY"
                        : `${analytics.global.model_usage.large_model.requests} requests`
                    }
                  />
                  <StatCard
                    label="Total credits used"
                    value={analytics.global.model_usage.total_credits}
                    sub={`${analytics.global.model_usage.cached_requests} cache hits (free)`}
                  />
                  <StatCard
                    label="AI answers (LLM generated)"
                    value={analytics.global.questions}
                    sub="Only real LLM generations"
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-medium text-violet-300">
                  Storage
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <StatCard
                    label="Total storage"
                    value={formatBytes(analytics.global.storage.total_bytes)}
                  />
                  <StatCard
                    label="Server disk (local)"
                    value={formatBytes(analytics.global.storage.server_bytes)}
                    sub={analytics.global.storage.server_label}
                  />
                  <StatCard
                    label="Cache (Redis)"
                    value={
                      analytics.global.storage.cache_available
                        ? formatBytes(analytics.global.storage.cache_bytes)
                        : "Not linked"
                    }
                    sub={
                      analytics.global.storage.cache_available
                        ? `${analytics.global.storage.cache_keys} cached answers`
                        : "Add Redis Cloud REDIS_URL in server/.env"
                    }
                  />
                  <StatCard
                    label="Database (MongoDB)"
                    value={
                      analytics.global.storage.database_available &&
                      analytics.global.storage.database_bytes != null
                        ? formatBytes(analytics.global.storage.database_bytes)
                        : "Not linked"
                    }
                    sub={
                      analytics.infrastructure.mongodb.connected
                        ? analytics.infrastructure.mongodb.label
                        : "Server cannot reach MongoDB"
                    }
                  />
                  <StatCard
                    label="Materials (indexed)"
                    value={
                      analytics.global.storage.materials_available &&
                      analytics.global.storage.materials_bytes != null
                        ? formatBytes(analytics.global.storage.materials_bytes)
                        : "—"
                    }
                    sub={`${analytics.global.books_ready} / ${analytics.global.books} ready`}
                  />
                  <StatCard
                    label="Citation links"
                    value={analytics.global.citation_links}
                    sub="Source references returned"
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-medium text-violet-300">
                  Users & content
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Schools" value={analytics.global.schools} />
                  <StatCard
                    label="Teachers (active)"
                    value={analytics.global.teachers}
                    sub={`${analytics.global.users_inactive_teachers} inactive`}
                  />
                  <StatCard label="Admins" value={analytics.global.admins} />
                  <StatCard
                    label="Total users"
                    value={analytics.global.users_total}
                  />
                  <StatCard
                    label="Materials"
                    value={analytics.global.books}
                    sub={`${analytics.global.books_ready} indexed`}
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-medium text-neutral-300">
                  Per school
                </h2>
                <div className="space-y-2">
                  {analytics.per_school.map((s) => (
                    <div
                      key={s.school_id}
                      className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-sm"
                    >
                      <p className="font-medium text-white">{s.school_name}</p>
                      <p className="mt-2 text-xs text-neutral-500">
                        {s.teachers} teachers · {s.books} materials ·{" "}
                        {s.questions} questions · {s.citation_links} links ·{" "}
                        {formatBytes(s.storage_bytes)} storage
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {analytics.global.model_usage.small_model.name}{" "}
                        {s.model_usage.small_model.credits} credits (
                        {s.model_usage.small_model.requests})
                        {s.model_usage.large_model.integrated !== false && (
                          <>
                            {" "}
                            · {s.model_usage.large_model.name}{" "}
                            {s.model_usage.large_model.credits} credits (
                            {s.model_usage.large_model.requests})
                          </>
                        )}{" "}
                        · {s.model_usage.cached_requests} cached
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "schools" && (
            <div className="grid gap-8 lg:grid-cols-2">
              <form
                onSubmit={handleCreateSchool}
                className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/80 p-5"
              >
                <h2 className="text-sm font-medium text-white">Add school</h2>
                <Input
                  placeholder="School name"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="aira-auth-input"
                  required
                />
                <Input
                  placeholder="Code (e.g. RHS01)"
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value)}
                  className="aira-auth-input"
                  required
                />
                <Button type="submit" className="bg-violet-500 hover:bg-violet-400">
                  Create school
                </Button>
              </form>
              <div className="space-y-2">
                {schools.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-4 py-3"
                  >
                    <p className="font-medium text-white">{s.name}</p>
                    <p className="text-xs text-neutral-500">{s.code}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "teachers" && (
            <div className="grid gap-8 lg:grid-cols-2">
              <form
                onSubmit={handleCreateTeacher}
                className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/80 p-5"
              >
                <h2 className="text-sm font-medium text-white">Add teacher</h2>
                <Input
                  placeholder="Full name"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  className="aira-auth-input"
                  required
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  className="aira-auth-input"
                  required
                />
                <Input
                  type="password"
                  placeholder="Temporary password"
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  className="aira-auth-input"
                  required
                  minLength={6}
                />
                <select
                  value={teacherSchoolId}
                  onChange={(e) => setTeacherSchoolId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-sm text-white"
                  required
                >
                  <option value="">Select school</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" className="bg-violet-500 hover:bg-violet-400">
                  Create teacher
                </Button>
              </form>
              <div className="space-y-2">
                {teachers.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-4 py-3"
                  >
                    <p className="font-medium text-white">{t.name}</p>
                    <p className="text-xs text-neutral-500">{t.email}</p>
                    <p className="text-xs text-neutral-600">{t.school_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "uploads" && (
            <div className="grid gap-8 lg:grid-cols-2">
              <form
                onSubmit={handleUpload}
                className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/80 p-5"
              >
                <h2 className="text-sm font-medium text-white">Upload material</h2>
                <select
                  value={uploadSchoolId}
                  onChange={(e) => setUploadSchoolId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-sm text-white"
                  required
                >
                  <option value="">Select school</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Book title"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="aira-auth-input"
                  required
                />
                <Input
                  placeholder="Subject"
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                  className="aira-auth-input"
                  required
                />
                <Input
                  placeholder="Class"
                  value={uploadClass}
                  onChange={(e) => setUploadClass(e.target.value)}
                  className="aira-auth-input"
                  required
                />
                <Input
                  placeholder="Chapter (optional)"
                  value={uploadChapter}
                  onChange={(e) => setUploadChapter(e.target.value)}
                  className="aira-auth-input"
                />
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-3 file:py-2 file:text-sm file:text-violet-300"
                  required
                />
                <Button
                  type="submit"
                  disabled={uploading}
                  className="bg-violet-500 hover:bg-violet-400"
                >
                  {uploading ? "Uploading..." : "Upload PDF"}
                </Button>
              </form>
              <div className="space-y-2">
                {books.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-4 py-3"
                  >
                    <p className="font-medium text-white">{b.title}</p>
                    <p className="text-xs text-neutral-500">
                      {b.subject} · Class {b.class}
                      {b.chapter ? ` · ${b.chapter}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      Status: {b.index_status}
                      {b.index_error ? ` — ${b.index_error}` : ""}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void reindexBook(b.id).then(loadData)}
                        className="text-xs text-violet-400 hover:text-violet-300"
                      >
                        Reindex
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteBook(b.id).then(loadData)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
