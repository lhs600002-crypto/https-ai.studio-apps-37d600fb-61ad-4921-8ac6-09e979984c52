import React, { useCallback, useEffect, useState } from "react";
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { formatBytes, formatDateTime } from "../types";
import type { AdminStats, UploadRecord } from "../types";

const TOKEN_STORAGE_KEY = "laeb_admin_token";

interface AdminDashboardViewProps {
  onExitAdmin: () => void;
}

export default function AdminDashboardView({ onExitAdmin }: AdminDashboardViewProps) {
  const [token, setToken] = useState<string>(
    () => sessionStorage.getItem(TOKEN_STORAGE_KEY) || ""
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  // Login gate state
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Dashboard data state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [files, setFiles] = useState<UploadRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string>("");

  // Filters
  const [search, setSearch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "pdf">("all");
  const [sortBy, setSortBy] = useState<"newest" | "largest" | "savings">("newest");

  // Preview Inspector state
  const [selectedFile, setSelectedFile] = useState<UploadRecord | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string>("");

  const authHeaders = useCallback(
    (currentToken: string): Record<string, string> =>
      currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
    []
  );

  // Verify existing session on mount
  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      try {
        const res = await fetch("/api/admin/session", {
          headers: authHeaders(token),
        });
        const data = (await res.json()) as { authenticated?: boolean };
        if (!cancelled) {
          setIsAuthenticated(Boolean(data.authenticated));
          if (!data.authenticated && token) {
            sessionStorage.removeItem(TOKEN_STORAGE_KEY);
            setToken("");
          }
        }
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    };
    void verify();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, token]);

  const loadDashboardData = useCallback(
    async (activeToken: string) => {
      setIsLoadingData(true);
      setDataError("");
      try {
        const params = new URLSearchParams({
          search,
          type: typeFilter,
          sort: sortBy,
        });

        const [statsRes, filesRes] = await Promise.all([
          fetch("/api/admin/stats", { headers: authHeaders(activeToken) }),
          fetch(`/api/admin/files?${params.toString()}`, {
            headers: authHeaders(activeToken),
          }),
        ]);

        if (statsRes.status === 401 || filesRes.status === 401) {
          setIsAuthenticated(false);
          sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken("");
          return;
        }

        if (!statsRes.ok || !filesRes.ok) {
          throw new Error("Failed to load administrator telemetry.");
        }

        const statsJson = (await statsRes.json()) as AdminStats;
        const filesJson = (await filesRes.json()) as { files: UploadRecord[] };
        setStats(statsJson);
        setFiles(filesJson.files || []);
      } catch (err) {
        setDataError(err instanceof Error ? err.message : "Failed to fetch admin data.");
      } finally {
        setIsLoadingData(false);
      }
    },
    [authHeaders, search, sortBy, typeFilter]
  );

  useEffect(() => {
    if (isAuthenticated) {
      void loadDashboardData(token);
    }
  }, [isAuthenticated, token, loadDashboardData]);

  // Load authenticated blob preview when a file is selected
  useEffect(() => {
    let activeUrl = "";
    let cancelled = false;

    if (!selectedFile || !isAuthenticated) {
      setPreviewObjectUrl("");
      return;
    }

    const fetchPreview = async () => {
      setIsLoadingPreview(true);
      setPreviewError("");
      try {
        const res = await fetch(`/api/admin/files/${selectedFile.id}/content`, {
          headers: authHeaders(token),
        });
        if (!res.ok) {
          throw new Error("Could not load file preview.");
        }
        const blob = await res.blob();
        activeUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setPreviewObjectUrl(activeUrl);
        } else {
          URL.revokeObjectURL(activeUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : "Preview unavailable.");
        }
      } finally {
        if (!cancelled) setIsLoadingPreview(false);
      }
    };

    void fetchPreview();

    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [selectedFile, isAuthenticated, token, authHeaders]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsAuthenticating(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data.token) {
        throw new Error(data.error || "Access denied.");
      }
      sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setToken(data.token);
      setIsAuthenticated(true);
      setPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
    setIsAuthenticated(false);
    setSelectedFile(null);
  };

  const handleDelete = async (fileId: string) => {
    try {
      const res = await fetch(`/api/admin/files/${fileId}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error("Delete failed.");
      if (selectedFile?.id === fileId) {
        setSelectedFile(null);
      }
      await loadDashboardData(token);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Failed to delete file.");
    }
  };

  const handleDownloadFile = async (record: UploadRecord) => {
    const res = await fetch(`/api/admin/files/${record.id}/content`, {
      headers: authHeaders(token),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = record.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (checkingSession) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Verifying session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              Administrator Console
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Enter the administrator password to inspect aggregate storage statistics and
              uploaded file previews.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Access Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C12] px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {authError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
                {authError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isAuthenticating || !password}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                {isAuthenticating ? "Verifying..." : "Unlock Dashboard"}
              </button>
              <button
                type="button"
                onClick={onExitAdmin}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
              >
                Return
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const maxDailyCount = Math.max(
    1,
    ...(stats?.dailyVolume.map((d) => d.count) ?? [1])
  );

  return (
    <section className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-slate-200 dark:border-slate-800/80 pb-6">
        <div>
          <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400 tracking-wide">
            làeb / pp / Administration / File Telemetry
          </p>
          <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Uploaded Files &amp; Storage Overview
          </h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadDashboardData(token)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Lock Console
          </button>
          <button
            type="button"
            onClick={onExitAdmin}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors whitespace-nowrap cursor-pointer"
          >
            Public Workspace
          </button>
        </div>
      </div>

      {dataError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          {dataError}
        </div>
      )}

      {/* 4-Column KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Uploaded Files</p>
          <p className="mt-2 text-2xl font-semibold font-mono-num text-slate-900 dark:text-slate-50">
            {stats?.totalFiles ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {stats?.imageCount ?? 0} images · {stats?.pdfCount ?? 0} PDFs
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Original Input Volume</p>
          <p className="mt-2 text-2xl font-semibold font-mono-num text-slate-900 dark:text-slate-50">
            {formatBytes(stats?.totalOriginalBytes ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Cumulative pre-processed size
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Stored Server Volume</p>
          <p className="mt-2 text-2xl font-semibold font-mono-num text-cyan-600 dark:text-cyan-400">
            {formatBytes(stats?.totalProcessedBytes ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Active archived repository
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Aggregate Savings</p>
          <p className="mt-2 text-2xl font-semibold font-mono-num text-emerald-600 dark:text-emerald-400">
            {stats?.averageSavingsPercent ?? 0}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {formatBytes(stats?.totalSavedBytes ?? 0)} reduced
          </p>
        </div>
      </div>

      {/* Distribution & 7-Day Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Distribution by Format &amp; Tool
          </h2>
          <div className="space-y-3">
            {[
              { label: "JPEG", count: stats?.byFormat.jpeg ?? 0 },
              { label: "PNG", count: stats?.byFormat.png ?? 0 },
              { label: "WebP", count: stats?.byFormat.webp ?? 0 },
              { label: "PDF", count: stats?.byFormat.pdf ?? 0 },
            ].map((item) => {
              const total = Math.max(1, stats?.totalFiles ?? 1);
              const pct = Math.round((item.count / total) * 100);
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {item.label}
                    </span>
                    <span className="font-mono-num text-slate-500 dark:text-slate-400">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            <span>Compressor: {stats?.byTool.compressor ?? 0}</span>
            <span>Passport: {stats?.byTool.passport ?? 0}</span>
            <span>Cropper: {stats?.byTool.cropper ?? 0}</span>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              7-Day Upload Volume
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Daily file count
            </span>
          </div>
          <div className="grid grid-cols-7 gap-3 items-end h-36 pt-4">
            {(stats?.dailyVolume ?? []).map((day) => {
              const heightPct = Math.max(6, Math.round((day.count / maxDailyCount) * 100));
              return (
                <div key={day.date} className="flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                    {day.count}
                  </span>
                  <div className="w-full max-w-[36px] flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-cyan-500/80 hover:bg-cyan-400 transition-colors"
                      style={{ height: `${heightPct}%` }}
                      title={`${day.date}: ${day.count} files (${formatBytes(day.bytes)})`}
                    />
                  </div>
                  <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                    {day.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Split: File Table + Live Preview Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          className={`${
            selectedFile ? "lg:col-span-7" : "lg:col-span-12"
          } rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] overflow-hidden`}
        >
          {/* Search & Filter Toolbar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search filenames or tools..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C12] pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
                {(["all", "image", "pdf"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize cursor-pointer ${
                      typeFilter === t
                        ? "bg-white dark:bg-[#141D2A] text-slate-900 dark:text-slate-100 shadow-sm"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {t === "all" ? "All" : t === "image" ? "Images" : "PDFs"}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "newest" | "largest" | "savings")}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C12] px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="newest">Newest First</option>
                <option value="largest">Largest Size</option>
                <option value="savings">Highest Savings</option>
              </select>
            </div>
          </div>

          {isLoadingData ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((row) => (
                <div
                  key={row}
                  className="h-10 rounded-md bg-slate-100 dark:bg-slate-800/60 animate-pulse"
                />
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No uploaded files match your filter yet.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Files processed in the Compressor or Passport &amp; Crop tools will appear here with
                live previews and size telemetry.
              </p>
              <button
                type="button"
                onClick={onExitAdmin}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors cursor-pointer"
              >
                Open Public Tools
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">File</th>
                    <th className="py-2.5 px-3">Tool</th>
                    <th className="py-2.5 px-3 text-right">Original</th>
                    <th className="py-2.5 px-3 text-right">Stored</th>
                    <th className="py-2.5 px-3 text-right">Saved</th>
                    <th className="py-2.5 px-3">Uploaded</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                  {files.map((file) => {
                    const isSelected = selectedFile?.id === file.id;
                    return (
                      <tr
                        key={file.id}
                        onClick={() => setSelectedFile(file)}
                        className={`h-11 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-cyan-500/10"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="py-2 px-4 max-w-[200px]">
                          <div className="flex items-center gap-2 min-w-0">
                            {file.category === "pdf" ? (
                              <FileText className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                            )}
                            <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                              {file.filename}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 capitalize text-slate-600 dark:text-slate-400">
                          {file.tool}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-slate-600 dark:text-slate-400">
                          {formatBytes(file.originalSize)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-slate-900 dark:text-slate-100">
                          {formatBytes(file.processedSize)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-emerald-600 dark:text-emerald-400">
                          {file.savingsPercent > 0 ? `-${file.savingsPercent}%` : "0%"}
                        </td>
                        <td className="py-2 px-3 font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDateTime(file.createdAt)}
                        </td>
                        <td
                          className="py-2 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedFile(file)}
                              title="Preview"
                              className="p-1.5 rounded-md text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownloadFile(file)}
                              title="Download"
                              className="p-1.5 rounded-md text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(file.id)}
                              title="Delete"
                              className="p-1.5 rounded-md text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Live File Preview Inspector */}
        {selectedFile && (
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
                  File Preview Inspector
                </p>
                <h3 className="mt-0.5 truncate text-lg font-bold text-slate-900 dark:text-slate-100">
                  {selectedFile.filename}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  {selectedFile.mimeType} · {formatBytes(selectedFile.processedSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#080C12] overflow-hidden min-h-[280px] flex items-center justify-center">
              {isLoadingPreview ? (
                <p className="text-xs text-slate-500">Loading preview...</p>
              ) : previewError ? (
                <p className="text-xs text-red-500 px-4 text-center">{previewError}</p>
              ) : previewObjectUrl ? (
                selectedFile.category === "pdf" ? (
                  <iframe
                    src={previewObjectUrl}
                    title={`Preview of ${selectedFile.filename}`}
                    className="w-full h-[380px]"
                  />
                ) : (
                  <img
                    src={previewObjectUrl}
                    alt={selectedFile.filename}
                    referrerPolicy="no-referrer"
                    className="max-h-[380px] max-w-full object-contain"
                  />
                )
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs border-t border-slate-200 dark:border-slate-800 pt-4">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Original Size</span>
                <span className="font-mono-num font-medium text-slate-900 dark:text-slate-100">
                  {formatBytes(selectedFile.originalSize)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Stored Size</span>
                <span className="font-mono-num font-medium text-cyan-600 dark:text-cyan-400">
                  {formatBytes(selectedFile.processedSize)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Tool Source</span>
                <span className="capitalize font-medium text-slate-900 dark:text-slate-100">
                  {selectedFile.tool}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">
                  {selectedFile.category === "pdf" ? "Pages" : "Dimensions"}
                </span>
                <span className="font-mono-num font-medium text-slate-900 dark:text-slate-100">
                  {selectedFile.category === "pdf"
                    ? `${selectedFile.pageCount ?? "—"} pages`
                    : selectedFile.width && selectedFile.height
                      ? `${selectedFile.width}×${selectedFile.height} px`
                      : "—"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void handleDownloadFile(selectedFile)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download File
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(selectedFile.id)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
