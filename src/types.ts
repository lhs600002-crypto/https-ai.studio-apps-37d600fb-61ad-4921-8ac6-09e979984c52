export type PublicTab = "compressor" | "passport" | "ai";

export interface UploadRecord {
  id: string;
  filename: string;
  storedName: string;
  mimeType: string;
  category: "image" | "pdf";
  tool: "compressor" | "passport" | "cropper";
  originalSize: number;
  processedSize: number;
  savingsPercent: number;
  width?: number;
  height?: number;
  pageCount?: number;
  createdAt: string;
}

export interface AdminStats {
  totalFiles: number;
  imageCount: number;
  pdfCount: number;
  totalOriginalBytes: number;
  totalProcessedBytes: number;
  totalSavedBytes: number;
  averageSavingsPercent: number;
  byTool: Record<string, number>;
  byFormat: Record<string, number>;
  dailyVolume: Array<{ date: string; count: number; bytes: number }>;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 100 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
