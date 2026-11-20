import React, { useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Upload,
  Zap,
} from "lucide-react";
import { formatBytes } from "../types";
import {
  compressImageFile,
  compressPdfFile,
  uploadProcessedRecord,
} from "../utils/mediaProcessing";
import type { CompressionProgress } from "../utils/mediaProcessing";

interface ProcessedOutput {
  filename: string;
  mimeType: string;
  originalSize: number;
  processedSize: number;
  savingsPercent: number;
  previewUrl: string;
  width?: number;
  height?: number;
  pageCount?: number;
  savedToServer: boolean;
}

interface FastPreset {
  id: string;
  label: string;
  detail: string;
  mode: "target" | "custom";
  targetReduction: number;
  quality: number;
  maxDimension: number;
  outputMime: "auto" | "image/jpeg" | "image/webp" | "image/png";
}

const FAST_OPTIONS: FastPreset[] = [
  {
    id: "quick-50",
    label: "Quick 50%",
    detail: "Balanced half-weight",
    mode: "target",
    targetReduction: 50,
    quality: 72,
    maxDimension: 1600,
    outputMime: "auto",
  },
  {
    id: "ultra-75",
    label: "Ultra Light 75%",
    detail: "Max space savings",
    mode: "target",
    targetReduction: 75,
    quality: 55,
    maxDimension: 1200,
    outputMime: "image/webp",
  },
  {
    id: "crisp-30",
    label: "Crisp Web 30%",
    detail: "High clarity",
    mode: "target",
    targetReduction: 30,
    quality: 84,
    maxDimension: 2048,
    outputMime: "auto",
  },
  {
    id: "archival",
    label: "Lossless Pack",
    detail: "Original dimensions",
    mode: "custom",
    targetReduction: 20,
    quality: 92,
    maxDimension: 0,
    outputMime: "auto",
  },
];

interface CompressorViewProps {
  externalFileTriggerRef?: React.RefObject<HTMLInputElement | null>;
}

export default function CompressorView({ externalFileTriggerRef }: CompressorViewProps) {
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = externalFileTriggerRef ?? internalInputRef;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  // Compression preset mode & configurable reduction target
  const [activeFastId, setActiveFastId] = useState<string>("quick-50");
  const [compressionMode, setCompressionMode] = useState<"target" | "custom">("target");
  const [targetReduction, setTargetReduction] = useState<number>(50);

  // Image controls
  const [quality, setQuality] = useState<number>(72);
  const [maxDimension, setMaxDimension] = useState<number>(1600);
  const [outputMime, setOutputMime] = useState<"auto" | "image/jpeg" | "image/webp" | "image/png">(
    "auto"
  );

  // PDF controls
  const [stripMetadata, setStripMetadata] = useState<boolean>(true);
  const [useObjectStreams, setUseObjectStreams] = useState<boolean>(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [liveProgress, setLiveProgress] = useState<CompressionProgress | null>(null);
  const [passHistory, setPassHistory] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [output, setOutput] = useState<ProcessedOutput | null>(null);

  const isPdf = selectedFile?.type === "application/pdf";

  const handleFileSelect = async (file: File) => {
    setErrorMsg("");
    setOutput(null);
    setLiveProgress(null);
    setPassHistory([]);

    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      setErrorMsg("Unsupported file format. Please choose a PDF, PNG, JPEG, or WebP file.");
      return;
    }

    if (file.size > 256 * 1024 * 1024) {
      setErrorMsg("File exceeds the 256 MB upload limit.");
      return;
    }

    if (originalPreviewUrl) {
      URL.revokeObjectURL(originalPreviewUrl);
    }

    setSelectedFile(file);
    if (file.type !== "application/pdf") {
      setOriginalPreviewUrl(URL.createObjectURL(file));
    } else {
      setOriginalPreviewUrl("");
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileSelect(file);
    }
  };

  const runCompression = async (override?: {
    mode: "target" | "custom";
    targetReduction: number;
    quality: number;
    maxDimension: number;
    outputMime: "auto" | "image/jpeg" | "image/webp" | "image/png";
  }) => {
    if (!selectedFile) return;

    const effMode = override?.mode ?? compressionMode;
    const effTarget = override?.targetReduction ?? targetReduction;
    const effQuality = override?.quality ?? quality;
    const effMaxDim = override?.maxDimension ?? maxDimension;
    const effMime = override?.outputMime ?? outputMime;

    setIsProcessing(true);
    setErrorMsg("");
    setOutput(null);
    setPassHistory([]);
    setLiveProgress({
      stage: "decoding",
      percentComplete: 8,
      label: "Initializing pipeline",
      currentBytes: selectedFile.size,
      originalBytes: selectedFile.size,
      liveSavingsPercent: 0,
    });

    const recordProgress = (prog: CompressionProgress) => {
      setLiveProgress(prog);
      setPassHistory((prev) => {
        if (prev[prev.length - 1] === prog.label) return prev;
        return [...prev.slice(-4), prog.label];
      });
    };

    try {
      if (selectedFile.type === "application/pdf") {
        const result = await compressPdfFile(selectedFile, {
          stripMetadata: effMode === "target" ? true : stripMetadata,
          useObjectStreams: effMode === "target" ? true : useObjectStreams,
          targetReductionPercent: effMode === "target" ? effTarget : undefined,
          onProgress: recordProgress,
        });

        const baseName = selectedFile.name.replace(/\.pdf$/i, "");
        const outFilename = `${baseName}-compressed.pdf`;
        const finalBlob = result.blob.size < selectedFile.size ? result.blob : selectedFile;

        const savings =
          selectedFile.size > 0
            ? Math.max(
                0,
                Math.round(((selectedFile.size - finalBlob.size) / selectedFile.size) * 1000) / 10
              )
            : 0;

        await uploadProcessedRecord({
          filename: outFilename,
          mimeType: "application/pdf",
          tool: "compressor",
          originalSize: selectedFile.size,
          processedSize: finalBlob.size,
          pageCount: result.pageCount,
          blob: finalBlob,
          onUploadProgress: (fraction) => {
            recordProgress({
              stage: "saving",
              percentComplete: 78 + Math.round(fraction * 22),
              label: `Saving to workspace (${Math.round(fraction * 100)}%)`,
              currentBytes: finalBlob.size,
              originalBytes: selectedFile.size,
              liveSavingsPercent: savings,
            });
          },
        });

        setOutput({
          filename: outFilename,
          mimeType: "application/pdf",
          originalSize: selectedFile.size,
          processedSize: finalBlob.size,
          savingsPercent: savings,
          previewUrl: URL.createObjectURL(finalBlob),
          pageCount: result.pageCount,
          savedToServer: true,
        });
      } else {
        const result = await compressImageFile(selectedFile, {
          quality: effQuality / 100,
          maxDimension: effMaxDim,
          outputMime: effMime,
          targetReductionPercent: effMode === "target" ? effTarget : undefined,
          onProgress: recordProgress,
        });

        const ext =
          result.mimeType === "image/webp"
            ? "webp"
            : result.mimeType === "image/png"
              ? "png"
              : "jpg";
        const baseName = selectedFile.name.replace(/\.[^.]+$/, "");
        const outFilename = `${baseName}-compressed.${ext}`;

        const savings =
          selectedFile.size > 0
            ? Math.round(((selectedFile.size - result.blob.size) / selectedFile.size) * 1000) / 10
            : 0;

        await uploadProcessedRecord({
          filename: outFilename,
          mimeType: result.mimeType,
          tool: "compressor",
          originalSize: selectedFile.size,
          processedSize: result.blob.size,
          width: result.width,
          height: result.height,
          blob: result.blob,
          onUploadProgress: (fraction) => {
            recordProgress({
              stage: "saving",
              percentComplete: 78 + Math.round(fraction * 22),
              label: `Saving to workspace (${Math.round(fraction * 100)}%)`,
              currentBytes: result.blob.size,
              originalBytes: selectedFile.size,
              liveSavingsPercent: Math.max(0, savings),
            });
          },
        });

        setOutput({
          filename: outFilename,
          mimeType: result.mimeType,
          originalSize: selectedFile.size,
          processedSize: result.blob.size,
          savingsPercent: savings,
          previewUrl: URL.createObjectURL(result.blob),
          width: result.width,
          height: result.height,
          savedToServer: true,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Compression failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const applyFastOption = (preset: FastPreset) => {
    setActiveFastId(preset.id);
    setCompressionMode(preset.mode);
    setTargetReduction(preset.targetReduction);
    setQuality(preset.quality);
    setMaxDimension(preset.maxDimension);
    setOutputMime(preset.outputMime);

    if (selectedFile && !isProcessing) {
      void runCompression({
        mode: preset.mode,
        targetReduction: preset.targetReduction,
        quality: preset.quality,
        maxDimension: preset.maxDimension,
        outputMime: preset.outputMime,
      });
    }
  };

  const handleDownload = () => {
    if (!output) return;
    const link = document.createElement("a");
    link.href = output.previewUrl;
    link.download = output.filename;
    link.click();
  };

  const handleReset = () => {
    setSelectedFile(null);
    setOutput(null);
    setLiveProgress(null);
    setPassHistory([]);
    setErrorMsg("");
    if (originalPreviewUrl) {
      URL.revokeObjectURL(originalPreviewUrl);
      setOriginalPreviewUrl("");
    }
  };

  // Visual gauge math for SVG ring
  const gaugeRadius = 42;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const activeSavings = output
    ? Math.max(0, output.savingsPercent)
    : liveProgress?.liveSavingsPercent ?? 0;
  const remainingFraction = Math.max(0.06, Math.min(1, 1 - activeSavings / 100));
  const strokeDashoffset = gaugeCircumference * (1 - activeSavings / 100);

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between border-b border-slate-200 dark:border-slate-800/80 pb-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400 tracking-wide">
            Media &amp; Document Compression
          </p>
          <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 [text-wrap:balance]">
            Precision PDF &amp; Image Compressor
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Reduce file weight with adaptive canvas resampling, WebP/JPEG transcoding, and PDF
            object-stream packing up to 256 MB.
          </p>
        </div>

        {selectedFile && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 self-start md:self-auto px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear File
          </button>
        )}
      </div>

      {/* Fast Options Strip (Always reachable in 1 click) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            <Zap className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Fast Options</span>
            <span className="font-normal text-slate-500 dark:text-slate-400">
              {selectedFile ? "· Click to compress immediately" : "· Select a preset before upload"}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 lg:max-w-3xl">
            {FAST_OPTIONS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={isProcessing}
                onClick={() => applyFastOption(preset)}
                className={`text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-60 ${
                  activeFastId === preset.id
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-slate-200 dark:border-slate-800 hover:border-cyan-500/40"
                }`}
              >
                <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {preset.label}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {preset.detail}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFileSelect(file);
          e.target.value = "";
        }}
      />

      {!selectedFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`group rounded-xl border border-dashed p-12 text-center transition-colors cursor-pointer ${
            isDragging
              ? "border-cyan-500 bg-cyan-500/5"
              : "border-slate-300 dark:border-slate-700/80 bg-white dark:bg-[#0D131C] hover:border-cyan-500/60"
          }`}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <Upload className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
            Drop a PDF or image to compress
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Supports PDF, JPEG, PNG, and WebP up to 256 MB
          </p>
          <div className="mt-6">
            <span className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white group-hover:bg-cyan-500 transition-colors">
              Select File
            </span>
          </div>
          <p className="mt-5 text-xs text-slate-500 dark:text-slate-500">
            Transparency notice: Uploaded files are stored on the làeb server for processing,
            retrieval, and administrative review.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls Panel */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-cyan-600 dark:text-cyan-400 font-medium">
                  {isPdf ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                  <span>{isPdf ? "PDF Document" : "Raster Image"}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedFile.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  Original: {formatBytes(selectedFile.size)}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Compression Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFastId("");
                      setCompressionMode("target");
                    }}
                    className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      compressionMode === "target"
                        ? "bg-white dark:bg-[#141D2A] text-cyan-700 dark:text-cyan-300 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Target Reduction
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFastId("");
                      setCompressionMode("custom");
                    }}
                    className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      compressionMode === "custom"
                        ? "bg-white dark:bg-[#141D2A] text-slate-900 dark:text-slate-100 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Custom Manual
                  </button>
                </div>
              </div>

              {compressionMode === "target" && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E15] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      How Much to Compress
                    </span>
                    <span className="font-mono-num font-semibold text-cyan-600 dark:text-cyan-400">
                      Up to {targetReduction}% smaller
                    </span>
                  </div>

                  <input
                    type="range"
                    min={10}
                    max={85}
                    step={5}
                    value={targetReduction}
                    onChange={(e) => {
                      setActiveFastId("");
                      setTargetReduction(Number(e.target.value));
                    }}
                    className="w-full cyan-slider bg-slate-200 dark:bg-slate-800"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {[25, 50, 75].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            setActiveFastId("");
                            setTargetReduction(pct);
                          }}
                          className={`px-2.5 py-1 text-[11px] font-mono-num font-medium rounded border transition-colors cursor-pointer ${
                            targetReduction === pct
                              ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                      Target &le;{" "}
                      {formatBytes(
                        Math.max(
                          1024,
                          Math.round(selectedFile.size * (1 - targetReduction / 100))
                        )
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {isPdf ? (
              compressionMode === "custom" ? (
                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useObjectStreams}
                      onChange={(e) => setUseObjectStreams(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-cyan-600 rounded"
                    />
                    <div>
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                        Object Stream Compression
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Packs PDF cross-reference tables and internal object streams efficiently.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripMetadata}
                      onChange={(e) => setStripMetadata(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-cyan-600 rounded"
                    />
                    <div>
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                        Strip Document Metadata
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Removes redundant producer tags, author headers, and unused document info.
                      </span>
                    </div>
                  </label>
                </div>
              ) : null
            ) : (
              <div className="space-y-5">
                {compressionMode === "custom" && (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Compression Quality
                      </span>
                      <span className="font-mono-num font-semibold text-cyan-600 dark:text-cyan-400">
                        {quality}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={95}
                      step={1}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-full cyan-slider bg-slate-200 dark:bg-slate-800"
                    />
                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
                      <span>Maximum Savings</span>
                      <span>Balanced</span>
                      <span>Archival</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Target Max Dimension
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Original", value: 0 },
                      { label: "2048 px", value: 2048 },
                      { label: "1600 px", value: 1600 },
                      { label: "800 px", value: 800 },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setMaxDimension(preset.value)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          maxDimension === preset.value
                            ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                            : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Output Format
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
                    {(
                      [
                        { label: "Auto", value: "auto" },
                        { label: "WebP", value: "image/webp" },
                        { label: "JPEG", value: "image/jpeg" },
                        { label: "PNG", value: "image/png" },
                      ] as const
                    ).map((fmt) => (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => setOutputMime(fmt.value)}
                        className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          outputMime === fmt.value
                            ? "bg-white dark:bg-[#141D2A] text-slate-900 dark:text-slate-100 shadow-sm"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="pt-2 space-y-3">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => void runCompression()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4" />
                {isProcessing ? "Compressing..." : "Compress & Process"}
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-relaxed">
                Processed files are saved on the làeb workspace server so outputs can be
                verified and reviewed by site administrators.
              </p>
            </div>
          </div>

          {/* Preview & Unique Live Compression Visualizer */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {isProcessing ? "Live Compression Telemetry" : "Output Inspection"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isProcessing && liveProgress
                    ? liveProgress.label
                    : output
                      ? `${output.filename} · ${output.mimeType}`
                      : "Choose a Fast Option or run compression to watch live reduction"}
                </p>
              </div>
              {output && !isProcessing && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Output
                </button>
              )}
            </div>

            {/* Unique Live Mass-Contraction & Radial Gauge (Visible while compressing OR after completion) */}
            {(isProcessing || output) && (
              <div className="rounded-xl border border-cyan-500/25 bg-slate-50 dark:bg-[#090E15] p-5">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {/* Radial Compression Ring */}
                  <div className="relative flex items-center justify-center shrink-0">
                    <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r={gaugeRadius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="7"
                        className="text-slate-200 dark:text-slate-800"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r={gaugeRadius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={gaugeCircumference}
                        strokeDashoffset={strokeDashoffset}
                        className="text-cyan-600 dark:text-cyan-400 transition-[stroke-dashoffset] duration-300 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-lg font-bold font-mono-num text-slate-900 dark:text-slate-50">
                        {activeSavings.toFixed(0)}%
                      </span>
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        compressed
                      </span>
                    </div>
                  </div>

                  {/* Proportional Footprint Contraction Bar */}
                  <div className="flex-1 w-full space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {isProcessing
                          ? `Stage: ${liveProgress?.stage ?? "compressing"} (${liveProgress?.percentComplete ?? 0}%)`
                          : "Final Footprint Contraction"}
                      </span>
                      <span className="font-mono-num text-emerald-600 dark:text-emerald-400 font-semibold">
                        -
                        {formatBytes(
                          Math.max(
                            0,
                            selectedFile.size -
                              (output
                                ? output.processedSize
                                : liveProgress?.currentBytes ?? selectedFile.size)
                          )
                        )}{" "}
                        shed
                      </span>
                    </div>

                    {/* Outer Frame = Original 100%, Inner Cyan Core = Remaining Weight */}
                    <div className="space-y-1.5">
                      <div className="h-4 w-full rounded-md bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
                        <div
                          className="h-full bg-cyan-600 dark:bg-cyan-500 rounded-md transition-all duration-300 ease-out"
                          style={{ width: `${Math.round(remainingFraction * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                        <span>
                          Compressed:{" "}
                          <strong className="text-slate-900 dark:text-slate-100">
                            {formatBytes(
                              output
                                ? output.processedSize
                                : liveProgress?.currentBytes ?? selectedFile.size
                            )}
                          </strong>
                        </span>
                        <span>Original: {formatBytes(selectedFile.size)}</span>
                      </div>
                    </div>

                    {passHistory.length > 0 && (
                      <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                        {passHistory.map((step, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1">
                            {idx > 0 && <span aria-hidden="true">→</span>}
                            <span
                              className={
                                idx === passHistory.length - 1
                                  ? "text-cyan-600 dark:text-cyan-400 font-medium"
                                  : ""
                              }
                            >
                              {step}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {output && !isProcessing ? (
              <div className="space-y-5">
                {output.mimeType === "application/pdf" ? (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-950">
                    <iframe
                      src={output.previewUrl}
                      title="Compressed PDF Preview"
                      className="w-full h-[380px]"
                    />
                    <div className="px-4 py-2.5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C]">
                      <span className="font-mono-num">Pages: {output.pageCount ?? 1}</span>
                      <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Saved to workspace
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Source Preview</span>
                        <span className="font-mono-num">{formatBytes(output.originalSize)}</span>
                      </div>
                      <div className="aspect-[4/3] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 overflow-hidden flex items-center justify-center">
                        <img
                          src={originalPreviewUrl}
                          alt="Original source"
                          referrerPolicy="no-referrer"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Compressed Preview</span>
                        <span className="font-mono-num text-cyan-600 dark:text-cyan-400">
                          {output.width}×{output.height} · {formatBytes(output.processedSize)}
                        </span>
                      </div>
                      <div className="aspect-[4/3] rounded-lg border border-cyan-500/30 bg-slate-100 dark:bg-slate-950 overflow-hidden flex items-center justify-center">
                        <img
                          src={output.previewUrl}
                          alt="Compressed result"
                          referrerPolicy="no-referrer"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : !isProcessing ? (
              <div className="min-h-[300px] flex flex-col items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-[#090E15] p-6 text-center">
                {originalPreviewUrl ? (
                  <img
                    src={originalPreviewUrl}
                    alt="Selected file preview"
                    referrerPolicy="no-referrer"
                    className="max-h-64 rounded-md object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                    <FileText className="w-10 h-10 text-cyan-600 dark:text-cyan-400" />
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs font-mono-num">
                      Ready to compress · {formatBytes(selectedFile.size)}
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
