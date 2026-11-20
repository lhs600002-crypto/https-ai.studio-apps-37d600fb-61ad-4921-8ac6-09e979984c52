import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import AdminDashboardView from "./components/AdminDashboardView";
import AiStudioView from "./components/AiStudioView";
import CompressorView from "./components/CompressorView";
import PassportCropView from "./components/PassportCropView";
import { OfflineIndicator, PWAInstallButton } from "./components/PWAInstallButton";
import type { PublicTab } from "./types";

function isAdminLocation(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.pathname === "/admin" ||
    window.location.pathname === "/admin/" ||
    window.location.hash === "#/admin"
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<PublicTab>("compressor");
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => isAdminLocation());
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false
  );

  const compressorFileTriggerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const syncRoute = () => setIsAdminRoute(isAdminLocation());
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("hashchange", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener("hashchange", syncRoute);
    };
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  };

  const exitAdminRoute = () => {
    window.history.pushState({}, "", "/");
    setIsAdminRoute(false);
    setActiveTab("compressor");
  };

  const handlePrimaryAction = () => {
    if (isAdminRoute) {
      exitAdminRoute();
      return;
    }
    setActiveTab("compressor");
    setTimeout(() => {
      compressorFileTriggerRef.current?.click();
    }, 30);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#070B11] dark:text-slate-100 transition-colors duration-150">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#070B11]/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1200px] px-6 py-4 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element Brand wordmark */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              if (isAdminRoute) {
                exitAdminRoute();
              } else {
                setActiveTab("compressor");
              }
            }}
            className="font-amiri text-2xl font-bold tracking-tight text-slate-900 dark:text-cyan-400 whitespace-nowrap shrink-0"
          >
            Laèb
          </a>

          {/* Zone 2: Clean single-line navigation links */}
          {!isAdminRoute ? (
            <nav className="flex items-center gap-6 text-sm font-medium">
              {(
                [
                  { id: "compressor", label: "Compressor" },
                  { id: "passport", label: "Passport & Crop" },
                  { id: "ai", label: "AI Studio" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === item.id
                      ? "border-cyan-500 text-slate-900 dark:text-slate-50"
                      : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          ) : (
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
              Administrator Console
            </div>
          )}

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isAdminRoute ? "Exit Admin" : "Upload File"}
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Sub-Toolbar */}
      <div className="mx-auto w-full max-w-[1200px] px-6 pt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isAdminRoute
            ? "Laèb · pp — Protected workspace telemetry and uploaded media inspection."
            : "Laèb · pp — Futuristic media compression, passport framing, and AI editing · Uploaded files are saved on the server for processing and administrative review."}
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-cyan-500/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-cyan-400" /> : <Moon className="w-3.5 h-3.5 text-cyan-600" />}
            {isDark ? "Daylight" : "Obsidian"}
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-8">
        {isAdminRoute ? (
          <AdminDashboardView onExitAdmin={exitAdminRoute} />
        ) : activeTab === "compressor" ? (
          <CompressorView externalFileTriggerRef={compressorFileTriggerRef} />
        ) : activeTab === "passport" ? (
          <PassportCropView />
        ) : (
          <AiStudioView />
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#070B11]">
        <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-amiri text-sm font-bold text-slate-900 dark:text-cyan-400">
              Laèb
            </span>
            <span aria-hidden="true">·</span>
            <span>pp</span>
            <span aria-hidden="true">·</span>
            <span>Created by pimpom group</span>
          </div>
          <span>PDF &amp; Image Compression · Passport Studio · AI Reverter</span>
        </div>
      </footer>
      <OfflineIndicator />
    </div>
  );
}
