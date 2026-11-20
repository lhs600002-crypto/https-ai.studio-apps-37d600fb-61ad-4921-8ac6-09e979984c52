import { PDFDocument } from "pdf-lib";
import type { UploadRecord } from "../types";

export interface CompressionProgress {
  stage: "decoding" | "compressing" | "saving";
  percentComplete: number; // 0..100
  label: string;
  currentBytes: number;
  originalBytes: number;
  liveSavingsPercent: number;
  passIndex?: number;
}

export interface ImageCompressOptions {
  quality: number; // 0.1 to 0.95
  maxDimension: number; // 0 means original
  outputMime: "auto" | "image/jpeg" | "image/webp" | "image/png";
  targetReductionPercent?: number; // e.g., 50 to target <= 50% of original file bytes
  onProgress?: (progress: CompressionProgress) => void;
}

export interface ImageCompressResult {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface PdfCompressOptions {
  stripMetadata: boolean;
  useObjectStreams: boolean;
  targetReductionPercent?: number;
  onProgress?: (progress: CompressionProgress) => void;
}

export interface PdfCompressResult {
  blob: Blob;
  dataUrl: string;
  pageCount: number;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as data URL."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the selected image."));
    img.src = src;
  });
}

async function encodeCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
  mime: string,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Image encoding failed."));
      },
      mime,
      quality
    );
  });
}

function calcSavings(originalSize: number, currentSize: number): number {
  if (originalSize <= 0) return 0;
  return Math.max(0, Math.round(((originalSize - currentSize) / originalSize) * 1000) / 10);
}

export async function compressImageFile(
  file: File,
  options: ImageCompressOptions
): Promise<ImageCompressResult> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    options.onProgress?.({
      stage: "decoding",
      percentComplete: 12,
      label: "Decoding image frame",
      currentBytes: file.size,
      originalBytes: file.size,
      liveSavingsPercent: 0,
    });

    const img = await loadImageElement(sourceUrl);
    const originalWidth = img.naturalWidth;
    const originalHeight = img.naturalHeight;

    let baseWidth = originalWidth;
    let baseHeight = originalHeight;

    if (options.maxDimension > 0) {
      const longest = Math.max(originalWidth, originalHeight);
      if (longest > options.maxDimension) {
        const scale = options.maxDimension / longest;
        baseWidth = Math.max(1, Math.round(originalWidth * scale));
        baseHeight = Math.max(1, Math.round(originalHeight * scale));
      }
    }

    let targetMime: string;
    if (options.outputMime === "auto") {
      if (file.type === "image/png" || file.type === "image/webp" || file.type === "image/jpeg") {
        targetMime = file.type;
      } else {
        targetMime = "image/jpeg";
      }
    } else {
      targetMime = options.outputMime;
    }

    if (options.targetReductionPercent && options.targetReductionPercent > 0) {
      const targetMaxBytes = Math.max(
        1024,
        Math.floor(file.size * (1 - options.targetReductionPercent / 100))
      );

      const mimeToUse =
        options.outputMime === "auto" && targetMime === "image/png"
          ? "image/webp"
          : targetMime;

      let pass = 1;
      let bestBlob = await encodeCanvas(img, baseWidth, baseHeight, mimeToUse, 0.85);
      let bestW = baseWidth;
      let bestH = baseHeight;

      options.onProgress?.({
        stage: "compressing",
        percentComplete: 30,
        label: `Pass ${pass} · Quality 85%`,
        currentBytes: bestBlob.size,
        originalBytes: file.size,
        liveSavingsPercent: calcSavings(file.size, bestBlob.size),
        passIndex: pass,
      });

      if (bestBlob.size > targetMaxBytes) {
        const qualitySteps = [0.75, 0.62, 0.5, 0.38, 0.26];
        for (let i = 0; i < qualitySteps.length; i += 1) {
          const q = qualitySteps[i];
          pass += 1;
          const candidate = await encodeCanvas(img, baseWidth, baseHeight, mimeToUse, q);
          if (candidate.size < bestBlob.size) {
            bestBlob = candidate;
            bestW = baseWidth;
            bestH = baseHeight;
          }
          options.onProgress?.({
            stage: "compressing",
            percentComplete: 35 + Math.round(((i + 1) / qualitySteps.length) * 25),
            label: `Pass ${pass} · Quality ${Math.round(q * 100)}%`,
            currentBytes: bestBlob.size,
            originalBytes: file.size,
            liveSavingsPercent: calcSavings(file.size, bestBlob.size),
            passIndex: pass,
          });
          if (candidate.size <= targetMaxBytes) {
            break;
          }
        }
      }

      if (bestBlob.size > targetMaxBytes) {
        const scaleSteps = [0.85, 0.72, 0.58, 0.45];
        const fallbackQ = options.targetReductionPercent >= 65 ? 0.42 : 0.58;
        for (let i = 0; i < scaleSteps.length; i += 1) {
          const s = scaleSteps[i];
          pass += 1;
          const w = Math.max(64, Math.round(baseWidth * s));
          const h = Math.max(64, Math.round(baseHeight * s));
          const candidate = await encodeCanvas(img, w, h, mimeToUse, fallbackQ);
          if (candidate.size < bestBlob.size) {
            bestBlob = candidate;
            bestW = w;
            bestH = h;
          }
          options.onProgress?.({
            stage: "compressing",
            percentComplete: 60 + Math.round(((i + 1) / scaleSteps.length) * 18),
            label: `Pass ${pass} · Resampling ${w}×${h}`,
            currentBytes: bestBlob.size,
            originalBytes: file.size,
            liveSavingsPercent: calcSavings(file.size, bestBlob.size),
            passIndex: pass,
          });
          if (candidate.size <= targetMaxBytes) {
            break;
          }
        }
      }

      return {
        blob: bestBlob,
        dataUrl: "",
        mimeType: mimeToUse,
        width: bestW,
        height: bestH,
        originalWidth,
        originalHeight,
      };
    }

    const blob = await encodeCanvas(img, baseWidth, baseHeight, targetMime, options.quality);
    options.onProgress?.({
      stage: "compressing",
      percentComplete: 72,
      label: `Encoded at ${Math.round(options.quality * 100)}% quality`,
      currentBytes: blob.size,
      originalBytes: file.size,
      liveSavingsPercent: calcSavings(file.size, blob.size),
      passIndex: 1,
    });

    return {
      blob,
      dataUrl: "",
      mimeType: targetMime,
      width: baseWidth,
      height: baseHeight,
      originalWidth,
      originalHeight,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function compressPdfFile(
  file: File,
  options: PdfCompressOptions
): Promise<PdfCompressResult> {
  options.onProgress?.({
    stage: "decoding",
    percentComplete: 18,
    label: "Reading PDF cross-reference tree",
    currentBytes: file.size,
    originalBytes: file.size,
    liveSavingsPercent: 0,
  });

  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  options.onProgress?.({
    stage: "compressing",
    percentComplete: 48,
    label: `Packing ${pdfDoc.getPageCount()} pages & object streams`,
    currentBytes: file.size,
    originalBytes: file.size,
    liveSavingsPercent: 0,
    passIndex: 1,
  });

  if (options.stripMetadata || (options.targetReductionPercent ?? 0) >= 50) {
    pdfDoc.setTitle("");
    pdfDoc.setAuthor("");
    pdfDoc.setSubject("");
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer("Laèb PDF Engine");
    pdfDoc.setCreator("Laèb");
  }

  const savedBytes = await pdfDoc.save({
    useObjectStreams: options.useObjectStreams || (options.targetReductionPercent ?? 0) >= 50,
    addDefaultPage: false,
    objectsPerTick: 100,
  });

  const blob = new Blob([new Uint8Array(savedBytes)], { type: "application/pdf" });
  const effectiveSize = Math.min(file.size, blob.size);

  options.onProgress?.({
    stage: "compressing",
    percentComplete: 76,
    label: "PDF streams packed",
    currentBytes: effectiveSize,
    originalBytes: file.size,
    liveSavingsPercent: calcSavings(file.size, effectiveSize),
    passIndex: 2,
  });

  return {
    blob,
    dataUrl: "",
    pageCount: pdfDoc.getPageCount(),
  };
}

export async function uploadProcessedRecord(params: {
  filename: string;
  mimeType: string;
  tool: "compressor" | "passport" | "cropper";
  originalSize: number;
  processedSize: number;
  width?: number;
  height?: number;
  pageCount?: number;
  blob?: Blob;
  dataUrl?: string;
  onUploadProgress?: (fraction: number) => void;
}): Promise<UploadRecord> {
  if (params.blob) {
    return new Promise<UploadRecord>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/uploads/stream");
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("x-laeb-filename", encodeURIComponent(params.filename));
      xhr.setRequestHeader("x-laeb-mime", params.mimeType);
      xhr.setRequestHeader("x-laeb-tool", params.tool);
      xhr.setRequestHeader("x-laeb-original-size", String(params.originalSize));
      xhr.setRequestHeader("x-laeb-processed-size", String(params.processedSize));
      if (params.width) xhr.setRequestHeader("x-laeb-width", String(params.width));
      if (params.height) xhr.setRequestHeader("x-laeb-height", String(params.height));
      if (params.pageCount) xhr.setRequestHeader("x-laeb-page-count", String(params.pageCount));

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          params.onUploadProgress?.(evt.loaded / evt.total);
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText) as {
            ok?: boolean;
            record?: UploadRecord;
            error?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300 && data.record) {
            resolve(data.record);
          } else {
            reject(new Error(data.error || "Failed to persist uploaded file."));
          }
        } catch {
          reject(new Error("Invalid server upload response."));
        }
      };

      xhr.onerror = () => reject(new Error("Network error while saving file."));
      xhr.send(params.blob);
    });
  }

  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: params.filename,
      mimeType: params.mimeType,
      tool: params.tool,
      originalSize: params.originalSize,
      processedSize: params.processedSize,
      width: params.width,
      height: params.height,
      pageCount: params.pageCount,
      dataBase64: params.dataUrl,
    }),
  });

  const data = (await response.json()) as { ok?: boolean; record?: UploadRecord; error?: string };
  if (!response.ok || !data.record) {
    throw new Error(data.error || "Failed to persist uploaded file.");
  }
  return data.record;
}
