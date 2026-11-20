import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Crop,
  Download,
  Eye,
  Grid,
  RotateCcw,
  Upload,
} from "lucide-react";
import { formatBytes } from "../types";
import { blobToDataUrl, uploadProcessedRecord } from "../utils/mediaProcessing";

interface CropPreset {
  id: string;
  label: string;
  subtitle: string;
  width: number;
  height: number;
  toolTag: "passport" | "cropper";
}

const PRESETS: CropPreset[] = [
  {
    id: "us-passport",
    label: "US Passport",
    subtitle: "2×2 in · 600×600 px",
    width: 600,
    height: 600,
    toolTag: "passport",
  },
  {
    id: "eu-passport",
    label: "EU / UK / Schengen",
    subtitle: "35×45 mm · 413×531 px",
    width: 413,
    height: 531,
    toolTag: "passport",
  },
  {
    id: "asia-passport",
    label: "India / Square ID",
    subtitle: "35×35 mm · 413×413 px",
    width: 413,
    height: 413,
    toolTag: "passport",
  },
  {
    id: "crop-4-3",
    label: "Standard 4:3",
    subtitle: "1200×900 px",
    width: 1200,
    height: 900,
    toolTag: "cropper",
  },
  {
    id: "crop-16-9",
    label: "Widescreen 16:9",
    subtitle: "1600×900 px",
    width: 1600,
    height: 900,
    toolTag: "cropper",
  },
  {
    id: "crop-3-4",
    label: "Portrait 3:4",
    subtitle: "900×1200 px",
    width: 900,
    height: 1200,
    toolTag: "cropper",
  },
];

export default function PassportCropView() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [presetId, setPresetId] = useState<string>("us-passport");
  const [zoom, setZoom] = useState<number>(1.1);
  const [rotation, setRotation] = useState<number>(0);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [bgTone, setBgTone] = useState<string>("#ffffff");

  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
  });

  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const activePreset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  const drawPreview = () => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img) return;

    const previewMax = 440;
    const ratio = activePreset.width / activePreset.height;
    const cw = ratio >= 1 ? previewMax : Math.round(previewMax * ratio);
    const ch = ratio >= 1 ? Math.round(previewMax / ratio) : previewMax;

    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = bgTone;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.translate(cw / 2 + offsetX, ch / 2 + offsetY);
    ctx.rotate((rotation * Math.PI) / 180);

    const coverScale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom;
    const drawW = img.naturalWidth * coverScale;
    const drawH = img.naturalHeight * coverScale;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    if (showGuides) {
      ctx.save();
      ctx.strokeStyle = "rgba(6, 182, 212, 0.75)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);

      // Center vertical axis
      ctx.beginPath();
      ctx.moveTo(cw / 2, 0);
      ctx.lineTo(cw / 2, ch);
      ctx.stroke();

      if (activePreset.toolTag === "passport") {
        // Crown & chin biometric alignment bands
        ctx.beginPath();
        ctx.moveTo(0, ch * 0.14);
        ctx.lineTo(cw, ch * 0.14);
        ctx.moveTo(0, ch * 0.44);
        ctx.lineTo(cw, ch * 0.44);
        ctx.moveTo(0, ch * 0.78);
        ctx.lineTo(cw, ch * 0.78);
        ctx.stroke();

        // Oval head frame
        ctx.beginPath();
        ctx.ellipse(cw / 2, ch * 0.46, cw * 0.25, ch * 0.31, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Rule of thirds grid
        ctx.beginPath();
        ctx.moveTo(cw / 3, 0);
        ctx.lineTo(cw / 3, ch);
        ctx.moveTo((cw * 2) / 3, 0);
        ctx.lineTo((cw * 2) / 3, ch);
        ctx.moveTo(0, ch / 3);
        ctx.lineTo(cw, ch / 3);
        ctx.moveTo(0, (ch * 2) / 3);
        ctx.lineTo(cw, (ch * 2) / 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  useEffect(() => {
    drawPreview();
  });

  const handleFileLoad = (file: File) => {
    setErrorMsg("");
    setExportStatus("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMsg("Please choose a PNG, JPEG, or WebP portrait image.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      setSourceFile(file);
      setZoom(1.1);
      setRotation(0);
      setOffsetX(0);
      setOffsetY(0);
      setBrightness(100);
      setContrast(100);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setErrorMsg("Unable to decode the selected image.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const renderExportCanvas = (): HTMLCanvasElement => {
    const img = loadedImageRef.current;
    const previewCanvas = canvasRef.current;
    if (!img || !previewCanvas) {
      throw new Error("No image loaded for export.");
    }

    const out = document.createElement("canvas");
    out.width = activePreset.width;
    out.height = activePreset.height;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable.");

    const scaleFactor = activePreset.width / previewCanvas.width;

    ctx.fillStyle = bgTone;
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.translate(
      out.width / 2 + offsetX * scaleFactor,
      out.height / 2 + offsetY * scaleFactor
    );
    ctx.rotate((rotation * Math.PI) / 180);

    const coverScale = Math.max(out.width / img.naturalWidth, out.height / img.naturalHeight) * zoom;
    const drawW = img.naturalWidth * coverScale;
    const drawH = img.naturalHeight * coverScale;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    return out;
  };

  const handleExportSingle = async () => {
    if (!sourceFile) return;
    setIsExporting(true);
    setErrorMsg("");
    setExportStatus("");

    try {
      const singleCanvas = renderExportCanvas();
      const blob = await new Promise<Blob>((resolve, reject) => {
        singleCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Export encoding failed."))),
          "image/jpeg",
          0.92
        );
      });

      const dataUrl = await blobToDataUrl(blob);
      const base = sourceFile.name.replace(/\.[^.]+$/, "");
      const outName = `${base}-${activePreset.id}.jpg`;

      await uploadProcessedRecord({
        filename: outName,
        mimeType: "image/jpeg",
        tool: activePreset.toolTag,
        originalSize: sourceFile.size,
        processedSize: blob.size,
        width: activePreset.width,
        height: activePreset.height,
        dataUrl,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      a.click();
      URL.revokeObjectURL(url);

      setExportStatus(
        `Exported ${activePreset.width}×${activePreset.height} px (${formatBytes(blob.size)}) and saved to workspace.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPrintSheet = async () => {
    if (!sourceFile) return;
    setIsExporting(true);
    setErrorMsg("");
    setExportStatus("");

    try {
      const singleCanvas = renderExportCanvas();
      // 4x6 inch sheet @ 300 DPI -> 1800 x 1200 landscape
      const sheet = document.createElement("canvas");
      sheet.width = 1800;
      sheet.height = 1200;
      const ctx = sheet.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable.");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sheet.width, sheet.height);

      const cols = activePreset.width <= 450 ? 3 : 2;
      const rows = 2;
      const gap = 40;
      const cellW = Math.min(singleCanvas.width, 540);
      const cellH = Math.round(cellW * (activePreset.height / activePreset.width));

      const totalW = cols * cellW + (cols - 1) * gap;
      const totalH = rows * cellH + (rows - 1) * gap;
      const startX = Math.round((sheet.width - totalW) / 2);
      const startY = Math.round((sheet.height - totalH) / 2);

      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const x = startX + c * (cellW + gap);
          const y = startY + r * (cellH + gap);
          ctx.drawImage(singleCanvas, x, y, cellW, cellH);
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellW, cellH);
        }
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        sheet.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Print sheet encoding failed."))),
          "image/jpeg",
          0.93
        );
      });

      const dataUrl = await blobToDataUrl(blob);
      const base = sourceFile.name.replace(/\.[^.]+$/, "");
      const outName = `${base}-${activePreset.id}-4x6-sheet.jpg`;

      await uploadProcessedRecord({
        filename: outName,
        mimeType: "image/jpeg",
        tool: "passport",
        originalSize: sourceFile.size,
        processedSize: blob.size,
        width: sheet.width,
        height: sheet.height,
        dataUrl,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      a.click();
      URL.revokeObjectURL(url);

      setExportStatus(
        `Exported 4×6" print sheet (${cols * rows} copies · ${formatBytes(blob.size)}) and saved to workspace.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Print sheet export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between border-b border-slate-200 dark:border-slate-800/80 pb-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400 tracking-wide">
            Biometric Sizing &amp; Framing
          </p>
          <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 [text-wrap:balance]">
            Passport Size Converter &amp; Interactive Cropper
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Align portraits to international 300 DPI passport templates or custom editorial aspect
            ratios with interactive pan, zoom, tilt, and 4×6" print sheet generation.
          </p>
        </div>

        {sourceFile && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 self-start md:self-auto px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Replace Photo
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileLoad(f);
          e.target.value = "";
        }}
      />

      {!sourceFile ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className="group rounded-xl border border-dashed border-slate-300 dark:border-slate-700/80 bg-white dark:bg-[#0D131C] p-12 text-center hover:border-cyan-500/60 transition-colors cursor-pointer"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <Crop className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
            Upload a portrait or image to crop
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Supports US 2×2", Schengen 35×45mm, Square ID, and custom aspect ratios
          </p>
          <div className="mt-6">
            <span className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white group-hover:bg-cyan-500 transition-colors">
              Choose Image
            </span>
          </div>
          <p className="mt-5 text-xs text-slate-500 dark:text-slate-500">
            Transparency notice: Exported passport and cropped photos are stored on the làeb
            server for retrieval and administrative review.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive Canvas Stage */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Interactive Framing Canvas
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  {activePreset.label} · {activePreset.width}×{activePreset.height} px · Drag image
                  to reposition
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuides((g) => !g)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showGuides
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                {showGuides ? "Guides On" : "Guides Off"}
              </button>
            </div>

            <div className="flex items-center justify-center rounded-lg bg-slate-100 dark:bg-[#080C12] border border-slate-200 dark:border-slate-800 p-6 overflow-hidden">
              <canvas
                ref={canvasRef}
                onPointerDown={(e) => {
                  setIsDraggingCanvas(true);
                  dragStartRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                    ox: offsetX,
                    oy: offsetY,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!isDraggingCanvas) return;
                  setOffsetX(dragStartRef.current.ox + (e.clientX - dragStartRef.current.x));
                  setOffsetY(dragStartRef.current.oy + (e.clientY - dragStartRef.current.y));
                }}
                onPointerUp={() => setIsDraggingCanvas(false)}
                className="rounded-md shadow-sm cursor-grab active:cursor-grabbing touch-none border border-slate-300 dark:border-slate-700"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>Source: {sourceFile.name}</span>
              <button
                type="button"
                onClick={() => {
                  setZoom(1.1);
                  setRotation(0);
                  setOffsetX(0);
                  setOffsetY(0);
                  setBrightness(100);
                  setContrast(100);
                }}
                className="inline-flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Framing
              </button>
            </div>
          </div>

          {/* Controls & Presets */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-6 space-y-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2.5">
                Passport &amp; Crop Dimension Presets
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPresetId(preset.id)}
                    className={`text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                      presetId === preset.id
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {preset.label}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                      {preset.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-5">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Zoom</span>
                  <span className="font-mono-num text-cyan-600 dark:text-cyan-400">
                    {zoom.toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={3}
                  step={0.02}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full cyan-slider bg-slate-200 dark:bg-slate-800"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    Fine Rotation
                  </span>
                  <span className="font-mono-num text-cyan-600 dark:text-cyan-400">
                    {rotation}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="w-full cyan-slider bg-slate-200 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      Brightness
                    </span>
                    <span className="font-mono-num text-slate-500">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={75}
                    max={130}
                    step={1}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full cyan-slider bg-slate-200 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">Contrast</span>
                    <span className="font-mono-num text-slate-500">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min={75}
                    max={130}
                    step={1}
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full cyan-slider bg-slate-200 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Canvas Backdrop
                </span>
                <div className="flex items-center gap-2">
                  {[
                    { label: "Pure White", color: "#ffffff" },
                    { label: "Off White", color: "#f1f5f9" },
                    { label: "Studio Blue", color: "#dbeafe" },
                  ].map((bg) => (
                    <button
                      key={bg.color}
                      type="button"
                      onClick={() => setBgTone(bg.color)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                        bgTone === bg.color
                          ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            {exportStatus && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{exportStatus}</span>
              </div>
            )}

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportSingle}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {isExporting ? "Exporting..." : "Export Single Photo (300 DPI)"}
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportPrintSheet}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-600/40 bg-cyan-500/5 px-4 py-2.5 text-sm font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <Grid className="w-4 h-4" />
                Export 4×6" Printable Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
