import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const RECORDS_PATH = path.join(DATA_DIR, "records.json");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "googleisuseless";
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash("sha256").update(`laeb-session-${ADMIN_PASSWORD}`).digest("hex");

interface UploadRecord {
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

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(RECORDS_PATH)) {
    fs.writeFileSync(RECORDS_PATH, "[]", "utf8");
  }
}

function readRecords(): UploadRecord[] {
  ensureStorage();
  try {
    const raw = fs.readFileSync(RECORDS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UploadRecord[]) : [];
  } catch {
    return [];
  }
}

function writeRecords(records: UploadRecord[]): void {
  ensureStorage();
  fs.writeFileSync(RECORDS_PATH, JSON.stringify(records, null, 2), "utf8");
}

function timingSafeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function createAdminToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
      exp: Date.now() + 12 * 60 * 60 * 1000,
    })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  if (!timingSafeCompare(sig, expectedSig)) return false;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { role?: string; exp?: number };
    return decoded.role === "admin" && typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      out[key] = val;
    }
  }
  return out;
}

function extractAdminToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies.laeb_admin_token;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractAdminToken(req);
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  next();
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-() ]+/g, "_").trim();
  return base.slice(0, 120) || "uploaded-file";
}

function extensionForMime(mimeType: string, filename: string): string {
  const extFromName = path.extname(filename).toLowerCase();
  if ([".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(extFromName)) {
    return extFromName;
  }
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024; // 256 MB

async function startServer() {
  ensureStorage();

  const app = express();

  // Digital Asset Links endpoint for Google Play Store Trusted Web Activity (TWA)
  app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
    const packageName =
      process.env.ANDROID_PACKAGE_NAME || "com.pimpomgroup.laeb";
    const fingerprintsRaw = process.env.ANDROID_SHA256_FINGERPRINT || "";
    const fingerprints = fingerprintsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    res.setHeader("Content-Type", "application/json");
    res.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints:
            fingerprints.length > 0
              ? fingerprints
              : ["REPLACE_WITH_YOUR_PLAY_APP_SIGNING_SHA256_FINGERPRINT"],
        },
      },
    ]);
  });

  // Streaming binary upload endpoint (supports up to 256 MB with low memory overhead)
  app.post("/api/uploads/stream", (req: Request, res: Response) => {
    const rawFilename = String(req.headers["x-laeb-filename"] || "uploaded-file");
    let filename = rawFilename;
    try {
      filename = decodeURIComponent(rawFilename);
    } catch {
      filename = rawFilename;
    }

    const mimeType = String(req.headers["x-laeb-mime"] || "");
    const toolHeader = String(req.headers["x-laeb-tool"] || "compressor");
    const originalSizeHeader = Number(req.headers["x-laeb-original-size"] || 0);
    const processedSizeHeader = Number(req.headers["x-laeb-processed-size"] || 0);
    const widthHeader = Number(req.headers["x-laeb-width"] || 0);
    const heightHeader = Number(req.headers["x-laeb-height"] || 0);
    const pageCountHeader = Number(req.headers["x-laeb-page-count"] || 0);

    const allowedMimes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowedMimes.includes(mimeType)) {
      res.status(400).json({ error: "Unsupported file format." });
      return;
    }

    const id = crypto.randomUUID();
    const safeName = sanitizeFilename(filename);
    const ext = extensionForMime(mimeType, safeName);
    const storedName = `${id}${ext}`;
    const diskPath = path.join(UPLOADS_DIR, storedName);

    const writeStream = fs.createWriteStream(diskPath);
    let receivedBytes = 0;
    let aborted = false;

    const cleanupPartial = () => {
      try {
        writeStream.destroy();
        if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
      } catch {
        // Ignore cleanup errors
      }
    };

    req.on("data", (chunk: Buffer) => {
      if (aborted) return;
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_UPLOAD_BYTES) {
        aborted = true;
        cleanupPartial();
        res.status(413).json({ error: "File exceeds the 256 MB upload limit." });
        req.destroy();
        return;
      }
      if (!writeStream.write(chunk)) {
        req.pause();
        writeStream.once("drain", () => req.resume());
      }
    });

    req.on("end", () => {
      if (aborted) return;
      writeStream.end(() => {
        if (receivedBytes === 0) {
          cleanupPartial();
          res.status(400).json({ error: "Uploaded file is empty." });
          return;
        }

        const origBytes =
          Number.isFinite(originalSizeHeader) && originalSizeHeader > 0
            ? Math.round(originalSizeHeader)
            : receivedBytes;
        const procBytes =
          Number.isFinite(processedSizeHeader) && processedSizeHeader > 0
            ? Math.round(processedSizeHeader)
            : receivedBytes;
        const savingsPercent =
          origBytes > 0
            ? Math.round(((origBytes - procBytes) / origBytes) * 1000) / 10
            : 0;

        const normalizedTool: "compressor" | "passport" | "cropper" =
          toolHeader === "passport" || toolHeader === "cropper"
            ? toolHeader
            : "compressor";

        const record: UploadRecord = {
          id,
          filename: safeName,
          storedName,
          mimeType,
          category: mimeType === "application/pdf" ? "pdf" : "image",
          tool: normalizedTool,
          originalSize: origBytes,
          processedSize: procBytes,
          savingsPercent,
          width: widthHeader > 0 ? Math.round(widthHeader) : undefined,
          height: heightHeader > 0 ? Math.round(heightHeader) : undefined,
          pageCount: pageCountHeader > 0 ? Math.round(pageCountHeader) : undefined,
          createdAt: new Date().toISOString(),
        };

        const records = readRecords();
        records.unshift(record);
        writeRecords(records);

        res.status(201).json({ ok: true, record });
      });
    });

    req.on("error", () => {
      if (!aborted) {
        aborted = true;
        cleanupPartial();
        if (!res.headersSent) {
          res.status(500).json({ error: "Stream upload interrupted." });
        }
      }
    });
  });

  app.use(express.json({ limit: "35mb" }));

  // Public file persistence endpoint (JSON fallback for smaller payloads)
  app.post("/api/uploads", (req: Request, res: Response) => {
    try {
      const {
        filename,
        mimeType,
        tool,
        originalSize,
        processedSize,
        width,
        height,
        pageCount,
        dataBase64,
      } = req.body as {
        filename?: string;
        mimeType?: string;
        tool?: string;
        originalSize?: number;
        processedSize?: number;
        width?: number;
        height?: number;
        pageCount?: number;
        dataBase64?: string;
      };

      if (!filename || !mimeType || !dataBase64) {
        res.status(400).json({ error: "Missing required file payload fields." });
        return;
      }

      const allowedMimes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];
      if (!allowedMimes.includes(mimeType)) {
        res.status(400).json({ error: "Unsupported file format." });
        return;
      }

      const cleanBase64 = dataBase64.includes(",")
        ? dataBase64.split(",")[1]
        : dataBase64;
      const buffer = Buffer.from(cleanBase64, "base64");
      if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) {
        res.status(400).json({ error: "File size must be between 1 byte and 25 MB." });
        return;
      }

      const id = crypto.randomUUID();
      const safeName = sanitizeFilename(filename);
      const ext = extensionForMime(mimeType, safeName);
      const storedName = `${id}${ext}`;
      const diskPath = path.join(UPLOADS_DIR, storedName);
      fs.writeFileSync(diskPath, buffer);

      const origBytes =
        typeof originalSize === "number" && originalSize > 0
          ? Math.round(originalSize)
          : buffer.length;
      const procBytes =
        typeof processedSize === "number" && processedSize > 0
          ? Math.round(processedSize)
          : buffer.length;
      const savingsPercent =
        origBytes > 0
          ? Math.round(((origBytes - procBytes) / origBytes) * 1000) / 10
          : 0;

      const normalizedTool: "compressor" | "passport" | "cropper" =
        tool === "passport" || tool === "cropper" ? tool : "compressor";

      const record: UploadRecord = {
        id,
        filename: safeName,
        storedName,
        mimeType,
        category: mimeType === "application/pdf" ? "pdf" : "image",
        tool: normalizedTool,
        originalSize: origBytes,
        processedSize: procBytes,
        savingsPercent,
        width: typeof width === "number" ? Math.round(width) : undefined,
        height: typeof height === "number" ? Math.round(height) : undefined,
        pageCount: typeof pageCount === "number" ? Math.round(pageCount) : undefined,
        createdAt: new Date().toISOString(),
      };

      const records = readRecords();
      records.unshift(record);
      writeRecords(records);

      res.status(201).json({ ok: true, record });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save uploaded file.";
      res.status(500).json({ error: msg });
    }
  });

  // Admin authentication routes
  app.post("/api/admin/auth", (req: Request, res: Response) => {
    const { password } = req.body as { password?: string };
    if (typeof password !== "string" || !password.length) {
      res.status(400).json({ error: "Password is required." });
      return;
    }

    if (!timingSafeCompare(password, ADMIN_PASSWORD)) {
      res.status(401).json({ error: "Invalid administrator password." });
      return;
    }

    const token = createAdminToken();
    res.cookie("laeb_admin_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ ok: true, token });
  });

  app.post("/api/admin/logout", (_req: Request, res: Response) => {
    res.clearCookie("laeb_admin_token", { path: "/" });
    res.json({ ok: true });
  });

  app.get("/api/admin/session", (req: Request, res: Response) => {
    const token = extractAdminToken(req);
    res.json({ authenticated: verifyAdminToken(token) });
  });

  // Admin statistics
  app.get("/api/admin/stats", requireAdmin, (_req: Request, res: Response) => {
    const records = readRecords();
    let imageCount = 0;
    let pdfCount = 0;
    let totalOriginalBytes = 0;
    let totalProcessedBytes = 0;

    const byTool: Record<string, number> = {
      compressor: 0,
      passport: 0,
      cropper: 0,
    };

    const byFormat: Record<string, number> = {
      jpeg: 0,
      png: 0,
      webp: 0,
      pdf: 0,
    };

    const dailyMap = new Map<string, { date: string; count: number; bytes: number }>();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, count: 0, bytes: 0 });
    }

    for (const r of records) {
      if (r.category === "pdf") {
        pdfCount += 1;
        byFormat.pdf += 1;
      } else {
        imageCount += 1;
        if (r.mimeType === "image/png") byFormat.png += 1;
        else if (r.mimeType === "image/webp") byFormat.webp += 1;
        else byFormat.jpeg += 1;
      }
      byTool[r.tool] = (byTool[r.tool] || 0) + 1;
      totalOriginalBytes += r.originalSize;
      totalProcessedBytes += r.processedSize;

      const dayKey = r.createdAt.slice(0, 10);
      const dayEntry = dailyMap.get(dayKey);
      if (dayEntry) {
        dayEntry.count += 1;
        dayEntry.bytes += r.processedSize;
      }
    }

    const totalSavedBytes = Math.max(0, totalOriginalBytes - totalProcessedBytes);
    const averageSavingsPercent =
      totalOriginalBytes > 0
        ? Math.round((totalSavedBytes / totalOriginalBytes) * 1000) / 10
        : 0;

    res.json({
      totalFiles: records.length,
      imageCount,
      pdfCount,
      totalOriginalBytes,
      totalProcessedBytes,
      totalSavedBytes,
      averageSavingsPercent,
      byTool,
      byFormat,
      dailyVolume: Array.from(dailyMap.values()),
    });
  });

  // Admin file list
  app.get("/api/admin/files", requireAdmin, (req: Request, res: Response) => {
    const search = String(req.query.search || "").trim().toLowerCase();
    const typeFilter = String(req.query.type || "all");
    const sortBy = String(req.query.sort || "newest");

    let records = readRecords();

    if (typeFilter === "image" || typeFilter === "pdf") {
      records = records.filter((r) => r.category === typeFilter);
    }

    if (search) {
      records = records.filter(
        (r) =>
          r.filename.toLowerCase().includes(search) ||
          r.tool.toLowerCase().includes(search) ||
          r.mimeType.toLowerCase().includes(search)
      );
    }

    if (sortBy === "largest") {
      records.sort((a, b) => b.processedSize - a.processedSize);
    } else if (sortBy === "savings") {
      records.sort((a, b) => b.savingsPercent - a.savingsPercent);
    } else {
      records.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    res.json({ files: records });
  });

  // Admin file binary content preview
  app.get("/api/admin/files/:id/content", requireAdmin, (req: Request, res: Response) => {
    const records = readRecords();
    const record = records.find((r) => r.id === req.params.id);
    if (!record) {
      res.status(404).json({ error: "File record not found." });
      return;
    }

    const safePath = path.resolve(UPLOADS_DIR, path.basename(record.storedName));
    if (!safePath.startsWith(UPLOADS_DIR) || !fs.existsSync(safePath)) {
      res.status(404).json({ error: "Stored file binary not found." });
      return;
    }

    res.setHeader("Content-Type", record.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${record.filename.replace(/"/g, "")}"`
    );
    res.sendFile(safePath);
  });

  // Admin file delete
  app.delete("/api/admin/files/:id", requireAdmin, (req: Request, res: Response) => {
    const records = readRecords();
    const idx = records.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "File record not found." });
      return;
    }

    const [removed] = records.splice(idx, 1);
    writeRecords(records);

    const safePath = path.resolve(UPLOADS_DIR, path.basename(removed.storedName));
    if (safePath.startsWith(UPLOADS_DIR) && fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
    }

    res.json({ ok: true });
  });

  // Server-side Gemini AI-to-Human Reverter
  app.post("/api/ai/humanize", async (req: Request, res: Response) => {
    try {
      const { text, tone, intensity } = req.body as {
        text?: string;
        tone?: string;
        intensity?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: "Please provide text to humanize." });
        return;
      }

      const ai = getGeminiClient();
      const selectedTone = tone || "Natural Editorial";
      const selectedIntensity = intensity || "Balanced Humanize";

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Rewrite the following text using tone "${selectedTone}" and rewrite depth "${selectedIntensity}":\n\n${text.trim()}`,
        config: {
          systemInstruction:
            "You are an expert human editor for Làeb. Rewrite mechanical, repetitive, or AI-sounding prose into natural, authentic human writing while preserving all factual meaning, names, and intent. Vary sentence cadence, eliminate cliché transitions (such as 'delve into', 'in today's fast-paced world', 'moreover', 'tapestry', 'testament'), and output only the rewritten text without meta-commentary or quotation wrappers.",
        },
      });

      const output = (response.text || "").trim();
      if (!output) {
        res.status(502).json({ error: "The AI model returned an empty response." });
        return;
      }

      res.json({ ok: true, output });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI humanization failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Server-side Gemini AI Content & Document Generator
  app.post("/api/ai/generate", async (req: Request, res: Response) => {
    try {
      const { prompt, format, length, style } = req.body as {
        prompt?: string;
        format?: string;
        length?: string;
        style?: string;
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: "Please enter a topic or prompt to generate." });
        return;
      }

      const ai = getGeminiClient();
      const selectedFormat = format || "Article / Essay";
      const selectedLength = length || "Standard (~350 words)";
      const selectedStyle = style || "Clear Editorial";

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Format: ${selectedFormat}\nTarget Length: ${selectedLength}\nStyle: ${selectedStyle}\n\nPrompt / Topic:\n${prompt.trim()}`,
        config: {
          systemInstruction:
            "You are the AI Generator inside Laèb (pp UI, created by pimpom group). Produce well-structured, directly usable text tailored to the requested format, length, and style. Output only the generated content without meta-commentary.",
        },
      });

      const output = (response.text || "").trim();
      if (!output) {
        res.status(502).json({ error: "The AI generator returned an empty response." });
        return;
      }

      res.json({ ok: true, output });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI generation failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Server-side Gemini Workspace Assistant
  app.post("/api/ai/assist", async (req: Request, res: Response) => {
    try {
      const { messages } = req.body as {
        messages?: Array<{ role: "user" | "assistant"; content: string }>;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "Conversation messages are required." });
        return;
      }

      const ai = getGeminiClient();
      const transcript = messages
        .slice(-10)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: transcript,
        config: {
          systemInstruction:
            "You are the pp Workspace Assistant for làeb, created by pimpom group. Help users with PDF and image compression strategies, passport photo dimensions and biometric guidelines (US 2x2 inch, Schengen/EU/UK 35x45mm, India 35x35mm), cropping aspect ratios, and writing refinement. Keep answers concise, practical, and directly actionable.",
        },
      });

      const reply = (response.text || "").trim();
      if (!reply) {
        res.status(502).json({ error: "The AI assistant returned an empty response." });
        return;
      }

      res.json({ ok: true, reply });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI assistant request failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Vite integration in development / static dist in production
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*splat", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Làeb server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Làeb server:", err);
  process.exit(1);
});
