import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import crypto from "crypto";
import { YoutubeTranscript } from 'youtube-transcript';
import rateLimit from "express-rate-limit";
import xss from "xss";
import { getGranularSubjectArchetypes } from "./src/utils/apArchetypes";


process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 1. Strict Rate Limiting (Brute Force Protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: "Too many requests from this IP, please try again after a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false }
});
app.use('/api/', apiLimiter);

app.all(["/api/health", "/health", "/api/status"], (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    geminiKeyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 6) + "..." : "MISSING",
    isVercel: Boolean(process.env.VERCEL)
  });
});

// 2. Global Input Sanitization Middleware (Injection Prevention)
const sanitizeInput = (obj: any): any => {
  if (typeof obj === 'string') {
    return xss(obj); // Strips <script> and dangerous HTML
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeInput(item));
  }
  if (typeof obj === 'object' && obj !== null) {
    const sanitizedObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitizedObj[key] = sanitizeInput(value);
    }
    return sanitizedObj;
  }
  return obj;
};





app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const summaryCache = new Map<string, any>();

/**
 * Repairs unescaped LaTeX backslashes, unescaped newlines/tabs inside quotes,
 * and trailing commas so JSON.parse never crashes on AI-generated math/science strings.
 */
function repairJsonString(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // Strip markdown code fences
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let inString = false;
  let escaped = false;
  const fixedChars: string[] = [];

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      if (escaped) {
        const nextChar = str[i + 1] || '';
        const isFollowedByLetter = /[a-zA-Z]/.test(nextChar);

        if (/[\\"\/]/.test(ch)) {
          fixedChars.push(ch);
        } else if (/[bfnrt]/.test(ch) && !isFollowedByLetter) {
          fixedChars.push(ch);
        } else if (ch === 'u') {
          const hex = str.slice(i + 1, i + 5);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            fixedChars.push(ch);
          } else {
            fixedChars[fixedChars.length - 1] = '\\\\';
            fixedChars.push(ch);
          }
        } else {
          // Unescaped LaTeX command like \Delta, \frac, \vec, \alpha, etc.
          fixedChars[fixedChars.length - 1] = '\\\\';
          fixedChars.push(ch);
        }
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
        fixedChars.push(ch);
      } else if (ch === '"') {
        inString = false;
        fixedChars.push(ch);
      } else if (ch === '\n') {
        fixedChars.push('\\n');
      } else if (ch === '\r') {
        fixedChars.push('\\r');
      } else if (ch === '\t') {
        fixedChars.push('\\t');
      } else {
        fixedChars.push(ch);
      }
    } else {
      if (ch === '"') {
        inString = true;
      }
      fixedChars.push(ch);
    }
  }

  let result = fixedChars.join('');
  result = result.replace(/,\s*([}\]])/g, '$1');
  return result;
}

/**
 * Robust JSON extraction and parsing utility.
 * Handles cases where models output markdown blocks, unescaped LaTeX backslashes, or control characters.
 */
function safeParseJSON(text: string, forceType: 'object' | 'array' | 'none' = 'none'): any {
  if (!text) return forceType === 'array' ? [] : (forceType === 'object' ? {} : null);
  const cleaned = text.trim();

  const parse = (str: string) => {
    try {
      const parsed = JSON.parse(str);
      if (forceType === 'array' && !Array.isArray(parsed)) {
        return [parsed];
      }
      if (forceType === 'object' && Array.isArray(parsed)) {
        return parsed[0] || {};
      }
      return parsed;
    } catch (e) {
      return null;
    }
  };

  // 1. Try direct parse
  let result = parse(cleaned);
  if (result) return result;

  // 2. Try cleaning markdown markers
  let extracted = cleaned;
  if (extracted.includes("```")) {
    extracted = extracted.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    result = parse(extracted);
    if (result) return result;
  }

  // 3. Try LaTeX and control character repair on cleaned text
  const repaired = repairJsonString(extracted);
  result = parse(repaired);
  if (result) return result;

  // 4. Extract using structural patterns (find first { or [ and last } or ])
  const objStart = extracted.indexOf('{');
  const objEnd = extracted.lastIndexOf('}');
  const arrStart = extracted.indexOf('[');
  const arrEnd = extracted.lastIndexOf(']');

  const hasObj = objStart !== -1 && objEnd !== -1 && objEnd > objStart;
  const hasArr = arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart;

  if (hasObj && (!hasArr || objStart < arrStart)) {
    const slice = extracted.slice(objStart, objEnd + 1);
    result = parse(slice) || parse(repairJsonString(slice));
    if (result) return result;
  }

  if (hasArr) {
    const slice = extracted.slice(arrStart, arrEnd + 1);
    result = parse(slice) || parse(repairJsonString(slice));
    if (result) return result;
  }

  // 5. If JSON was truncated or cut off, attempt bracket closure repair
  try {
    let closed = repairJsonString(extracted);
    const openBraces = (closed.match(/\{/g) || []).length;
    const closeBraces = (closed.match(/\}/g) || []).length;
    const openBrackets = (closed.match(/\[/g) || []).length;
    const closeBrackets = (closed.match(/\]/g) || []).length;

    if (openBraces > closeBraces) {
      closed += '}'.repeat(openBraces - closeBraces);
    }
    if (openBrackets > closeBrackets) {
      closed += ']'.repeat(openBrackets - closeBrackets);
    }
    result = parse(closed);
    if (result) return result;
  } catch (_) {}

  // Final fallback: if we need an array/object but everything failed
  if (forceType === 'array') return [];
  if (forceType === 'object') return {};
  throw new Error("Could not parse JSON from AI response");
}

async function fetchWithTimeout(url: string, options: any = {}, timeout = 90000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}
let lastQuotaExceededTime = 0;
const rateLimitedModels: Record<string, number> = {};
const rateLimitedModelsCooldown: Record<string, number> = {};

app.use(express.json({ limit: "35mb" }));

app.use((req, res, next) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  next();
});

app.use(express.urlencoded({ limit: "35mb", extended: true }));

app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: "File too large. Maximum size is 30MB." });
    }
  }
  console.error('[Global Error Handler] Caught unhandled error:', err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.path && req.path.startsWith('/api')) {
    return res.status(err.status || 500).json({
      error: err.message || "An unexpected error occurred on the server.",
      success: false
    });
  }
  next(err);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 35 * 1024 * 1024 }
});

// 3. PrivacyGuard Security Middleware: Immediate Image & File Purging
// This middleware intercepts response completion and physically overrides all uploaded
// in-memory buffer blocks with zero bytes before releasing their references.
// This fulfills our "100% Privacy-First & Zero-Retention" guarantee, securing student data completely.
app.use((req, res, next) => {
  const purgeFiles = () => {
    try {
      if (req.file) {
        if (req.file.buffer && Buffer.isBuffer(req.file.buffer)) {
          req.file.buffer.fill(0);
          console.log("[PrivacyGuard] Securely purged single uploaded file buffer from memory.");
        }
        req.file = undefined as any;
      }
      if (req.files) {
        if (Array.isArray(req.files)) {
          (req.files as Express.Multer.File[]).forEach(file => {
            if (file.buffer && Buffer.isBuffer(file.buffer)) {
              file.buffer.fill(0);
            }
          });
          console.log("[PrivacyGuard] Securely purged multiple uploaded file buffers from memory.");
        } else if (typeof req.files === "object") {
          Object.values(req.files).forEach((fileArr: any) => {
            if (Array.isArray(fileArr)) {
              fileArr.forEach((file: any) => {
                if (file.buffer && Buffer.isBuffer(file.buffer)) {
                  file.buffer.fill(0);
                }
              });
            }
          });
          console.log("[PrivacyGuard] Securely purged object-based multiple uploaded file buffers from memory.");
        }
        req.files = undefined as any;
      }
    } catch (e) {
      console.error("[PrivacyGuard] Error while purging buffers:", e);
    }
  };

  res.on("finish", purgeFiles);
  res.on("close", purgeFiles);
  next();
});

function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const wavHeader = Buffer.alloc(44);
  const numBytes = pcmBuffer.length;

  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + numBytes, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE((sampleRate * numChannels * bitsPerSample) / 8, 28);
  wavHeader.writeUInt16LE((numChannels * bitsPerSample) / 8, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(numBytes, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

function cleanTextForSpeech(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/^#+\s+/gm, '') // Remove markdown headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/[-*•]\s+/g, '') // Remove bullets
    .replace(/\$\$(.*?)\$\$/gs, '$1') // LaTeX display math
    .replace(/\$(.*?)\$/g, '$1') // LaTeX inline math
    .replace(/```[\s\S]*?```/g, '') // Remove large code blocks
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitTextForTTS(text: string, maxChunkSize = 2200): string[] {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return [];
  if (cleaned.length <= maxChunkSize) return [cleaned];

  const chunks: string[] = [];
  const paragraphs = cleaned.split(/\n+/);
  let currentChunk = "";

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    if (currentChunk.length + trimmedPara.length + 1 <= maxChunkSize) {
      currentChunk = currentChunk ? `${currentChunk}\n${trimmedPara}` : trimmedPara;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }

      if (trimmedPara.length > maxChunkSize) {
        const sentences = trimmedPara.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [trimmedPara];
        for (const sentence of sentences) {
          const trimmedSentence = sentence.trim();
          if (!trimmedSentence) continue;

          if (currentChunk.length + trimmedSentence.length + 1 <= maxChunkSize) {
            currentChunk = currentChunk ? `${currentChunk} ${trimmedSentence}` : trimmedSentence;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = trimmedSentence;
          }
        }
      } else {
        currentChunk = trimmedPara;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return ai;
}

function extractUserQuery(params: any): string {
  try {
    if (!params) return "";
    if (params.contents) {
      let contents = params.contents;
      if (!Array.isArray(contents)) {
        contents = [contents];
      }
      for (let i = contents.length - 1; i >= 0; i--) {
        const content = contents[i];
        if (content && content.parts) {
          for (const part of content.parts) {
            if (part && part.text) {
              return part.text;
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return "";
}

async function safeGenerateContent(params: any, retries = 3, delay = 200): Promise<any> {
  // Extract student profile data if provided
  const gradeLevel = params.gradeLevel || params.grade;
  const stream = params.stream || params.academic_stream;
  const country = params.country || params.academic_country;
  const region = params.region || params.regionSystem || params.academic_region;
  const userRole = params.userRole || params.role;
  const learningStyle = params.learningStyle;
  const profileContext = params.profileContext || params.userProfile;

  // We only clone the top-level structure and config elements to avoid serializing huge base64 strings (which causes CPU freezes and timeouts).
  const clonedParams = { ...params };
  delete clonedParams.gradeLevel;
  delete clonedParams.grade;
  delete clonedParams.stream;
  delete clonedParams.academic_stream;
  delete clonedParams.country;
  delete clonedParams.academic_country;
  delete clonedParams.region;
  delete clonedParams.regionSystem;
  delete clonedParams.academic_region;
  delete clonedParams.userRole;
  delete clonedParams.role;
  delete clonedParams.learningStyle;
  delete clonedParams.profileContext;
  delete clonedParams.userProfile;

  // Ensure config exists
  if (!clonedParams.config) {
    clonedParams.config = {};
  } else {
    clonedParams.config = { ...clonedParams.config };
  }

  const isTtsModel = !!(clonedParams.model && clonedParams.model.includes("tts"));

  if (isTtsModel && clonedParams.config) {
    delete clonedParams.config.systemInstruction;
  }

  // Setup basic systemInstruction structure if missing
  if (!isTtsModel) {
    if (!clonedParams.config.systemInstruction) {
      clonedParams.config.systemInstruction = { parts: [{ text: "" }] };
    } else {
      let sysInstr = clonedParams.config.systemInstruction;
      if (typeof sysInstr === 'string') {
        sysInstr = { parts: [{ text: sysInstr }] };
      } else {
        sysInstr = { ...sysInstr };
        if (sysInstr.parts) {
          sysInstr.parts = sysInstr.parts.map((p: any) => ({ ...p }));
        }
      }
      clonedParams.config.systemInstruction = sysInstr;
    }
  }

  // Clone tools if present
  if (clonedParams.config.tools) {
    clonedParams.config.tools = clonedParams.config.tools.map((t: any) => ({ ...t }));
  }

  if (!isTtsModel) {
    // Inject current date & time
    const dateInstruction = `The current date and time is: ${new Date().toISOString()}. You must treat this as the absolute present moment.`;
    const originalParts = clonedParams.config.systemInstruction.parts || [];
    const originalText = originalParts[0]?.text || "";
    clonedParams.config.systemInstruction.parts = [
      { text: `${originalText}\n\n${dateInstruction}`.trim() },
      ...originalParts.slice(1)
    ];

    // Universal Student Profile Adaptation Engine
    const profileLines: string[] = [];
    if (gradeLevel) profileLines.push(`• Academic Level / Grade: ${gradeLevel}`);
    if (stream) profileLines.push(`• Academic Track / Stream: ${stream}`);
    if (country || region) profileLines.push(`• Educational Standard / Region: ${country || region}`);
    if (userRole) profileLines.push(`• Student Role: ${userRole}`);
    if (learningStyle) profileLines.push(`• Learning Style Preference: ${learningStyle}`);
    if (profileContext && typeof profileContext === 'string') profileLines.push(`• Profile Background: ${profileContext}`);

    if (profileLines.length > 0) {
      const studentProfileInstruction = `STUDENT PROFILE & PERSONALIZATION DIRECTIVE:
You are actively interacting with a student who has the following academic profile:
${profileLines.join('\n')}

MANDATORY ADAPTATION RULES:
1. PEDAGOGICAL CALIBRATION: Calibrate conceptual depth, mathematical rigor, sentence complexity, and vocabulary precisely to this student's grade level (${gradeLevel || 'Standard'}). Never use graduate-level jargon if the student is in middle/high school, and never over-simplify or talk down to a college student.
2. STREAM RELEVANCE: When providing real-world examples, analogies, applications, or problem setups, tailor them to their academic track (${stream || 'General Academic'}). (e.g. use physics/engineering examples for STEM, biological/clinical examples for Pre-Med, commerce/market examples for Business, social/literary contexts for Humanities).
3. CURRICULUM ACCURACY: Respect regional standards (${country || region || 'Global'}). Use terminology, units, and conventions aligned with standard regional curricula (e.g. AP/SAT in US, A-Levels/GCSE in UK, HSC/VCE in Australia, IB in International).
4. EMPOWERING TONE: Maintain an encouraging, intellectually stimulating, and supportive mentor persona.`;

      const parts = clonedParams.config.systemInstruction.parts || [];
      const text = parts[0]?.text || "";
      clonedParams.config.systemInstruction.parts = [
        { text: `${studentProfileInstruction}\n\n${text}`.trim() },
        ...parts.slice(1)
      ];
    }
  }

  const query = extractUserQuery(clonedParams);
  const sysInstr = clonedParams?.config?.systemInstruction?.parts?.[0]?.text || "";
  const respMime = clonedParams?.config?.responseMimeType || "";

  const isAudioModel = isTtsModel || 
    !!(clonedParams.config?.speechConfig) || 
    !!(clonedParams.config?.responseModalities?.includes(Modality.AUDIO));

  // Set up sequential models to try if the default model hits rate limits or quota issues
  const isSpecialtyModel = isAudioModel || (params.model && (
    params.model.includes("image") ||
    params.model.includes("video") ||
    params.model.includes("veo") ||
    params.model.includes("lyria") ||
    params.model.includes("clip")
  ));

  let requestedModel = isAudioModel ? (params.model || "gemini-3.5-flash-lite") : (params.model || "gemini-3.5-flash-lite");
  if (requestedModel && (requestedModel.includes("2.5") || requestedModel.includes("2.0") || requestedModel.includes("1.5"))) {
    requestedModel = "gemini-3.5-flash-lite";
  }
  let modelsToTry = isAudioModel 
    ? [requestedModel, "gemini-3.5-flash-lite", "gemini-flash-lite-latest"].filter(Boolean)
    : isSpecialtyModel 
      ? [requestedModel] 
      : [
          requestedModel,
          "gemini-3.5-flash-lite",
          "gemini-flash-lite-latest",
          "gemini-3.7-flash",
          "gemini-3.6-flash"
        ].filter((value, index, self) => self.indexOf(value) === index);

  if (!isSpecialtyModel) {
    const now = Date.now();
    const activeModels: string[] = [];
    const backburnerModels: string[] = [];

    for (const m of modelsToTry) {
      const lastLimited = rateLimitedModels[m] || 0;
      const cooldownMs = rateLimitedModelsCooldown[m] || 60000;
      // Keep on backburner during cooldown period
      if (now - lastLimited < cooldownMs) {
        backburnerModels.push(m);
      } else {
        activeModels.push(m);
      }
    }

    if (activeModels.length > 0) {
      modelsToTry = [...activeModels, ...backburnerModels];
    }
  }

  let lastError: any = null;
  let anyQuotaExceeded = false;

  for (const model of modelsToTry) {
    // Generate fresh clean parameters for the current model run from clonedParams
    const currentParams: any = {
      model,
      contents: clonedParams.contents
    };
    if (clonedParams.config) {
      currentParams.config = { ...clonedParams.config };
      if (currentParams.config.tools) {
        currentParams.config.tools = currentParams.config.tools.map((t: any) => ({ ...t }));
      }
      if (currentParams.config.systemInstruction) {
        currentParams.config.systemInstruction = { ...currentParams.config.systemInstruction };
        if (currentParams.config.systemInstruction.parts) {
          currentParams.config.systemInstruction.parts = currentParams.config.systemInstruction.parts.map((p: any) => ({ ...p }));
        }
      }
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const aiClient = getAI();
        const generatePromise = aiClient.models.generateContent(currentParams);
        const timeoutMs = (params.timeoutMs && typeof params.timeoutMs === 'number') ? params.timeoutMs : 90000;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: Model ${model} took longer than ${timeoutMs}ms`)), timeoutMs)
        );
        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        return response;
      } catch (error: any) {
        lastError = error;
        const errorStr = String(error.message || error).toLowerCase();

        const isRateLimitOrOverloaded = errorStr.includes("429") ||
          errorStr.includes("503") ||
          errorStr.includes("quota") ||
          errorStr.includes("limit") ||
          errorStr.includes("resource_exhausted") ||
          errorStr.includes("unavailable") ||
          errorStr.includes("overloaded") ||
          errorStr.includes("demand") ||
          errorStr.includes("timeout") ||
          errorStr.includes("not_found") ||
          errorStr.includes("404");

        if (isRateLimitOrOverloaded) {
          console.warn(`[ai-client] Model ${model} (attempt ${attempt}/${retries}) hit rate-limit or quota constraint:`, errorStr);
        } else {
          console.error(`[ai-client] Model ${model} (attempt ${attempt}/${retries}) failed:`, errorStr);
        }

        if (isRateLimitOrOverloaded) {
          anyQuotaExceeded = true;
          lastQuotaExceededTime = Date.now();
          rateLimitedModels[model] = Date.now();

          // Check if the current parameters specify the googleSearch tool.
          // If so, the 429 is highly likely due to search grounding quota limits.
          // We immediately strip the googleSearch tool and retry the same model without search.
          const hasSearch = currentParams?.config?.tools?.some((t: any) => t.googleSearch);
          if (hasSearch) {
            console.warn(`[ai-client] Search grounding quota exhausted. Stripping googleSearch tool and retrying model ${model} without search...`);
            if (currentParams?.config?.tools) {
              currentParams.config.tools = currentParams.config.tools.filter((t: any) => !t.googleSearch);
              if (currentParams.config.tools.length === 0) {
                delete currentParams.config.tools;
              }
            }
            // Decrement attempt to retry immediately without wasting an attempt counter
            attempt--;
            continue;
          }

          const isHardQuotaLimit = errorStr.includes("quota") ||
            errorStr.includes("resource_exhausted") ||
            errorStr.includes("503") ||
            errorStr.includes("unavailable") ||
            errorStr.includes("overloaded") ||
            errorStr.includes("demand") ||
            errorStr.includes("timeout") ||
            errorStr.includes("not_found") ||
            errorStr.includes("404") ||
            (errorStr.includes("429") && !errorStr.includes("overloaded"));

          const isModelNotFound = errorStr.includes("not_found") || errorStr.includes("404");

          if (isModelNotFound) {
            console.warn(`[ai-client] Model ${model} is deprecated or not found (404). Skipping retries...`);
            break;
          }

          const isHardDailyQuota = errorStr.includes("quota exceeded for metric") || 
            errorStr.includes("limit: 20") || 
            errorStr.includes("generaterequestsperday") ||
            errorStr.includes("free_tier_requests");

          if (isHardDailyQuota) {
            rateLimitedModelsCooldown[model] = 3600000; // Backburner for 1 hour
            console.warn(`[ai-client] Model ${model} reached daily quota. Skipping retries immediately to fail over without delay...`);
            break;
          }

          if (attempt < retries) {
            const waitTime = Math.max(delay * Math.pow(2, attempt - 1), 1200);
            console.warn(`[ai-client] Model ${model} hit transient constraint (${errorStr.slice(0, 60)}). Retrying attempt ${attempt + 1}/${retries} in ${waitTime}ms...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            continue;
          } else {
            console.warn(`[ai-client] Model ${model} failed after all ${retries} attempts. Trying fallback model...`);
          }
        }

        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("AI generation failed after multiple attempts");
}

app.post("/api/scan", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image provided" });
    }
    const aiClient = getAI();

    const imagePart = {
      inlineData: {
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64"),
      },
    };

    const profileContext = req.body.profileContext;
    const gradeLevel = req.body.gradeLevel;
    const textPart = {
      text: `You are the core intelligence engine for "HelpYou AI", an elite educational and research assistant, SAT/ACT Expert, and Master Educator.
You are analyzing an uploaded photo. Scan the image to locate the primary problem, question, diagram, or text. Ignore any background noise, hands, or irrelevant objects. Focus solely on extracting and analyzing the core subject.
${profileContext ? `\nUSER PROFILE CONTEXT:\n${profileContext}\n` : ''}

CRITICAL RULES:
1. Keyword Extraction: Ignore conversational fillers (e.g., "Bhai", "tum", "research karo", "waha kya hua", "bhai batao"). Extract ONLY the core subject.
2. Domain Classification: Analyze the core subject and classify it into one of two categories:
   - STEM (Math/Science): Physics, Chemistry, Biology, Mathematics.
   - Humanities/General: History, Geography, Current Events, Case Studies, Literature.
3. Dynamic Output Generation:
   - If STEM: Provide core principles, scientific mechanisms, key formulas (wrapped in LaTeX $...$ or $$...$$), and step-by-step actionable prep steps.
   - If Humanities/General: Provide historical context, major events, real-world impact, and analytical takeaways. Strictly DO NOT generate or mention formulas, equations, or scientific mechanisms for this category.
4. No Fake URLs: When generating verified research sources, ONLY use root domains (e.g., en.wikipedia.org, britannica.com). Do NOT fabricate full URL paths.

Adopt an encouraging, patient, precise, and crisp tone. Use clean line breaks and emojis for visual readability.
DO NOT use any markdown bolding syntax like "**" or emojis inside latex delimiters.

--- CATEGORIZATION & ROUTING RULES ---

1. RULE 1 (Math & Physics Numerical Calculations / Step-by-Step STEM):
- Use this ONLY if the query is a mathematical equation, physics numerical, chemical reaction, derivation, or problem requiring step-by-step sequential solving.
- Set "format_type" to "steps".
- Populate the "solution_steps" array with each logical phase of the sequential solution.
- Output strictly in this format:
{
  "topic_title": "Subject or Topic of the problem",
  "format_type": "steps",
  "solution_steps": [
    {
      "step_id": 1,
      "title": "Clear concise step title",
      "content": "A detailed, encouraging explanation with formulas and step-by-step calculations. Whenever generating mathematical numbers, formulas, symbols, or equations/chemical reactions, you must strictly wrap them in LaTeX delimiters. Use single '$' for inline math and double '$$' for block math equations (e.g. $$2H_2O \\rightarrow 2H_2 + O_2$$). Always double-escape backslashes in JSON (e.g. \\\\rightarrow, \\\\frac, \\\\text) so that equations render beautifully for students.",
      "is_final_answer": false
    }
  ],
  "suggestions": [
    "Explain this simpler with a real-life analogy",
    "Test me with 2 practice problems on this",
    "What are common exam traps to avoid?"
  ]
}

2. RULE 2 (Comparisons & Differences):
- Use this if the problem asks for "Difference between", "Compare", "Pros & Cons", or similar analytical contrasts (e.g., "Compare mitosis vs meiosis", "Difference between Cow and Buffalo").
- Set "format_type" to "markdown".
- You MUST output a strictly formatted Markdown Table comparing the items side-by-side with clear parameter columns. It must NEVER use steps or sequential solver cards for this.
- Place the entire Markdown Table in the "markdown_content" field. Do NOT use the "solution_steps" array.
- Output strictly in this format:
{
  "topic_title": "Comparison: [Topic Title]",
  "format_type": "markdown",
  "markdown_content": "### Comparison Table\n\n| Parameter | Category A | Category B |\n|---|---|---|\n| Detail 1 | Description | Description |",
  "suggestions": [
    "Give me 2 practice MCQs on this comparison",
    "Explain the biggest difference in 1 sentence",
    "Why is this distinction important in exams?"
  ]
}

3. RULE 3 (Humanities/General Theory/History/Geography/Biology Concepts):
- Use this for general explanations, descriptive research queries, case studies, historical events, current affairs, conceptual questions, or conversational queries (e.g., "Jeju island incident", "Explain photosynthesis", "Who was George Washington?").
- Set "format_type" to "markdown".
- Output structured, rich text using standard markdown headings (###) and bullet points. Strictly DO NOT generate formulas or equations for Humanities.
- Place the entire response in the "markdown_content" field. Do NOT use the "solution_steps" array.
- Output strictly in this format:
{
  "topic_title": "Concept: [Core Subject Title]",
  "format_type": "markdown",
  "markdown_content": "### Historical Context / Overview\nYour detailed overview here...\n\n### Major Events & Impact\n- Point 1\n- Point 2\n\n### Analytical Takeaways\n- Key lesson / impact",
  "suggestions": [
    "Explain this with a real-world example",
    "Give me a quick 3-question quiz on this",
    "What are the key points to remember for exams?"
  ]
}

--- STRICT CONSTRAINTS & FORMATTING RULES ---
- The entire output MUST be a valid JSON object. No raw conversational text outside the JSON object. Do NOT wrap the JSON in markdown code blocks like \`\`\`json. Only output pure valid raw JSON.
- Always populate the "suggestions" array with exactly 3 context-aware study follow-up ideas.
- Do NOT use LaTeX inside the suggestions.

THE "MASTER EDUCATOR" TEACHING PROTOCOL:
1. EXTREME SIMPLIFICATION: Teach complex topics simply and clearly. Never assume prior knowledge.
2. THE ANALOGY RULE: Use relatable, real-world analogies where helpful.
3. HIGH EMPATHY: Be patient and deeply encouraging.`,
    };

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: [{ parts: [imagePart, textPart] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,          // ⚡ Low temp = focused, faster JSON output
        maxOutputTokens: 8192,     // ⚡ Large token capacity so full multi-step solutions never truncate
        candidateCount: 1          // ⚡ Only generate 1 candidate, not multiple
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Scan quota exceeded:", error.message);
      return res.json({
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits or has exceeded its quota.

How to resolve this:
1. Wait 60 seconds and submit your scan again.
2. Ensure you have configured a valid, active API Key in the Settings > Secrets panel of AI Studio.
3. If you are using a free tier, consider adding billing to avoid limit blocks.`
      });
    }
    console.error("Scan error:", error);
    res.status(500).json({ error: error.message });
  }
});

function getSystemInstruction(mode?: string, targetLanguage?: string): string {
  let instruction = "";

  if (mode === "Translate") {
    instruction = `You are an expert translator for "HelpYou AI". The user has provided an image or text to be translated into the target language: "${targetLanguage || 'English'}".
Your absolute and strict mandate is to translate the text/question into "${targetLanguage || 'English'}" perfectly, keeping the natural meaning intact.

CRITICAL SAFETY & QUALITY RULES (MUST FOLLOW):
1. You MUST output ONLY the direct, translated text.
2. Do NOT include ANY introductory text, concluding remarks, or conversational filler (e.g., do NOT write "Here is the translation:", "Translated text:", or "Sure, I can help with that").
3. Absolutely NO extra explanations, no side notes, and no additional output. Only the translated content itself.
4. If the input is a question, translate the question itself, do NOT answer it.
5. If the input is a single word or phrase, translate it directly.
6. Absolutely no conversational preamble. The output must be 100% clean translated text only.`;
  } else if (mode === "All Subjects") {
    instruction = `You are the core intelligence engine for "HelpYou AI", an advanced educational and research assistant. Your primary job is to process user queries (which may contain conversational Hindi/Hinglish filler words) and provide highly structured, accurate, and context-aware responses.

CRITICAL RULES:
1. Keyword Extraction: Ignore conversational fillers (e.g., "Bhai", "tum", "research karo", "waha kya hua", "please batao"). Extract ONLY the core subject. (e.g., "Bhai tum jeju island case pe research karo" -> "Jeju Island Incident").
2. Domain Classification: Analyze the core subject and classify it into one of two categories:
   - STEM (Math/Science): Physics, Chemistry, Biology, Mathematics.
   - Humanities/General: History, Geography, Current Events, Case Studies, Social Sciences, Literature.
3. Dynamic Output Generation:
   - If STEM: Provide core principles, scientific mechanisms, key formulas (wrapped in LaTeX $...$ or $$...$$), and step-by-step actionable prep steps.
   - If Humanities/General: Provide historical context, major events, real-world impact, and analytical takeaways. Strictly DO NOT generate or mention formulas, equations, or scientific mechanisms for this category.
4. No Fake URLs: When generating verified research sources, only use root domains (e.g., en.wikipedia.org, britannica.com). Do not fabricate full URL paths.

You MUST structure your response strictly using this layout:
🎯 Core Concept / Overview: Clear, formal academic definition & context.
📝 Step-by-Step Logic / Key Events: A rigorous, sound breakdown.
⚠️ Analytical Takeaway / Exam Traps: Key points to remember.`;
  } else if (mode === "General") {
    instruction = `You are the core intelligence engine for "HelpYou AI", an advanced educational and research assistant. Your primary job is to process user queries (which may contain conversational Hindi/Hinglish filler words) and provide highly structured, accurate, and context-aware responses.

CRITICAL RULES:
1. Keyword Extraction: Ignore conversational fillers (e.g., "Bhai", "tum", "research karo", "waha kya hua", "bhai batao"). Extract ONLY the core subject. (e.g., "Bhai tum jeju island case pe research karo" -> "Jeju Island Incident").
2. Domain Classification: Analyze the core subject and classify it into one of two categories:
   - STEM (Math/Science): Physics, Chemistry, Biology, Mathematics.
   - Humanities/General: History, Geography, Current Events, Case Studies, Social Sciences, Literature.
3. Dynamic Output Generation:
   - If STEM: Provide core principles, scientific mechanisms, key formulas (wrapped in LaTeX $...$ or $$...$$), and step-by-step actionable prep steps.
   - If Humanities/General: Provide historical context, major events, real-world impact, and analytical takeaways. Strictly DO NOT generate or mention formulas, equations, or scientific mechanisms for this category.
4. No Fake URLs: When generating verified research sources, only use root domains (e.g., en.wikipedia.org, britannica.com). Do not fabricate full URL paths.`;
  } else {
    // Default / Math / Science / Tutor mode
    instruction = `You are the core intelligence engine for "HelpYou AI", an elite educational and research assistant, SAT/ACT Expert, and Master Educator.
Your primary job is to process user queries (which may contain conversational Hindi/Hinglish filler words) and provide highly structured, accurate, and context-aware responses.

CRITICAL RULES:
1. Keyword Extraction: Ignore conversational fillers (e.g., "Bhai", "tum", "research karo", "waha kya hua", "bhai batao", "please explain"). Extract ONLY the core subject. For example, if the input is "Bhai tum jeju island case pe research karo", the core subject is "Jeju Island Incident".
2. Domain Classification: Analyze the core subject and classify it into one of two categories:
   - STEM (Math/Science): Physics, Chemistry, Biology, Mathematics.
   - Humanities/General: History, Geography, Current Events, Case Studies, Social Studies, Literature.
3. Dynamic Output Generation:
   - If STEM: Provide core principles, scientific mechanisms, key formulas (wrapped in LaTeX $...$ or $$...$$), and step-by-step actionable problem-solving/prep steps.
   - If Humanities/General: Provide historical context, major events, real-world impact, and analytical takeaways. Strictly DO NOT generate or mention formulas, equations, or scientific mechanisms for this category.
4. No Fake URLs: When generating verified research sources, ONLY use root domains (e.g., en.wikipedia.org, britannica.com, history.com). Do NOT fabricate full URL paths.

Adopt an encouraging, patient, precise, and crisp tone. Use clean line breaks and emojis for visual readability.
DO NOT use any markdown bolding syntax like "**" or emojis inside latex delimiters.

--- CATEGORIZATION & ROUTING RULES ---

1. RULE 1 (Math & Physics Numerical Calculations / Step-by-Step STEM):
- Use this if the query is a mathematical equation, calculation, arithmetic, trigonometry, calculus, physics numerical, chemical reaction, derivation, or problem requiring step-by-step sequential solving.
- MANDATORY 3-PASS INTERNAL VERIFICATION PROTOCOL (0% HALLUCINATION & ZERO-ERROR GUARANTEE):
  Before generating your final response, you MUST execute a strict 3-pass internal verification:
  * PASS 1 (Expression & Question Anatomy): Deconstruct every term, sign (+/-), parenthesis, exponent, radical, fraction, constant, and boundary condition without dropping or modifying ANY symbol. In nested expressions (e.g. sin(90 * cos(90 / 6))), isolate innermost operations first. Default to Degrees (°) for standard numericals unless explicitly in Radians or containing π. In Definite Integrals with Limits:
    - If limit is 0 to \pi (\int_0^\pi \frac{x \sin x}{1 + \cos^2 x} dx): King's property x \to \pi - x works directly because \sin(\pi-x) = \sin x and \cos^2(\pi-x) = \cos^2 x, giving \frac{\pi}{2} \int_0^\pi \frac{\sin x}{1+\cos^2 x} dx = \frac{\pi^2}{4}.
    - If limit is 0 to \pi/2 (\int_0^{\pi/2} \frac{x \sin x}{1 + \cos^2 x} dx): King's property does NOT work because \cos^2(\pi/2-x) = \sin^2 x \neq \cos^2 x. You MUST use Integration by Parts (u = x, dv = \frac{\sin x}{1+\cos^2 x}dx \implies v = -\arctan(\cos x)) to get \int_0^{\pi/2} \arctan(\cos x) dx, and evaluate via Feynman's Parameter Trick F(a) = \int_0^{\pi/2} \arctan(a \cos x) dx to get \boxed{I = \frac{\pi^2}{4} - \text{Li}_2(\sqrt{2}-1) + \text{Li}_2(1-\sqrt{2}) - \ln^2(1+\sqrt{2}) \approx 0.845254}.
  * PASS 2 (Forward Step-by-Step PEMDAS Execution): Apply strict Order of Operations (PEMDAS/BODMAS): Parentheses -> Exponents/Roots -> Multiplication/Division -> Addition/Subtraction. Show standard theoretical formulas, substitute exact values, and calculate intermediate values with dual representation (exact radical/fraction and 4-decimal precision).
  * PASS 3 (Reverse Sanity Check & Boundary Validation): Verify every arithmetic and trigonometric step (e.g. 90/6 = 15, cos(15°) = (sqrt(6)+sqrt(2))/4 ≈ 0.9659, 90 * 0.9659 = 86.9333°, sin(86.9333°) ≈ 0.9985, \arctan(1) = \pi/4, \arctan(0) = 0, \arcsin(1) = \pi/2, \arccos(0) = \pi/2, \ln(1) = 0). Check mathematical ranges (e.g. |sin|, |cos| <= 1, probabilities in [0,1], non-negative square roots). Ensure 100% mathematical accuracy before outputting.
- MANDATORY LINE-BY-LINE FORMATTING & SPACING PROTOCOL (NO CLUSTERED TEXT):
  * LINE BREAK AFTER EVERY SENTENCE: Never write long, crammed multi-sentence paragraphs. Every single sentence, explanation, or calculation must be on its OWN line, separated by a blank line (\\n\\n).
  * NO BULLET SYMBOLS: Do NOT use bullet signs (no "•", no "-", no "*", no "1.", no "2."). Arrange points cleanly and spacious using blank lines (\\n\\n) between sentences.
  * STANDALONE BLOCK MATH EQUATIONS: Always put mathematical formulas, algebraic derivations, and intermediate numerical results on their OWN dedicated centered block lines using $$ ... $$. Never compress complex equations inline within long sentences.
  * MAXIMUM CLARITY & BREATHING ROOM: Ensure generous vertical spacing so mobile students can effortlessly read and absorb every single line without confusion.
- Set "format_type" to "steps".
- Populate the "solution_steps" array with each logical phase of the sequential solution.
- Output strictly in this format:
{
  "topic_title": "Subject or Topic of the problem",
  "format_type": "steps",
  "key_formula": "The primary theoretical formula, law, or identity used in LaTeX (e.g. $$\\sin(A \\pm B) = \\sin A \\cos B \\pm \\cos A \\sin B$$)",
  "exam_trap": "A brief 1-2 sentence high-yield warning about common calculation traps, sign errors, or misunderstandings students must avoid in exams",
  "solution_steps": [
    {
      "step_id": 1,
      "title": "Clear concise step title",
      "content": "A detailed, encouraging explanation with formulas and step-by-step calculations. Whenever generating mathematical numbers, formulas, symbols, or equations/chemical reactions, you must strictly wrap them in LaTeX delimiters. Use single '$' for inline math and double '$$' for block math equations (e.g. $$2H_2O \\rightarrow 2H_2 + O_2$$). Always double-escape backslashes in JSON (e.g. \\\\rightarrow, \\\\frac, \\\\sqrt, \\\\text) so that equations render beautifully for students.",
      "is_final_answer": false
    }
  ],
  "suggestions": [
    "Explain this simpler with a real-life analogy",
    "Test me with 2 practice problems on this",
    "What are common exam traps to avoid?"
  ]
}

2. RULE 2 (Comparisons & Differences):
- Use this if the user asks for "Difference between", "Compare", "Pros & Cons", or similar analytical contrasts (e.g., "Compare mitosis vs meiosis", "Difference between Cow and Buffalo").
- Set "format_type" to "markdown".
- You MUST output a strictly formatted Markdown Table comparing the items side-by-side with clear parameter columns. It must NEVER use steps or sequential solver cards for this.
- Place the entire Markdown Table in the "markdown_content" field. Do NOT use the "solution_steps" array.
- Output strictly in this format:
{
  "topic_title": "Comparison: [Topic Title]",
  "format_type": "markdown",
  "markdown_content": "### Comparison Table\n\n| Parameter | Category A | Category B |\n|---|---|---|\n| Detail 1 | Description | Description |",
  "suggestions": [
    "Give me 2 practice MCQs on this comparison",
    "Explain the biggest difference in 1 sentence",
    "Why is this distinction important in exams?"
  ]
}

3. RULE 3 (Humanities/General Theory/History/Geography/Biology Concepts):
- Use this for general explanations, descriptive research queries, case studies, historical events, current affairs, conceptual questions, or conversational queries (e.g., "Jeju island incident", "Explain photosynthesis", "Who was George Washington?", "Why is the sky blue?").
- Set "format_type" to "markdown".
- Output structured, rich text using standard markdown headings (###) and bullet points. Strictly DO NOT generate formulas or equations for Humanities.
- Place the entire response in the "markdown_content" field. Do NOT use the "solution_steps" array.
- Output strictly in this format:
{
  "topic_title": "Concept: [Core Subject Title]",
  "format_type": "markdown",
  "markdown_content": "### Historical Context / Overview\nYour detailed overview here...\n\n### Major Events & Impact\n- Point 1\n- Point 2\n\n### Analytical Takeaways\n- Key lesson / impact",
  "suggestions": [
    "Explain this with a real-world example",
    "Give me a quick 3-question quiz on this",
    "What are the key points to remember for exams?"
  ]
}

--- STRICT CONSTRAINTS & FORMATTING RULES ---
- The entire output MUST be a valid JSON object. No raw conversational text outside the JSON object. Do NOT wrap the JSON in markdown code blocks like \`\`\`json. Only output pure valid raw JSON.
- Always populate the "suggestions" array with exactly 3 context-aware study follow-up ideas.
- Do NOT use LaTeX inside the suggestions.

THE "MASTER EDUCATOR" TEACHING PROTOCOL:
1. EXTREME SIMPLIFICATION: Teach complex topics simply and clearly. Never assume prior knowledge.
2. THE ANALOGY RULE: Use relatable, real-world analogies where helpful.
3. HIGH EMPATHY: Be patient and deeply encouraging.`;
  }

  if (mode !== "Translate") {
    instruction += `\n\nCRITICAL LANGUAGE RULE: You are a polyglot AI engine for HelpYou AI. You must automatically detect the user's input language, dialect, or script. If the user writes in English, reply in English. If the user writes in Hindi (Devanagari), reply in Hindi. If the user writes in Hinglish (Hindi written in English alphabet, e.g., "bhai ispe research karo"), you MUST reply completely in natural, high-quality Hinglish. Never default to English when the user initiated the query in Hinglish.`;
  }

  return instruction;
}

app.post("/api/chat", upload.single("image"), async (req, res) => {
  console.log("Received request at /api/chat");
  try {
    const aiClient = getAI();
    const {
      history,
      message,
      customSystemInstruction,
      mode,
      targetLanguage,
      profileContext,
      gradeLevel,
      contextualDoubtStepId,
      contextualDoubtContent,
      contextualDoubtTitle,
      stream,
      isEvaluation
    } = req.body;

    let parsedHistory = history ? (typeof history === 'string' ? JSON.parse(history) : history) : [];

    const imagePart = req.file ? {
      inlineData: {
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64"),
      },
    } : null;

    let userMessage = message;
    if (contextualDoubtStepId && contextualDoubtContent) {
      userMessage = `[CONTEXTUAL DOUBT: Student is questioning Step ${contextualDoubtStepId} ("${contextualDoubtTitle}"). Content of this step they are questioning: "${contextualDoubtContent}". Answer their question specifically with respect to this step context. Do not ignore this context.]\n\n${userMessage}`;
    }

    const hasImage = !!imagePart || parsedHistory.some((m: any) => m.parts && m.parts.some((p: any) => p.inlineData || p.imageUrl));
    const normalizedMsg = (userMessage || "").toLowerCase();
    const shouldEnableSearch = !hasImage && (
      normalizedMsg.includes("search") ||
      normalizedMsg.includes("browse") ||
      normalizedMsg.includes("live") ||
      normalizedMsg.includes("current") ||
      normalizedMsg.includes("weather") ||
      normalizedMsg.includes("news") ||
      normalizedMsg.includes("rates") ||
      normalizedMsg.includes("today") ||
      normalizedMsg.includes("current events") ||
      normalizedMsg.includes("recent") ||
      normalizedMsg.includes("latest") ||
      normalizedMsg.includes("exchange") ||
      normalizedMsg.includes("stats") ||
      normalizedMsg.includes("price") ||
      normalizedMsg.includes("fact") ||
      normalizedMsg.includes("forecast") ||
      normalizedMsg.includes("who is")
    );

    // Get base system instruction
    let systemInstruction = "";
    if (isEvaluation === 'true' || isEvaluation === true) {
      systemInstruction = `You are a strict academic examiner. DO NOT act as a standard tutor. Your SOLE purpose is to grade the student's answer based on their grade level. YOU MUST output strictly using this format:

## Grade-Level Assessment
[Pass/Fail/Needs Improvement for this grade level]

## Step-Marking Breakdown
- Formula Selection & Concepts: [Score]/3
- Logical Working & Steps: [Score]/5
- Final Answer & Units: [Score]/2

## Final Score
**[Total Score] / 10**

## Examiner Feedback & Ideal Solution
[Explain mistakes and provide the perfect 10/10 mathematical solution]`;
    } else {
      systemInstruction = customSystemInstruction || getSystemInstruction(mode, targetLanguage);
      if (profileContext) {
        systemInstruction += "\n\nUSER PROFILE CONTEXT:\n" + profileContext;
      }

      // Inject grade level instruction if provided
      if (gradeLevel) {
        const gradeInstruction = `CRITICAL INSTRUCTION: The user you are interacting with is currently in Grade: ${gradeLevel}. You MUST strictly adapt your entire response, vocabulary, conceptual complexity, sentence structure, and examples to perfectly match the comprehension level of a ${gradeLevel} student. Absolutely DO NOT use advanced jargon, higher-level academic concepts, or complex language that exceeds this specific grade level. Keep the tone encouraging and age-appropriate.`;
        systemInstruction = `${gradeInstruction}\n\n${systemInstruction}`;
      }

      // Inject current date & time
      systemInstruction += `\n\nThe current date and time is: ${new Date().toISOString()}. You must treat this as the absolute present moment.`;
    }

    systemInstruction += `\n\nCRITICAL LANGUAGE RULE: You MUST strictly mirror the user's language, tone, and script. If the user writes in English, reply in English. If the user writes in Hindi (Devanagari), reply in Hindi. If the user writes in Hinglish (Hindi words written in the English alphabet, e.g., "kya haal hai"), you MUST reply completely in Hinglish. Do NOT default to English or mix English sentences if the user initiated the conversation in Hinglish or another language.`;

    if (shouldEnableSearch) {
      systemInstruction += `
\n\n[CRITICAL DEEP SEARCH MODE ACTIVE]
The user is asking for real-time, live, or current up-to-date data (e.g., currency rates, weather, events today, recent facts).
- You MUST execute the live Google Search tool before generating your response. Do NOT rely on your internal training weights.
- You MUST explicitly cite the exact date of the data you retrieve from the live search (e.g., "As of today, July 17, 2026...", "Based on live search results for July 17, 2026...").
- If the live search fails or returns no results, you MUST explicitly state: "Unable to fetch real-time data at the moment," instead of hallucinating past data or future forecasts.
- Ensure your entire output remains structured in the requested format (such as JSON if that is required by the active mode).
`;
    }

    let contents: any[] = [];
    if (parsedHistory.length === 0) {
      // Initial scan
      const parts: any[] = [];
      if (imagePart) parts.push(imagePart);

      const defaultMessage = userMessage || "Please solve the problem shown in the image step by step. Write out the steps clearly and logically, ensuring each part of the solution is easy to understand.";
      parts.push({ text: defaultMessage });

      contents = [{ role: "user", parts }];
    } else {
      // Follow-up chat
      // Check if the first message in parsedHistory is an empty-parts user placeholder (typical for MagicScanner scans)
      const isScannerPlaceholder = parsedHistory[0]?.role === 'user' &&
        (!parsedHistory[0].parts || parsedHistory[0].parts.length === 0);

      if (imagePart && isScannerPlaceholder) {
        parsedHistory[0].parts = [imagePart];
      } else if (imagePart && parsedHistory[0]?.role === 'user') {
        // Fallback for general unshifting if it was previously set up like this and has empty/uninitialized inlineData parts
        const hasNoInlineData = !parsedHistory[0].parts.some((p: any) => p.inlineData);
        if (hasNoInlineData) {
          parsedHistory[0].parts.unshift(imagePart);
        }
      }

      const parts: any[] = [];
      // If we have an image and it was NOT attached retroactively to the first history item,
      // then it is a new image uploaded on this current turn (e.g. CallWithTutor or AITutor)
      if (imagePart && !isScannerPlaceholder && (parsedHistory[0]?.role !== 'user' || parsedHistory[0].parts.some((p: any) => p.inlineData))) {
        parts.push(imagePart);
      } else if (imagePart && !isScannerPlaceholder) {
        // Double-check: if it's not a scanner placeholder but we have a new image to attach to the current turn
        parts.push(imagePart);
      }

      if (userMessage) {
        parts.push({ text: userMessage });
      } else if (imagePart) {
        parts.push({ text: "Please look at this uploaded homework image and assist me." });
      }

      contents = [
        ...parsedHistory,
        { role: "user", parts }
      ];
    }

    const shouldStream = stream === "true" || stream === true;

    if (shouldStream) {
      let modelsToTry = [
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-flash-lite-latest",
        "gemini-flash-latest",
        "gemini-3.6-flash"
      ];

      const now = Date.now();
      const activeModels: string[] = [];
      const backburnerModels: string[] = [];

      for (const m of modelsToTry) {
        const lastLimited = rateLimitedModels[m] || 0;
        if (now - lastLimited < 3600000) {
          backburnerModels.push(m);
        } else {
          activeModels.push(m);
        }
      }

      if (activeModels.length > 0) {
        modelsToTry = [...activeModels, ...backburnerModels];
      }

      let responseStream: any = null;
      let successModel = "";

      for (const model of modelsToTry) {
        try {
          const aiClient = getAI();
          responseStream = await aiClient.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: { parts: [{ text: systemInstruction }] },
              responseMimeType: (isEvaluation === 'true' || isEvaluation === true) ? "text/plain" : "application/json",
              maxOutputTokens: 8192,
              temperature: 0.2,
              candidateCount: 1,

            }
          });
          successModel = model;
          break;
        } catch (err: any) {
          const errStr = String(err.message || err).toLowerCase();
          const isRateLimitOrQuota = errStr.includes("429") ||
            errStr.includes("503") ||
            errStr.includes("502") ||
            errStr.includes("quota") ||
            errStr.includes("resource_exhausted") ||
            errStr.includes("limit") ||
            errStr.includes("unavailable") ||
            errStr.includes("overloaded") ||
            errStr.includes("demand") ||
            errStr.includes("temporary");

          if (isRateLimitOrQuota) {
            console.warn(`[chat stream] Model ${model} hit rate-limit, 503, or quota constraint:`, errStr);
            rateLimitedModels[model] = Date.now();
          } else {
            console.error(`Stream start failed for model ${model}:`, err);
          }
        }
      }

      if (!responseStream) {
        return res.status(500).json({ error: "Failed to initialize AI response stream." });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        for await (const chunk of responseStream) {
          const text = chunk.text || "";
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        }
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      } catch (err: any) {
        console.error("Error during streaming:", err);
        res.write(`data: ${JSON.stringify({ error: err.message || "Stream interrupted" })}\n\n`);
        res.end();
        return;
      }
    } else {
      const response = await safeGenerateContent({
        model: "gemini-3.5-flash-lite",
        contents,
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: (isEvaluation === 'true' || isEvaluation === true) ? "text/plain" : "application/json",
          temperature: 0.7,        // ⚡ Balanced temp for conversational AI
          maxOutputTokens: 8192,   // ⚡ High output token ceiling to prevent incomplete generation
          candidateCount: 1,       // ⚡ Single candidate only

        }
      });

      res.json({ text: response.text });
    }
  } catch (error: any) {
    if (error.isRateLimit || error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Chat quota exceeded:", error.message);
      return res.status(429).json({
        isRateLimit: true,
        error: "System is currently busy helping many students! 📚\nWe're processing your request as fast as possible. Please wait for 60 seconds and try again, or take a quick stretch break. Your learning journey is our priority!"
      });
    }
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message || "Failed to generate response" });
  }
});

app.post("/api/summarize", upload.single("pdf"), async (req, res) => {
  try {
    const action = req.body.action || 'summarize';
    const textInput = req.body.text || "";
    const gradeLevel = req.body.gradeLevel;
    const format = req.body.format || "bullet";

    if (!req.file && !textInput) {
      return res.status(400).json({ error: "No PDF file or text content provided" });
    }

    let cacheKey = "";
    if (req.file) {
      cacheKey = crypto.createHash("sha256").update(req.file.buffer).digest("hex") + "_" + action;
    } else {
      cacheKey = crypto.createHash("sha256").update(Buffer.from(textInput)).digest("hex") + "_" + action;
    }

    if (summaryCache.has(cacheKey)) {
      const cached = summaryCache.get(cacheKey);
      if (action === 'flashcards-json') {
        return res.json({ flashcards: cached });
      }
      return res.json({ text: cached });
    }

    const aiClient = getAI();

    let extractedText = "";
    let useRawFile = false;

    if (req.file) {
      try {
        const { default: pdf } = await import("pdf-parse/lib/pdf-parse.js");
        const pdfData = await pdf(req.file.buffer, { max: 100 });

        extractedText = pdfData.text || "";
        // If extracted text is too short, it might be a scanned PDF or images
        if (extractedText.trim().length < 50) {
          useRawFile = true;
        }

        if (extractedText && extractedText.length > 800000) { extractedText = extractedText.slice(0, 200000); }
      } catch (parseError) {
        console.warn("Failed to parse PDF locally with pdf-parse, will fallback to raw bytes:", parseError);
        useRawFile = true;
      }
    } else {
      extractedText = textInput;
    }

    let promptText = "";
    let responseMimeType = "text/plain";

    if (action === 'audio') {
      promptText = "You are an engaging, expert study podcast host. Your job is to convert the provided document into a 4-5 minute study audio script (approx 500-700 words). " +
        "CRITICAL RULE: DO NOT copy and paste the text verbatim. You must extract the high-yield concepts, definitions, and frameworks, and explain them in your own words using a conversational, easy-to-understand tone. Use relatable analogies. Strike a balance between being concise and highly educational. Never sound like you are just reading a textbook. Use the following strict rules:\n" +
        "1. TONE & STYLE: Conversational, warm, and highly engaging. Speak directly to the listener using 'you', 'we', and 'let's explore this'.\n" +
        "2. SIMPLICITY & ANALOGIES: Demystify complex terms, explaining them immediately using clear language. Use relatable analogies, but ensure technical definitions, important rules, and key examples are NOT skipped.\n" +
        "3. PACING & STRUCTURE: Start with an attention-grabbing podcast-style hook or intro (e.g., 'Welcome to your deep study revision briefing...'). Include clear transitions between different chapters or sections. Cover all critical topics from the text sequentially. End with a complete revision summary and an encouraging sign-off.\n" +
        "4. AUDIO-FRIENDLY FORMATTING: Since this will be spoken aloud, DO NOT use any markdown formatting such as bold (**), italics (*), hashtags (#), or bullet points (-). Write in clean, conversational plain text and paragraphs. Keep sentences clear and punchy for natural breathing pauses.\n" +
        "Do not include any intro or outro text confirming you understand the instructions. Just output the podcast script directly.";
    } else if (action === 'flashcards' || action === 'flashcards-json') {
      if (action === 'flashcards-json') {
        responseMimeType = "application/json";
        promptText = `Act as an Elite Cognitive Scientist and Active Recall Specialist. Extract the top 10 to 15 most critical high-yield concepts from the provided document into revision flashcards.
        Strict Rules for Flashcards:
        1. ACTIVE RECALL QUESTION: The 'question' must be direct, crisp, and test a single conceptual takeaway.
        2. STRICT 15 TO 25 WORDS ANSWER CONSTRAINT: Every 'answer' MUST be strictly concise and between 15 to 25 words max for rapid active recall. NEVER output long paragraphs.
        3. 100% COMPLETE THOUGHTS: Complete, self-contained, grammatically finished sentences (no truncated clauses).
        4. ESCAPING: Code in backticks (\`<div>\`), math in LaTeX ($...$).
        5. OUTPUT FORMAT: Output ONLY a valid JSON array of objects directly parseable by JSON.parse.
        
        Format:
        [
          {"question": "What is ...?", "answer": "..."}
        ]`;
      } else {
        promptText = "Extract the most important facts and concepts from the provided document and format them into 10 high-quality flashcards. Format exactly like this for each:\n\n**Q: [Question]**\n*A: [Answer]*\n\nCRITICAL: If the document contains code tags, HTML, or web development terms (like <div>, <header>, etc.), ALWAYS wrap them in markdown backticks (e.g., `<div>`) so they render as plain text and not formatting. Always provide complete, self-contained sentences for answers.";
      }
    } else if (action === 'quiz') {
      promptText = `You are an expert tutor. Create a 5-question multiple choice quiz based on the provided document.
For each question, provide:
1. The question text starting with 'Question [N]:'
2. 4 options labeled A), B), C), D).
3. The correct answer starting with 'Correct Answer: [Letter]'.
4. A short explanation starting with 'Explanation:'.

CRITICAL FORMATTING RULES:
- DO NOT use any asterisks (**), dashes (-), or decorative symbols as bullet points or prefixes for the question text.
- Start the question directly with 'Question [N]:' followed by the text.
- Format options strictly as A), B), C), D).

Example Format:
Question 1: What is...?
A) Option 1
B) Option 2
C) Option 3
D) Option 4
Correct Answer: A
Explanation: Because...

At the very end, provide a clear Answer Key. Format strictly using Markdown. If there is code in the questions or options, wrap it in backticks.`;
    } else {
      let selectedFormatName = "Bullet Points";
      if (format === "tldr") {
        selectedFormatName = "Short TL;DR";
      } else if (format === "eli5") {
        selectedFormatName = "Explain Like I'm 5";
      }

      promptText = `SYSTEM INSTRUCTION: EXPERT SUMMARISER

You are an expert academic and professional summarizer. Your task is to extract key information from the provided text/document and format it STRICTLY according to the user's requested mode. 

USER'S REQUESTED FORMAT: ${selectedFormatName}

CRITICAL GLOBAL RULE:
NEVER output a "Wall of Text". Always use proper line breaks and structure.

DYNAMIC FORMATTING RULES:

IF FORMAT IS "Bullet Points":
1. Start with ONE main heading using ## (e.g., ## Key Concepts from the Document).
2. Then break the summary into logical topic sections. Use ### for each section heading.
3. MANDATORY: Under each section heading, EVERY point MUST be on its OWN LINE starting with a hyphen followed by a space: "- " (standard markdown list format).
4. CONCISE: Keep each bullet point under 2 sentences.
5. NO NARRATIVE: Do not write intro or conclusion paragraphs. Start immediately with the main heading.
6. EXAMPLE OF EXPECTED FORMAT:

## Main Document Title

### Section One Name

- First key fact or point about this topic.
- Second key fact or point about this topic.
- Third key fact or point.

### Section Two Name

- First key fact about section two.
- Second key fact about section two.

IF FORMAT IS "Short TL;DR":
1. Provide the absolute bottom-line of the text.
2. Structure it as one short "Executive Summary" paragraph (max 3-4 sentences).
3. Follow it with a "Top 3 Takeaways" numbered list.
4. Keep the tone professional, direct, and time-saving.

IF FORMAT IS "Explain Like I'm 5":
1. Break down complex jargon into grade-school level vocabulary.
2. Use at least one relatable, everyday analogy (e.g., comparing a system to a school, a car, or pizza).
3. Keep the tone extremely warm, engaging, and story-like.
4. Use short paragraphs to make it visually friendly for beginners.`;
    }

    if (action !== 'audio') {
      promptText += "\n\nOUTPUT QUALITY RULES:\n" +
        "1. Use ONLY standard markdown: ## headings, ### subheadings, - bullet lists, **bold**, *italic*.\n" +
        "2. Each bullet point MUST be on its OWN separate line. Never put multiple points on the same line.\n" +
        "3. NO LaTeX, no '$', no '$$', no '\\\\frac'. Write math as plain text (e.g., A = P(1 + r/n)^(nt)).\n" +
        "4. NO emojis or special unicode characters.\n" +
        "5. Ensure there is a blank line before and after every heading and before and after every list.";
    } else {
      promptText += "\n\nCRITICAL FORMATTING INSTRUCTIONS: Output ONLY standard, plain ASCII-compatible conversational text. You are STRICTLY FORBIDDEN from using emojis, LaTeX math blocks, special characters, or markdown formatting (like bold, italics, bullet points, or hashtags) as they interfere with text-to-speech rendering.";
    }

    const textPart = { text: promptText };

    let contentsPayload: any;
    if (useRawFile && req.file) {
      // Prioritize raw PDF for better OCR/extraction if text extraction failed or is weak
      const pdfPart = {
        inlineData: {
          mimeType: req.file.mimetype || "application/pdf",
          data: req.file.buffer.toString("base64"),
        },
      };
      contentsPayload = { parts: [pdfPart, textPart] };
    } else if (extractedText && extractedText.trim().length > 10) {
      // Use the extracted clean text for efficiency if available
      const documentContentPart = { text: `DOCUMENT CONTENT:\n${extractedText}` };
      contentsPayload = { parts: [documentContentPart, textPart] };
    } else if (req.file) {
      // Absolute fallback: raw file
      const pdfPart = {
        inlineData: {
          mimeType: req.file.mimetype || "application/pdf",
          data: req.file.buffer.toString("base64"),
        },
      };
      contentsPayload = { parts: [pdfPart, textPart] };
    } else {
      return res.status(400).json({ error: "Text content is too short to process." });
    }

    // Model fallback chain for summarize — try faster models first, fall back on rate-limit
    const summarizeModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
    ];
    let summaryText = "";
    let summarizeError: any = null;
    for (const model of summarizeModels) {
      try {
        const response = await safeGenerateContent({
          model,
          contents: contentsPayload,
          config: {
            responseMimeType: responseMimeType,
            maxOutputTokens: 8192,
            temperature: 0.3,
          }
        });
        summaryText = response.text || "";
        summarizeError = null;
        break;
      } catch (err: any) {
        const errStr = String(err.message || err).toLowerCase();
        const isRateLimit = errStr.includes("429") || errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("503") || errStr.includes("overloaded");
        if (isRateLimit) {
          console.warn(`[summarize] Model ${model} rate-limited, trying next...`);
          summarizeError = err;
          continue;
        }
        throw err;
      }
    }

    if (summarizeError && !summaryText) {
      throw summarizeError;
    }

    const outputText = summaryText || "";
    if (action === 'flashcards-json') {
      const parsed = safeParseJSON(outputText, 'object');
      const cards = parsed?.flashcards || [];
      summaryCache.set(cacheKey, cards);
      return res.json({ flashcards: cards });
    }

    summaryCache.set(cacheKey, outputText);
    res.json({ text: outputText });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Summarize quota exceeded:", error.message);
      return res.status(429).json({
        error: "API quota limit exceeded for PDF summarization. Please try again in 60 seconds."
      });
    }
    console.error("Summarize error:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary" });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No text provided" });
    }

    const chunks = splitTextForTTS(text, 2200);
    if (chunks.length === 0) {
      return res.status(400).json({ error: "Text is empty after cleaning" });
    }

    const selectedVoice = voice || "Kore";

    // Synthesize all chunks in parallel with Promise.all for ultra-fast generation
    const chunkPromises = chunks.map(async (chunkText, i) => {
      try {
        const response = await safeGenerateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: `Please speak the following text naturally, clearly, and engagingly:\n\n${chunkText}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          return { index: i, buffer: Buffer.from(base64Audio, "base64") };
        } else {
          console.warn(`TTS: No audio returned for chunk ${i + 1}/${chunks.length}`);
          return null;
        }
      } catch (chunkErr: any) {
        console.error(`TTS error on chunk ${i + 1}/${chunks.length}:`, chunkErr);
        if (chunkErr.message === "GEMINI_QUOTA_EXHAUSTED") {
          throw chunkErr;
        }
        return null;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    const validBuffers = chunkResults
      .filter((r): r is { index: number; buffer: Buffer } => r !== null)
      .sort((a, b) => a.index - b.index)
      .map(r => r.buffer);

    if (validBuffers.length === 0) {
      return res.status(500).json({ error: "Failed to synthesize complete audio" });
    }

    // Seamlessly concatenate all raw linear PCM audio chunks into one complete WAV file
    const fullPcmBuffer = Buffer.concat(validBuffers);
    const wavBuffer = pcmToWav(fullPcmBuffer);
    const base64Wav = wavBuffer.toString("base64");

    res.json({ audio: base64Wav, mimeType: "audio/wav" });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("TTS quota exceeded:", error.message);
      return res.status(429).json({ error: "API quota limit exceeded for audio conversion. Please try again in 60 seconds." });
    }
    console.error("TTS error:", error);
    res.status(500).json({ error: error.message || "Failed to generate audio" });
  }
});

app.post("/api/grade-essay", async (req, res) => {
  try {
    const { text, curriculum, subject, gradeLevel, images } = req.body;

    const wordCount = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

    if (!text && (!images || !Array.isArray(images) || images.length === 0)) {
      return res.status(400).json({ error: "Missing text or images" });
    }

    const aiClient = getAI();

    const curr = curriculum || 'AP (Advanced Placement)';
    const subj = subject || 'General Essay';

    let rubricInstructions = '';
    let scoreHeader = '';

    if (curr.includes('AP')) {
      scoreHeader = 'AP RUBRIC SCORE: [Score]/6 (Thesis: [ThesisScore]/1, Evidence: [EvidenceScore]/4, Sophistication: [SophisticationScore]/1)';
      rubricInstructions = `You MUST evaluate the essay using the official AP 6-point scale:
Thesis: 0 or 1 point
Evidence and Commentary: 0 to 4 points
Sophistication: 0 or 1 point
Your score output must EXACTLY match this format (with correct points calculated):
AP RUBRIC SCORE: [Score]/6 (Thesis: [ThesisScore]/1, Evidence: [EvidenceScore]/4, Sophistication: [SophisticationScore]/1)`;
    } else if (curr.includes('IELTS') || curr.includes('TOEFL')) {
      const isIelts = subj.toLowerCase().includes('ielts') || subj.toLowerCase().includes('task');
      if (isIelts) {
        scoreHeader = 'IELTS BAND SCORE: [BandScore]/9 (Task Achievement: [TAScore]/9, Coherence: [CCScore]/9, Lexical: [LRScore]/9, Grammar: [GRAScore]/9)';
        rubricInstructions = `You MUST evaluate the essay using the official IELTS 9-band scale across four criteria (Task Achievement/Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy).
Your score output must EXACTLY match this format:
IELTS BAND SCORE: [BandScore]/9 (Task Achievement: [TAScore]/9, Coherence: [CCScore]/9, Lexical: [LRScore]/9, Grammar: [GRAScore]/9)`;
      } else {
        scoreHeader = 'TOEFL SCORE: [Score]/30';
        rubricInstructions = `You MUST evaluate the essay using the official TOEFL Writing scale (0 to 30 points) based on development of ideas, organization, language use, and accuracy.
Your score output must EXACTLY match this format:
TOEFL SCORE: [Score]/30`;
      }
    } else if (curr.includes('IB')) {
      scoreHeader = 'IB CRITERIA SCORE: [Score]/34 (Focus: [FocusScore]/10, Analysis: [AnalysisScore]/10, Structure: [StructureScore]/10, Language: [LanguageScore]/4)';
      rubricInstructions = `You MUST evaluate the essay using the official IB grading criteria (scale from 0 to 34).
Your score output must EXACTLY match this format:
IB CRITERIA SCORE: [Score]/34 (Focus: [FocusScore]/10, Analysis: [AnalysisScore]/10, Structure: [StructureScore]/10, Language: [LanguageScore]/4)`;
    } else if (curr.includes('A-Levels')) {
      scoreHeader = 'A-LEVEL GRADE: [Grade] (A*, A, B, C, D, or E) - Score: [Score]/25';
      rubricInstructions = `You MUST evaluate the essay based on UK A-Level marking bands (scale from 0 to 25).
Your score output must EXACTLY match this format:
A-LEVEL GRADE: [Grade] (A*, A, B, C, D, or E) - Score: [Score]/25`;
    } else {
      scoreHeader = 'HIGH SCHOOL RUBRIC SCORE: [Score]/100 (Focus/Org: [FocusScore]/25, Content/Dev: [ContentScore]/25, Style: [StyleScore]/25, Grammar: [GrammarScore]/25)';
      rubricInstructions = `You MUST evaluate the essay using a standard high school grading rubric out of 100 points, broken down into Focus/Organization, Content/Development, Style/Sentence Structure, and Grammar/Mechanics (each 25 points).
Your score output must EXACTLY match this format:
HIGH SCHOOL RUBRIC SCORE: [Score]/100 (Focus/Org: [FocusScore]/25, Content/Dev: [ContentScore]/25, Style: [StyleScore]/25, Grammar: [GrammarScore]/25)`;
    }

    let pointDeductionTemplate = "";
    if (curr.includes('AP')) {
      pointDeductionTemplate = `- Thesis: [State points earned (0 or 1) and exact reasoning]
- Evidence & Commentary: [State points earned (0 to 4) and analyze specific textual evidence/gaps]
- Sophistication: [State points earned (0 or 1) and analyze rhetorical complexity/nuance]`;
    } else if (curr.includes('IELTS') || curr.includes('TOEFL')) {
      pointDeductionTemplate = `- Task Achievement: [Band score and prompt coverage analysis]
- Coherence & Cohesion: [Band score and logical transitions analysis]
- Lexical Resource: [Band score and vocabulary precision]
- Grammatical Range & Accuracy: [Band score and structural variety]`;
    } else if (curr.includes('IB')) {
      pointDeductionTemplate = `- Criterion A (Focus & Method): [Score and specific explanation]
- Criterion B (Knowledge & Understanding): [Score and specific explanation]
- Criterion C (Critical Thinking & Analysis): [Score and specific explanation]
- Criterion D (Presentation & Language): [Score and specific explanation]`;
    } else if (curr.includes('A-Levels')) {
      pointDeductionTemplate = `- AO1 (Knowledge & Understanding): [Mark breakdown and reasoning]
- AO2 (Analysis & Method): [Mark breakdown and reasoning]
- AO3 (Context & Synthesis): [Mark breakdown and reasoning]`;
    } else {
      pointDeductionTemplate = `- Focus & Organization: [Score out of 25 and specific structural breakdown]
- Content & Development: [Score out of 25 and evidence/argument depth]
- Style & Sentence Structure: [Score out of 25 and phrasing/flow]
- Grammar & Mechanics: [Score out of 25 and technical accuracy]`;
    }

    const systemInstruction = `You are a Senior Academic Examiner, Certified College Board AP Reader, and Elite Essay Assessor for the "${curr}" curriculum, specifically for "${subj}".
Your task is to grade and provide rigorous, highly specific, actionable feedback on the student's essay.

GRADE LEVEL CALIBRATION: The student is in Grade: ${gradeLevel}. Calibrate your explanations, tone, and examples so they are encouraging, academically rigorous, and crystal-clear.

CRITICAL GRADING RULES (STRICT COMPLIANCE REQUIRED):
1. OFFICIAL RUBRIC SCORE HEADER:
${rubricInstructions}

2. NO WALL OF TEXT (CATEGORIZED POINT DEDUCTION ANALYSIS):
Under "POINT DEDUCTION ANALYSIS", you MUST break down the score category by category using clean bullet points. For every single category where full points were NOT awarded, explicitly explain the exact deficiency in 1-2 sharp sentences.
${pointDeductionTemplate}

3. ZERO-TOLERANCE MECHANICAL, PUNCTUATION & HOMOPHONE AUDIT:
Under "GRAMMAR, MECHANICS & POLISH", you MUST actively detect and explicitly list EVERY mechanical flaw in the essay, including:
- Comma splices, run-on sentences, missing apostrophes, and punctuation errors.
- Homophone confusion (e.g., "there" vs. "their", "affect" vs. "effect", "your" vs. "you're", "its" vs. "it's").
- Subject-verb disagreement and tense shifts.
NEVER write vague placeholders like "minor word choice issues." You MUST quote the exact erroneous sentence/phrase from the essay and provide the exact corrected sentence!

4. STRUCTURED OUTPUT FORMAT:
Analyze the provided essay and output your response strictly in the following format:

${scoreHeader}

### POINT DEDUCTION ANALYSIS
${pointDeductionTemplate}

### STRENGTHS
- [1-2 sentences highlighting a strong conceptual or stylistic element of the essay with specific examples]

### AREAS FOR IMPROVEMENT
1. [First high-priority structural or argument improvement with actionable advice]
2. [Second high-priority improvement with actionable advice]

### GRAMMAR, MECHANICS & POLISH
[If errors are found, list each one clearly as follows:]
1. [Error Name, e.g. Comma Splice / Homophone Typo / Subject-Verb Agreement]
   - Original: "[Exact quote from student essay]"
   - Correction: "[Exact corrected sentence]"
   - Why: [1 sentence explaining the rule]
[If the essay is mechanically flawless, write: "Zero mechanical or grammatical errors detected. Outstanding prose precision."]

### OVERALL VERDICT
[A supportive, motivating 2-sentence summary providing a clear roadmap for their next revision.]`;

    const originalModel = "gemini-3.6-flash";
    let modelsToTry = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
      "gemini-3.6-flash"
    ];

    const now = Date.now();
    const activeModels: string[] = [];
    const backburnerModels: string[] = [];

    for (const m of modelsToTry) {
      const lastLimited = rateLimitedModels[m] || 0;
      // Keep on backburner for 1 hour to handle daily/frequent free-tier limits
      if (now - lastLimited < 3600000) {
        backburnerModels.push(m);
      } else {
        activeModels.push(m);
      }
    }

    if (activeModels.length > 0) {
      modelsToTry = [...activeModels, ...backburnerModels];
    }

    // Build contents payload with optional images
    const contentParts = [];
    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (!img) continue;
        const parts = img.split(',');
        const base64Data = parts[1] || img;
        const mimeType = parts[0]?.split(';')[0]?.split(':')[1] || 'image/jpeg';
        contentParts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }
    }
    const targetText = text || "Please read the student's handwritten or typed essay from the attached image(s) and grade it strictly according to the rubric.";
    contentParts.push({ text: targetText });

    let streamResponse = null;
    let lastError: any = null;
    let anyQuotaExceeded = false;

    for (const model of modelsToTry) {
      try {
        streamResponse = await aiClient.models.generateContentStream({
          model,
          contents: { parts: contentParts },
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.15,
            maxOutputTokens: 8192
          }
        });
        break; // Successfully got the stream
      } catch (err: any) {
        lastError = err;
        const errStr = String(err.message || err);

        const isRateLimitOrQuota = errStr.includes("429") ||
          errStr.includes("quota") ||
          errStr.includes("RESOURCE_EXHAUSTED") ||
          errStr.includes("resource_exhausted") ||
          errStr.includes("limit");

        if (isRateLimitOrQuota) {
          console.warn(`[grade-essay stream] Model ${model} hit rate-limit or quota constraint:`, errStr);
          lastQuotaExceededTime = Date.now();
          rateLimitedModels[model] = Date.now();
          anyQuotaExceeded = true;
          // Continue to next model
          continue;
        } else {
          console.error(`[grade-essay stream] Model ${model} failed:`, errStr);
        }
      }
    }

    // Set streaming headers
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!streamResponse) {
      if (anyQuotaExceeded) {
        res.write("The Gemini API is currently experiencing rate limits. Please try again in 60 seconds.");
      } else {
        res.write("AI generation failed. Please try again or provide a shorter prompt.");
      }
      res.end();
      return;
    }

    for await (const chunk of streamResponse) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }
    res.end();
  } catch (error: any) {
    console.error("Essay Grader error:", error);

    const errorStr = String(error.message || error);
    const isQuotaError = errorStr.includes("429") ||
      errorStr.includes("quota") ||
      errorStr.includes("RESOURCE_EXHAUSTED");

    if (!res.headersSent) {
      if (isQuotaError) {
        res.status(429).json({
          error: "GEMINI_QUOTA_EXHAUSTED",
          message: "The Gemini API is currently experiencing rate limits. Please try again in 60 seconds."
        });
      } else {
        res.status(500).json({ error: error.message || "Failed to grade essay" });
      }
    } else {
      res.end();
    }
  }
});

app.post("/api/scan-essay", upload.single("image"), async (req, res) => {
  try {
    const { gradeLevel } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "No image provided" });
    }
    const aiClient = getAI();

    const imagePart = {
      inlineData: {
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64"),
      },
    };

    const response = await safeGenerateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          parts: [
            imagePart,
            { text: "Transcribe the handwritten text from this essay image perfectly. Return ONLY the transcribed text. Do not add any conversational filler, intro, outro, or formatting annotations. Keep paragraphs intact as written." }
          ]
        }
      ]
    });

    const text = response.text || "";
    res.json({ text: text.trim() });
  } catch (error: any) {
    console.error("OCR Error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe image" });
  }
});

app.post("/api/grade-frq", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image provided. Please capture or upload an FRQ answer photo." });
    }

    const imagePart = {
      inlineData: {
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64"),
      },
    };

    const systemPrompt = `You are a Senior College Board AP Chief Reader, Lead Exam Table Leader, and Master Academic Auditor.
Your job is to rigorously evaluate uploaded photos for AP Free Response Questions (FRQ) and student handwritten STEM/academic solutions with the authoritative standards of an official AP exam table leader.

=======================================================
MANDATORY STEP 1: STRICT OPTICAL VERIFICATION (VERIFY FIRST!)
=======================================================
Before awarding ANY scores or generating rubrics, carefully examine the physical content of the image.

REJECTION RULE (CRITICAL):
You MUST immediately REJECT the image if:
1. NON-ACADEMIC / IRRELEVANT: The photo contains people, selfies, faces, rooms, furniture, vehicles, animals/pets, food, plants, memes, app screenshots, UI graphics, logos, blank paper, or non-educational objects.
2. MULTIPLE CHOICE QUESTION (MCQ): The photo depicts an objective multiple-choice question with answer options (A, B, C, D) or bubble answer sheets.

IF REJECTED:
Set:
- "isValidAcademicAnswer": false
- "verificationVerdict": "REJECT_NOT_AN_ANSWER" (or "REJECT_MCQ_NOT_ALLOWED" if MCQ)
- "errorCode": "NO_ACADEMIC_CONTENT" (or "MCQ_DETECTED")
- "errorMessage": "No valid academic question or student answer was detected in this photo." (or "Multiple Choice Question (MCQ) detected. FRQ Grader strictly evaluates subjective Free Response Questions only.")
- "detectionReason": Provide a direct, concise description of what was physically identified in the photo (e.g. "The uploaded photo depicts a person / room / non-academic item rather than academic exam work.").
- "suggestion": "Please take a clear photo of an academic exam question (FRQ) or your handwritten student answer sheet."
- Set: "totalPointsEarned": 0, "totalPointsPossible": 0, "predictedAPScale": 0, "evaluationSteps": []

ACCEPTANCE CRITERIA:
Accept the image ONLY if it contains:
1. "subjective_frq_solution": An authentic handwritten (or typed) student response solving an academic problem with equations, formulas, calculations, or explanatory text.
2. "subjective_frq_question": A genuine printed or written academic exam problem statement from a textbook, workbook, or past AP exam paper (without student answer).
3. "question_and_answer": A printed question with student's handwritten work below it.

=======================================================
EVALUATION PROTOCOL FOR VALID SUBMISSIONS:
=======================================================
- Grade strictly according to official College Board AP Scoring Guidelines with the "NO WORK, NO CREDIT" rule.
- All mathematical expressions, formulas, variables ($x$, $y$, $t$), derivatives, integrals, limits, equations, and units MUST be wrapped in KaTeX math delimiters ($...$ for inline or $$...$$ for display).
- Break down grading into official rubric parts/steps: Part (a), Part (b), etc.
- Award pointsEarned (0 to pointsPossible) for each step with clear rubric criteria, student work evaluated, and reader feedback.
- If it is a question prompt (textbook question without student work): award 0 points earned, show total points possible, provide full model solutions for each step, and Chief Reader advice.
- Provide professional, concise Chief Reader diagnostic commentary without boilerplate or filler text.

Return ONLY valid raw JSON conforming strictly to this schema:
{
  "opticalInspection": {
    "visibleTextSummary": "Summary of all text/symbols physically visible in image",
    "imageMedium": "printed_book_or_test_paper" | "notebook_page" | "hybrid_exam_sheet" | "digital_screen_or_graphic" | "non_educational_object",
    "questionType": "subjective_frq_question" | "subjective_frq_solution" | "mcq_or_objective_question" | "non_academic",
    "isHandwrittenExamSolution": boolean,
    "verdict": "GENUINE_EXAM_QUESTION" | "GENUINE_EXAM_ANSWER" | "REJECT_MCQ_NOT_ALLOWED" | "REJECT_NOT_AN_ANSWER",
    "verdictReason": "Clear explanation of classification"
  },
  "verificationVerdict": "GENUINE_EXAM_QUESTION" | "GENUINE_EXAM_ANSWER" | "REJECT_MCQ_NOT_ALLOWED" | "REJECT_NOT_AN_ANSWER",
  "submissionMode": "question_prompt" | "student_answer" | "question_and_answer" | "mcq_question" | "non_academic",
  "questionType": "subjective_frq_question" | "subjective_frq_solution" | "mcq_or_objective_question" | "non_academic",
  "isValidAcademicAnswer": boolean,
  "detectedContentType": "printed_frq_question" | "handwritten_student_work" | "mcq_or_objective_question" | "app_logo_or_graphic" | "random_object" | "blank_or_unreadable",
  "hasStudentHandwriting": boolean,
  "errorCode": "MCQ_DETECTED" | "NO_ACADEMIC_CONTENT" | "NO_STUDENT_WORK_DETECTED",
  "errorMessage": "Clear message if rejected",
  "detectionReason": "Detailed explanation of what was detected",
  "suggestion": "Actionable next step",
  
  // Populated when isValidAcademicAnswer is true:
  "subjectDetected": "AP Course Name (e.g. AP Calculus AB, AP Physics 1)",
  "questionStatement": "Transcribed question text with KaTeX math ($...$)",
  "questionTopic": "Official AP CED Topic Name",
  "transcribedHandwriting": "Transcribed student work with KaTeX math (if student answer)",
  "totalPointsEarned": 0,
  "totalPointsPossible": 9,
  "predictedAPScale": 5,
  "predictedAPScaleLabel": "AP Score 5" | "Official AP Rubric & Model Solution Benchmark",
  "evaluationSteps": [
    {
      "stepTitle": "Part (a): Derivative / Equation (2 Points)",
      "pointsEarned": 2,
      "pointsPossible": 2,
      "criteria": "Official College Board scoring criteria with KaTeX math",
      "workEvaluated": "Official Model Solution or Student Work Evaluated with KaTeX math",
      "feedback": "Chief Reader feedback with KaTeX math",
      "status": "full" | "partial" | "zero"
    }
  ],
  "chiefReaderSummary": "High-level Chief Reader diagnostic summary and exam strategy",
  "keyStrengths": [
    "Key conceptual technique demonstrated"
  ],
  "keyMissedOpportunities": [
    "Common student pitfall or trap on this question type"
  ],
  "howToGetFullPoints": [
    "Actionable exam day tip to secure maximum points"
  ]
}`;

    const response = await safeGenerateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            imagePart,
            { text: systemPrompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      },
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const rawText = response.text || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(repairJsonString(rawText));
    } catch (parseErr) {
      console.warn("[/api/grade-frq] Direct JSON parse failed, extracting bracketed JSON:", parseErr);
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(repairJsonString(match[0]));
      } else {
        throw new Error("Invalid grading format received from AI evaluation engine.");
      }
    }

    // Programmatic Gatekeeper: Strict Verification Defense in Depth
    const isMCQ = 
      parsed.detectedContentType === 'mcq_or_objective_question' ||
      parsed.detectedContentType === 'mcq_or_objective_test' ||
      parsed.submissionMode === 'mcq_question' ||
      parsed.questionType === 'mcq_or_objective_question' ||
      parsed.opticalInspection?.questionType === 'mcq_or_objective_question' ||
      parsed.verificationVerdict === 'REJECT_MCQ_NOT_ALLOWED' ||
      parsed.errorCode === 'MCQ_DETECTED';

    const isNonAcademic =
      parsed.detectedContentType === 'app_logo_or_graphic' ||
      parsed.detectedContentType === 'random_object' ||
      parsed.detectedContentType === 'blank_or_unreadable' ||
      parsed.submissionMode === 'non_academic' ||
      parsed.questionType === 'non_academic' ||
      parsed.opticalInspection?.questionType === 'non_academic' ||
      parsed.verificationVerdict === 'REJECT_NOT_AN_ANSWER' ||
      parsed.errorCode === 'NO_ACADEMIC_CONTENT';

    if (isMCQ) {
      parsed.isValidAcademicAnswer = false;
      parsed.hasStudentHandwriting = false;
      parsed.totalPointsEarned = 0;
      parsed.totalPointsPossible = 0;
      parsed.predictedAPScale = 0;
      parsed.predictedAPScaleLabel = "Not Scored (MCQ)";
      parsed.evaluationSteps = [];
      parsed.parts = [];
      parsed.errorCode = "MCQ_DETECTED";
      parsed.errorMessage = "Multiple Choice Question (MCQ) detected. The FRQ Grader strictly evaluates subjective Free Response Questions only.";
      parsed.detectionReason = parsed.detectionReason || "The uploaded image contains multiple choice questions or options (A, B, C, D) rather than subjective problem solving.";
      parsed.suggestion = "For multiple-choice questions, please use the Quiz / Practice feature. The FRQ Grader is exclusively for subjective free-response questions and solutions.";
    } else if (isNonAcademic || parsed.isValidAcademicAnswer === false) {
      parsed.isValidAcademicAnswer = false;
      parsed.hasStudentHandwriting = false;
      parsed.totalPointsEarned = 0;
      parsed.totalPointsPossible = 0;
      parsed.predictedAPScale = 0;
      parsed.predictedAPScaleLabel = "Not Scored";
      parsed.evaluationSteps = [];
      parsed.parts = [];
      parsed.errorCode = parsed.errorCode || "NO_ACADEMIC_CONTENT";
      parsed.errorMessage = parsed.errorMessage || "No valid academic question or student answer was detected in this photo.";
      parsed.detectionReason = parsed.detectionReason || parsed.opticalInspection?.verdictReason || "The image does not contain an authentic academic exam question or student solution.";
      parsed.suggestion = parsed.suggestion || "Please take a clear photo of an academic exam question (FRQ) or your handwritten student answer sheet.";
    } else {
      // Valid academic question or student answer
      parsed.isValidAcademicAnswer = true;
      const isQuestionPrompt =
        parsed.submissionMode === 'question_prompt' ||
        parsed.questionType === 'subjective_frq_question' ||
        parsed.detectedContentType === 'printed_frq_question' ||
        parsed.verificationVerdict === 'GENUINE_EXAM_QUESTION';

      if (isQuestionPrompt) {
        parsed.submissionMode = 'question_prompt';
        if (!parsed.predictedAPScaleLabel) {
          parsed.predictedAPScaleLabel = "Official AP Rubric & Model Solution Benchmark";
        }
      } else {
        parsed.submissionMode = parsed.submissionMode || 'student_answer';
      }

      // Ensure evaluationSteps and parts compatibility
      if (parsed.evaluationSteps && Array.isArray(parsed.evaluationSteps)) {
        parsed.parts = parsed.evaluationSteps.map((s: any) => ({
          ...s,
          part: s.stepTitle || s.part || "Evaluation Step"
        }));
      } else if (parsed.parts && Array.isArray(parsed.parts)) {
        parsed.evaluationSteps = parsed.parts.map((p: any) => ({
          ...p,
          stepTitle: p.part || p.stepTitle || "Evaluation Step"
        }));
      }
    }

    res.json(parsed);
  } catch (error: any) {
    console.error("[/api/grade-frq] Error:", error);
    res.status(500).json({ error: error.message || "Failed to grade FRQ response" });
  }
});

app.post("/api/scan-images", upload.array("images", 5), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }

    const imageParts = files.map(file => ({
      inlineData: {
        mimeType: file.mimetype,
        data: file.buffer.toString("base64"),
      },
    }));

    const response = await safeGenerateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          parts: [
            ...imageParts,
            { text: "Transcribe the handwritten and printed text from these images perfectly, preserving their chronological page order. Return ONLY the combined transcribed text. Do not add any conversational filler, intro, outro, or formatting annotations. Keep paragraphs intact as written." }
          ]
        }
      ]
    });

    const text = response.text || "";
    res.json({ text: text.trim() });
  } catch (error: any) {
    console.error("Multimodal OCR Error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe images" });
  }
});

app.post("/api/generate-flashcards", async (req, res) => {
  try {
    const text = req.body.text || req.body.topic || req.body.content || "";
    const gradeLevel = req.body.gradeLevel || req.body.userGrade;
    const count = req.body.count;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text or topic" });
    }

    const requestedCount = Math.min(Math.max(parseInt(count) || 10, 1), 30);
    const aiClient = getAI();

    const systemInstruction = `Act as an Elite Cognitive Scientist and Active Recall Specialist.
Your mission is to generate exactly ${requestedCount} high-yield revision flashcards for the provided text or academic topic.

CRITICAL ACTIVE RECALL & CONCISE LENGTH RULES:
1. PUNCHY ACTIVE RECALL QUESTIONS: The 'question' must be direct, crisp, and test a single core mechanism, formula, definition, historical milestone, or concept.
2. STRICT 15 TO 25 WORDS ANSWER CONSTRAINT: Every 'answer' MUST be strictly concise, punchy, and between 15 to 25 words max. It must be an active recall mnemonic, definition, or key formula concept designed for rapid revision. NEVER output long multi-sentence paragraphs.
3. 100% COMPLETE THOUGHTS: The 15-25 word answer must be grammatically complete and self-contained (no trailing '...', no chopped clauses).
4. LATEX & CODE: If there are formulas, wrap in LaTeX ($...$). If coding/HTML tags, wrap in backticks (\`<div>\`).

CRITICAL OUTPUT FORMAT:
You must output ONLY a valid JSON array of objects. Do not wrap in markdown quotes.

Format:
[
  {
    "question": "What is the primary function of mitochondria in eukaryotic cells?",
    "answer": "Mitochondria generate cellular energy by converting glucose and oxygen into ATP through oxidative phosphorylation and cellular respiration."
  },
  {
    "question": "What is the key principle of Newton's Third Law of Motion?",
    "answer": "Every interacting force creates an equal and opposite reaction acting simultaneously on two distinct interacting physical objects."
  }
]`;

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: `Generate exactly ${requestedCount} high-yield active recall flashcards with answers strictly between 15 and 25 words from this text or topic:\n\n${text}` }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        temperature: 0.2
      }
    });

    let outputText = response.text || "[]";
    res.json({ flashcards: safeParseJSON(outputText, 'array') });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Flashcards quota exceeded:", error.message);
      return res.json({
        flashcards: [
          {
            question: "⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded",
            answer: "The Gemini API has exceeded its rate limit. Please wait 60 seconds and try again, or check your API key in settings."
          }
        ]
      });
    }
    console.error("Flashcards error:", error);
    res.status(500).json({ error: error.message || "Failed to generate flashcards" });
  }
});

async function robustFetchYoutubeTranscript(videoId: string): Promise<any[]> {
  console.log(`[robustFetchYoutubeTranscript] Fetching transcript for video: ${videoId}`);

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  ];
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

  let captionTracks: any[] = [];
  let lastError: any = null;

  // Method 1: Try InnerTube API with multiple client options for maximum resilience
  const innerTubeClients = [
    {
      name: 'ANDROID',
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
        }
      },
      userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
    },
    {
      name: 'WEB',
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240228.01.00',
          hl: 'en',
          gl: 'US'
        }
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    {
      name: 'IOS',
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: '19.29.1',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '17.5.1',
          hl: 'en',
          gl: 'US'
        }
      },
      userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5_1 like Mac OS X; en_US)'
    },
    {
      name: 'TVHTML5',
      context: {
        client: {
          clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
          clientVersion: '1.0',
          hl: 'en',
          gl: 'US'
        }
      },
      userAgent: 'Mozilla/5.0 (Chromecast; PlaybackEngine) AppleWebKit/537.36 (KHTML, like Gecko) Kit/6.0.211116.14 Chrome/94.0.4606.111 Safari/537.36'
    }
  ];

  for (const clientConfig of innerTubeClients) {
    try {
      const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
      console.log(`[robustFetch] Trying InnerTube API (${clientConfig.name} client) for videoId: ${videoId}...`);

      const resp = await fetchWithTimeout(INNERTUBE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': clientConfig.userAgent,
        },
        body: JSON.stringify({
          context: clientConfig.context,
          videoId: videoId,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(tracks) && tracks.length > 0) {
          captionTracks = tracks;
          console.log(`[robustFetch] Successfully fetched ${captionTracks.length} caption tracks from InnerTube API (${clientConfig.name})`);
          break;
        } else {
          console.warn(`[robustFetch] InnerTube API (${clientConfig.name}) response lacked captionTracks. Playability:`, data?.playabilityStatus?.status);
        }
      } else {
        console.warn(`[robustFetch] InnerTube API (${clientConfig.name}) returned status: ${resp.status}`);
      }
    } catch (err: any) {
      console.error(`[robustFetch] InnerTube API (${clientConfig.name}) failed:`, err.message || err);
      lastError = err;
    }
  }

  // Method 2: Try Web Page Scraping with robust parser
  if (captionTracks.length === 0) {
    try {
      console.log(`[robustFetch] Trying Web Page HTML scraping for videoId: ${videoId}...`);
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const resp = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': randomUserAgent,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!resp.ok) {
        throw new Error(`Web page request failed with status: ${resp.status}`);
      }

      const body = await resp.text();
      if (body.includes('class="g-recaptcha"')) {
        throw new Error("YouTube blocks request with Recaptcha (Too Many Requests / 429)");
      }

      // Try to parse ytInitialPlayerResponse using multiple prefixes
      let playerResponse: any = null;
      const prefixes = [
        "var ytInitialPlayerResponse = ",
        "window['ytInitialPlayerResponse'] = ",
        "window.ytInitialPlayerResponse = ",
        "ytInitialPlayerResponse = "
      ];

      for (const prefix of prefixes) {
        const startIndex = body.indexOf(prefix);
        if (startIndex !== -1) {
          const jsonStart = startIndex + prefix.length;
          let depth = 0;
          for (let i = jsonStart; i < body.length; i++) {
            if (body[i] === '{') depth++;
            else if (body[i] === '}') {
              depth--;
              if (depth === 0) {
                try {
                  playerResponse = JSON.parse(body.slice(jsonStart, i + 1));
                  break;
                } catch (_) { }
              }
            }
          }
          if (playerResponse) break;
        }
      }

      const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        captionTracks = tracks;
        console.log(`[robustFetch] Successfully fetched ${captionTracks.length} caption tracks from Web Page`);
      } else {
        console.warn(`[robustFetch] No caption tracks found in ytInitialPlayerResponse. Playability:`, playerResponse?.playabilityStatus?.status);
      }
    } catch (err: any) {
      console.error(`[robustFetch] Web Page scraping failed with error:`, err);
      lastError = err;
    }
  }

  if (captionTracks.length === 0) {
    throw lastError || new Error("No caption tracks found or available on this video. Please ensure Closed Captions (CC) are enabled.");
  }

  // Choose the best caption track
  // Logic: First look for English ('en'), then any English variant (starts with 'en'), then any available language track
  let selectedTrack = captionTracks.find(t => t.languageCode === 'en');
  if (!selectedTrack) {
    selectedTrack = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en'));
  }
  if (!selectedTrack) {
    // Select the first available track
    selectedTrack = captionTracks[0];
    console.log(`[robustFetch] English transcript not found. Falling back to first available language: ${selectedTrack.languageCode}`);
  } else {
    console.log(`[robustFetch] Selected language track: ${selectedTrack.languageCode}`);
  }

  const transcriptURL = selectedTrack.baseUrl;
  if (!transcriptURL) {
    throw new Error("Selected caption track has no baseUrl");
  }

  // Fetch the actual transcript XML
  console.log(`[robustFetch] Fetching transcript XML from: ${transcriptURL}`);
  const transcriptResponse = await fetchWithTimeout(transcriptURL, {
    headers: {
      'User-Agent': randomUserAgent,
    },
  });

  if (!transcriptResponse.ok) {
    throw new Error(`Failed to fetch transcript XML, status: ${transcriptResponse.status}`);
  }

  const xmlText = await transcriptResponse.text();

  // Use YoutubeTranscript's internal parser if available, or write/use a robust local parser
  try {
    const results = (YoutubeTranscript as any).parseTranscriptXml(xmlText, selectedTrack.languageCode);
    if (results && results.length > 0) {
      return results;
    }
  } catch (parseErr) {
    console.error("[robustFetch] YoutubeTranscript.parseTranscriptXml failed, using local fallback parser:", parseErr);
  }

  // Local fallback XML parser
  const results: any[] = [];
  const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;

  let match;
  while ((match = pRegex.exec(xmlText)) !== null) {
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const inner = match[3];
    let text = '';
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/g, '');
    }
    text = decodeEntities(text).trim();
    if (text) {
      results.push({
        text,
        duration: durMs,
        offset: startMs,
        lang: selectedTrack.languageCode,
      });
    }
  }

  if (results.length > 0) return results;

  const classicResults = [...xmlText.matchAll(RE_XML_TRANSCRIPT)];
  return classicResults.map((res) => ({
    text: decodeEntities(res[3]),
    duration: parseFloat(res[2]) * 1000,
    offset: parseFloat(res[1]) * 1000,
    lang: selectedTrack.languageCode,
  }));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

app.post("/api/youtube-summary", async (req, res) => {
  try {
    const { url, followUp, previousSummary, gradeLevel } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Missing YouTube URL" });
    }

    let videoId = "";
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === 'youtu.be') {
        videoId = parsedUrl.pathname.slice(1);
      } else if (parsedUrl.hostname.includes('youtube.com')) {
        if (parsedUrl.pathname.startsWith('/shorts/')) {
          videoId = parsedUrl.pathname.split('/')[2];
        } else {
          videoId = parsedUrl.searchParams.get('v') || "";
        }
      }
    } catch (e) {
      // Ignored
    }

    if (!videoId) {
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
      videoId = match ? match[1] : url;
    }

    let title = "";
    let authorName = "";
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
      const oembedRes = await fetchWithTimeout(oembedUrl);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        title = oembedData.title || "";
        authorName = oembedData.author_name || "";
      }
    } catch (err) {
      console.error("Failed to fetch oembed details", err);
    }

    const fileHash = crypto.createHash("sha256").update(url).digest("hex");
    if (summaryCache.has(fileHash) && !followUp) {
      return res.json({
        text: summaryCache.get(fileHash),
        title: title || "YouTube Video",
        authorName: authorName || "",
        videoId: videoId
      });
    }

    // Handle interactive follow-up suggestions
    if (followUp) {
      const systemInstruction = `You are an expert study coach. The student is asking a follow-up question or requesting an interactive study enhancement based on a previous YouTube video summary.
Your task is to fulfill the request in a highly informative, educational, and engaging way.
Keep your response concise, structured with headings, bullet points, and highlight key terms using markdown.

1. TIMESTAMPS INTEGRATION:
If any specific parts of the video are mentioned, or if referring to specific events, include relevant timestamps formatted exactly as **⏱️ MM:SS** (e.g. **⏱️ 04:20**).

2. INTERACTIVE STUDY SUGGESTIONS:
At the very end of your response, you MUST output 2-3 new interactive follow-up study suggestions formatted exactly as \`[SUGGESTION: ...]\`, e.g.:
\`[SUGGESTION: Explain key concepts simpler]\`
\`[SUGGESTION: Test me with 3 practice questions]\`
\`[SUGGESTION: Generate a list of key terms]\``;

      const promptText = `Previous Summary:
${previousSummary}

Student's Request: "${followUp}"`;

      const response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: { parts: [{ text: promptText }] },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] }
        }
      });

      const outputText = response.text || "No response generated.";
      return res.json({
        text: outputText,
        title: title || "YouTube Video",
        authorName: authorName || "",
        videoId: videoId
      });
    }

    let transcriptText = "";
    try {
      console.log(`Attempting to fetch transcript for video: ${videoId}`);
      const transcript = await robustFetchYoutubeTranscript(videoId);

      if (!transcript || transcript.length === 0) {
        throw new Error("No transcript data returned");
      }

      console.log(`Successfully fetched transcript for ${videoId} using robust fetcher`);

      transcriptText = transcript.map(t => {
        const totalSec = Math.floor((t.offset || 0) / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        const timestampStr = `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}]`;
        return `${timestampStr} ${t.text}`;
      }).join(' ');

      // Limit to ~250k characters to prevent timeouts on massive videos
      if (transcriptText.length > 250000) {
        transcriptText = transcriptText.substring(0, 250000) + "... [transcript truncated for length]";
      }

      // If after processing, it's still too short, trigger fallback
      if (transcriptText.trim().split(/\s+/).length < 20) {
        throw new Error("Transcript too short for meaningful summary");
      }
    } catch (e: any) {
      console.warn("YouTube transcript extraction unavailable, returning strict fallback:", e.message || e);
      return res.status(400).json({
        error: "⚠️ I couldn't read the subtitles for this video. Please try pasting the video's transcript directly into the Text Note-Maker."
      });
    }

    const transcriptWordCount = transcriptText.trim().split(/\s+/).filter(w => w.length > 0).length;
    if (transcriptWordCount < 50) {
      return res.status(400).json({
        error: "⚠️ I couldn't read the subtitles for this video. Please try pasting the video's transcript directly into the Text Note-Maker."
      });
    }

    const systemInstruction = `You are an AI assistant tasked with creating high-yield study notes from YouTube videos. Once you have the transcript, create a structured summary with clear headings, bullet points, and key takeaways.
    
1. TIMESTAMPS INTEGRATION:
For each major bullet point, key concept, or important takeaway, locate the closest timestamp in the provided text (formatted as [MM:SS]) and prepend it to the bullet point styled exactly as **⏱️ MM:SS** (e.g., **⏱️ 04:20**). Do not guess timestamps if none are in the transcript, but if they are, use them.

2. INTERACTIVE STUDY SUGGESTIONS:
At the very end of your notes, always include 3 helpful interactive study suggestions wrapped in brackets like \`[SUGGESTION: ...]\`, for example:
\`[SUGGESTION: Explain key concepts simpler]\`
\`[SUGGESTION: Give me a quick 3-question quiz]\`
\`[SUGGESTION: Deep dive into the first half]\``;

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: transcriptText }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] }
      }
    });

    const outputText = response.text || "No summary generated.";
    summaryCache.set(fileHash, outputText);
    res.json({
      text: outputText,
      title: title || "YouTube Video",
      authorName: authorName || "",
      videoId: videoId
    });
  } catch (error: any) {
    if (error.isRateLimit || error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("YouTube summary quota exceeded:", error.message);
      return res.status(429).json({
        isRateLimit: true,
        error: "System is currently busy helping many students! 📚\nWe're processing your request as fast as possible. Please wait for 60 seconds and try again, or take a quick stretch break. Your learning journey is our priority!"
      });
    }
    console.error("YouTube summary error:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary" });
  }
});

app.post("/api/generate-content", async (req, res) => {
  try {
    const { topic, type, tone = "Academic", format = "Standard", gradeLevel } = req.body;

    const wordCount = topic ? topic.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

    if (!topic || !type) {
      return res.status(400).json({ error: "Missing topic or type" });
    }

    const aiClient = getAI();

    let formatSpecificRules = "";
    if (type.toUpperCase() === "ESSAY") {
      formatSpecificRules = `
- ESSAY SCHOLARSHIP & RIGOR: Avoid the simplistic 5-paragraph template. Synthesize theoretical frameworks, evaluate counter-arguments, and present persuasive, evidence-based academic reasoning.
- MANDATORY IN-TEXT CITATIONS (APA / MLA / ACADEMIC): You MUST integrate authentic parenthetical in-text citations throughout the body paragraphs for every factual claim, statistical figure, scientific definition, or theoretical argument (e.g., (Author, Year) for APA; (Author Page) for MLA).
- 1-TO-1 CITATION TO REFERENCE MAPPING: Every source listed in the References or Works Cited section at the end of the essay MUST appear at least once as an in-text citation inside the body text. Never produce a detached bibliography.
- TITLE PAGE & SECTION HEADINGS:
  * APA Format: Include a structured APA 7th Edition Title Block at the beginning:
    # [Complete Descriptive Paper Title]
    **Author:** Student Researcher  
    **Affiliation:** Academic Department, [Institution]  
    **Course:** Academic Writing & Research  
    **Instructor:** Course Examiner  
    **Date:** ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}  
    ---
    Use clear markdown headings (## Introduction, ## Critical Analysis, ## Synthesis & Counter-Perspectives, ## Conclusion, ## References).
  * MLA Format: Include standard MLA 9th Edition Header:
    Student Researcher  
    Course Examiner  
    Academic Writing & Research  
    ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}  
    ### [Centered Title of the Essay]  
    ---
    Follow with standard body paragraphs and ## Works Cited.
  * Standard Format: Title at top (# Title), followed by structured introduction, analytical body paragraphs, and conclusion.`;
    } else if (type.toUpperCase() === "BLOG") {
      formatSpecificRules = `
- Ground the text in reality. Use concrete examples, hypothetical case studies, or hard numbers (e.g., specific metrics, benchmarks, case studies).
- Use punchy, scannable paragraphs and Markdown subheadings (###).`;
    } else if (type.toUpperCase() === "POEM") {
      formatSpecificRules = `
- STRICT POEM & STANZA FORMATTING (ZERO PROSE MERGING): If the content type is Poem, you MUST output structured poetic verse with explicit line breaks.
- Separate every stanza with an empty line (\\n\\n).
- Inside each stanza, every single line of poetry MUST end with a newline character (\\n).
- NEVER output continuous prose or block paragraphs for a poem.
- Employ vivid sensory imagery, evocative rhythm, distinct meter, and artistic line breaks.`;
    } else if (type.toUpperCase() === "PARAGRAPH") {
      formatSpecificRules = `
- Deliver a single, highly concentrated, intellectually substantive block of thought without filler fluff.`;
    }

    let toneSpecificRules = "";
    if (tone.toUpperCase() === "ACADEMIC") {
      toneSpecificRules = `
- Maintain extreme objectivity, elevated scholarship, and formal structure.
- Incorporate parenthetical citations logically into every analytical paragraph.
- Synthesize complex mechanisms with authoritative clarity.`;
    } else if (tone.toUpperCase() === "PERSUASIVE") {
      toneSpecificRules = `
- Write from the trenches. Be direct, authoritative, and logic-driven.
- Convince the reader using realistic scenarios, empirical evidence, and sharp logic.`;
    } else if (tone.toUpperCase() === "CREATIVE") {
      toneSpecificRules = `
- "Show, don't tell."
- Focus on emotional resonance, setting the scene, and exploring the human condition.
- Avoid melodrama and clichéd tropes.`;
    } else if (tone.toUpperCase() === "CASUAL") {
      toneSpecificRules = `
- Write like a brilliant mentor or a masterclass article.
- Be relatable, conversational, energetic, and highly engaging.`;
    }

    const systemInstruction = `You are an Elite Academic Author, Senior Essayist, and Master Literary Writer capable of adapting flawlessly to any format and tone. Your primary goal is to generate high-quality, deeply engaging content while strictly adhering to formatting standards and avoiding formulaic "AI-speak."

1. THE GLOBAL ANTI-ROBOT FILTER (Applies to ALL outputs):
- BAN AI CLICHÉS: Never use overused words like "delve," "testament," "realm," "tapestry," "crucial," "foster," or "unassailable." Use natural, precise, and sophisticated vocabulary.
- NO ROBOTIC TRANSITIONS: Eliminate mechanical transitions ("Firstly," "Furthermore," "In conclusion," "Ultimately"). Weave ideas together naturally.
- NO ROBOTIC FILLER: Do not say "Here is your content" or "Certainly". Output ONLY the final content itself.

2. DYNAMIC FORMAT RULES (Adapt based on user's 'Content Type' selection):
${formatSpecificRules}

3. DYNAMIC TONE RULES (Adapt based on user's 'Tone' selection):
${toneSpecificRules}`;

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: `Generate a ${type} in ${format} format with a ${tone} tone. Topic: ${topic}` }] },
      config: { 
        systemInstruction: { parts: [{ text: systemInstruction }] },
        maxOutputTokens: 8192,
        temperature: 0.3
      }
    });

    const outputText = response.text || "No content generated.";
    res.json({ text: outputText });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED" || error.message?.includes("quota")) {
      console.warn("Content generation quota exceeded:", error.message);
      return res.status(429).json({ error: "Generation took too long or failed due to high demand. Please try again in 60 seconds." });
    }
    console.error("Content generation error:", error);
    res.status(500).json({ error: error.message || "Generation took too long or failed. Please try again or provide a shorter prompt." });
  }
});

app.post("/api/grammar-enhance", async (req, res) => {
  try {
    const { text, mode, gradeLevel, images } = req.body;

    const wordCount = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

    if (!text && (!images || !Array.isArray(images) || images.length === 0)) {
      return res.status(400).json({ error: "Missing text or images" });
    }

    const aiClient = getAI();
    const userMode = mode === "academic" ? "academic" : "fix";

    let modeInstruction = "";
    if (userMode === "fix") {
      modeInstruction = `MODE: Fix Grammar Only (Preserves user's original voice)
- Fix all spelling mistakes, grammatical errors, subject-verb agreement issues, punctuation errors, and typos.
- DO NOT rewrite or fundamentally change the user's sentence structure, tone, vocabulary level, or core meaning. Keep it as close to the user's original words as possible, only correcting mistakes and very minor awkward phrasing.`;
    } else {
      modeInstruction = `MODE: Academic Rewrite (Elevates vocabulary and flow)
- Elevate vocabulary, academic phrasing, structures, flow, and clarity.
- Make it read like a well-crafted essay, scientific article, or formal scholarship submission.
- Ensure professional transitions and academic style. Use high-yield educational adjustments.`;
    }

    const systemInstruction = `You are an Elite Academic Writer, Expert English Editor, and Master Study Coach. Your job is to proofread, correct, and enhance the provided text based on the requested mode.

${modeInstruction}

CRITICAL OUTPUT FORMAT:
You must return your output strictly in JSON format matching the following schema. Do not output any markdown formatting, wrappers, or conversational text outside the JSON.

{
  "correctedText": "The fully polished and corrected text matching the chosen mode.",
  "fixes": [
    "A concise, educational bullet point of what was fixed and why (e.g., 'Corrected spelling of \"milks\" to \"milk\" because \"milk\" is an uncountable noun.'). Limit to 3-6 key educational fixes."
  ]
}`;

    // Build content payload with optional images
    const contentParts = [];
    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (!img) continue;
        const parts = img.split(',');
        const base64Data = parts[1] || img;
        const mimeType = parts[0]?.split(';')[0]?.split(':')[1] || 'image/jpeg';
        contentParts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }
    }
    const targetText = text || "Please read the text inside the attached image(s), correct any grammatical errors, and enhance it according to the chosen mode.";
    contentParts.push({ text: targetText });

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: { parts: contentParts },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });

    const outputRaw = response.text || "{}";
    let correctedText = "";
    let fixes: string[] = [];

    try {
      const parsed = safeParseJSON(outputRaw, 'object');
      correctedText = parsed.correctedText || parsed.text || outputRaw;
      fixes = Array.isArray(parsed.fixes) ? parsed.fixes : [];
    } catch (parseError) {
      console.log("[grammar-enhance] Failed to parse JSON, falling back to raw output", parseError);
      correctedText = outputRaw;
      fixes = ["Reviewed grammar, spelling, and phrasing structures."];
    }

    res.json({ text: correctedText, fixes });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Grammar enhance quota exceeded:", error.message);
      return res.status(429).json({ error: "The Gemini API is currently experiencing rate limits. Please try again in 60 seconds." });
    }
    console.error("Grammar enhance error:", error);
    res.status(500).json({ error: error.message || "Failed to enhance grammar" });
  }
});


app.post("/api/extract-file-text", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }
    let extractedText = "";
    if (req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf")) {
      try {
        const pdfModule: any = await import("pdf-parse/lib/pdf-parse.js");
        const parsePdf = pdfModule.default || pdfModule;
        const pdfData = await parsePdf(req.file.buffer, { max: 60 });
        if (pdfData.numpages > 60) {
          return res.status(400).json({ error: "PDF document exceeds 60 pages limit. Please upload a shorter document." });
        }
        extractedText = pdfData.text || "";
        if (extractedText && extractedText.length > 500000) { extractedText = extractedText.slice(0, 500000); }
      } catch (parseError: any) {
        return res.status(500).json({ error: "Failed to parse PDF: " + parseError.message });
      }
    } else {
      extractedText = req.file.buffer.toString("utf-8");
    }

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: "Could not extract any readable text from this file." });
    }

    res.json({ text: extractedText.trim() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to extract text from file." });
  }
});

app.post("/api/fetch-url-text", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "No URL provided" });
    }

    const targetUrl = url.trim();
    const scraperUrl = `https://r.jina.ai/${targetUrl}`;

    try {
      const response = await fetchWithTimeout(scraperUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "X-No-Cache": "true"
        }
      });

      if (!response.ok) {
        return res.status(500).json({ error: `Unable to read this link. The website's security is blocking our AI. Please copy and paste the article text directly into the box.` });
      }

      let cleanText = await response.text();

      // Validation Gateway
      const blockedPhrases = ["403 forbidden", "access denied", "robot check", "captcha", "cloudflare"];
      const lowercaseText = cleanText.toLowerCase();
      const isBlocked = blockedPhrases.some(phrase => lowercaseText.includes(phrase));

      if (cleanText.length < 20 || isBlocked) {
        return res.status(400).json({ error: "Unable to read this link. The website's security is blocking our AI. Please copy and paste the article text directly into the box." });
      }

      if (cleanText.length > 60000) {
        cleanText = cleanText.slice(0, 60000) + "...";
      }

      res.json({ text: cleanText.trim() });
    } catch (fetchError) {
      res.status(500).json({ error: "Unable to read this link. The website's security is blocking our AI. Please copy and paste the article text directly into the box." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to retrieve webpage content." });
  }
});


app.post("/api/summarize-text", async (req, res) => {
  try {
    const { text, format, gradeLevel } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

    const wordCount = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

    const aiClient = getAI();
    const summaryFormat = format || "bullet";

    // Additional Validation for Hallucination Prevention
    const blockedPhrases = ["403 forbidden", "access denied", "robot check", "captcha", "cloudflare"];
    const lowercaseText = text.toLowerCase();
    if (text.length < 20 || blockedPhrases.some(p => lowercaseText.includes(p))) {
      return res.json({ text: "Unable to read this link. The website's security is blocking our AI. Please copy and paste the article text directly into the box." });
    }

    let selectedFormatName = "Bullet Points";
    if (summaryFormat === "tldr") {
      selectedFormatName = "Short TL;DR";
    } else if (summaryFormat === "eli5") {
      selectedFormatName = "Explain Like I'm 5";
    }

    const systemInstruction = `SYSTEM INSTRUCTION: EXPERT SUMMARISER


You are an expert academic and professional summarizer. Your task is to extract key information from the provided text and format it STRICTLY according to the user's requested mode.

USER'S REQUESTED FORMAT: ${selectedFormatName}

CRITICAL GLOBAL RULE:
NEVER output a "Wall of Text". Always use proper line breaks and structure.

DYNAMIC FORMATTING RULES:

IF FORMAT IS "Bullet Points":
1. Start with ONE main heading using ## (e.g., ## Key Concepts from the Text).
2. Then break the summary into logical topic sections. Use ### for each section heading.
3. MANDATORY: Under each section heading, EVERY point MUST be on its OWN LINE starting with "- " (standard markdown list).
4. CONCISE: Keep each bullet point under 2 sentences.
5. NO NARRATIVE: Do not write intro or conclusion paragraphs. Start immediately with the main heading.
6. EXAMPLE OF EXPECTED FORMAT:

## Main Topic Summary

### Section One

- First key fact about this section.
- Second key fact about this section.

### Section Two

- First key fact about section two.
- Second key fact about section two.

IF FORMAT IS "Short TL;DR":
1. Provide the absolute bottom-line of the text.
2. Structure it as one short "Executive Summary" paragraph (max 3-4 sentences).
3. Follow it with a "Top 3 Takeaways" numbered list.
4. Keep the tone professional, direct, and time-saving.

IF FORMAT IS "Explain Like I'm 5":
1. Break down complex jargon into grade-school level vocabulary.
2. Use at least one relatable, everyday analogy.
3. Keep the tone extremely warm, engaging, and story-like.
4. Use short paragraphs to make it visually friendly for beginners.

OUTPUT QUALITY RULES:
1. Use ONLY standard markdown: ## headings, ### subheadings, - bullet lists, **bold**, *italic*.
2. Each bullet point MUST be on its OWN separate line. Never put multiple points on the same line.
3. NO LaTeX, no '$', no '$$'. Write math as plain text (e.g., A = P(1 + r/n)^(nt)).
4. Ensure there is a blank line before and after every heading and list block.`;

    // Model fallback chain for text summarize
    const textSumModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
    ];
    let textSummaryResult = "";
    let textSumError: any = null;
    for (const model of textSumModels) {
      try {
        const response = await safeGenerateContent({
          gradeLevel,
          model,
          contents: { parts: [{ text }] },
          config: { systemInstruction: { parts: [{ text: systemInstruction }] }, maxOutputTokens: 8192, temperature: 0.3 }
        });
        textSummaryResult = response.text || "";
        textSumError = null;
        break;
      } catch (err: any) {
        const errStr = String(err.message || err).toLowerCase();
        const isRateLimit = errStr.includes("429") || errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("503") || errStr.includes("overloaded");
        if (isRateLimit) {
          console.warn(`[summarize-text] Model ${model} rate-limited, trying next...`);
          textSumError = err;
          continue;
        }
        throw err;
      }
    }
    if (textSumError && !textSummaryResult) throw textSumError;

    res.json({ text: textSummaryResult });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Text summarize quota exceeded:", error.message);
      return res.json({
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits. Please wait 60 seconds and try again.`
      });
    }
    console.error("Text summarize error:", error);
    res.status(500).json({ error: error.message || "Failed to summarize text." });
  }
});



app.post("/api/generate-questions", async (req, res) => {
  try {
    const topic = req.body.topic || req.body.prompt || req.body.text || "";
    const gradeLevel = req.body.gradeLevel || req.body.userGrade;
    const count = req.body.count;
    const stream = req.body.stream;
    const requestedCount = Math.min(Math.max(parseInt(count) || 5, 1), 15);
    const topicText = topic && topic.trim() ? topic.trim() : `general concepts in ${stream || 'academic subjects'}`;

    const aiClient = getAI();
    
    const systemInstruction = `You are an Elite Academic Advisor, Senior Examiner, and Master Educator.
The user wants to generate high-yield, level-appropriate SUBJECTIVE (open-ended/essay) practice questions along with comprehensive expected answers and examiner marking rubrics for self-evaluation.
Your job is to generate exactly ${requestedCount} subjective practice questions based on the topic and the user's profile.

CRITICAL RULES:
1. STRICT SUBJECTIVE FOCUS: Every single question must be an open-ended, subjective, conceptual, or analytical inquiry. They must require deep explanation, structured essay responses, mathematical proofs, or architectural coding plans.
2. SUB-PART FORMATTING (MANDATORY LINE BREAKS): If a question has sub-parts (e.g., Part A, Part B, (i), (ii)), you MUST separate each sub-part with a double newline '\\n\\n' so each part starts on its own line. NEVER merge multiple parts onto a single continuous line.
3. EXPECTED ANSWER: For each question, provide a complete, high-scoring model answer ('expectedAnswer') in 2-4 comprehensive, elegant, grammatically complete sentences. Use LaTeX ($formula$) for any math or chemical formulas.
4. GRADING RUBRIC / KEYWORDS: For each question, provide an array of 3-5 essential keywords or marking criteria ('keyRubricPoints') that examiners require to award full marks.
5. STRICT JSON OUTPUT: You must output ONLY a valid JSON object containing an array in a key named "questions". Do not wrap the JSON in markdown code blocks like \`\`\`json.

Use this exact JSON structure:
{
  "questions": [
    {
      "question": "Part A: Detail the foundational theoretical principles governing the target topic.\\n\\nPart B: Predict and mathematically/conceptually justify the outcome when conditions or key parameters are altered.",
      "expectedAnswer": "Part A: Exemplary comprehensive explanation with precise terminology and formulas in LaTeX ($...$).\\n\\nPart B: Rigorous multi-step justification explaining mechanisms and causal relationships.",
      "keyRubricPoints": [
        "Accurate identification and definition of core mechanisms",
        "Correct mathematical/scientific equations or proof steps",
        "Clear causal reasoning addressing boundary conditions"
      ]
    }
  ]
}`;

    const avoidList = Array.isArray(req.body.avoidPrompts) ? req.body.avoidPrompts.filter(Boolean).slice(0, 10) : [];
    const avoidDirective = avoidList.length > 0
      ? `\nSTRICT ANTI-REPETITION: Do NOT generate questions similar to these previously answered prompts:\n${avoidList.map((p: string, i: number) => `  [${i+1}] ${p.slice(0, 100)}`).join('\n')}`
      : '';

    let generatedText = "";
    try {
      const response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: { parts: [{ text: `Topic: ${topicText}. Grade Level: ${gradeLevel || '11th Grade (Junior)'}. Academic Stream: ${stream || 'STEM / Engineering'}. Count: Generate exactly ${requestedCount} unique questions with expected answers and rubrics now.${avoidDirective}` }] },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          temperature: 0.75
        }
      });
      generatedText = response.text || "";
    } catch (apiError: any) {
      console.warn("API Error during subjective question generation:", apiError);
      throw apiError;
    }

    const parsed = safeParseJSON(generatedText, 'object');
    if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return res.json({ questions: parsed.questions });
    } else if (Array.isArray(parsed)) {
      return res.json({ questions: parsed });
    }

    throw new Error("Failed to generate a valid subjective questions structure.");

  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({ 
        error: "QUOTA_EXCEEDED",
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("Question generation endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to generate questions" });
  }
});

function getCollegeBoardSubjectGuidelines(subject: string, questionType: 'objective' | 'subjective'): string {
  const s = (subject || '').toLowerCase();
  
  if (s.includes('human geography') || s.includes('aphg')) {
    if (questionType === 'objective') {
      return `AP HUMAN GEOGRAPHY (APHG) EXAM SPECIFICATIONS (College Board CED - #1 Grade 9 AP):
- Target Audience: Grade 9 (Freshman) High School Students. Stimulus-based, testing spatial perspective, geographic patterns, and real-world regional connections across Units 1–7.
- Core Topics:
  1. Thinking Geographically (Geospatial tech [GIS, GPS, remote sensing], scales of analysis [local, regional, national, global], formal/functional/perceptual regions).
  2. Population & Migration (Demographic Transition Model [DTM Stages 1-5], population pyramids, dependency ratios, Malthusian theory, push/pull factors, Ravenstein's laws, refugees/IDPs).
  3. Cultural Patterns & Processes (Hearths, spatial diffusion [contagious, hierarchical, stimulus, relocation], acculturation, assimilation, language families, universalizing vs ethnic religions).
  4. Political Patterns & Processes (Sovereignty, nation-states, stateless nations, supranationalism [UN, EU, NATO], devolution, gerrymandering, boundaries/UNCLOS).
  5. Agriculture & Rural Land-Use (Von Thünen model, Green Revolution, subsistence vs commercial agriculture, intensive vs extensive farming, global supply chains).
  6. Cities & Urban Land-Use (Burgess Concentric Zone, Hoyt Sector, Harris-Ullman Multiple Nuclei, Galactic model, Christaller's Central Place Theory, rank-size rule, primate cities, gentrification, New Urbanism).
  7. Industrial & Economic Development (Wallerstein World Systems [Core/Periphery], Rostow 5 Stages of Economic Growth, Weber Least Cost Theory, HDI, UN SDGs).
- Stimulus Requirement: Ground questions in realistic geographic stimuli (demographic data charts, regional map descriptions, population pyramid profiles, or geographic case studies).
- Distractors: Plausible 9th-grade misconceptions (e.g., confusing environmental determinism with possibilism, confusing hierarchical with contagious diffusion, or misidentifying DTM stages).`;
    } else {
      return `AP HUMAN GEOGRAPHY FREE RESPONSE STANDARDS (College Board CED - 7-Part FRQ):
- Format: Real 7-PART College Board Free Response Questions with parts (A), (B), (C), (D), (E), (F), and (G). Total Points: Exactly 7 Points (1 point per part).
- Official FRQ Types:
  1. Question 1 (No Stimulus): Tests geographic concepts, spatial models, and processes.
  2. Question 2 (One Stimulus): Anchored to a thematic map, demographic chart, or spatial model.
  3. Question 3 (Two Stimuli): Comparative synthesis between two geographic datasets or regions.
- Command Verbs & Scaffolding:
  - "Identify" / "Define" (1-2 sentences stating the specific concept or pattern).
  - "Describe" (Provide relevant characteristics or spatial trends).
  - "Explain" (Must clearly establish cause-and-effect line of reasoning: 'how' or 'why' X causes Y in geographic context).
- Rubric: Exactly 7 points (+1 pt for each part A through G) with crystal-clear scoring criteria and model responses.`;
    }
  }

  if (s.includes('environmental') || s.includes('apes')) {
    if (questionType === 'objective') {
      return `AP ENVIRONMENTAL SCIENCE (APES) EXAM SPECIFICATIONS (College Board CED):
- Target Level: Grade 9-10 introductory environmental lab science. High conceptual clarity, data interpretation, and environmental problem-solving across Units 1–9.
- Core Units:
  1-3. Ecosystems, biogeochemical cycles (carbon, nitrogen, phosphorus, water), trophic cascades, 10% rule, biodiversity, ecosystem services, population ecology (r/K selection, survivorship curves, carrying capacity).
  4-6. Earth systems (soil texture triangle, atmosphere, El Niño), land & water use (Tragedy of the Commons, Green Revolution, irrigation, IPM, CAFOs, mining), energy resources (fossil fuels, nuclear, solar, wind, efficiency).
  7-9. Atmospheric pollution (photochemical smog, acid deposition, thermal inversions), aquatic/terrestrial pollution (eutrophication, biomagnification, LD50, landfills), global change (stratospheric ozone depletion, ocean acidification, climate mitigation).
- Quantitative Reasoning: Include realistic environmental math (Rule of 70, LD50 toxicity, percent change, metric conversions).
- Distractors: Represent common student traps (confusing ozone depletion with global warming, confusing point vs nonpoint pollution).`;
    } else {
      return `AP ENVIRONMENTAL SCIENCE FREE RESPONSE STANDARDS (College Board CED):
- Format: Real 10-POINT multi-part questions with sub-parts (a), (b), (c), (d), (e). Total Points: Exactly 10 Points.
- Official FRQ Archetypes:
  1. Design an Investigation: Hypothesis, independent/dependent/control variables, data collection procedures, and experimental validity.
  2. Analyze an Environmental Problem & Propose a Solution: Ecological impacts, identifying root causes, and proposing realistic, sustainable solutions with environmental or economic justifications.
  3. Quantitative Environmental Problem & Solution: Multi-step mathematical calculations (with units and dimensional analysis) paired with an environmental mitigation recommendation.
- Rubric: Exactly 10 points breakdown with step-by-step partial-credit criteria.`;
    }
  }

  if (s.includes('principles') || s.includes('csp')) {
    if (questionType === 'objective') {
      return `AP COMPUTER SCIENCE PRINCIPLES (CSP) EXAM SPECIFICATIONS (College Board CED):
- Target Level: Grade 9-10 foundational computing. Focus on computational thinking, algorithm logic, data representation, and societal impacts (Units 1–5).
- Scope: Creative development, binary/hex numbers, data compression (lossy vs lossless), pseudocode algorithms (robot grid traversal, conditional iteration, list filtering), Internet architecture (IP, TCP/IP, packet routing, fault tolerance), cybersecurity (public-key encryption, phishing, DDoS), and computing ethics.
- Distractors: Represent algorithmic off-by-one errors, Boolean logic inversion (AND vs OR), or confusing lossy vs lossless compression.`;
    } else {
      return `AP COMPUTER SCIENCE PRINCIPLES WRITTEN RESPONSE / PERFORMANCE TASK STANDARDS:
- Format: 4-Part Written Response (6 Points Total) based on computational artifacts and program development:
  - Part (a): Program Function and Purpose (explaining user inputs, outputs, and overall functionality).
  - Part (b): Data Abstraction (identifying list/collection name, data represented, and how complexity is managed).
  - Part (c): Algorithmic Logic & Sequencing (explaining iteration, selection, sequencing, and algorithmic outcome).
  - Part (d): Testing & Parameter Behavior (describing two different calls/inputs, expected conditions, and resulting outputs).
- Rubric: Precise College Board CED 6-point scoring criteria.`;
    }
  }

  if (s.includes('calculus bc')) {
    if (questionType === 'objective') {
      return `AP CALCULUS BC EXAM SPECIFICATIONS (College Board CED):
- Coverage: Full AB curriculum PLUS BC-exclusive topics: Parametric equations, vector motion in 2D (velocity/acceleration vectors, speed = sqrt((x')^2 + (y')^2)), polar functions (polar area = (1/2)*integral(r^2 dTheta)), integration by parts, partial fractions, improper integrals, Euler's method, logistic differential equations (dP/dt = kP(1 - P/M)), and Infinite Series.
- Infinite Series focus: Geometric series, Taylor/Maclaurin polynomial approximations, nth-term divergence, Ratio test for radius & interval of convergence, Alternating Series Test.
- Distractors must represent classic student misconceptions: omitting chain rule in parametric derivatives, sign errors in integration by parts, forgetting to check endpoints in interval of convergence.
- Format all math expressions cleanly using LaTeX ($...$).`;
    } else {
      return `AP CALCULUS BC FREE RESPONSE STANDARDS (College Board CED):
- Format: Real 9-POINT multi-part questions with sub-parts (a), (b), (c), (d).
- Priority Archetypes:
  1. Infinite Series (Taylor/Maclaurin series, finding general term, computing radius/interval of convergence using Ratio Test, Alternating Series Error Bound or Lagrange Error Bound).
  2. Parametric / Polar Motion (position vector, velocity, total distance traveled / arc length integral, polar area enclosed between curves).
  3. Logistic Differential Equations & Euler's Method step-by-step approximation.
  4. Area & Volume of solids of revolution (disk/washer/cross sections) or Rate In / Rate Out Accumulation.
- Total Points MUST be 9 points. Rubric must award partial points step-by-step (+1 pt for setup/derivative, +1 pt for antiderivative, +1 pt for justification/units).`;
    }
  }

  if (s.includes('calculus ab') || s.includes('calculus')) {
    if (questionType === 'objective') {
      return `AP CALCULUS AB EXAM SPECIFICATIONS (College Board CED):
- Coverage: Limits & Continuity (including L'Hopital's Rule), Derivatives (Chain rule, Product/Quotient rule, Implicit differentiation), Mean Value Theorem, Particle Motion in 1D (position, velocity, acceleration, speed increasing/decreasing), Definite & Indefinite Integrals, Fundamental Theorem of Calculus, Riemann Sums, Differential Equations (separable).
- Distractors must reflect real student math traps: forgetting chain rule factors, arithmetic sign slips, forgetting '+ C', confusing velocity with acceleration.
- Format all equations cleanly in LaTeX ($...$).`;
    } else {
      return `AP CALCULUS AB FREE RESPONSE STANDARDS (College Board CED):
- Format: Real 9-POINT multi-part questions with sub-parts (a), (b), (c), (d).
- Classic AP FRQ Archetypes:
  1. Rate In / Rate Out Accumulation: Net change integral formula integral(R_in(t) - R_out(t))dt, checking critical times.
  2. Particle Motion: Analyzing velocity v(t), determining when speed is increasing/decreasing, total distance traveled integral(|v(t)|dt).
  3. Graph Analysis of f'(x): Identifying relative extrema, points of inflection, justifying with First/Second Derivative Test, EVT.
  4. Area & Volume: Area between two curves, volume of solid of revolution (disk/washer), volume with known cross sections (squares/semicircles).
  5. Differential Equations: Slope fields, separation of variables to find particular solution y = f(x) with initial condition.
  6. Riemann Sums & Tables: Estimating definite integrals using Trapezoidal rule or Left/Right sums with physical units.
- Total Points MUST be 9 points. Rubric must assign exact points per sub-part.`;
    }
  }

  if (s.includes('biology')) {
    if (questionType === 'objective') {
      return `AP BIOLOGY EXAM SPECIFICATIONS (College Board CED):
- Stimulus-Based Design: Base questions on authentic biological investigations (e.g. cellular respiration respirometers, gel electrophoresis band patterns, spectrophotometric enzyme curves, water potential potato cylinders, pedigree tracking, or Hardy-Weinberg population data).
- Visual Diagrams & Curves (MANDATORY): For Cellular Energetics (Unit 3), Cell Structure (Unit 2), Genetics (Unit 5), or Ecology (Unit 8), generate the complete SVG diagram in "diagramSvg" (viewBox="0 0 400 220") and specify "diagramType".
- Diverse Organisms & Real Biological Systems: NEVER use generic placeholders like 'Enzyme X' or repeat identical experimental scenarios. Vary the organism (e.g. yeast, spinach, bovine liver catalase, E. coli, marine phytoplankton, Drosophila, Arabidopsis thaliana) and real enzymes (catalase, pepsin, salivary amylase, RuBisCO, ATP synthase, cytochrome c oxidase).
- Core Themes: Chemistry of life, cell structure & energetics (photosynthesis/respiration), cell communication & cell cycle, heredity & genetics, gene expression & regulation, natural selection, ecology.
- Question Style: Questions must require students to analyze experimental data, make scientific claims, identify controls, or predict the biological consequence of an inhibitor or mutation.`;
    } else {
      return `AP BIOLOGY FREE RESPONSE STANDARDS (College Board CED):
- Formats:
  1. Long FRQ (8-10 points): Interpreting & Evaluating Experimental Results. Includes experimental design, specifying independent/dependent variables, graphing with standard error bars (±2 SEM), calculating means, and Null Hypothesis / Chi-Square testing.
  2. Short FRQ (4 points): Scientific Investigation (identifying negative/positive controls), Conceptual Analysis (predicting effects of disruption/mutation), or Model Analysis (analyzing cell signaling cascades).
- Visual Diagrams & Curves (MANDATORY): For Cellular Energetics, Genetics (pedigrees), or Ecology, generate the complete SVG graph in "diagramSvg" (viewBox="0 0 400 220") with labeled axes, data points, and appropriate "diagramType". NEVER use generic 'Enzyme X' - use real biological enzymes and realistic experimental parameters.
- Rubric: Precise point allocation (+1 pt for identifying control, +1 pt for calculating rate, +1 pt for biological justification).`;
    }
  }

  if (s.includes('chemistry')) {
    if (questionType === 'objective') {
      return `AP CHEMISTRY EXAM SPECIFICATIONS (College Board CED):
- Content: Atomic structure & PES spectra, molecular bonding & Lewis/VSEPR, intermolecular forces & properties, chemical reactions & stoichiometry, kinetics rate laws, thermodynamics (Delta H, Delta S, Delta G = -RT ln K), equilibrium & Le Chatelier's principle, acids & bases (titration curves, buffers), electrochemistry.
- Visuals & Diagrams: Include particulate representations (drawings of atoms/molecules in a container), molecular geometry descriptions, and reaction energy profiles.
- Distractors: Represent stoichiometry mole-ratio errors, confusing Delta H with Delta G, or inverted equilibrium expressions.`;
    } else {
      return `AP CHEMISTRY FREE RESPONSE STANDARDS (College Board CED):
- Formats:
  1. Long FRQ (10 points): Multi-part problem covering multi-step stoichiometry, net ionic equations, thermodynamics calculations, electrochemistry cell potentials (E_cell = E_cathode - E_anode), and acid-base buffer calculations (Henderson-Hasselbalch equation).
  2. Short FRQ (4 points): Lewis structures & resonance, VSEPR molecular geometry and bond angles, intermolecular forces comparing boiling points, or Beer-Lambert Law spectrophotometry (A = epsilon * b * c).
- Rubric: Must break down exact points (+1 pt for balanced net ionic equation, +1 pt for ICE table setup, +1 pt for final answer with correct significant figures and units).`;
    }
  }

  if (s.includes('physics 1')) {
    if (questionType === 'objective') {
      return `AP PHYSICS 1: ALGEBRA-BASED EXAM SPECIFICATIONS (Updated College Board CED):
- Format: Strictly 4 answer choices (A-D, single-select).
- Scope: Kinematics, Newton's Laws, Work/Energy/Power, Linear Momentum, Torque & Rotational Motion, Simple Harmonic Motion, AND newly integrated FLUIDS (density, pressure, buoyant force, Archimedes principle, continuity equation, Bernoulli's equation).
- Cognitive Focus: Qualitative proportional reasoning (e.g. 'If radius doubles and angular velocity is halved, what happens to centripetal acceleration?'), force diagrams, and conservation laws.`;
    } else {
      return `AP PHYSICS 1 FREE RESPONSE STANDARDS (College Board CED):
- Four Official FRQ Types:
  1. Mathematical Routines (algebraic derivations, energy/momentum conservation).
  2. Translation Between Representations (connecting equations to graphs like Force vs Time or Velocity vs Time).
  3. Experimental Design (outlining a lab setup, list of apparatus, step-by-step procedure to reduce uncertainty, and data analysis plan).
  4. Qualitative / Quantitative Translation (QQT) (explaining a physical phenomenon in clear conceptual prose without equations first, then deriving the algebraic formula to prove it).
- Total points: 7 to 12 points with explicit point-by-point rubric.`;
    }
  }

  if (s.includes('computer science a')) {
    if (questionType === 'objective') {
      return `AP COMPUTER SCIENCE A EXAM SPECIFICATIONS (College Board Java Subset):
- Java Syntax: Code snippets strictly following the official Java Quick Reference (String, Math, ArrayList, 1D/2D arrays, OOP inheritance, polymorphism).
- Concepts: Loop bounds, tracing variable mutations, Boolean logic (De Morgan's laws), recursion execution traces, class design, and searching/sorting algorithms (binary search, selection/insertion/merge sort).
- Distractors: Off-by-one errors (e.g., '< arr.length' vs '<= arr.length'), NullPointerException triggers, confusing '=' with '==', integer division truncation.`;
    } else {
      return `AP COMPUTER SCIENCE A FREE RESPONSE STANDARDS (College Board CED):
- Format: 4 Authentic Java Coding Questions (9 Points Each):
  - Question 1: Methods and Control Structures (loops, conditionals, helper methods).
  - Question 2: Class Design (writing a complete Java class with private instance variables, constructor, getters/setters, and specified methods).
  - Question 3: Array / ArrayList (traversing, filtering, or modifying elements, avoiding ConcurrentModificationException and index errors).
  - Question 4: 2D Array (nested row/column loops, grid manipulation).
- Rubric: Strict 9-point rubric awarding points for method header, loops, conditionals, accessing elements, returning correct value.`;
    }
  }

  if (s.includes('u.s. history') || s.includes('us history') || s.includes('apush')) {
    if (questionType === 'objective') {
      return `AP U.S. HISTORY (APUSH) EXAM SPECIFICATIONS (College Board CED):
- Stimulus-Based: Every single question set MUST be anchored to a primary source excerpt (presidential speech, newspaper editorial, letter, treaty, colonial document) or secondary historical analysis from Periods 1-9 (1491-Present).
- Historical Thinking Skills: Contextualization, causation, continuity and change over time (CCOT), comparison.
- Distractors: Factually true statements from a DIFFERENT historical era or claims that mischaracterize the author's argument.`;
    } else {
      return `AP U.S. HISTORY (APUSH) FREE RESPONSE STANDARDS (College Board CED):
- Formats:
  1. DBQ (Document-Based Question, 7-Point Rubric): Provide 7 distinct historical source documents (Author, Source, Year, Excerpt). Rubric: Thesis (1 pt), Contextualization (1 pt), Evidence from 3+ docs (1 pt) or 6+ docs (2 pts), Outside Evidence (1 pt), Sourcing/HIPP analysis (1 pt), Historical Complexity (1 pt).
  2. LEQ (Long Essay Question, 6-Point Rubric): Historical prompt testing Causation, CCOT, or Comparison without documents.
  3. SAQ (Short Answer Question): 3 parts (a), (b), (c) strictly requiring the ACE format (Answer, Cite specific evidence, Explain connection).`;
    }
  }

  if (s.includes('world history')) {
    if (questionType === 'objective') {
      return `AP WORLD HISTORY: MODERN EXAM SPECIFICATIONS (College Board CED):
- Time Period: 1200 CE to the Present.
- Stimulus-Based: Provide primary excerpts from historical travelers (Ibn Battuta, Marco Polo), imperial edicts (Mongol, Ottoman, Ming), colonial treaties, or Cold War declarations.
- Themes: Global Tapestry, Networks of Exchange, Land-Based Empires, Transoceanic Interconnections, Revolutions, Industrialization, Global Conflicts, Decolonization, and Globalization.`;
    } else {
      return `AP WORLD HISTORY: MODERN FREE RESPONSE STANDARDS (College Board CED):
- Formats:
  1. DBQ (Document-Based Question, 7-Point Rubric): 7 historical documents from world history.
  2. LEQ (Long Essay Question, 6-Point Rubric): Global historical causation, comparison, or CCOT.
  3. SAQ (Short Answer Question): 3 distinct parts (a), (b), (c) in ACE format.
- Rubrics must strictly follow the official College Board historical rubrics.`;
    }
  }

  if (s.includes('english') || s.includes('lang')) {
    if (questionType === 'objective') {
      return `AP ENGLISH LANGUAGE & COMPOSITION EXAM SPECIFICATIONS (College Board CED):
- Reading Questions: Non-fiction rhetorical analysis passage (speech, essay, letter). Analyze author's purpose, claims, line of reasoning, rhetorical choices (diction, syntax, appeals to ethos/pathos/logos), and tone.
- Writing Questions: Excerpt from a draft student essay. Ask how to revise thesis statements, enhance sentence variety, improve transitional phrases, or integrate evidence cohesively.`;
    } else {
      return `AP ENGLISH LANGUAGE FREE RESPONSE STANDARDS (College Board CED):
- 3 Authentic AP Lang Essay Types (Each scored on the official 6-Point Analytic Rubric):
  1. Synthesis Essay: Present a prompt and 6 diverse sources (articles, statistics, visual data). Students must synthesize at least 3 sources to support an argument.
  2. Rhetorical Analysis Essay: Provide an authentic non-fiction speech/letter and ask students to analyze how the author uses rhetorical choices to convey their message.
  3. Argument Essay: Present a philosophical, cultural, or social claim to defend, challenge, or qualify with evidence from history, literature, or personal observation.
- Rubric: 1 pt Thesis, 4 pts Evidence & Commentary, 1 pt Sophistication.`;
    }
  }

  if (s.includes('psychology')) {
    if (questionType === 'objective') {
      return `AP PSYCHOLOGY EXAM SPECIFICATIONS (Updated College Board CED):
- Format: Scenario-based questions applying psychological principles to real-world behavioral situations.
- Content: Biological bases of behavior (neurotransmitters, brain structures, nervous system), sensation & perception, learning (operant/classical conditioning), cognitive psychology (memory, biases), developmental psychology, personality theories, social psychology, clinical psychology (DSM-5 diagnostic criteria).`;
    } else {
      return `AP PSYCHOLOGY FREE RESPONSE STANDARDS (Updated College Board CED):
- 2 Official FRQ Types:
  1. Article Analysis Question (AAQ): Provide an empirical psychological research study abstract. Students must identify independent/dependent variables, confounding variables, assess statistical significance (p < 0.05), and evaluate APA ethical guidelines (informed consent, debriefing, confidentiality).
  2. Evidence-Based Question (EBQ): Students synthesize psychological concepts to construct a defensible claim supported by empirical evidence.
- Rubric: Clearly specify which psychological concepts earn points and required justifications.`;
    }
  }

  if (s.includes('economic')) {
    if (questionType === 'objective') {
      return `AP MICRO & MACROECONOMICS EXAM SPECIFICATIONS (College Board CED):
- Microeconomics: Supply & demand elasticity, consumer/producer surplus, market structures (perfect competition, monopoly, oligopoly), externalities, marginal cost/revenue, factor markets.
- Macroeconomics: GDP, inflation, unemployment, Aggregate Demand / Aggregate Supply (AD-AS), fiscal policy, monetary policy (Federal Reserve tools), Money Market, Loanable Funds, Phillips Curve, Foreign Exchange.
- Distractors: Confusing shifts of a curve with movements along a curve, or miscalculating tax incidence / multiplier effects.`;
    } else {
      return `AP ECONOMICS FREE RESPONSE STANDARDS (College Board CED):
- Formats:
  1. Long FRQ (10 points, ~30 min): Multi-part scenario with explicit graphing instructions (e.g., 'Draw a correctly labeled graph of the money market and show the effect of an open market purchase of bonds on the nominal interest rate').
  2. Short FRQ (5 points, ~15 min): Targeted calculations (elasticity, spending multiplier, balance of payments) and directional explanations.
- Rubric: Explicit points for graph labeling, curve shift directions, and numerical calculations.`;
    }
  }

  // Fallback for general AP Subjects
  return `College Board AP Course and Exam Description standards for ${subject}. High rigor, analytical thinking, stimulus-based.`;
}

function getDynamicTopicVariation(subject: string, unitOrTopic: string, count: number): string {
  const archetypes = getGranularSubjectArchetypes(subject, unitOrTopic, count);
  return archetypes.map((arch, idx) => `  - Question ${idx + 1} Target Archetype: ${arch}`).join('\n');
}


const MCQ_LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Generates a balanced, non-consecutive target position sequence for N questions.
 * Guarantees ~25% chance for A, B, C, D and NO adjacent identical answers.
 * Also eliminates predictable sequential cycles.
 */
function generateBalancedAnswerSequence(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.floor(Math.random() * 4)];

  const pool: number[] = [];
  const fullSets = Math.floor(count / 4);
  const remainder = count % 4;

  for (let s = 0; s < fullSets; s++) {
    pool.push(0, 1, 2, 3);
  }

  const remOptions = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  for (let r = 0; r < remainder; r++) {
    pool.push(remOptions[r]);
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = [...pool];
    for (let i = candidate.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
    }

    // Fix any adjacent duplicates by swapping with a valid position
    for (let i = 0; i < candidate.length - 1; i++) {
      if (candidate[i] === candidate[i + 1]) {
        for (let k = 0; k < candidate.length; k++) {
          if (
            candidate[k] !== candidate[i] &&
            (k === 0 || candidate[k - 1] !== candidate[i + 1]) &&
            (k === candidate.length - 1 || candidate[k + 1] !== candidate[i + 1]) &&
            candidate[k] !== candidate[i + 2]
          ) {
            [candidate[i + 1], candidate[k]] = [candidate[k], candidate[i + 1]];
            break;
          }
        }
      }
    }

    let hasAdjDup = false;
    let hasCycle = false;
    let cycleCount = 0;
    for (let i = 0; i < candidate.length - 1; i++) {
      if (candidate[i] === candidate[i + 1]) {
        hasAdjDup = true;
        break;
      }
      if ((candidate[i] + 1) % 4 === candidate[i + 1]) {
        cycleCount++;
      } else {
        cycleCount = 0;
      }
      if (cycleCount >= 3) {
        hasCycle = true;
        break;
      }
    }

    if (!hasAdjDup && !hasCycle) {
      return candidate;
    }
  }

  // Fallback generation guaranteeing no adjacent duplicates
  const res: number[] = [];
  let last = -1;
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < count; i++) {
    const validNext = [0, 1, 2, 3].filter(x => x !== last);
    validNext.sort((a, b) => counts[a] - counts[b] + (Math.random() - 0.5));
    const chosen = validNext[0];
    res.push(chosen);
    counts[chosen]++;
    last = chosen;
  }
  return res;
}

/**
 * Shuffles options for Test Prep questions to guarantee 25% balance across A, B, C, D
 * with no consecutive identical answers.
 */
function shuffleAndBalanceTestPrepQuestions(questions: any[]): any[] {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const targetPositions = generateBalancedAnswerSequence(questions.length);

  return questions.map((q, qIdx) => {
    const rawOptions = Array.isArray(q.options) ? q.options.map(String) : [];
    if (rawOptions.length < 4) return q;

    const rawAns = String(q.correctAnswer || '').trim();
    let currentCorrectIdx = -1;

    const letterMatch =
      rawAns.match(/^Option\s+([A-Da-d])/i) ||
      rawAns.match(/^([A-Da-d])[\)\.:\s]/) ||
      rawAns.match(/^([A-Da-d])$/);
    if (letterMatch && letterMatch[1]) {
      const matchedLetter = letterMatch[1].toUpperCase();
      const lIdx = MCQ_LETTERS.indexOf(matchedLetter);
      if (lIdx >= 0 && lIdx < 4) currentCorrectIdx = lIdx;
    }

    if (currentCorrectIdx === -1) {
      const cleanRawAns = rawAns.toLowerCase().replace(/^[a-d][\)\.:\s]+/, '').trim();
      const foundIdx = rawOptions.findIndex(opt => {
        const cleanOpt = opt.toLowerCase().replace(/^[a-d][\)\.:\s]+/, '').trim();
        return cleanOpt === cleanRawAns;
      });
      if (foundIdx >= 0) currentCorrectIdx = foundIdx;
    }

    if (currentCorrectIdx === -1) currentCorrectIdx = 0;

    const origLetter = MCQ_LETTERS[currentCorrectIdx];

    const items = rawOptions.slice(0, 4).map((opt, idx) => ({
      content: opt.replace(/^[A-Da-d][\)\.:\s]\s*/, '').trim(),
      isCorrect: idx === currentCorrectIdx
    }));

    const correctItem = items[currentCorrectIdx];
    const distractorItems = items.filter((_, idx) => idx !== currentCorrectIdx);

    // Randomize distractors
    for (let d = distractorItems.length - 1; d > 0; d--) {
      const rand = Math.floor(Math.random() * (d + 1));
      [distractorItems[d], distractorItems[rand]] = [distractorItems[rand], distractorItems[d]];
    }

    const targetPos = targetPositions[qIdx];
    const newLetter = MCQ_LETTERS[targetPos];
    const reorderedItems: any[] = [];
    let distractorIdx = 0;

    for (let pos = 0; pos < 4; pos++) {
      if (pos === targetPos) {
        reorderedItems.push(correctItem);
      } else {
        reorderedItems.push(distractorItems[distractorIdx++]);
      }
    }

    const newOptions = reorderedItems.map((item, pos) => `${MCQ_LETTERS[pos]}) ${item.content}`);
    const newCorrectAnswer = newOptions[targetPos];

    let newExplanation = q.explanation || "";
    if (origLetter && origLetter !== newLetter) {
      newExplanation = newExplanation
        .replace(new RegExp(`\\bOption\\s+${origLetter}\\b`, 'gi'), `Option ${newLetter}`)
        .replace(new RegExp(`\\b${origLetter}\\s+is\\s+correct\\b`, 'gi'), `${newLetter} is correct`)
        .replace(new RegExp(`\\(${origLetter}\\)\\s+is\\s+correct\\b`, 'gi'), `(${newLetter}) is correct`);
    }

    return {
      ...q,
      options: newOptions,
      correctAnswer: newCorrectAnswer,
      explanation: newExplanation
    };
  });
}

/**
 * Shuffles options for AP Trap Radar questions to guarantee 25% balance across A, B, C, D
 * with no consecutive identical answers, perfectly synchronizing traps array.
 */
function shuffleAndBalanceTrapRadarQuestions(questions: any[]): any[] {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const targetPositions = generateBalancedAnswerSequence(questions.length);

  return questions.map((q, qIdx) => {
    if (q.format === 'subjective') return q;

    const rawOptions = Array.isArray(q.options) ? q.options.map(String) : [];
    if (rawOptions.length < 4) return q;

    const rawAns = String(q.correctAnswer || '').trim();
    let currentCorrectIdx = -1;

    if (Array.isArray(q.traps) && q.traps.length > 0) {
      const correctTrapIdx = q.traps.findIndex((t: any) => t.isCorrect);
      if (correctTrapIdx >= 0 && correctTrapIdx < 4) {
        currentCorrectIdx = correctTrapIdx;
      }
    }

    if (currentCorrectIdx === -1) {
      const letterMatch = rawAns.match(/^[A-Da-d][\)\.:\s]/i) || rawAns.match(/^[A-Da-d]$/);
      if (letterMatch) {
        const matchedLetter = (letterMatch[1] || letterMatch[0]).charAt(0).toUpperCase();
        const lIdx = MCQ_LETTERS.indexOf(matchedLetter);
        if (lIdx >= 0) currentCorrectIdx = lIdx;
      }
    }

    if (currentCorrectIdx === -1) {
      const cleanRawAns = rawAns.toLowerCase().replace(/^[a-d][\)\.:\s]+/, '').trim();
      const foundIdx = rawOptions.findIndex(opt => {
        const cleanOpt = opt.toLowerCase().replace(/^[a-d][\)\.:\s]+/, '').trim();
        return cleanOpt === cleanRawAns;
      });
      if (foundIdx >= 0) currentCorrectIdx = foundIdx;
    }

    if (currentCorrectIdx === -1) currentCorrectIdx = 0;

    const items = rawOptions.slice(0, 4).map((opt, idx) => {
      const cleanText = opt.replace(/^[A-Da-d][\)\.:\s]\s*/, '').trim();
      const trap = Array.isArray(q.traps) && q.traps[idx] ? { ...q.traps[idx] } : null;
      return {
        content: cleanText,
        isCorrect: idx === currentCorrectIdx,
        trap
      };
    });

    const correctItem = items[currentCorrectIdx];
    const distractorItems = items.filter((_, idx) => idx !== currentCorrectIdx);

    for (let d = distractorItems.length - 1; d > 0; d--) {
      const rand = Math.floor(Math.random() * (d + 1));
      [distractorItems[d], distractorItems[rand]] = [distractorItems[rand], distractorItems[d]];
    }

    const targetPos = targetPositions[qIdx];
    const reorderedItems: any[] = [];
    let distractorIdx = 0;

    for (let pos = 0; pos < 4; pos++) {
      if (pos === targetPos) {
        reorderedItems.push(correctItem);
      } else {
        reorderedItems.push(distractorItems[distractorIdx++]);
      }
    }

    const newOptions = reorderedItems.map((item, pos) => `${MCQ_LETTERS[pos]}) ${item.content}`);
    const newCorrectAnswer = newOptions[targetPos];

    let newTraps: any[] | undefined = undefined;
    if (Array.isArray(q.traps) && q.traps.length > 0) {
      newTraps = reorderedItems.map((item, pos) => {
        if (item.trap) {
          return {
            ...item.trap,
            option: MCQ_LETTERS[pos],
            isCorrect: pos === targetPos
          };
        }
        return {
          option: MCQ_LETTERS[pos],
          isCorrect: pos === targetPos,
          trapType: pos === targetPos ? '🎯 Official College Board Target' : '⚠️ Psychometric Distractor Trap',
          trapDescription: pos === targetPos ? 'Target Answer' : 'Common Distractor',
          collegeBoardMindset: 'AP CED Standard'
        };
      });
    }

    return {
      ...q,
      options: newOptions,
      correctAnswer: newCorrectAnswer,
      traps: newTraps
    };
  });
}

app.post("/api/generate-ap-questions", async (req, res) => {
  try {
    const { subject, unit, topic, questionType, count, gradeLevel, avoidPrompts, randomSeed } = req.body;
    if (!subject) {
      return res.status(400).json({ error: "Missing AP Subject" });
    }

    const type = questionType === 'subjective' ? 'subjective' : 'objective';
    const requestedCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);
    const targetTopic = [topic, unit, subject].filter(Boolean).join(" - ");
    const subjectGuidelines = getCollegeBoardSubjectGuidelines(subject, type);

    const s = (subject || '').toLowerCase();
    const g = (gradeLevel || '').toLowerCase();

    const dynamicArchetypePlan = getDynamicTopicVariation(subject, targetTopic, requestedCount);

    let antiRepetitionDirective = `
CRITICAL QUESTION DIVERSITY & NO-REPEAT DIRECTIVE:
- EVERY QUESTION MUST BE COMPLETELY UNIQUE, NOVEL, AND ORIGINAL.
- DO NOT repeat classic stock textbook examples (e.g. do NOT use standard functions like (x^2-4)/(x-2), (sin(3x)tan(2x))/x^2, or standard textbook table values).
- Invent fresh scenarios, diverse function types (rational, radical, trigonometric, exponential, piecewise, logarithmic), distinct variables, and varied real-world/experimental contexts.
- Each of the ${requestedCount} questions must target a DIFFERENT sub-topic or analytical skill from the AP Course and Exam Description (CED).

MANDATORY QUESTION VARIATION BLUEPRINT FOR THIS SESSION:
${dynamicArchetypePlan}
Ensure every question adheres to its designated archetype and uses distinct functions, numbers, and contexts.`;

    if (Array.isArray(avoidPrompts) && avoidPrompts.length > 0) {
      const cleanAvoid = avoidPrompts
        .filter((p: any) => typeof p === 'string' && p.trim())
        .slice(0, 12)
        .map((p: string, idx: number) => `  [PREVIOUS ${idx + 1}]: "${p.replace(/\n+/g, ' ').slice(0, 140)}"`)
        .join('\n');

      if (cleanAvoid) {
        antiRepetitionDirective += `

STRICT PREVIOUS QUESTIONS AVOIDANCE (CRITICAL):
The student was previously tested on the following problems. You MUST NOT repeat, closely adapt, or generate questions similar to them:
${cleanAvoid}
Ensure your questions test different concepts, different functions, different numbers, and different problem archetypes.`;
      }
    }

    let gradeCalibrationInstruction = '';

    if (g.includes('9th') || g.includes('freshman') || s.includes('human geography') || s.includes('aphg') || s.includes('principles') || s.includes('csp')) {
      gradeCalibrationInstruction = `
OFFICIAL GRADE-LEVEL PEDAGOGICAL CALIBRATION: GRADE 9 (FRESHMAN AP TRACK - AGE ~14-15):
- Cognitive Profile: High school freshmen embarking on their foundational AP coursework.
- Question Scaffolding: Anchor every question in clear, accessible real-world stimuli, spatial maps, demographic profiles (DTM), or intuitive algorithmic logic. Avoid confusing academic trick wording.
- Official Command Verbs: Strictly train the student on College Board foundational verbs: "Identify", "Define", "Describe" (observable trends/features), and "Explain" (clear cause-and-effect 'how' or 'why' X leads to Y).
- Explanations & Model Solutions: Break down reasoning step-by-step with supportive educational scaffolding, explaining why the correct choice is true and how to avoid classic 9th-grade misconceptions.`;
    } else if (g.includes('10th') || g.includes('sophomore')) {
      gradeCalibrationInstruction = `
OFFICIAL GRADE-LEVEL PEDAGOGICAL CALIBRATION: GRADE 10 (SOPHOMORE AP TRACK - AGE ~15-16):
- Cognitive Profile: Intermediate high school rigor, expanding analytical essay writing, historical reasoning, and multi-concept scientific/computing problems (e.g. AP World History, AP Psychology, AP CSA).
- Question Scaffolding: Integrate comparative analysis, contextualization across historical eras/systems, and structured application of theories (e.g. operant conditioning, OOP inheritance, transoceanic networks).
- Official Command Verbs: Train students on "Compare and contrast", "Explain the historical/conceptual connection", "Analyze the relationship", and "Evaluate the consequence".
- Explanations & Model Solutions: Teach historical continuity and change over time (CCOT), causation, and analytical justification using structured ACE format.`;
    } else if (g.includes('11th') || g.includes('junior')) {
      gradeCalibrationInstruction = `
OFFICIAL GRADE-LEVEL PEDAGOGICAL CALIBRATION: GRADE 11 (JUNIOR AP TRACK - AGE ~16-17 - CRITICAL AP ADMISSIONS YEAR):
- Cognitive Profile: Peak AP rigor aligned with university introductory sequences (AP Calculus AB, APUSH, AP English Language, AP Chemistry, AP Biology, AP Physics 1).
- Question Scaffolding: Multi-layered, stimulus-driven questions featuring primary historical source excerpts, multi-step calculus problems (related rates, accumulation integrals), and authentic laboratory experimental data sets.
- Official Command Verbs: Rigorous testing of "Justify using mathematical/scientific principles", "Synthesize multiple conflicting viewpoints", "Formulate a defensible thesis statement", and "Calculate with appropriate physical units".
- Explanations & Model Solutions: Deep College Board Chief Reader breakdown with rigorous criteria, addressing subtle distractor traps and common AP exam score-losing pitfalls.`;
    } else if (g.includes('12th') || g.includes('senior') || g.includes('college')) {
      gradeCalibrationInstruction = `
OFFICIAL GRADE-LEVEL PEDAGOGICAL CALIBRATION: GRADE 12 (SENIOR AP / UNIVERSITY CREDIT TRACK - AGE ~17-18):
- Cognitive Profile: Advanced college-level mastery (AP Calculus BC, AP Physics C, AP English Literature, AP Gov & Econ, AP Statistics).
- Question Scaffolding: High-speed synthesis, multi-variable calculus proofs, complex chemical thermodynamics, macroeconomic AD-AS modeling, and sophisticated literary analysis.
- Official Command Verbs: "Evaluate the extent to which...", "Derive the mathematical relationship", "Demonstrate using graphical models", and "Provide comprehensive empirical justification".
- Explanations & Model Solutions: Direct college-level grading standard analysis with exact point-by-point scoring guidelines matching university freshman course equivalence.`;
    } else {
      gradeCalibrationInstruction = `
OFFICIAL GRADE-LEVEL PEDAGOGICAL CALIBRATION: ADVANCED PLACEMENT (HIGH SCHOOL TO COLLEGE):
- Rigor: Standard College Board AP Course and Exam Description (CED) college-level rigor.
- Explanations: Clear, authoritative step-by-step breakdown according to official College Board scoring rubrics.`;
    }

    // Chunk requestedCount into parallel batches of max 5 questions to prevent timeouts & token limits
        // Chunk requestedCount into optimized parallel batches of max 10 questions to balance latency, concurrency, and token limits
    const batchSizes: number[] = [];
    let remaining = requestedCount;
    while (remaining > 0) {
      const take = Math.min(remaining, 10);
      batchSizes.push(take);
      remaining -= take;
    }

    const allArchetypes = getGranularSubjectArchetypes(subject, targetTopic, requestedCount);

    if (type === 'objective') {
      const generateObjectiveBatch = async (batchCount: number, bIdx: number, extraAvoid: string[] = []): Promise<any[]> => {
        const batchOffset = bIdx >= 80 ? 0 : batchSizes.slice(0, bIdx).reduce((a, b) => a + b, 0);
        const batchArchetypes = allArchetypes.slice(batchOffset, batchOffset + batchCount);
        const batchArchetypePlan = batchArchetypes.map((arch, idx) => `  - Question ${batchOffset + idx + 1} Target Archetype: ${arch}`).join('\n');
        const batchSeed = `${randomSeed || Date.now()}_b${bIdx + 1}_${Math.random().toString(36).substring(2, 6)}`;

        let combinedAntiRepetition = antiRepetitionDirective;
        if (extraAvoid.length > 0) {
          const avoidLines = extraAvoid.slice(0, 15).map((p, i) => `  [SESSION EXCLUDED ${i + 1}]: "${p.replace(/\n+/g, ' ').slice(0, 120)}"`).join('\n');
          combinedAntiRepetition += `\n\nSTRICT PREVIOUS QUESTIONS AVOIDANCE (NO DUPLICATES):\n${avoidLines}`;
        }

        const systemInstruction = `You are a Senior College Board AP Exam Chief Examiner and Master Test Developer.
The student is preparing for the AP ${subject} Exam.
Your task is to generate exactly ${batchCount} authentic, high-caliber AP Exam MULTIPLE CHOICE QUESTIONS (MCQs) for: "${targetTopic}".

CRITICAL COLLEGE BOARD AP EXAM STANDARDS:
1. RIGOR & DEPTH: Every question must test deep conceptual understanding, analytical thinking, or multi-step problem solving as defined in the official College Board AP Course and Exam Description (CED). Avoid trivial recall or surface-level trivia.
2. MANDATORY PRE-SOLVE & OPTION VERIFICATION (CRITICAL):
   - Before outputting options, you MUST solve the question step-by-step to arrive at the definite, mathematically and scientifically verified answer.
   - EXACTLY ONE OF THE 4 OPTIONS (A, B, C, or D) MUST BE 100% CORRECT. Under no circumstances should all 4 options be wrong, and under no circumstances should the true answer be missing from the options list!
   - "correctAnswer" MUST BE VERBATIM IDENTICAL: The "correctAnswer" property MUST be an exact character-for-character match to the corresponding option in the "options" array.
3. EQUAL 25% OPTION DISTRIBUTION (CRITICAL - NO OPTION A BIAS):
   - You MUST distribute the correct answer uniformly across options (A, B, C, and D) with equal ~25% probability across the batch!
   - Under NO circumstances should Option A always be the correct answer!
   - Ensure an authentic, varied distribution across A, B, C, and D throughout the question set (e.g. Q1 correct is B, Q2 correct is D, Q3 correct is A, Q4 correct is C).
4. STEP-BY-STEP AP EXPLANATION & DISTRACTOR BREAKDOWN:
   Explain WHY the correct option is right with structured step-by-step logic using double newlines ('\\n\\n'):
   - Step 1: Core formula, theorem, or contextual definition.
   - Step 2: Clear calculation or deductive justification proving the correct answer.
   - Distractor Analysis: Explicitly break down why each of the 3 incorrect options is wrong.
   - NEVER glue sentences together without spaces.
6. AP EXAM SKILL/UNIT TAG: Label the relevant AP Unit or Skill practiced.
7. MANDATORY COLLEGE BOARD SVG DIAGRAMS & GRAPHS (CRITICAL):
   For all visual or graphical subjects and units:
   - AP Calculus (Limits & Continuity, piecewise curves with open/closed circle holes, derivative graphs of f'(x), tangent lines, Riemann sums, slope fields).
   - AP Physics (kinematics v-t/x-t graphs, Free-Body Force Diagrams with labeled arrows, projectile paths, circuit schematics).
   - AP Chemistry (reaction coordinate energy profiles with Delta H & Ea, acid-base titration curves, PES spectra).
   - AP Biology (pedigree charts, enzyme kinetics curves, cell signaling feedback loops).
   - AP Economics (supply and demand equilibrium shifts, PPC, Phillips curves).
   
   CRITICAL REQUIREMENT:
   For these subjects and units, you MUST formulate questions based on visual graph analysis, and you MUST provide the complete, standalone SVG diagram in "diagramSvg" (viewBox='0 0 400 220') and specify "diagramType".
   The question prompt MUST refer to the visual diagram naturally using varied lead-ins (e.g. "In the investigation depicted in the accompanying figure...", "Based on the experimental data plotted in the graph above...", "A student analyzes the model shown in the figure...", "According to the diagram above..."). NEVER begin every question with the exact same repetitive formulaic words.
   
   SVG TECHNICAL REQUIREMENTS (MANDATORY SAFE BOUNDS - ZERO CLIPPING):
   - Root tag: <svg viewBox='0 0 400 220' xmlns='http://www.w3.org/2000/svg' width='100%' height='auto'>...</svg>
   - Dark contrast container: <rect width='400' height='220' fill='#09090b' rx='12' stroke='#27272a' stroke-width='1'/>
   - STRICT SAFE DRAWING ZONE (CRITICAL):
     * Keep ALL curves, plotted points, coordinate axes, and labels strictly within the inner bounding box: x between 25 and 375, and y between 25 and 195.
     * NEVER draw any curve peak, inflection point, asymptote, or circle where y < 20 or y > 200, so curves NEVER touch or get cut off by the border!
   - Coordinate Axes: stroke='#94a3b8' stroke-width='2' with arrows and labels (e.g. 'x', 'y = f(x)').
   - Grid lines: stroke='#1e293b' stroke-dasharray='2,2'.
   - Calculus Discontinuities / Holes: Use hollow circles for removable holes (<circle cx='...' cy='...' r='4.5' fill='#09090b' stroke='#38bdf8' stroke-width='2.5'/>) and solid dots for defined points (<circle cx='...' cy='...' r='4.5' fill='#38bdf8'/>).
   - Curves / Shapes: High-contrast stroke='#38bdf8' or stroke='#818cf8' stroke-width='2.5' fill='none'.
   - Text labels: fill='#f8fafc' font-size='12' font-family='sans-serif' font-weight='bold'.
   - Only set diagramSvg to "" if the subject is purely literary/historical (e.g. AP English Lit, AP History).

${subjectGuidelines}
${gradeCalibrationInstruction}
${combinedAntiRepetition}

BATCH TARGET ARCHETYPES:
${batchArchetypePlan}

CRITICAL CODE, MATH & LATEX FORMATTING:
- FOR COMPUTER SCIENCE / PROGRAMMING (AP Computer Science A, AP Computer Science Principles):
  * Always format code snippets inside standard Markdown fenced code blocks (\`\`\`java ... \`\`\`).
  * In code blocks and programming expressions, ALWAYS use standard programming operators: '<=', '>=', '!=', '==', '&&', '||', '<', '>'. NEVER substitute LaTeX symbols like \\leqslant, \\le, \\ge, \\times into code!
  * For inline variable names, methods, or keywords in question text (e.g. \`reverseString("APCS")\`, \`true\`, \`false\`, \`StackOverflowError\`), ALWAYS use Markdown backticks (\`code\`) and NEVER raw LaTeX like \\texttt{...}.
- FOR MATHEMATICS & SCIENCE (AP Calculus, AP Physics, AP Chemistry, AP Statistics):
  * Wrap all mathematical expressions in valid LaTeX syntax: $...$ for inline or $$...$$ for block.
  * For data tables and matrices, ALWAYS wrap in $$ block delimiters:
    $$\\begin{array}{c|ccccc} x & -1 & 0 & 2 & 3 & 4 \\\\ \\hline g(x) & -5 & 3 & -2 & 7 & 10 \\end{array}$$
    NEVER output bare \\begin{array} without $$...$$ delimiters!
  * For piecewise functions, ALWAYS use clean LaTeX with $$:
    $$f(x) = \\begin{cases} g(x) & \\text{for } x < c \\\\ h(x) & \\text{for } x \\ge c \\end{cases}$$
    NEVER write raw unescaped pseudo-code like 'f(x) = { ... }' or '<=' inside math equations that breaks KaTeX!
  * Always double-escape backslashes in JSON output: \\\\frac, \\\\le, \\\\ge, \\\\to, \\\\infty, \\\\begin{cases}, \\\\end{cases}, \\\\begin{array}, \\\\end{array}.

STRICT JSON OUTPUT:
Return ONLY a valid JSON array of objects with this exact structure:
[
  {
    "id": 1,
    "question": "Question text with clear formatting...",
    "stimulus": "Optional contextual text, data table, or scenario if applicable (or empty string)",
    "diagramSvg": "<svg viewBox='0 0 400 220' xmlns='http://www.w3.org/2000/svg'>...</svg>",
    "diagramType": "piecewise_graph",
    "options": [
      "A) Distractor 1",
      "B) Verified correct answer",
      "C) Distractor 2",
      "D) Distractor 3"
    ],
    "correctAnswer": "B) Verified correct answer",
    "explanation": "Detailed College Board explanation breaking down why B is correct and why A, C, D are common traps.",
    "skill": "Relevant AP Unit / Skill Tag"
  }
]`;

        const makeCall = async (seed: string): Promise<any[]> => {
          const response = await safeGenerateContent({
            gradeLevel: gradeLevel || "AP High School (Advanced Placement)",
            model: "gemini-3.5-flash-lite",
            timeoutMs: 90000,
            contents: { parts: [{ text: `Subject: ${subject}. Unit/Topic: ${targetTopic}. Batch Seed: ${seed}.
Generate exactly ${batchCount} authentic College Board AP Exam Multiple Choice Questions (MCQs) for this batch.
Target Archetypes for this batch:
${batchArchetypePlan}
IMPORTANT: Ensure 100% diversity and fresh non-repetitive problems with unique functions, numbers, and scenarios. Do not repeat standard textbook clichés!
If this is AP Calculus, AP Physics, AP Chemistry, AP Biology, AP Economics, or AP Statistics, generate authentic graph/diagram-based questions and provide the complete College Board standard SVG in "diagramSvg" with coordinate axes, curves, and labeled points so the student analyzes the visual graphic!` }] },
            config: {
              systemInstruction: { parts: [{ text: systemInstruction }] },
              responseMimeType: "application/json",
              maxOutputTokens: 16384,
              temperature: 0.75
            }
          });

          const generatedText = response.text || "";
          const parsed = safeParseJSON(generatedText, 'array');
          let questionsList: any[] = [];
          if (Array.isArray(parsed)) {
            questionsList = parsed;
          } else if (parsed && Array.isArray(parsed.questions)) {
            questionsList = parsed.questions;
          } else if (parsed && typeof parsed === 'object') {
            const found = Object.values(parsed).find(v => Array.isArray(v));
            if (found) questionsList = found as any[];
          }
          return questionsList;
        };

        try {
          const res = await makeCall(batchSeed);
          if (Array.isArray(res) && res.length > 0) return res;
        } catch (firstErr) {
          console.warn(`[generate-ap-questions] Objective batch ${bIdx + 1} initial attempt error:`, firstErr);
        }

        // Retry once with a fresh seed if initial call failed or returned empty
        try {
          const retrySeed = `${batchSeed}_retry_${Date.now()}`;
          const retryRes = await makeCall(retrySeed);
          return retryRes || [];
        } catch (retryErr) {
          console.warn(`[generate-ap-questions] Objective batch ${bIdx + 1} retry error:`, retryErr);
          return [];
        }
      };

      const batchPromises = batchSizes.map((batchCount, bIdx) => generateObjectiveBatch(batchCount, bIdx));
      const batchResults = await Promise.allSettled(batchPromises);
      let combinedQuestions: any[] = [];
      for (const res of batchResults) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          combinedQuestions.push(...res.value);
        } else if (res.status === 'rejected') {
          console.warn('[generate-ap-questions] Objective batch error:', res.reason);
        }
      }

      // Guaranteed auto-backfill loop: if fewer questions than requested were generated, backfill the deficit
      let backfillAttempts = 0;
      while (combinedQuestions.length < requestedCount && backfillAttempts < 2) {
        backfillAttempts++;
        const missingCount = requestedCount - combinedQuestions.length;
        console.warn(`[generate-ap-questions] Objective questions deficit: got ${combinedQuestions.length}/${requestedCount}. Backfilling ${missingCount} questions (attempt ${backfillAttempts})...`);
        try {
          const existingPrompts = combinedQuestions.map((q: any) =>
            (typeof q === 'string' ? q : (q.prompt || q.question || '')).slice(0, 140)
          ).filter(Boolean);
          const backfillResult = await generateObjectiveBatch(missingCount, 80 + backfillAttempts, existingPrompts);
          if (Array.isArray(backfillResult) && backfillResult.length > 0) {
            combinedQuestions.push(...backfillResult);
          }
        } catch (bfErr) {
          console.warn('[generate-ap-questions] Objective backfill attempt failed:', bfErr);
        }
      }

      if (combinedQuestions.length > 0) {
        const letters = ['A', 'B', 'C', 'D'];
        const questionsList = combinedQuestions.slice(0, requestedCount).map((q: any, idx: number) => {
          if (typeof q === 'string') {
            return {
              id: idx + 1,
              title: `Question ${idx + 1}`,
              prompt: q,
              options: ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
              correctAnswer: "A) Option A",
              explanation: ""
            };
          }

          let rawOptions = Array.isArray(q.options) ? q.options.map(String) : [];
          if (rawOptions.length < 4) {
            const fallbacks = ["A) Option A", "B) Option B", "C) Option C", "D) Option D"];
            while (rawOptions.length < 4) {
              rawOptions.push(fallbacks[rawOptions.length]);
            }
          } else if (rawOptions.length > 4) {
            rawOptions = rawOptions.slice(0, 4);
          }

          const formattedOptions = rawOptions.map((opt: string, optIdx: number) => {
            const trimmed = opt.trim();
            const letterPrefixMatch = trimmed.match(/^[A-Da-d][\)\.:\s]\s*(.*)$/);
            const content = letterPrefixMatch ? letterPrefixMatch[1] : trimmed;
            return `${letters[optIdx]}) ${content}`;
          });

          const rawAns = String(q.correctAnswer || '').trim();
          let resolvedAnswer = formattedOptions[0];

          const letterMatch = rawAns.match(/^[A-Da-d]$/) || rawAns.match(/^Option\s+([A-Da-d])/i) || rawAns.match(/^([A-Da-d])[\)\.:\s]/i);
          if (letterMatch) {
            const matchedLetter = (letterMatch[1] || letterMatch[0]).toUpperCase();
            const lIdx = letters.indexOf(matchedLetter);
            if (lIdx >= 0 && lIdx < formattedOptions.length) {
              resolvedAnswer = formattedOptions[lIdx];
            }
          } else {
            const cleanRawAns = rawAns.toLowerCase().replace(/^[a-d][\)\.:\s]+/, '').trim();
            const foundOpt = formattedOptions.find(opt => {
              const cleanOpt = opt.toLowerCase().replace(/^[a-d][\)\.:\s]+/, '').trim();
              return cleanOpt === cleanRawAns;
            });
            if (foundOpt) {
              resolvedAnswer = foundOpt;
            } else {
              const subOpt = formattedOptions.find(opt => opt.toLowerCase().includes(cleanRawAns) || (cleanRawAns.length > 3 && cleanRawAns.includes(opt.toLowerCase())));
              if (subOpt) resolvedAnswer = subOpt;
            }
          }

          return {
            ...q,
            id: idx + 1,
            title: q.title || `Question ${idx + 1}`,
            prompt: q.prompt || q.question || q.text || q.scenario || "",
            options: formattedOptions,
            correctAnswer: resolvedAnswer
          };
        });
        const balancedList = shuffleAndBalanceTestPrepQuestions(questionsList);
        return res.json({ questions: balancedList, questionType: 'objective', subject, count: balancedList.length });
      }
      throw new Error("Failed to generate a valid AP objective questions structure.");
    } else {
      // Subjective (FRQ / DBQ / LEQ / SAQ) with parallel batching, retries & auto-backfill
      const generateSubjectiveBatch = async (batchCount: number, bIdx: number, extraAvoid: string[] = []): Promise<any[]> => {
        const batchOffset = bIdx >= 80 ? 0 : batchSizes.slice(0, bIdx).reduce((a, b) => a + b, 0);
        const batchArchetypes = allArchetypes.slice(batchOffset, batchOffset + batchCount);
        const batchArchetypePlan = batchArchetypes.map((arch, idx) => `  - Question ${batchOffset + idx + 1} Target Archetype: ${arch}`).join('\n');
        const batchSeed = `${randomSeed || Date.now()}_b${bIdx + 1}_${Math.random().toString(36).substring(2, 6)}`;

        let combinedAntiRepetition = antiRepetitionDirective;
        if (extraAvoid.length > 0) {
          const avoidLines = extraAvoid.slice(0, 15).map((p, i) => `  [SESSION EXCLUDED ${i + 1}]: "${p.replace(/\n+/g, ' ').slice(0, 120)}"`).join('\n');
          combinedAntiRepetition += `\n\nSTRICT PREVIOUS QUESTIONS AVOIDANCE (NO DUPLICATES):\n${avoidLines}`;
        }

        const systemInstruction = `You are an AP Exam Chief Reader and Author of official College Board Scoring Guidelines.
The student is preparing for the AP ${subject} Exam.
Your task is to generate exactly ${batchCount} authentic, high-yield AP Exam FREE RESPONSE / SUBJECTIVE QUESTIONS for: "${targetTopic}".

CRITICAL COLLEGE BOARD AP EXAM STANDARDS:
1. AUTHENTIC MULTI-PART STRUCTURE: AP Free Response Questions always consist of clearly delineated sub-parts: (a), (b), (c) (and optionally (d)). Each sub-part must clearly test specific College Board cognitive skills (e.g., Identify, Calculate, Justify, Explain, Describe, Graph, Show).
2. CLEAR LINE BREAKS: Separate each part with a double newline '\\n\\n' so each part starts clearly on a new line.
3. OFFICIAL SCORING GUIDELINES & POINT BREAKDOWN: Provide a precise, point-by-point College Board Reader rubric in an array 'scoringRubric'. Each item should state what earns the point (e.g., '+1 pt for applying product rule', '+1 pt for correctly stating units', '+1 pt for citing historical document').
4. STEP-BY-STEP EXEMPLARY MODEL ANSWER (CRITICAL):
   Provide a complete, maximum-points exemplary student response in 'modelAnswer'.
   - ALWAYS format each sub-part with a clear label and double newlines ('\\n\\n'):
     Part (a): [Step-by-step mathematical/conceptual setup, formula substitution, and complete concluding sentence.]\\n\\nPart (b): [Step-by-step reasoning, calculations, and final value with units.]\\n\\nPart (c): [Thorough analytical justification and conclusion.]
   - NEVER glue parts or sentences together (NEVER output things like 'holds.(b)' or 'x=2.(c)'). ALWAYS leave clean double newlines and spaces between words, sentences, and sub-parts!
5. TOTAL POINTS: Total point value for this problem (e.g. 9 points for Calculus/CSA, 10 points for Chem, 7 points for DBQ, 4 points for Short FRQ).
6. MANDATORY COLLEGE BOARD SVG DIAGRAMS & GRAPHS (CRITICAL):
   For all graphical, experimental, and visual subjects/units:
   - AP Calculus (Limits & Continuity, piecewise functions with holes/discontinuities, derivatives, tangent lines, graphs of f'(x), Riemann sum areas, slope fields).
   - AP Physics (kinematics v-t/x-t graphs, Free-Body Force Diagrams with labeled force vectors, projectile trajectories, electric circuit schematics).
   - AP Chemistry (reaction coordinate energy profiles with Delta H & Ea, acid-base titration curves with equivalence point, PES spectra).
   - AP Biology (pedigree charts, enzyme kinetics curves, cell signaling feedback loops).
   - AP Micro/Macroeconomics (supply & demand equilibrium shifts, PPC, Phillips curves).
   - AP Statistics (box plots with 5-number summary & outliers, normal distribution bell curves).

   The question prompt MUST refer to the visual diagram naturally using varied lead-ins (e.g. "In the experiment depicted in the accompanying figure...", "Based on the plotted data in the graph above...", "A researcher examines the model shown in the figure...", "According to the diagram provided..."). NEVER begin every question with the exact same repetitive formulaic words.
   
   SVG TECHNICAL REQUIREMENTS (MANDATORY SAFE BOUNDS - ZERO CLIPPING):
   - Root tag: <svg viewBox='0 0 400 220' xmlns='http://www.w3.org/2000/svg' width='100%' height='auto'>...</svg>
   - Dark contrast container: <rect width='400' height='220' fill='#09090b' rx='12' stroke='#27272a' stroke-width='1'/>
   - STRICT SAFE DRAWING ZONE (CRITICAL):
     * Keep ALL curves, plotted points, coordinate axes, and labels strictly within the inner bounding box: x between 25 and 375, and y between 25 and 195.
     * NEVER draw any curve peak, inflection point, asymptote, or circle where y < 20 or y > 200, so curves NEVER touch or get cut off by the border!
   - Coordinate Axes: stroke='#94a3b8' stroke-width='2' with arrowheads and axis labels (e.g. 'x', 'y = f(x)').
   - Grid lines: stroke='#1e293b' stroke-dasharray='2,2'.
   - Calculus Discontinuities / Holes: Use hollow circles for removable holes (<circle cx='...' cy='...' r='4.5' fill='#09090b' stroke='#38bdf8' stroke-width='2.5'/>) and solid dots for defined points (<circle cx='...' cy='...' r='4.5' fill='#38bdf8'/>).
   - Curves / Shapes: High-contrast stroke='#38bdf8' or stroke='#818cf8' stroke-width='2.5' fill='none'.
   - Text labels: fill='#f8fafc' font-size='12' font-family='sans-serif' font-weight='bold'.
   - Only set diagramSvg to "" if the subject is purely literary/historical (e.g. AP English Lit, AP History).

${subjectGuidelines}
${gradeCalibrationInstruction}
${combinedAntiRepetition}

BATCH TARGET ARCHETYPES:
${batchArchetypePlan}

CRITICAL CODE, MATH & LATEX FORMATTING:
- FOR COMPUTER SCIENCE / PROGRAMMING (AP Computer Science A, AP Computer Science Principles):
  * Always format code snippets inside standard Markdown fenced code blocks (\`\`\`java ... \`\`\`).
  * In code blocks and programming expressions, ALWAYS use standard programming operators: '<=', '>=', '!=', '==', '&&', '||', '<', '>'. NEVER substitute LaTeX symbols like \\leqslant, \\le, \\ge, \\times into code!
  * For inline variable names, methods, or keywords in question text (e.g. \`reverseString("APCS")\`, \`true\`, \`false\`, \`StackOverflowError\`), ALWAYS use Markdown backticks (\`code\`) and NEVER raw LaTeX like \\texttt{...}.
- FOR MATHEMATICS & SCIENCE (AP Calculus, AP Physics, AP Chemistry, AP Statistics):
  * Wrap all mathematical expressions in valid LaTeX syntax: $...$ for inline or $$...$$ for block.
  * For data tables and matrices, ALWAYS wrap in $$ block delimiters:
    $$\\begin{array}{c|ccccc} x & -1 & 0 & 2 & 3 & 4 \\\\ \\hline g(x) & -5 & 3 & -2 & 7 & 10 \\end{array}$$
    NEVER output bare \\begin{array} without $$...$$ delimiters!
  * For piecewise functions, ALWAYS use clean LaTeX with $$:
    $$f(x) = \\begin{cases} g(x) & \\text{for } x < c \\\\ h(x) & \\text{for } x \\ge c \\end{cases}$$
    NEVER write raw unescaped pseudo-code like 'f(x) = { ... }' or '<=' inside math equations that breaks KaTeX!
  * Always double-escape backslashes in JSON output: \\\\frac, \\\\le, \\\\ge, \\\\to, \\\\infty, \\\\begin{cases}, \\\\end{cases}, \\\\begin{array}, \\\\end{array}.

STRICT JSON OUTPUT:
Return ONLY a valid JSON object with key "questions" containing an array of objects:
{
  "questions": [
    {
      "id": 1,
      "title": "FRQ 1: Multi-Part Analytical Problem",
      "prompt": "Scenario/stimulus referencing the diagram above followed by:\\n\\n(a) Sub-part A prompt...\\n\\n(b) Sub-part B prompt...\\n\\n(c) Sub-part C prompt...",
      "diagramSvg": "<svg viewBox='0 0 400 220' xmlns='http://www.w3.org/2000/svg'>...</svg>",
      "diagramType": "piecewise_graph",
      "totalPoints": 9,
      "modelAnswer": "(a) Full exemplary solution for part a...\\n\\n(b) Full exemplary solution for part b...\\n\\n(c) Full exemplary solution for part c...",
      "scoringRubric": [
        "1 point for correct formula/setup",
        "1 point for accurate mathematical/conceptual justification",
        "1 point for final answer with correct units or specific terminology"
      ],
      "skill": "Relevant AP Unit / Skill Tag"
    }
  ]
}
NEVER include multiple-choice options A/B/C/D in subjective output.`;

        const makeCall = async (seed: string): Promise<any[]> => {
          const response = await safeGenerateContent({
            gradeLevel: gradeLevel || "AP High School (Advanced Placement)",
            model: "gemini-3.5-flash-lite",
            timeoutMs: 90000,
            contents: { parts: [{ text: `Subject: ${subject}. Unit/Topic: ${targetTopic}. Batch Seed: ${seed}.
Generate exactly ${batchCount} authentic College Board AP Exam Free Response / Subjective Questions for this batch.
Target Archetypes for this batch:
${batchArchetypePlan}
IMPORTANT: Ensure 100% diversity and fresh non-repetitive problems with unique functions, numbers, and scenarios. Do not repeat standard textbook clichés!
If this is AP Calculus, AP Physics, AP Chemistry, AP Biology, AP Economics, or AP Statistics, generate authentic graph/diagram-based questions and provide the complete College Board standard SVG in "diagramSvg" with coordinate axes, curves, and labeled points so the student analyzes the visual graphic!` }] },
            config: {
              systemInstruction: { parts: [{ text: systemInstruction }] },
              responseMimeType: "application/json",
              maxOutputTokens: 16384,
              temperature: 0.75
            }
          });

          const generatedText = response.text || "";
          const parsed = safeParseJSON(generatedText, 'object');
          let questionsList: any[] = [];
          if (parsed && Array.isArray(parsed.questions)) {
            questionsList = parsed.questions;
          } else if (Array.isArray(parsed)) {
            questionsList = parsed;
          } else if (parsed && typeof parsed === 'object') {
            const found = Object.values(parsed).find(v => Array.isArray(v));
            if (found) questionsList = found as any[];
          }
          return questionsList;
        };

        try {
          const res = await makeCall(batchSeed);
          if (Array.isArray(res) && res.length > 0) return res;
        } catch (firstErr) {
          console.warn(`[generate-ap-questions] Subjective batch ${bIdx + 1} initial attempt error:`, firstErr);
        }

        try {
          const retrySeed = `${batchSeed}_retry_${Date.now()}`;
          const retryRes = await makeCall(retrySeed);
          return retryRes || [];
        } catch (retryErr) {
          console.warn(`[generate-ap-questions] Subjective batch ${bIdx + 1} retry error:`, retryErr);
          return [];
        }
      };

      const batchPromises = batchSizes.map((batchCount, bIdx) => generateSubjectiveBatch(batchCount, bIdx));
      const batchResults = await Promise.allSettled(batchPromises);
      let combinedQuestions: any[] = [];
      for (const res of batchResults) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          combinedQuestions.push(...res.value);
        } else if (res.status === 'rejected') {
          console.warn('[generate-ap-questions] Subjective batch error:', res.reason);
        }
      }

      // Guaranteed auto-backfill loop: if fewer questions than requested were generated, backfill the deficit
      let backfillAttempts = 0;
      while (combinedQuestions.length < requestedCount && backfillAttempts < 2) {
        backfillAttempts++;
        const missingCount = requestedCount - combinedQuestions.length;
        console.warn(`[generate-ap-questions] Subjective questions deficit: got ${combinedQuestions.length}/${requestedCount}. Backfilling ${missingCount} questions (attempt ${backfillAttempts})...`);
        try {
          const existingPrompts = combinedQuestions.map((q: any) =>
            (typeof q === 'string' ? q : (q.prompt || q.question || q.title || '')).slice(0, 140)
          ).filter(Boolean);
          const backfillResult = await generateSubjectiveBatch(missingCount, 80 + backfillAttempts, existingPrompts);
          if (Array.isArray(backfillResult) && backfillResult.length > 0) {
            combinedQuestions.push(...backfillResult);
          }
        } catch (bfErr) {
          console.warn('[generate-ap-questions] Subjective backfill attempt failed:', bfErr);
        }
      }

      if (combinedQuestions.length > 0) {
        const questionsList = combinedQuestions.slice(0, requestedCount).map((q: any, idx: number) => {
          if (typeof q === 'string') {
            return {
              id: idx + 1,
              title: `FRQ ${idx + 1}: Multi-Part Analytical Problem`,
              prompt: q,
              diagramSvg: "",
              diagramType: "none",
              modelAnswer: "",
              scoringRubric: []
            };
          }
          return {
            ...q,
            id: idx + 1,
            title: q.title || `FRQ ${idx + 1}: Multi-Part Analytical Problem`,
            prompt: q.prompt || q.question || q.text || q.scenario || ""
          };
        });
        return res.json({ questions: questionsList, questionType: 'subjective', subject, count: questionsList.length });
      }
      throw new Error("Failed to generate a valid AP subjective questions structure.");
    }
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({ 
        error: "QUOTA_EXCEEDED",
        text: `⚠️ AP Prep Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("AP Question generation endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AP questions" });
  }
});

app.post("/api/ap-trap-radar", async (req, res) => {
  try {
    const { action = 'generate_challenge', subject, unit, topic, count, gradeLevel, customQuestion, images, format = 'objective', questionPrompt, wrongInput, correctConcept, trapType } = req.body;

    // ACTION 1: Explain Mistake (AI Mistake Doctor)
    if (action === 'explain_mistake') {
      const explainSystemInstruction = `You are a world-renowned College Board AP Exam Chief Reader, Lead Psychometrician, and Master Educational Diagnostician.
A high school AP student was practicing with the "AP TRAP RADAR™" and fell into a deceptive College Board distractor trap.
Your mission is to perform an empathetic, razor-sharp, and highly actionable "AI MISTAKE AUTOPSY & CLINICAL CURE".

CRITICAL PEDAGOGICAL OBJECTIVES:
1. "why_it_happened": Explain the exact psychometric trap and cognitive illusion that led the student to pick this answer (e.g. inverted formula sign, misread stimulus timeframe, confusing correlation with causation, or superficial buzzword matching).
2. "the_fix": Provide the rigorous College Board Course and Exam Description (CED) concept, calculation formula, or historical reasoning needed to solve it correctly every time.
3. "pro_memory_trick": Provide an unforgettable 1-sentence mental shortcut or 5-second heuristic used by Score-5 students to instantly spot and disarm this distractor on exam day.

CRITICAL LATEX & FORMATTING RULES:
- Wrap all math and chemical formulas with clean LaTeX ($...$ or $$...$$) without breaks inside delimiters.

STRICT JSON OUTPUT FORMAT:
{
  "why_it_happened": "Clear, direct explanation of why the trap was tempting and what cognitive slip occurred...",
  "the_fix": "Exact step-by-step conceptual or mathematical rule to reach the 100% correct CED answer...",
  "pro_memory_trick": "⚡ Unforgettable Score-5 rule / mnemonic to disarm this trap in 5 seconds."
}`;

      const response = await safeGenerateContent({
        gradeLevel: gradeLevel || "AP High School (Advanced Placement)",
        model: "gemini-3.5-flash-lite",
        contents: { parts: [{ text: `Question: ${questionPrompt || 'AP Question'}\nStudent Chose / Mistake: ${wrongInput || 'Distractor Trap'}\nCorrect Concept / Target: ${correctConcept || 'CED Standard'}\nTrap Type: ${trapType || 'Psychometric Trap'}` }] },
        config: {
          systemInstruction: { parts: [{ text: explainSystemInstruction }] },
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      const parsed = safeParseJSON(response.text || "{}", 'object');
      return res.json({ success: true, aiFix: parsed });
    }

    // ACTION 2: Analyze Custom Question / Image
    if (action === 'analyze_custom') {
      if (!customQuestion && (!images || images.length === 0)) {
        return res.status(400).json({ error: "Please provide question text or an image to analyze." });
      }

      const systemInstruction = `You are a Senior College Board AP Exam Psychometrician, Chief Reader, and Master Distractor Architect.
Your mission is to perform an exhaustive "TRAP RADAR AUTOPSY" on the provided AP Exam multiple-choice question or stimulus image.

PHASE 1: RIGOROUS INPUT VALIDATION (MANDATORY FIRST STEP):
Before analyzing, inspect the user's input text and attached images:
1. DOES THE INPUT CONTAIN AN ACTUAL ACADEMIC / AP EXAM QUESTION, PROBLEM STEM, DATA SCENARIO, OR MULTIPLE-CHOICE OPTIONS?
2. IF THE INPUT IS:
   - A greeting, conversational chit-chat, or pleasantry (e.g. "hi", "hello", "hey", "good morning", "how are you", "yo")
   - Single random words, numbers, or keyboard gibberish (e.g. "asdf", "test", "123", "ok", "cool")
   - Non-academic sentences with NO question, problem, or multiple-choice choices to analyze
   THEN YOU MUST NOT INVENT, FABRICATE, OR HALLUCINATE A QUESTION OR OPTIONS.
   INSTEAD, YOU MUST RETURN STRICTLY THIS JSON:
   {
     "isInvalidQuestion": true,
     "errorMessage": "Input is not a valid AP question. Please enter an actual AP exam question prompt, stimulus, and options (A, B, C, D) or snap a photo of your AP worksheet/test so the Trap Radar can dissect the distractors."
   }

PHASE 2: TRAP RADAR AUTOPSY (ONLY FOR VALID AP QUESTIONS):
If the input is a genuine AP or academic multiple-choice problem:
College Board MCQs are famous for engineering 6 distinct Distractor Archetypes:
1. 🪤 The Reverse Logic / Sign Flip Trap (Correct calculation but flipped sign, reciprocal, or reversed direction).
2. 🪤 The Half-Truth Scope Creep Trap (A statement that is factually true in real life, BUT does not answer the stimulus prompt or exceeds CED scope).
3. 🪤 The Chronological / Evolutionary Anachronism Trap (Correct event or process, but placed in the wrong century, epoch, or phase).
4. 🪤 The Absolute Qualifier / Extreme Word Trap (Includes 'always', 'never', 'solely', 'invariably' which invalidates an otherwise plausible claim).
5. 🪤 The Pseudo-Vocabulary Jargon Trap (Strings together authentic unit buzzwords into a scientifically or historically nonsensical mechanism to bait superficial guessers).
6. 🪤 The Intermediate Step / Premature Stop Trap (Calculates an intermediate value correctly, but fails to execute the final step required by the prompt).

ANALYZE THE QUESTION THOROUGHLY:
1. Identify the AP Subject and Core Unit/Skill.
2. Question & Concept Master Breakdown: Provide a crystal-clear, thorough pedagogical explanation of what the question is asking, what underlying AP course concept, theorem, formula, or historical event it tests, and the step-by-step logic required to solve it.
3. Determine which option is the true, verified correct answer, and explain why it is 100% correct according to the CED.
4. For EVERY option (A, B, C, D), deconstruct its purpose with deep pedagogical clarity:
   - If correct: Mark as "🎯 Official College Board Target". In "trapDescription", write an authoritative, crystal-clear explanation demonstrating exactly WHY this choice is 100% correct according to the College Board Course and Exam Description (CED), validating any formulas, definitions, or historical causal chains.
   - If incorrect: Identify the exact Trap Archetype. In "trapDescription", write a sharp, eye-opening diagnosis of the exact misconception, calculation slip, or subtle wording trick that causes students to choose it, and explain why it is factually or conceptually flawed.
   - In "text": Provide the exact text of the choice without prepending the letter (e.g. "All living organisms share a common ancestral origin", NOT "A) All living organisms...").
5. Provide the "5-Second Disarm Secret": A bulletproof heuristic or mental model to immediately spot and eliminate the distractor on the real exam.

CRITICAL LATEX & FORMULA FORMATTING RULES:
- Format ALL mathematical, physics, and chemical equations, variables, and formulas using standard LaTeX syntax ($...$ for inline or $$...$$ for display formulas).
- Keep each inline LaTeX equation on a single unbroken line without internal line breaks or raw HTML entities.

STRICT JSON OUTPUT FORMAT (WHEN VALID):
{
  "isInvalidQuestion": false,
  "detectedSubject": "AP Subject Name",
  "skill": "Relevant CED Unit & Learning Objective",
  "question": "The cleaned-up, properly formatted question stem (with LaTeX formatting for math/science)",
  "stimulus": "Any excerpt, table, code block, or scenario context (if applicable)",
  "conceptExplanation": "Clear, comprehensive step-by-step master breakdown explaining what the question is asking, the core AP concept tested, and the complete reasoning to reach the solution.",
  "correctAnswer": "A) ...",
  "overallTrapDifficulty": "Moderate | High | Brutal (Level 5 Distractor)",
  "traps": [
    {
      "option": "A",
      "text": "Full option text without option letter prefix",
      "isCorrect": true,
      "trapType": "🎯 Official College Board Target",
      "trapDescription": "Clear, rigorous, step-by-step explanation of why this option is 100% CED-verified correct.",
      "collegeBoardMindset": "Evaluates mastery of CED concept...",
      "vulnerabilityRate": "Target Answer (0% Trap)"
    },
    {
      "option": "B",
      "text": "Full option text without option letter prefix",
      "isCorrect": false,
      "trapType": "⚠️ The Reverse Logic / Sign Flip Trap",
      "trapDescription": "Explains why students fall for this and why it is wrong...",
      "collegeBoardMindset": "Test-makers set this trap for students who...",
      "vulnerabilityRate": "38% of AP students fall for this under time pressure"
    }
  ],
  "disarmStrategy": "⚡ 5-Second Disarm Secret: Quick rule to eliminate the trap instantly in the exam hall."
}`;

      const contentParts: any[] = [];
      if (images && Array.isArray(images) && images.length > 0) {
        for (const img of images) {
          if (!img) continue;
          const parts = img.split(',');
          const base64Data = parts[1] || img;
          const mimeType = parts[0]?.split(';')[0]?.split(':')[1] || 'image/jpeg';
          contentParts.push({
            inlineData: { mimeType, data: base64Data }
          });
        }
      }
      contentParts.push({ text: customQuestion || "Analyze this AP multiple-choice question and expose every trap option." });

      const response = await safeGenerateContent({
        gradeLevel: gradeLevel || "AP High School (Advanced Placement)",
        model: "gemini-3.5-flash-lite",
        contents: { parts: contentParts },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      const parsed = safeParseJSON(response.text || "{}", 'object');
      if (parsed && Array.isArray(parsed.traps)) {
        parsed.traps = parsed.traps.map((t: any, idx: number) => {
          const opt = String(t.option || String.fromCharCode(65 + idx)).trim().toUpperCase();
          let txt = String(t.text || '').trim();
          txt = txt.replace(new RegExp(`^\\s*${opt}\\s*[:.)-]\\s*`, 'i'), '').trim();
          return {
            ...t,
            option: opt,
            text: txt
          };
        });
      }
      return res.json({ success: true, analysis: parsed });
    }

    // ACTION 3: Generate Challenge Questions
    if (!subject) {
      return res.status(400).json({ error: "Missing AP Subject" });
    }

    const targetTopic = [topic, unit, subject].filter(Boolean).join(" - ");

    // BRANCH A: SUBJECTIVE (Section II Free Response Questions / FRQs)
    if (format === 'subjective') {
      const requestedCount = Math.min(Math.max(parseInt(count) || 3, 1), 5);

      const subjectiveSystemInstruction = `You are an elite Senior College Board AP Exam Chief Reader, Lead Item Writer, and Free-Response (FRQ) Scoring Director.
The student is training with the "AP TRAP RADAR™" to achieve a Score 5 in AP ${subject} on Section II (Free Response Questions / FRQs).
Your mission: Generate exactly ${requestedCount} ultra-authentic, high-caliber College Board AP Exam Free Response Questions (FRQ) for "${targetTopic}" embedded with REAL CHIEF READER RUBRIC TRAPS where 40%-70% of AP students forfeit critical rubric points.

RAPID GENERATION & HIGH-YIELD CONCISENESS DIRECTIVE:
- Generate high-yield, punchy, and academically rigorous questions WITHOUT verbose filler or conversational padding.
- Provide exactly 2 to 3 targeted parts per question (e.g. Part a and Part b, or a, b, c).
- Keep each Chief Reader trap description to 1 crisp sentence explaining the mistake and 1 crisp sentence for the full-credit fix.

MANDATORY STEP-BY-STEP SOLUTIONS FOR CALCULATION & QUANTITATIVE PROBLEMS:
- FOR ANY CALCULATION, DERIVATION, OR QUANTITATIVE TASK (e.g. Calculus, Physics, Chemistry, Statistics, Macro/Microeconomics):
  THE "modelAnswer" MUST BE BROKEN DOWN STRICTLY STEP-BY-STEP, displaying full mathematical rigor as required by College Board Chief Readers:
  • Step 1 [Formula Setup & Concept]: Write the fundamental equation, theorem, integral/derivative setup, or physical law before plugging in numbers.
  • Step 2 [Value Substitution & Work]: Show explicit substitution of numerical values with standard units. Show all intermediate algebraic/calculus work step-by-step.
  • Step 3 [Evaluation & Final Result]: Calculate the exact final answer, rounded to standard College Board precision (3 decimal places for AP Calculus/Stats, or appropriate significant figures for Chemistry/Physics) WITH EXPLICIT UNITS.
  • Step 4 [Interpretation / Justification]: Provide 1 clear concluding sentence connecting the numerical result back to the context of the problem (e.g. interpreting rate of change, direction of velocity/acceleration, or rejecting H0).
- FOR QUALITATIVE / EXPLANATORY PROBLEMS (e.g. History, Gov, Human Geography, Biology conceptual):
  Structure the model answer with clear sub-points:
  • Part 1: Direct Claim / Identification.
  • Part 2: Evidence citation directly referencing the stimulus text or data.
  • Part 3: Explicit causal reasoning connecting the evidence to the broader concept.
- NEVER PROVIDE A SHORT 1-LINE ANSWER FOR A CALCULATION. Every single calculation point MUST have its setup and intermediate work clearly visible.

AUTHENTIC COLLEGE BOARD AP EXAM STANDARDS (STRICT REQUIREMENT):
1. REAL AP STIMULUS & MULTI-PART COLLEGE BOARD ARCHITECTURE:
   - AP Human Geography (APHG): Authentic geographic scenarios with demographic data tables, population pyramids, urban land-use models (Burgess, Hoyt, Harris-Ullman, galactic), agricultural systems (von Thünen, Green Revolution), or spatial diffusion maps. Formatted as 4-to-7-point multi-part prompts (Parts a, b, c, d) with exact College Board task verbs: "Identify", "Describe", "Explain how", "Explain the degree to which", "Compare".
   - AP STEM Sciences (Biology, Chemistry, Physics 1/2/C, Environmental Science): Authentic experimental design, raw lab observation data tables, reaction coordinates, biological feedback loops, or physical systems. Multi-part (a), (b), (c), (d) using CED task verbs: "Calculate", "Identify", "Justify", "Describe", "Determine".
   - AP Mathematics (Calculus AB/BC, Statistics): Multi-part analytical problems with contextual rate functions (e.g. rate in/rate out $R(t)$, $L(t)$), particle kinematics, Riemann sums, differential equations, Taylor polynomials, or hypothesis tests with standard conditions.
   - AP History & Social Sciences (APUSH, World, Euro, US Gov): Authentic primary or secondary historical source excerpt with full bibliographic citation (Author, Document title, Date), followed by 3-part Short Answer Question (SAQ) (Parts a, b, c). For AP Gov: SCOTUS Comparison or Quantitative Analysis FRQ.
   - AP Computer Science (CSA): Formal class design, 2D array traversal, or ArrayList manipulation problem with method signatures, preconditions, and postconditions.
   - AP Economics (Macroeconomics, Microeconomics): Multi-step scenario with economic curve shifts (AD/AS, Phillips curve, Money Market, Loanable Funds, PPC, externalities) and step-by-step causal chain analysis.

2. AUTHENTIC CHIEF READER RUBRIC TRAPS (WHERE 50%+ OF AP STUDENTS FORFEIT POINTS):
   Every part of the FRQ MUST diagnose the exact real-world pitfalls documented in College Board Chief Reader reports:
   🪤 The Naked Number / Missing Units Trap (writing calculation results without formula substitution or omitting standard SI/economic units, forfeiting the point).
   🪤 The Unjustified Claim / Data Citation Gap Trap (making a correct claim but failing to cite specific numerical data points or direct textual evidence from the stimulus).
   🪤 The Circular Reasoning / Prompt Echo Trap (restating the prompt's premise instead of explaining the underlying causal mechanism e.g. saying "TFR decreased because birth rate went down").
   🪤 The Ambiguous Reference / Vague Pronoun Trap (writing "it", "they", or "this factor" without explicitly naming the chemical species, geographic actor, or variable).
   🪤 The Task Verb Misalignment Trap (answering an "Explain" prompt with merely an "Identify" statement without linking the cause to the effect).
   🪤 The Scope Creep / Wrong Scale Trap (discussing the wrong geographic scale, outside historical era, or exceeding CED limits).

3. SCORING CRITERIA & FULL-CREDIT MODEL ANSWERS:
   - Provide exact College Board scoring criteria for EVERY part (e.g. "Earns 1 point for correctly calculating... with units and work shown").
   - Provide a 100% full-credit exemplary model answer demonstrating the exact phrasing Chief Readers award points for.
   - Provide "disarmStrategy": The Chief Reader's 5-Second Rule to secure maximum points and eliminate point deductions.
   - Format ALL mathematical and chemical equations, variables, and formulas using clean standard LaTeX ($...$ for inline or $...$ for display). Keep each inline LaTeX formula on a single unbroken line.

STRICT JSON OUTPUT FORMAT:
Return ONLY a valid JSON array of question objects:
[
  {
    "id": 1,
    "format": "subjective",
    "prompt": "Multi-part AP Free Response Question stem with background scenario and context...",
    "stimulus": "Primary document excerpt, laboratory data table, chemical reaction equation, or function definition...",
    "totalPoints": 4,
    "overallTrapDifficulty": "High (Level 4 FRQ Trap)",
    "parts": [
      {
        "partLabel": "(a)",
        "task": "Specific task prompt with College Board task verb...",
        "points": 1,
        "scoringCriteria": "Earns 1 point for correctly explaining/calculating...",
        "modelAnswer": "Step 1 (Formula Setup): Total distance is $D = \\int_{0}^{2} \\sqrt{(x'(t))^2 + (y'(t))^2}\\,dt$.\nStep 2 (Derivatives & Substitution): $x'(t) = 2t - 3$ and $y'(t) = e^{-t^2}$. Thus $D = \\int_{0}^{2} \\sqrt{(2t - 3)^2 + e^{-2t^2}}\\,dt$.\nStep 3 (Evaluation): Evaluating the definite integral yields $D \\approx 3.486$ units.\nStep 4 (Interpretation): This value represents the total path length traveled by the particle from $t = 0$ to $t = 2$.",
        "frqTraps": [
          {
            "trapName": "🪤 The Unjustified Claim Trap",
            "howStudentsLosePoints": "Students identify the correct trend but fail to cite specific data points from Table 1, forfeiting the point.",
            "vulnerabilityRate": "56% of students lose this point",
            "fullCreditFix": "Always state the numerical value from the table and explicitly connect it to the mechanism."
          }
        ]
      }
    ],
    "disarmStrategy": "⚡ Chief Reader Scoring Secret: The exact rubric requirement to guarantee full credit and avoid common point deductions.",
    "skill": "Relevant AP Skill / CED Unit"
  }
]`;

      const response = await safeGenerateContent({
        gradeLevel: gradeLevel || "AP High School (Advanced Placement)",
        model: "gemini-3.5-flash-lite",
        contents: { parts: [{ text: `Generate ${requestedCount} authentic AP ${subject} Free Response Trap Radar questions for ${targetTopic}.` }] },
        config: {
          systemInstruction: { parts: [{ text: subjectiveSystemInstruction }] },
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      const parsed = safeParseJSON(response.text || "[]", 'array');
      let questionsList: any[] = [];
      if (Array.isArray(parsed)) {
        questionsList = parsed;
      } else if (parsed && Array.isArray(parsed.questions)) {
        questionsList = parsed.questions;
      } else if (parsed && typeof parsed === 'object') {
        const found = Object.values(parsed).find(v => Array.isArray(v));
        if (found) questionsList = found as any[];
      }

      if (questionsList.length > 0) {
        const finalized = questionsList.map((q, idx) => ({
          ...q,
          id: q.id || (idx + 1),
          format: 'subjective',
          totalPoints: q.totalPoints || (q.parts ? q.parts.reduce((sum, p) => sum + (Number(p.points) || 1), 0) : 4)
        }));
        return res.json({ success: true, questions: finalized, subject, unit: targetTopic, count: finalized.length, format: 'subjective' });
      }
      throw new Error("Failed to generate valid Subjective Trap Radar questions.");
    }

    // BRANCH B: OBJECTIVE (Section I Multiple Choice Questions / MCQs)
    const requestedCount = Math.min(Math.max(parseInt(count) || 5, 1), 10);

    const systemInstruction = `You are a Senior College Board AP Exam Chief Psychometrician, Lead Item Writer, and Master Distractor Architect.
The student is training with the "AP TRAP RADAR™" to achieve a Score 5 in AP ${subject}.
Your mission: Generate exactly ${requestedCount} ultra-authentic, high-caliber College Board AP Exam Multiple Choice Questions for "${targetTopic}" with DECEPTIVELY ENGINEERED PSYCHOMETRIC DISTRACTOR TRAPS.

RAPID HIGH-SPEED GENERATION RULES:
- Generate with ultra-high speed and razor-sharp clarity. Keep each trapDescription to 1 crisp, direct sentence.
- Keep each collegeBoardMindset to 1 concise sentence.
- Keep disarmStrategy to 1 sharp, high-yield heuristic.
- No conversational preambles or filler. Output strictly valid JSON array directly.

MANDATORY 25% BALANCED ANSWER DISTRIBUTION (CRITICAL RULE):
- YOU MUST DISTRIBUTE THE CORRECT TARGET OPTION EVENLY ACROSS ALL 4 POSITIONS (A, B, C, D) WITH ROUGHLY 25% PROBABILITY EACH.
- OVER-RELIANCE ON OPTION B IS STRICTLY FORBIDDEN. Ensure Option C, Option D, and Option A are evenly chosen as correct targets.
- Ensure varied correct target positions without consecutive identical answers.

AUTHENTIC COLLEGE BOARD AP EXAM STANDARDS (STRICT REQUIREMENT):
1. REAL AP STIMULUS-BASED FORMAT:
   - AP History / Social Sciences (APUSH, World History, Euro, Gov, Human Geography): Every question MUST feature an authentic historical primary/secondary source excerpt (with author attribution, document title, and date e.g. "Source: John Locke, Two Treatises of Government, 1689"), historical treaty, political speech, map interpretation, or economic data table.
   - AP STEM Sciences (Biology, Chemistry, Physics, Environmental Science): Every question MUST feature a realistic laboratory experiment scenario, biological feedback pathway, reaction coordinate, data observation table, or physical system with formal variables.
   - AP Mathematics (Calculus AB/BC, Statistics): Questions MUST use rigorous College Board mathematical notation ($f(x)$, derivatives, Riemann sums, differential equations, sampling distributions) testing conceptual theorems (MVT, IVT, EVT) or rate-of-change tables.
   - AP Computer Science (CSA, CSP): Questions MUST contain authentic AP Java Subset code snippets (e.g. 2D arrays, ArrayList, object references, off-by-one loop boundaries, boolean logic) requiring precise execution tracing.
   - AP Economics (Macroeconomics, Microeconomics): Questions MUST test multi-step fiscal/monetary chain reactions, curve shifts, elasticity calculations, or market equilibrium models.

2. AUTHENTIC COLLEGE BOARD DISTRACTOR TRAPS (NO OBVIOUS / SILLY WRONG ANSWERS):
   Every question MUST feature 4 options (A, B, C, D):
   - EXACTLY 1 OPTION: The 100% verified, mathematically/historically sound College Board Target.
   - THE OTHER 3 OPTIONS: Must be genuine statistical traps designed to exploit standard high-school misconceptions that 40%-60% of AP test-takers pick:
     🪤 The Reverse Logic / Arithmetic Slip Trap (inverted derivative/integral sign, reciprocal, flipped cause-and-effect).
     🪤 The Half-Truth / Scope Creep Trap (factually true in real life, BUT does not answer the stimulus excerpt or exceeds CED scope).
     🪤 The Chronological / Evolutionary Anachronism Trap (correct historical event or biological mechanism, but out of historical order or incorrect phase).
     🪤 The Absolute Qualifier Trap ('always', 'solely', 'invariably' turning a plausible assertion into an invalid claim).
     🪤 The Pseudo-Vocabulary Jargon Salad Trap (strings together legitimate unit keywords into a mechanism that makes no logical sense).
     🪤 The Intermediate Calculation Stop Trap (stops after finding an intermediate variable $x$ or moles $n$, rather than the final requested quantity).

3. SCORING & DISARMING SECRETS:
   - Provide the "5-Second Disarm Secret": A sharp, pragmatic mental heuristic used by AP 5-scorers to neutralize and cross out the distractors in seconds.
   - Format ALL math and chemistry formulas with clean LaTeX ($...$ or $$...$$) without breaks inside delimiters.
   - Ensure EXACTLY ONE OPTION is correct and 'correctAnswer' matches the exact string in 'options'.

STRICT JSON OUTPUT FORMAT:
Return ONLY a valid JSON array of question objects:
[
  {
    "id": 1,
    "format": "objective",
    "prompt": "Clear, stimulus-based AP question stem...",
    "stimulus": "Optional source excerpt, data table, code snippet, or historical quote (or empty string)",
    "options": [
      "A) ...",
      "B) ...",
      "C) ...",
      "D) ..."
    ],
    "correctAnswer": "A) ...",
    "overallTrapDifficulty": "High (Level 4 Trap)",
    "traps": [
      {
        "option": "A",
        "isCorrect": true,
        "trapType": "🎯 Official College Board Target",
        "trapDescription": "Why this option is the sole CED-compliant answer.",
        "collegeBoardMindset": "Evaluates foundational CED objective...",
        "vulnerabilityRate": "N/A"
      },
      {
        "option": "B",
        "isCorrect": false,
        "trapType": "🪤 The Reverse Logic / Sign Flip Trap",
        "trapDescription": "Why students fall for this...",
        "collegeBoardMindset": "Designed for students who missed the negative sign...",
        "vulnerabilityRate": "42% of students choose this"
      },
      {
        "option": "C",
        "isCorrect": false,
        "trapType": "🪤 The Half-Truth / Scope Creep Trap",
        "trapDescription": "Why students fall for this...",
        "collegeBoardMindset": "Exploits superficial reading of the passage...",
        "vulnerabilityRate": "27% of students choose this"
      },
      {
        "option": "D",
        "isCorrect": false,
        "trapType": "🪤 The Absolute Qualifier Trap",
        "trapDescription": "Why students fall for this...",
        "collegeBoardMindset": "Baits students with extreme language...",
        "vulnerabilityRate": "19% of students choose this"
      }
    ],
    "disarmStrategy": "⚡ 5-Second Disarm Secret: The exact heuristic to eliminate distractors instantly on exam day.",
    "skill": "Relevant AP Skill / CED Unit"
  }
]`;

    const response = await safeGenerateContent({
      gradeLevel: gradeLevel || "AP High School (Advanced Placement)",
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: `Generate ${requestedCount} authentic AP ${subject} Trap Radar questions for ${targetTopic}.` }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const parsed = safeParseJSON(response.text || "[]", 'array');
    let questionsList: any[] = [];
    if (Array.isArray(parsed)) {
      questionsList = parsed;
    } else if (parsed && Array.isArray(parsed.questions)) {
      questionsList = parsed.questions;
    } else if (parsed && typeof parsed === 'object') {
      const found = Object.values(parsed).find(v => Array.isArray(v));
      if (found) questionsList = found as any[];
    }

    if (questionsList.length > 0) {
      const finalized = questionsList.map((q, idx) => ({
        ...q,
        id: q.id || (idx + 1),
        format: 'objective'
      }));
      const balancedFinalized = shuffleAndBalanceTrapRadarQuestions(finalized);
      return res.json({ success: true, questions: balancedFinalized, subject, unit: targetTopic, count: balancedFinalized.length, format: 'objective' });
    }
    throw new Error("Failed to generate valid Trap Radar questions structure.");
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: "⚠️ AP Trap Radar Notice: Gemini API rate limit reached. Please try again in 60 seconds."
      });
    }
    console.error("AP Trap Radar endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to run AP Trap Radar analysis" });
  }
});

app.post("/api/evaluate-answer", async (req, res) => {
  try {
    const questionText = req.body.questionText || req.body.question || "";
    const userAnswer = req.body.userAnswer || req.body.answer || "";
    const userGrade = req.body.userGrade || req.body.gradeLevel;
    const curriculum = req.body.curriculum;
    const subject = req.body.subject;
    const image = req.body.image || req.body.imageBase64 || "";
    const scoringRubric = req.body.scoringRubric;
    const modelAnswer = req.body.modelAnswer;

    if (!questionText) {
      return res.status(400).json({ error: "Missing questionText" });
    }
    if ((!userAnswer || !userAnswer.trim()) && !image) {
      return res.status(400).json({ error: "Please write an answer or attach a photo of your work before submitting for evaluation!" });
    }

    const isApExam = userGrade === 'AP High School Exam Standard' || (typeof userGrade === 'string' && userGrade.includes('AP')) || Boolean(subject && subject.includes('AP'));

    const systemInstruction = isApExam 
      ? `You are an official College Board AP Exam Chief Reader, Senior AP Table Leader, and Master AP High School Educator.
Your role is to rigorously assess, grade, and coach the student on their Free Response / Subjective submission with the authentic discipline, precision, and pedagogical standard of the College Board.

GRADING & SCORING RULES:
1. RIGOROUS AP RUBRIC POINT-BY-POINT BREAKDOWN:
   - For every sub-part (e.g. Part (a), Part (b), Part (c), Part (d)):
     - Award exact points: [X / Y Points].
     - Provide unambiguous justification citing the student's exact mathematical work, equations, units, or evidence.
     - Cite official AP grading conventions (e.g. "+1 point for correct chain rule derivative; +1 point for equating f'(x)=0; 0 points for sign chart alone without concluding sentence").
2. TOTAL OFFICIAL AP SCORE & PERCENTAGE:
   - Tally the total points earned (e.g., Score: 7 / 9 Points, 78%).
3. AUTHENTIC COLLEGE BOARD AP SCALE CONVERSION (1 to 5):
   - Translate their performance on this standard into the official 1-5 AP scale:
     - 5: Extremely Well Qualified (Top 10-15% caliber)
     - 4: Well Qualified (College Credit Ready)
     - 3: Qualified (Passing Standard)
     - 2: Possibly Qualified (Foundational Gaps)
     - 1: No Recommendation
4. PROFESSIONAL TEACHER COACHING:
   - What was done brilliantly (proper AP notation, clear justification).
   - Costly AP Traps to avoid (missing units, incomplete theorem hypotheses like continuity/differentiability).
   - High-Scoring Exemplary Revision (how to write it on exam day to guarantee 100% full credit).

OUTPUT FORMAT: Output strictly using this clean Markdown structure:

# 🎓 AP® Chief Reader & Teacher Evaluation

### 📊 Official Scorecard
- **Total AP Points**: **[Earned Points] / [Total Rubric Points] Points ([Percentage]%)**
- **Projected AP Exam Score**: **AP Score [1-5] • [Extremely Well Qualified / Well Qualified / Qualified / Needs Review]**
- **Teacher Verdict**: [Brief, professional, encouraging teacher verdict]

---

### 📋 Official Rubric Point-by-Point Breakdown
- **Part (a) [[Earned]/[Total] pts]**: [Specific College Board justification referencing student's work]
- **Part (b) [[Earned]/[Total] pts]**: [Specific College Board justification referencing student's work]
- **Part (c) [[Earned]/[Total] pts]**: [Specific College Board justification referencing student's work]
(include Part (d) if present)

---

### 👨‍🏫 Professional Teacher Feedback & AP Exam Fixes
- **🌟 Key Strengths**: [What was done accurately with proper terminology/notation]
- **⚠️ Costly Traps & Where Points Were Lost**: [Specific slips, missing conditions, or flawed notation]
- **🎯 Full-Credit College Board Standard**: [How to write or format this on the actual May AP exam to guarantee full credit]`
      : `You are a strict academic examiner. DO NOT act as a standard tutor. Your SOLE purpose is to grade the student's answer based on their grade level. YOU MUST output strictly using this format:

## Grade-Level Assessment
[Pass/Fail/Needs Improvement for this grade level]

## Step-Marking Breakdown
- Formula Selection & Concepts: [Score]/3
- Logical Working & Steps: [Score]/5
- Final Answer & Units: [Score]/2

## Final Score
**[Total Score] / 10**

## Examiner Feedback & Ideal Solution
[Explain mistakes and provide the perfect 10/10 mathematical solution]`;

    const parts: any[] = [];
    if (image) {
      let mimeType = "image/jpeg";
      let cleanBase64 = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          cleanBase64 = matches[2];
        }
      }
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64
        }
      });
    }

    parts.push({
      text: `Evaluate the student's answer for: "${questionText}".
Student's Written/Typed Answer: "${userAnswer || 'No typed text provided; student submitted handwritten work in the attached image.'}".${
      Array.isArray(scoringRubric) && scoringRubric.length > 0 ? `\n\nOfficial College Board Scoring Rubric:\n${scoringRubric.join('\n')}` : ''
    }${
      modelAnswer ? `\n\nOfficial Exemplary Model Solution:\n${modelAnswer}` : ''
    }
${image ? 'IMPORTANT: The student has provided an attached photo containing their handwritten calculations, work, or steps. Thoroughly inspect and evaluate the handwritten solution in the image against the scoring rubric.' : ''}`
    });

    const response = await safeGenerateContent({
      gradeLevel: userGrade,
      model: "gemini-3.5-flash-lite",
      contents: { parts },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] }
      }
    });

    const text = response.text || "Failed to evaluate response.";
    res.json({ evaluation: text, feedback: text });

  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({ 
        error: "QUOTA_EXCEEDED",
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("Evaluation endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to evaluate answer" });
  }
});

app.post("/api/ap-tutor-explain", async (req, res) => {
  try {
    const { questionText, stimulus, options, questionType, subject, unit, followUpQuestion, mode, correctAnswer, explanation, modelAnswer, scoringRubric, trapsData, disarmStrategy } = req.body;

    if (!questionText) {
      return res.status(400).json({ error: "Missing questionText" });
    }

    const isTrapsMode = mode === 'traps';
    const isFullSolution = mode === 'full-solution';

    let systemInstruction = '';
    if (isTrapsMode) {
      systemInstruction = `You are the Master AP Chief Reader & AP Trap Radar Specialist for College Board AP ${subject || 'Exams'}.
A high-school student is practicing with AP Trap Radar and clicked: "EXPLAIN QUESTION TRAPS WITH AI".
Your mission is to act as an elite AP Exam Examiner who knows every psychological, psychometric, and conceptual trap designed by College Board test-makers.

TRAP ANALYSIS TEACHING STRUCTURE:
1. 🪤 **Primary AP Trap Archetype**:
   - Explicitly name and classify the core trap in this question (e.g., Reverse Logic / Sign Flip, Half-Truth / Scope Creep, Chronological Anachronism, Unit / Dimension Mismatch, Formula Misapplication, Distractor Decoy, or Incomplete Justification).
2. ⚠️ **Deceptive Wording & Cognitive Triggers**:
   - Highlight the sneaky phrasing, subtle qualifiers, or tricky graph/table nuances that cause 60%+ of students to lose points (e.g., "rate of decrease vs decrease", "except", "not supported", hidden negative signs).
3. 🎯 **Distractor Autopsy (Where Students Trip)**:
   - Break down why the wrong options are so tempting and dissect the exact misconception behind each trap distractor.
4. ⚡ **Examiner's 5-Second Disarm Secret**:
   - Give the student a foolproof, actionable heuristic/rule of thumb to disarm this trap instantly on the May AP exam!
Format cleanly in Markdown with bold headers, bullet points, clean LaTeX ($...$) where applicable, and readable spacing.`;
    } else if (isFullSolution) {
      systemInstruction = `You are the AI Magic Tutor for College Board AP ${subject || 'Exams'}.
A high-school student is practicing an AP exam question and has requested a COMPLETE STEP-BY-STEP EXPLANATION AND SOLUTION.
Your mission is to act as their master AP teacher: deliver a crystal-clear, thorough, and highly pedagogical breakdown of the question, its full mathematical or conceptual solution, why the correct answer is right, why incorrect distractors fail, and essential AP exam traps to avoid.

TEACHING STRUCTURE:
1. 🎯 **Official Correct Answer & Quick Summary**: State the correct answer or key result upfront.
2. 📐 **Step-by-Step Solution & Working**: Walk through every single calculation, theorem, or piece of evidence with clean LaTeX ($...$) formulas.
3. ⚠️ **Distractor Autopsy & Common Traps**: Explain why common wrong choices fail and what misunderstandings cause students to pick them.
4. 💡 **Chief Reader AP Exam Strategy**: Share a high-scoring College Board tip to guarantee full points on similar May exam questions.
Format cleanly in Markdown with bold headers and readable spacing.`;
    } else {
      systemInstruction = `You are the AI Magic Tutor for College Board AP ${subject || 'Exams'}.
A high-school student is practicing an AP exam question and has clicked "Ask with AI" for guided hints.
Your mission is to act as their world-class AP teacher: break down the question thoroughly, explain the core concepts, and provide strategic hints so they can solve it THEMSELVES.

CRITICAL SOCRATIC AP TUTORING PRINCIPLES:
1. NEVER GIVE AWAY THE DIRECT ANSWER:
   - For Multiple Choice: DO NOT reveal which letter option (A, B, C, or D) is correct.
   - For Free Response / Subjective: DO NOT provide the final numerical answer or finished proof.
   - If the student explicitly asks "what is the answer?", politely refuse and say: "As your AP Magic Tutor, my goal is to help you crush the real AP Exam in May! Let me guide your thinking so you can solve it yourself."
2. EXPLAIN WHAT THE QUESTION IS REALLY ASKING:
   - Translate dense or intimidating College Board language into clear, intuitive concepts.
   - Clarify what each given value, graph, table, or passage excerpt represents.
3. CORE AP CONCEPTS & THEOREMS:
   - Identify the exact AP Unit and theoretical principle (e.g. Mean Value Theorem, First Law of Thermodynamics, Le Chatelier's Principle, Supply/Demand shifts, Synthesis evidence).
   - Write relevant formulas in clean LaTeX ($...$).
4. PROGRESSIVE STEP-BY-STEP HINTS:
   - 💡 **Hint 1 (Starting Point)**: What to observe, identify, or set up first.
   - 💡 **Hint 2 (Connecting the Pieces)**: How the given data fits into the formula or concept without doing the final computation.
   - 💡 **Hint 3 (Self-Reflection Check)**: A targeted question or sanity check for the student to verify their final step.
5. TONE & FORMAT:
   - Warm, empowering, brilliant high-school AP teacher tone.
   - Format cleanly in Markdown with bold headers and clear spacing.`;
    }

    let promptGoal = 'Please decode what College Board is asking, explain core concepts, and provide strategic hints so I can solve it myself without spoiling the answer!';
    if (isTrapsMode) {
      promptGoal = 'Please conduct a deep AP Trap Radar analysis on this question: expose the College Board traps, deceptive wording, why students pick the wrong distractors, and give the 5-second disarm secret!';
    } else if (isFullSolution) {
      promptGoal = 'Please provide the complete step-by-step solution, explain why the correct answer is true, why wrong options fail, and key AP traps.';
    }

    const userPrompt = followUpQuestion 
      ? `Original Question: ${questionText}\n${stimulus ? `Stimulus: ${stimulus}\n` : ''}${options && options.length > 0 ? `Options:\n${options.join('\n')}\n` : ''}\nStudent's Follow-up Question to Tutor: "${followUpQuestion}"`
      : `AP Subject: ${subject || 'AP Course'}\nUnit: ${unit || 'Curriculum Unit'}\nQuestion Type: ${questionType || 'objective'}\nQuestion:\n${questionText}\n${stimulus ? `Stimulus / Context:\n${stimulus}\n` : ''}${options && options.length > 0 ? `Multiple Choice Options:\n${options.join('\n')}\n` : ''}${correctAnswer ? `\nOfficial Correct Answer: ${correctAnswer}\n` : ''}${explanation ? `\nOfficial Explanation: ${explanation}\n` : ''}${modelAnswer ? `\nModel Answer: ${modelAnswer}\n` : ''}${scoringRubric ? `\nRubric: ${scoringRubric}\n` : ''}${trapsData ? `\nIdentified Traps Context:\n${JSON.stringify(trapsData, null, 2)}\n` : ''}${disarmStrategy ? `\nDisarm Secret Note: ${disarmStrategy}\n` : ''}\n\n${promptGoal}`;

    const response = await safeGenerateContent({
      gradeLevel: "AP High School (Advanced Placement)",
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: userPrompt }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        temperature: 0.3
      }
    });

    return res.json({ explanation: response.text || "Here is a breakdown to help you understand and solve this AP question." });
  } catch (error: any) {
    console.error("AP Tutor Explain Error:", error);
    return res.status(500).json({ error: error.message || "Failed to explain AP question" });
  }
});

app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { topic, gradeLevel, count } = req.body;
    if (!topic) {
      return res.status(400).json({ error: "Missing topic" });
    }

    const requestedCount = Math.min(Math.max(parseInt(count) || 5, 1), 30);
    const aiClient = getAI();

    const systemInstruction = `You are an Elite Academic Tutor and Curriculum Exam Expert. The user will provide a subject or specific topic. 
Your ONLY job is to generate a highly accurate, exam-level Multiple Choice Quiz for that topic.

CRITICAL RULES:
1. STRICT JSON OUTPUT: You must output ONLY a valid JSON array. Do not wrap it in markdown blockquotes like \`\`\`json. Absolutely ZERO conversational text before or after the JSON.
2. FORMAT: Generate exactly ${requestedCount} questions. Each question must have exactly 4 options and a short explanation.
3. CORRECT ANSWER: The "correctAnswer" field MUST be a single string that EXACTLY matches one of the strings in the "options" array. Do not return an array of multiple correct answers.
4. MULTIPLE EQUATIONS FORMATTING: If generating any math questions, options, or explanations that contain multiple equations (such as systems of linear equations), you must strictly separate the equations using a clear delimiter like the word 'and' or a newline character (\\n) so they do not blend together into a single string.

Use this exact JSON structure:
[
  {
    "question": "Which of the following best characterizes the key mechanism of [Concept]?",
    "options": ["A) Statement 1", "B) Statement 2", "C) Statement 3", "D) Statement 4"],
    "correctAnswer": "A) Statement 1",
    "explanation": "Clear educational breakdown justifying why the correct option is true and why the distractors are incorrect."
  }
]`;

    const avoidList = Array.isArray(req.body.avoidPrompts) ? req.body.avoidPrompts.filter(Boolean).slice(0, 10) : [];
    const avoidDirective = avoidList.length > 0
      ? `\nSTRICT ANTI-REPETITION: Do NOT repeat or generate questions similar to these previously tested prompts:\n${avoidList.map((p: string, i: number) => `  [${i+1}] ${p.slice(0, 100)}`).join('\n')}`
      : '';

    let quizText = "";
    try {
      const response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: { parts: [{ text: `Topic: ${topic}. Generate the ${requestedCount}-question JSON quiz now.${avoidDirective}` }] },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json",
          temperature: 0.75
        }
      });
      quizText = response.text || "";
    } catch (apiError: any) {
      console.warn("API Error during quiz generation:", apiError);
      throw apiError;
    }

    const parsed = safeParseJSON(quizText, 'array');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return res.json({ quiz: parsed });
    }

    throw new Error("Failed to generate a valid quiz structure.");

  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("Quiz generation endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to generate quiz" });
  }
});

app.post("/api/generate-pdf-quiz", upload.single("pdf"), async (req, res) => {
  try {
    const { gradeLevel, count } = req.body;
    if (!req.file) {
      console.warn("[PDF Quiz API] No PDF file provided in request.");
      return res.status(400).json({ error: "No PDF file provided" });
    }

    console.log(`[PDF Quiz API] Received file: ${req.file.originalname}, Size: ${req.file.size} bytes`);

    // Enforce 10MB size limit
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSizeBytes) {
      return res.status(400).json({ error: "PDF file size must not exceed 10MB." });
    }

    // Attempt text extraction first using pdf-parse
    let extractedText = "";
    let numPages = 0;
    try {
      const pdfModule: any = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParser = pdfModule.default || pdfModule;
      const pdfData = await pdfParser(req.file.buffer, { max: 51 });
      numPages = pdfData.numpages;
      extractedText = pdfData.text || "";
      console.log(`[PDF Quiz API] PDF parse complete. Pages: ${numPages}, Extracted text length: ${extractedText.trim().length}`);
    } catch (parseError) {
      console.warn("[PDF Quiz API] Failed to parse PDF locally with pdf-parse:", parseError);
    }

    if (numPages > 50) {
      return res.status(400).json({ error: "PDF document exceeds 50 pages limit. Please upload a shorter document (max 50 pages)." });
    }

    const requestedCount = Math.min(Math.max(parseInt(count) || 5, 1), 30);

    const systemInstruction = `You are an expert exam creator. Analyze the provided study material and extract the most high-yield concepts. Generate exactly ${requestedCount} multiple choice questions based strictly on this text/document. Output your response STRICTLY in JSON format as an array of objects. Each object must have the following keys: 'question' (string), 'options' (an array of exactly 4 strings), 'correctAnswer' (string, must exactly match one of the options), and 'explanation' (string, detailing why the answer is correct).

CRITICAL RULES:
1. STRICT JSON OUTPUT: You must output ONLY a valid JSON array. Do not wrap it in markdown blockquotes like \`\`\`json. Absolutely ZERO conversational text before or after the JSON.
2. FORMAT: Generate exactly ${requestedCount} questions. Each question must have exactly 4 options and a short explanation.
3. CORRECT ANSWER: The "correctAnswer" field MUST be a single string that EXACTLY matches one of the strings in the "options" array.
4. MULTIPLE EQUATIONS FORMATTING: If generating any math questions, options, or explanations that contain multiple equations (such as systems of linear equations), you must strictly separate the equations using a clear delimiter like the word 'and' or a newline character (\\n) so they do not blend together into a single string.

Use this exact JSON structure:
[
  {
    "question": "Sample multiple choice question...",
    "options": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
    "correctAnswer": "A) Option A",
    "explanation": "Because..."
  }
]`;

    let response;
    if (extractedText && extractedText.trim().length >= 50) {
      console.log("[PDF Quiz API] Using high-reliability text extraction path...");
      const slicedText = extractedText.length > 150000 ? extractedText.slice(0, 150000) : extractedText;
      response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: [{
          parts: [{ text: `DOCUMENT CONTENT:\n${slicedText}\n\nGenerate the ${requestedCount}-question JSON quiz now based strictly on the content above.` }]
        }],
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
        }
      });
    } else {
      console.log("[PDF Quiz API] Falling back to base64 PDF multimodal processing path (scanned PDF or low-quality extraction)...");
      const pdfPart = {
        inlineData: {
          mimeType: "application/pdf",
          data: req.file.buffer.toString("base64"),
        },
      };

      response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: [{
          parts: [
            pdfPart,
            { text: `Analyze the attached PDF document and generate the ${requestedCount}-question JSON quiz now based strictly on its content.` }
          ]
        }],
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
        }
      });
    }

    let quizText = response.text || "";
    console.log(`[PDF Quiz API] Gemini response received. Length: ${quizText.length} characters.`);
    try {
      const parsed = safeParseJSON(quizText, 'array');
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[PDF Quiz API] Successfully parsed quiz with ${parsed.length} questions.`);
        return res.json({ quiz: parsed });
      }
    } catch (parseError) {
      console.error("[PDF Quiz API] JSON parse error for PDF quiz output:", parseError, quizText);
    }

    return res.status(400).json({ error: "Failed to generate a valid quiz structure from the PDF. Please ensure it has readable text or images." });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("[PDF Quiz API] PDF quiz generation error:", error);
    res.status(400).json({ error: error.message || "Failed to generate quiz from PDF" });
  }
});

app.post("/api/generate-image-quiz", upload.single("image"), async (req, res) => {
  try {
    const { gradeLevel, count } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "No image provided" });
    }

    const imagePart = {
      inlineData: {
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64"),
      },
    };

    const requestedCount = Math.min(Math.max(parseInt(count) || 5, 1), 30);

    const systemInstruction = `You are an expert exam creator and visual analyzer. Analyze the textbook page, question sheet, or study material in the provided image. Identify the key academic topics, concepts, or exercises shown on the page. Generate exactly ${requestedCount} multiple choice questions based strictly on the content of that textbook page.
    
CRITICAL RULES:
1. STRICT JSON OUTPUT: You must output ONLY a valid JSON array. Do not wrap it in markdown blockquotes like \`\`\`json. Absolutely ZERO conversational text before or after the JSON.
2. FORMAT: Generate exactly ${requestedCount} questions. Each question must have exactly 4 options (prefixed with A), B), C), D)) and a short explanation.
3. CORRECT ANSWER: The "correctAnswer" field MUST be a single string that EXACTLY matches one of the strings in the "options" array.
4. MULTIPLE EQUATIONS FORMATTING: If generating any math questions, options, or explanations that contain multiple equations (such as systems of linear equations), you must strictly separate the equations using a clear delimiter like the word 'and' or a newline character (\\n) so they do not blend together into a single string.

Use this exact JSON structure:
[
  {
    "question": "Based on the concept in the image, what is...",
    "options": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
    "correctAnswer": "A) Option A",
    "explanation": "Because..."
  }
]`;

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: [{ parts: [imagePart, { text: `Analyze this textbook page image and generate exactly ${requestedCount} multiple choice questions.` }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });

    let quizText = response.text || "";
    try {
      const parsed = safeParseJSON(quizText, 'array');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return res.json({ quiz: parsed });
      }
    } catch (parseError) {
      console.error("JSON parse error for image quiz output:", parseError, quizText);
    }

    return res.status(500).json({ error: "Failed to generate a valid quiz structure from the image." });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("Image quiz generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate quiz from image" });
  }
});

interface SearchSourceItem {
  title: string;
  uri: string;
  sourceName: string;
  snippet: string;
  pubDate?: string;
  type: 'news' | 'encyclopedia' | 'knowledge' | 'academic';
}

async function extractSearchKeywords(userQuery: string): Promise<string[]> {
  try {
    const aiClient = getAI();
    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [{
        parts: [{
          text: `You are a search query optimizer for an elite educational AI. Given a user query (which might be in conversational Hindi, Hinglish, slang, or complex English), extract 2-3 crisp, highly-targeted English search keyword phrases for Google News and Wikipedia.

User Query: "${userQuery}"

Output strictly a valid JSON array of strings, e.g. ["keyword 1", "keyword 2"]. Absolutely zero conversational markdown or extra text.`
        }]
      }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const parsed = safeParseJSON(response.text || '[]', 'array');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(k => String(k).trim()).filter(Boolean);
    }
  } catch (e) {
    console.error("[extractSearchKeywords] Error:", e);
  }

  // Robust heuristic fallback
  const clean = userQuery.replace(/^(bhai|tum|please|zara|karo|batao|explain|mujhe|janna|hai|deep|search|kya|hua|tha|pe|par|about)\s+/gi, '').trim();
  return [clean || userQuery];
}

async function performLiveWebSearch(query: string, searchKeywords: string[] = [], userCountry: string = 'United States'): Promise<SearchSourceItem[]> {
  const sources: SearchSourceItem[] = [];
  const seenUrls = new Set<string>();

  const queriesToSearch = Array.from(new Set([
    ...searchKeywords,
    query.replace(/^(bhai|tum|please|zara|karo|batao|explain|mujhe|janna|hai|deep|search)\s+/gi, '').trim()
  ])).filter(q => q && q.length > 2).slice(0, 3);

  const searchTasks = queriesToSearch.map(async (kw) => {
    const encoded = encodeURIComponent(kw);

    // 1. Google News Real-Time RSS
    try {
      const rssRes = await fetchWithTimeout(`https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }, 7000);
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
        for (let i = 0; i < Math.min(4, items.length); i++) {
          const block = items[i][1];
          const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim();
          const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
          const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
          const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
          if (title && link && !seenUrls.has(link)) {
            seenUrls.add(link);
            sources.push({
              title,
              uri: link,
              sourceName: source || 'Live News',
              snippet: `Published: ${pubDate}. Publisher: ${source}. Headline: ${title}`,
              pubDate,
              type: 'news'
            });
          }
        }
      }
    } catch (e) {
      console.warn(`[performLiveWebSearch] Google News RSS error for "${kw}":`, e);
    }

    // 2. Wikipedia Deep REST API
    try {
      const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&utf8=&format=json&srlimit=3`;
      const wikiRes = await fetchWithTimeout(wikiSearchUrl, { headers: { 'User-Agent': 'HelpYouAI-Bot/1.0' } }, 7000);
      if (wikiRes.ok) {
        const data = await wikiRes.json();
        const items = data.query?.search || [];
        for (const item of items) {
          const pageTitle = item.title;
          const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
          if (seenUrls.has(pageUrl)) continue;
          seenUrls.add(pageUrl);

          let extract = item.snippet.replace(/<[^>]+>/g, '');
          try {
            const sumRes = await fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`, {
              headers: { 'User-Agent': 'HelpYouAI-Bot/1.0' }
            }, 4000);
            if (sumRes.ok) {
              const sumData = await sumRes.json();
              if (sumData.extract) extract = sumData.extract;
            }
          } catch (_) { }

          sources.push({
            title: pageTitle,
            uri: pageUrl,
            sourceName: 'Wikipedia Encyclopedia',
            snippet: extract,
            type: 'encyclopedia'
          });
        }
      }
    } catch (e) {
      console.warn(`[performLiveWebSearch] Wikipedia error for "${kw}":`, e);
    }

    // 3. DuckDuckGo Instant Knowledge API
    try {
      const ddgRes = await fetchWithTimeout(`https://api.duckduckgo.com/?q=${encoded}&format=json`, {}, 5000);
      if (ddgRes.ok) {
        const ddg = await ddgRes.json();
        if (ddg.Heading && ddg.AbstractURL && !seenUrls.has(ddg.AbstractURL)) {
          seenUrls.add(ddg.AbstractURL);
          sources.push({
            title: ddg.Heading,
            uri: ddg.AbstractURL,
            sourceName: ddg.AbstractSource || 'DuckDuckGo Knowledge',
            snippet: ddg.Abstract || '',
            type: 'knowledge'
          });
        }
      }
    } catch (e) {
      console.warn(`[performLiveWebSearch] DuckDuckGo error for "${kw}":`, e);
    }
  });

  await Promise.allSettled(searchTasks);
  return sources;
}

app.post("/api/fix-mistake", async (req, res) => {
  try {
    const { question, wrongInput, correctConcept, gradeLevel } = req.body;

    const safeQuestion = (question || "Academic Problem").slice(0, 3000);
    const safeWrong = (wrongInput || "Incorrect attempt").slice(0, 1000);
    const safeCorrect = (correctConcept || "Correct method / concept").slice(0, 2000);

    const systemInstruction = `You are the Lead Master of Academic Conceptual Clarity & Mistake Correction.
Your job is to analyze a student's academic mistake and provide a structured 3-part conceptual breakdown.
Be direct, encouraging, precise, and crystal-clear.

STRICT JSON OUTPUT FORMAT (Return ONLY a single valid JSON object, NO markdown wrappers):
{
  "why_it_happened": "One crisp sentence identifying the conceptual trap or reason behind the mistake.",
  "the_fix": "The absolute correct concept explained in simple, memorable terms.",
  "pro_memory_trick": "A clever mnemonic, practical rule of thumb, or analogy to never forget this."
}`;

    const prompt = `Student Mistake Context:
- Problem / Question: ${safeQuestion}
- Student's Incorrect Input: ${safeWrong}
- Correct Concept / Solution: ${safeCorrect}
- Target Grade Level: ${gradeLevel || "High School"}

Analyze this mistake and provide the 3-part JSON fix.`;

    const response = await safeGenerateContent({
      gradeLevel: gradeLevel || "High School",
      model: "gemini-3.5-flash-lite",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });

    let rawText = response.text || "";
    let parsedResult = safeParseJSON(rawText, 'object');
    if (!parsedResult || !parsedResult.the_fix) {
      parsedResult = {
        why_it_happened: `There was a confusion with the underlying problem setup.`,
        the_fix: `The correct concept is: ${safeCorrect}`,
        pro_memory_trick: "💡 Memory Rule: Always double check the core formula and units before answering!"
      };
    }

    res.json(parsedResult);
  } catch (error: any) {
    console.error("Fix mistake endpoint error:", error);
    res.json({
      why_it_happened: "A common misunderstanding of the fundamental concept.",
      the_fix: req.body?.correctConcept ? `The correct concept is: ${req.body.correctConcept}` : "Review the key formula and step-by-step logic.",
      pro_memory_trick: "💡 Pro Tip: Write down the given values and formula first to avoid calculation traps!"
    });
  }
});

app.post("/api/generate-practice", async (req, res) => {
  try {
    const { question, wrongInput, correctConcept, sourceFeature, gradeLevel } = req.body;

    const safeQuestion = (question || "Academic Concept").slice(0, 3000);
    const safeWrong = (wrongInput || "Incorrect attempt").slice(0, 1000);
    const safeCorrect = (correctConcept || "Correct concept").slice(0, 2000);

    const systemInstruction = `You are an Elite Academic Practice Coach.
Your task is to generate exactly 3 multiple-choice practice questions that test the SAME core concept as the student's mistake, but with fresh numbers, contexts, or scenarios.

RULES:
1. Generate exactly 3 questions with increasing mastery (Easy, Medium, Mastery).
2. Each question MUST have exactly 4 distinct options.
3. "correctIndex" MUST be an integer (0, 1, 2, or 3).
4. "explanation" MUST be 1-2 concise, encouraging sentences.

STRICT JSON OUTPUT (Return ONLY a JSON array with 3 question objects):
[
  {
    "question": "Clear, concise practice question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Clear explanation of why Option A is correct."
  }
]`;

    const prompt = `Student Mistake Context:
- Source Area: ${sourceFeature || "General"}
- Original Question: ${safeQuestion}
- Incorrect Input: ${safeWrong}
- Correct Principle: ${safeCorrect}
- Target Grade: ${gradeLevel || "High School"}

Generate 3 fresh similar practice questions to help the student master this concept.`;

    const response = await safeGenerateContent({
      gradeLevel: gradeLevel || "High School",
      model: "gemini-3.5-flash-lite",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });

    let rawText = response.text || "";
    let parsedResult = safeParseJSON(rawText, 'array');

    // Handle when AI returns wrapped object { questions: [...] }
    if (!Array.isArray(parsedResult)) {
      const obj = safeParseJSON(rawText, 'object');
      if (obj && Array.isArray(obj.questions)) {
        parsedResult = obj.questions;
      } else if (obj && Array.isArray(obj.practice_questions)) {
        parsedResult = obj.practice_questions;
      } else if (obj && Array.isArray(obj.practiceQuestions)) {
        parsedResult = obj.practiceQuestions;
      }
    }

    if (!Array.isArray(parsedResult) || parsedResult.length === 0) {
      parsedResult = [
        {
          question: `Regarding the concept from "${safeQuestion.slice(0, 120)}...", which statement is accurate?`,
          options: [
            safeCorrect.slice(0, 80) || "The formal rule applies directly",
            "An alternative incorrect interpretation",
            "The variables are mutually exclusive",
            "None of the above are valid"
          ],
          correctIndex: 0,
          explanation: `The correct principle is: ${safeCorrect.slice(0, 200)}.`
        },
        {
          question: `What is the most effective approach when solving problems on this topic?`,
          options: [
            "Apply the standard formula and verify given constraints",
            "Assume the first intuitive guess without verification",
            "Disregard intermediate calculations",
            "Skip unit checks"
          ],
          correctIndex: 0,
          explanation: "Always apply the formal definition and check your given values step-by-step."
        },
        {
          question: `Which key takeaway ensures full mastery of this question in future exams?`,
          options: [
            "Mastering the underlying formula and its assumptions",
            "Memorizing only final answers",
            "Relying on elimination alone",
            "Ignoring edge cases"
          ],
          correctIndex: 0,
          explanation: "Mastering the underlying formula and assumptions ensures you can solve any variation!"
        }
      ];
    }

    res.json(parsedResult);
  } catch (error: any) {
    console.error("Generate practice endpoint error:", error);
    res.json([
      {
        question: `Based on your mistake, which statement accurately reflects the correct concept?`,
        options: [
          req.body?.correctConcept ? req.body.correctConcept.slice(0, 80) : "The formal rule applies directly",
          "An alternative incorrect assumption",
          "The inverse relationship holds true",
          "Cannot be determined from given data"
        ],
        correctIndex: 0,
        explanation: req.body?.correctConcept ? `The correct concept is: ${req.body.correctConcept}` : "Review the correct concept to ensure full mastery."
      },
      {
        question: "What is the best strategy to verify your answer when solving similar problems?",
        options: [
          "Cross-verify using the fundamental formula and units",
          "Guess based on option lengths",
          "Ignore edge conditions",
          "Skip intermediate algebraic steps"
        ],
        correctIndex: 0,
        explanation: "Cross-verifying with the core formula and checking units guarantees full accuracy!"
      },
      {
        question: "Which of the following is a classic trap to avoid in this category?",
        options: [
          "Confusing similar-sounding terms or opposite signs",
          "Reading the entire question carefully",
          "Writing down given information clearly",
          "Checking the final units"
        ],
        correctIndex: 0,
        explanation: "Watch out for sign errors and term confusions—that is where most marks are lost!"
      }
    ]);
  }
});

app.post("/api/live-study-tutor", async (req, res) => {
  const rawQueryInput = req.body.query || req.body.prompt || req.body.search || "";
  const profileContext = req.body.profileContext;
  const studentNotes = req.body.studentNotes;
  const gradeLevel = req.body.gradeLevel || req.body.userGrade || "11th Grade (Junior)";
  const country = req.body.country || "United States";
  const academicStream = req.body.academicStream || "STEM / Engineering";

  try {
    if (!rawQueryInput || !rawQueryInput.trim()) {
      return res.status(400).json({ error: "Missing search query" });
    }

    const rawQuery = rawQueryInput.trim();

    // 1. Smart Keyword & Entity Extraction
    const keywords = await extractSearchKeywords(rawQuery);

    // 2. Multi-Engine Real-Time Live Web Search (Google News RSS, Crossref Academic DOI, DuckDuckGo)
    const searchResults = await performLiveWebSearch(rawQuery, keywords, country);

    const verifiedContextString = searchResults.map((s, idx) =>
      `[Source ${idx + 1}] Title: ${s.title}\nURL: ${s.uri}\nPublisher: ${s.sourceName}\nContent Snippet: ${s.snippet}\n`
    ).join('\n---\n');

    const systemInstruction = `You are the lead intelligence engine for "Deep Search AI" in the "HelpYou AI" app.
Your mission is to process student queries and produce an elite, point-wise, in-depth academic research report grounded in real-time verified data, peer-reviewed journals, and accredited national educational repositories.

CRITICAL ACADEMIC INTEGRITY & CITATION RULES:
1. STRICT WIKIPEDIA HARD-BAN:
   - NEVER cite, link, or output "wikipedia.org" or "wikimedia.org" URLs or titles anywhere in your output. Tier-1 academic institutions (US, UK, Canada, Australia, IB schools) strictly ban Wikipedia citations and penalize students.
   - Strictly prioritize peer-reviewed journals (.edu, .gov, Nature, Science, IEEE, NIH, JSTOR, Springer, Elsevier, Crossref DOI), authoritative encyclopedias (Encyclopaedia Britannica), accredited national education boards (CollegeBoard, NCERT, UCAS), and verified global news wires (Reuters, AP, BBC).

2. MANDATORY INLINE CITATIONS PROTOCOL:
   - Every single factual claim, statistic, date, quote, policy decision, exam notification, or scientific theorem in "live_updates" MUST include an inline numerical bracket citation immediately following the fact (e.g. "...ratified in early 2026 [1]...", "...quantum coherence increased by 42% [2]...").
   - Every citation number [1], [2], [3] MUST correspond directly to the 1-based index of the items in "source_links" and "detailed_sources". This guarantees students can map every single fact to its exact accredited source when writing essays.

3. ONLY ONE MAIN HEADLINE:
   - "topic_title" MUST be a crisp, elegant, concise headline of 3 to 6 words max (e.g. "Jeju Island Case Investigation", "JEE Main 2026 Registration Guide", "Quantum Entanglement Principles"). Avoid long multi-clause sentence titles.

4. NEVER OUTPUT LARGE UNBROKEN PARAGRAPHS:
   - All explanations MUST be strictly broken down into small, digestible subheadings and point-wise bullet points.
   - Each entry in "live_updates" MUST start with a small markdown subheading (e.g. "### 📌 Core Background & Overview", "### 🔍 Detailed Timeline & Key Developments", "### ⚖️ Analytical Impact & Real-World Consequences", "### 💡 High-Yield Student Takeaways").
   - Under each subheading, provide 2 to 4 detailed bullet points starting with bold anchors and ending with inline citations (e.g. "* **Incident Timeline:** In late August 2026, official authorities confirmed the findings [1].").

5. REGIONAL ACADEMIC ADAPTATION:
   - The student is located in ${country}, Grade: ${gradeLevel}, Stream: ${academicStream}.
   - Contextualize terminology, syllabus relevance, and exam boards according to their national curriculum (e.g., AP/SAT/CollegeBoard for USA, GCSE/A-Levels for UK, JEE/NEET/CBSE for India, VCE/HSC for Australia).

6. STEM vs HUMANITIES RIGOR:
   - STEM Queries (Physics, Chemistry, Math, Biology): Provide core formulas wrapped in LaTeX ($...$ or $$...$$), step-by-step derivations, and key parameters.
   - Humanities/News Queries: Provide structured bullet points covering background origin, chronological milestones, institutional impact, and current status.

7. LANGUAGE MATCHING:
   - If the user wrote in Hinglish (e.g. "Bhai Jeju island pe kya hua tha"), write the entire response in natural, articulate, point-wise Hinglish with academic precision.
   - If Hindi, write Hindi. If English, write English.

8. ZERO FAKE URLS:
   - In "source_links", ONLY use exact verified URLs from context or accredited root domains (e.g., britannica.com, nature.com, nih.gov, ed.gov, ncert.nic.in). NEVER use Wikipedia.

STRICT JSON OUTPUT FORMAT:
{
  "topic_title": "Concise Main Headline (3-6 words)",
  "match_score": "98%",
  "live_updates": [
    "### 📌 Core Background & Overview\\n* **Foundational Context:** Clear, verified background facts supported by research [1].\\n* **Core Definition & Significance:** Key concepts students need to know for examination [2].",
    "### 🔍 Detailed Timeline & Key Developments\\n* **Chronological Milestones:** Specific dates and verified occurrences [1].\\n* **Key Turning Points:** Critical discoveries or institutional policy shifts [2].",
    "### ⚖️ Analytical Impact & Real-World Consequences\\n* **Institutional Findings:** Official commissions or syllabus implications [1].\\n* **Current 2026 Status:** Up-to-date verified status as of today [2].",
    "### 💡 High-Yield Student Takeaways\\n* **Critical Exam Insights:** High-yield questions and summary synthesis [1].\\n* **Common Misconceptions:** Key distinctions to avoid exam traps [2]."
  ],
  "action_steps": [
    "Step 1: Foundational Review - core concepts and essential timeline to master",
    "Step 2: Analytical Deep-Dive - key turning points or core mechanisms",
    "Step 3: Synthesis & Verification - review findings against accredited citations"
  ],
  "pro_tips": "In-depth educator pro-tip highlighting common exam traps or memory anchors.",
  "related_queries": [
    "Follow-up research question 1",
    "Follow-up research question 2",
    "Follow-up research question 3"
  ],
  "source_links": [
    "verified url from context 1",
    "verified url from context 2"
  ]
}`;

    const contentPrompt = `STUDENT SEARCH QUERY: "${rawQuery}"
STUDENT ACADEMIC PROFILE & LOCATION:
- Country: ${country}
- Grade Level: ${gradeLevel}
- Academic Stream: ${academicStream}
${profileContext ? `ADDITIONAL PROFILE CONTEXT:\n${profileContext}\n` : ""}
${studentNotes ? `STUDENT LOCAL STUDY NOTES / TARGET SYLLABUS:\n${studentNotes}\n` : ""}

VERIFIED REAL-TIME ACADEMIC & RESEARCH DATA:
${verifiedContextString || "No external search feeds returned. Synthesize using accurate, verified ground truth from peer-reviewed databases."}

Conduct an elite, point-wise, structured academic research report with small markdown subheadings (### ...), bullet points, and mandatory inline bracketed citations ([1], [2]) mapping to verified references, returning strictly the JSON structure above.`;

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: [{ parts: [{ text: contentPrompt }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    });

    let rawText = response.text || "";
    let parsedResult: any = null;
    try {
      parsedResult = safeParseJSON(rawText, 'object');
      if (!parsedResult || !parsedResult.topic_title || !parsedResult.live_updates) {
        throw new Error("Invalid or incomplete JSON response from model");
      }
    } catch (parseError) {
      console.error("[live-study-tutor] JSON parse failed, constructing grounded result from raw text:", parseError);
      parsedResult = {
        topic_title: keywords[0] || rawQuery,
        match_score: "96%",
        live_updates: rawText ? [rawText] : ["Live research synthesis completed successfully."],
        action_steps: [
          `Review core concepts and definitions of ${keywords[0] || rawQuery}`,
          `Analyze key mechanisms, timeline, and exam implications`,
          `Verify understanding against authoritative academic references`
        ],
        pro_tips: `Focus on the underlying core principles and timeline rather than rote memorization when studying ${keywords[0] || rawQuery}.`,
        related_queries: [
          `Key timeline of ${keywords[0] || rawQuery}`,
          `Exam takeaways for ${keywords[0] || rawQuery}`,
          `Important facts about ${keywords[0] || rawQuery}`
        ],
        source_links: searchResults.map(s => s.uri).slice(0, 5)
      };
    }

    // Build verified detailed_sources with exact titles and working URLs (Wikipedia Hard-Banned)
    const cleanSources: string[] = [];
    const detailedSources: { title: string; uri: string; sourceName?: string }[] = [];
    const seenUrls = new Set<string>();

    const candidateLinks = Array.isArray(parsedResult.source_links) && parsedResult.source_links.length > 0
      ? parsedResult.source_links
      : searchResults.map(s => s.uri);

    for (const link of candidateLinks) {
      if (typeof link !== 'string' || !link.startsWith('http') || seenUrls.has(link) || link.includes('wikipedia.org') || link.includes('wikimedia.org')) continue;
      seenUrls.add(link);
      cleanSources.push(link);

      const matched = searchResults.find(s => s.uri === link);
      let displayTitle = matched?.title;
      if (!displayTitle) {
        try {
          const u = new URL(link);
          const host = u.hostname.replace(/^www\./, '');
          if (host.includes('britannica')) displayTitle = 'Encyclopaedia Britannica Academic';
          else if (host.includes('nature')) displayTitle = 'Nature Journal Research';
          else if (host.includes('doi.org')) displayTitle = 'Peer-Reviewed DOI Study';
          else if (host.includes('news.google')) displayTitle = 'Google News Live Feed';
          else displayTitle = `${host} Verified Research`;
        } catch (_) {
          displayTitle = 'Verified Academic Source';
        }
      }

      detailedSources.push({
        title: displayTitle,
        uri: link,
        sourceName: matched?.sourceName
      });
    }

    // If search results had sources but none matched, include the top search results
    if (detailedSources.length === 0 && searchResults.length > 0) {
      for (const s of searchResults.slice(0, 5)) {
        if (!seenUrls.has(s.uri) && !s.uri.includes('wikipedia.org') && !s.uri.includes('wikimedia.org')) {
          seenUrls.add(s.uri);
          cleanSources.push(s.uri);
          detailedSources.push({
            title: s.title,
            uri: s.uri,
            sourceName: s.sourceName
          });
        }
      }
    }

    // Guaranteed fallback sources if completely empty (Tier-1 Academic Portals based on country)
    if (detailedSources.length === 0) {
      const mainKeyword = keywords[0] || rawQuery;
      const encodedKw = encodeURIComponent(mainKeyword);
      const countryNorm = (country || '').toLowerCase();

      const britannicaUrl = `https://www.britannica.com/search?query=${encodedKw}`;
      const natureUrl = `https://www.nature.com/search?q=${encodedKw}`;

      cleanSources.push(britannicaUrl, natureUrl);
      detailedSources.push(
        { title: `${mainKeyword} - Encyclopaedia Britannica Academic`, uri: britannicaUrl, sourceName: "Encyclopaedia Britannica" },
        { title: `${mainKeyword} - Nature Academic Research Index`, uri: natureUrl, sourceName: "Nature Journal" }
      );

      if (countryNorm.includes('india')) {
        cleanSources.push("https://ncert.nic.in");
        detailedSources.push({ title: "NCERT National Academic Repository", uri: "https://ncert.nic.in", sourceName: "NCERT India" });
      } else if (countryNorm.includes('kingdom') || countryNorm.includes('uk')) {
        cleanSources.push("https://www.gov.uk/education");
        detailedSources.push({ title: "UK Department for Education Official Portal", uri: "https://www.gov.uk/education", sourceName: "GOV.UK Education" });
      } else {
        cleanSources.push("https://www.loc.gov");
        detailedSources.push({ title: "Library of Congress Academic Database", uri: "https://www.loc.gov", sourceName: "Library of Congress" });
      }
    }

    parsedResult.source_links = cleanSources.slice(0, 6);
    parsedResult.detailed_sources = detailedSources.slice(0, 6);

    // Strictly clamp any citation [X] > total sources so bad hallucinated numbers never appear
    const finalSourcesCount = parsedResult.detailed_sources.length;
    if (finalSourcesCount > 0) {
      const clampCitations = (text: string) => {
        if (!text) return '';
        return text.replace(/\[\s*(\d+)\s*\]/g, (_, p1) => {
          let n = parseInt(p1, 10);
          if (n > finalSourcesCount) {
            n = ((n - 1) % finalSourcesCount) + 1;
          } else if (n < 1) {
            n = 1;
          }
          return `[${n}]`;
        });
      };

      if (Array.isArray(parsedResult.live_updates)) {
        parsedResult.live_updates = parsedResult.live_updates.map((u: any) => typeof u === 'string' ? clampCitations(u) : u);
      } else if (typeof parsedResult.live_updates === 'string') {
        parsedResult.live_updates = clampCitations(parsedResult.live_updates);
      }
    }

    if (!Array.isArray(parsedResult.related_queries) || parsedResult.related_queries.length === 0) {
      parsedResult.related_queries = [
        `Key milestones of ${parsedResult.topic_title}`,
        `Exam questions on ${parsedResult.topic_title}`,
        `Latest 2026 updates regarding ${parsedResult.topic_title}`
      ];
    }

    res.json(parsedResult);
  } catch (error: any) {
    console.error("[live-study-tutor] Fatal error:", error);
    res.status(500).json({
      error: error.message || "Failed to conduct deep research search. Please try again.",
      success: false
    });
  }
});

app.post("/api/generate-trivia", async (req, res) => {
  try {
    const { gradeLevel, academicStream, studyLevel, topic, excludeQuestions, country } = req.body;

    const aiClient = getAI();
    const normalizeStr = (s: string) => s ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    const excludesSet = new Set((excludeQuestions || []).map((q: string) => normalizeStr(q)));

    let attempts = 0;
    let finalTrivia: any = null;
    let extraAvoidInstruction = "";

    while (attempts < 3) {
      attempts++;

      let promptText = `Generate a single short, curriculum-aligned academic brain booster trivia question for:
- Student Academic Grade/Level: ${gradeLevel || studyLevel || "High School"}
- Academic Stream/Interest: ${academicStream || "General Science & Logic"}
- Student's Country & Context: ${country || "Global"}`;

      if (country && country.trim().length > 0) {
        promptText += `\n- Country Context: Align with the national academic curriculum and everyday relatable logic relevant to ${country}.`;
      }

      if (topic && topic.trim().length > 0) {
        promptText += `\n- Specific Category Focus: ${topic}`;
      } else {
        promptText += `\n- Category Focus: High-yield academic concepts, everyday scientific applications, mathematical intuition, or clever logical problem solving tailored to ${academicStream}.`;
      }

      if (excludeQuestions && Array.isArray(excludeQuestions) && excludeQuestions.length > 0) {
        promptText += `\n- EXCLUDE the following questions (do NOT repeat them): ${JSON.stringify(excludeQuestions.slice(-120))}`;
      }

      if (extraAvoidInstruction) {
        promptText += `\n${extraAvoidInstruction}`;
      }

      const systemInstruction = `You are the Master of Academic Brain Booster & Cognitive Trivia for Students.

MISSION:
Generate a single, ultra-short, highly engaging multiple choice brain booster question tailored STRICTLY to the student's profile (Grade level: ${gradeLevel}, Stream: ${academicStream}, and Country: ${country}).

QUESTION PHILOSOPHY:
1. Focus on HIGH-YIELD ACADEMIC CONCEPTS, PRACTICAL SCIENCE/PHYSICS/MATH APPLICATIONS, CLEVER LOGIC SHORTCUTS, or ACCURATE CURRICULAR INSIGHTS.
2. The question must trigger an instant "Aha!" moment and reinforce real academic learning.
3. STRICT SHORT LENGTH CONSTRAINTS:
   - "question": STRICTLY SHORT & PUNCHY — 15 to 25 words maximum! (1 or 2 crisp sentences). NEVER output long wordy paragraphs.
   - "options": EXACTLY 3 or 4 short options (1 to 4 words each).
   - "fact": STRICTLY 15 to 25 words max explaining the core concept or logic with an emoji (e.g. "💡 High-Yield Concept: ...").
4. SUBJECT TAG: 2-3 words with an appropriate emoji (e.g. "⚡ Physics Intuition", "🧪 Chemistry in Action", "🧬 Biology Masterclass", "📐 Mental Math Shortcut", "📈 Economics Insight").

STRICT JSON OUTPUT FORMAT:
Output ONLY a valid JSON object matching this exact schema:
{
  "subjectTag": "⚡ Physics Intuition",
  "question": "If you double the speed of a car, by what factor does its braking distance increase on a dry road?",
  "options": ["2 times", "4 times", "8 times", "Remains same"],
  "correctIndex": 1,
  "fact": "💡 Kinetic Energy is proportional to velocity squared (v^2), so braking distance quadruples! 🚗"
}`;

      const response = await safeGenerateContent({
        gradeLevel: gradeLevel || "High School",
        model: "gemini-3.5-flash-lite",
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
        }
      });

      const triviaText = response.text || "";
      const parsed = safeParseJSON(triviaText, 'object');

      if (parsed && parsed.question && Array.isArray(parsed.options)) {
        const normQ = normalizeStr(parsed.question);
        if (!excludesSet.has(normQ)) {
          finalTrivia = parsed;
          break; // Found a completely unique question!
        } else {
          console.warn(`[Trivia Loop] Duplicate question generated: "${parsed.question}". Retrying...`);
          extraAvoidInstruction = `\n- IMPORTANT: You previously generated "${parsed.question}", which was already asked. Please choose a completely different subtopic or a creative new angle to make sure it is 100% unique.`;
        }
      }
    }

    if (finalTrivia) {
      return res.json({ trivia: finalTrivia });
    }

    throw new Error("Failed to parse or generate a unique trivia response after multiple attempts");
  } catch (error: any) {
    console.error("Trivia generation error:", error);
    // Fallback to punchy presence of mind / common sense trivia
    const fallbacks = [
      {
        subjectTag: "💡 Presence of Mind",
        question: "If an electric train travels North at 60 mph and wind blows West at 20 mph, which way does the smoke blow?",
        options: ["North", "West", "No smoke (Electric)"],
        correctIndex: 2,
        fact: "⚡ Presence of mind! Electric trains don't produce any smoke! 🚂"
      },
      {
        subjectTag: "🧠 Logic & Common Sense",
        question: "A bat and ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much is the ball?",
        options: ["$0.10", "$0.05", "$0.01"],
        correctIndex: 1,
        fact: "💡 Common sense trap! If the ball were $0.10, the bat would be $1.10, making the total $1.20! 🎾"
      },
      {
        subjectTag: "⚡ Everyday Physics",
        question: "Why can birds sit safely on uninsulated high-voltage power lines without getting an electric shock?",
        options: ["Insulated feet", "Zero voltage difference", "Feathers absorb charge"],
        correctIndex: 1,
        fact: "🦅 Both feet are on the exact same wire, creating zero voltage difference so no current flows! ⚡"
      },
      {
        subjectTag: "🧪 Kitchen Science",
        question: "Which freezes faster in a home freezer under certain conditions: hot water or cold water?",
        options: ["Cold Water", "Hot Water (Mpemba Effect)", "Both at same rate"],
        correctIndex: 1,
        fact: "❄️ Known as the Mpemba Effect, hot water can sometimes freeze faster due to rapid surface evaporation! 🧊"
      },
      {
        subjectTag: "🧩 Mind Teaser",
        question: "A rooster lays an egg on the very top of a slanted triangular barn roof. Which side does it roll down?",
        options: ["Left side", "Right side", "Roosters don't lay eggs"],
        correctIndex: 2,
        fact: "🐔 Classic presence of mind riddle! Roosters are male and do not lay eggs! 🥚"
      }
    ];
    const randomIndex = Math.floor(Math.random() * fallbacks.length);
    res.json({ trivia: fallbacks[randomIndex], isFallback: true });
  }
});

// Premium Subscriptions State Storage (File-backed database fallback)
const SUBS_FILE_PATH = path.join(process.cwd(), "subscriptions.json");

function getStoredSubscriptions(): Record<string, boolean> {
  try {
    if (fs.existsSync(SUBS_FILE_PATH)) {
      return JSON.parse(fs.readFileSync(SUBS_FILE_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("Error reading subscriptions from file:", error);
  }
  return {};
}

function writeStoredSubscriptions(subs: Record<string, boolean>) {
  try {
    fs.writeFileSync(SUBS_FILE_PATH, JSON.stringify(subs, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving subscriptions to file:", error);
  }
}

// REST Endpoint to persist/verify VIP subscription status across accounts
app.post("/api/set-subscription", (req, res) => {
  const { userId, isPro } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing required parameter: userId" });
  }
  const subs = getStoredSubscriptions();
  subs[userId] = !!isPro;
  writeStoredSubscriptions(subs);
  console.log(`[Subscription API] Stored subscription status for user ${userId}: ${!!isPro}`);
  res.json({ success: true, userId, isPro: !!isPro });
});

app.post("/api/verify-subscription", (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing required parameter: userId" });
  }
  const subs = getStoredSubscriptions();
  const isPro = !!subs[userId];
  console.log(`[Subscription API] Verified subscription status for user ${userId}: ${isPro}`);
  res.json({ userId, isPro });
});

// Server-time validation endpoint
app.get("/api/time", (req, res) => {
  res.json({ timestamp: Date.now() });
});


// ================= 1V1 REAL MULTIPLAYER BATTLE ENGINE =================
function normalizeBattleSubject(subId?: string): string {
  if (!subId) return 'ap-calculus-ab';
  let s = subId.trim().toLowerCase();
  if (s === 'ap-physics-1') return 'ap-physics';
  return s;
}


interface BattlePlayer {
  id: string;
  name: string;
  avatar: string;
  score: number;
  hasAnswered: boolean;
  currentQ: number;
  lastSeen: number;
  finished?: boolean;
}

interface ServerRoom {
  id: string;
  code?: string;
  subjectId: string;
  status: 'waiting' | 'countdown' | 'battle' | 'finished';
  player1: BattlePlayer;
  player2: BattlePlayer | null;
  questions: any[];
  currentQ: number; // 0 to 4
  roundStatus: 'playing' | 'revealed';
  roundStartTime: number;
  revealStartTime?: number;
  countdownStart?: number;
  updatedAt: number;
}

const waitingQueue = new Map<string, { player: BattlePlayer; subjectId: string; questions: any[]; timestamp: number; lastSeen: number }>();
const activeBattleRooms = new Map<string, ServerRoom>();
const playerToRoomMap = new Map<string, string>();

// Clean up stale queue tickets (> 8000ms inactive) & old rooms (> 15m)
function purgeStaleTickets() {
  const now = Date.now();
  for (const [qId, ticket] of waitingQueue.entries()) {
    if (now - ticket.lastSeen > 8000) {
      waitingQueue.delete(qId);
    }
  }
  for (const [roomId, room] of activeBattleRooms.entries()) {
    if (now - room.updatedAt > 900000) {
      activeBattleRooms.delete(roomId);
    }
  }
}

// 1. Enter queue & match ONLY with players ACTIVELY ON RADAR right now
app.post("/api/battle/match", (req, res) => {
  try {
    const { playerId, playerName, playerAvatar, subjectId, questions } = req.body;
    if (!playerId || !subjectId) {
      return res.status(400).json({ error: "Missing playerId or subjectId" });
    }

    const now = Date.now();
    purgeStaleTickets();

    // Clear prior queue/room state for this player
    waitingQueue.delete(playerId);
    playerToRoomMap.delete(playerId);

    const myPlayer: BattlePlayer = {
      id: playerId,
      name: playerName || "Student",
      avatar: playerAvatar || "U",
      score: 0,
      hasAnswered: false,
      currentQ: 0,
      lastSeen: now
    };

    // Check if another real player is ACTIVELY searching on radar right now (< 2000ms)
    let foundOpponent: { qId: string; ticket: { player: BattlePlayer; subjectId: string; questions: any[]; timestamp: number; lastSeen: number } } | null = null;

    // STRICT SAME-SUBJECT MATCHMAKING: Never match across different subjects!
    const myNormSubject = normalizeBattleSubject(subjectId);
    for (const [qId, ticket] of waitingQueue.entries()) {
      if (
        ticket.player.id !== playerId && 
        (now - ticket.lastSeen <= 8000) && 
        normalizeBattleSubject(ticket.subjectId) === myNormSubject
      ) {
        foundOpponent = { qId, ticket };
        break;
      }
    }

    if (foundOpponent) {
      // Both are actively on radar right now! Match them!
      waitingQueue.delete(foundOpponent.qId);
      waitingQueue.delete(playerId);

      const roomId = `room_${now}_${Math.random().toString(36).substring(2, 6)}`;
      const battleQuestions = (foundOpponent.ticket.questions && foundOpponent.ticket.questions.length > 0)
        ? foundOpponent.ticket.questions
        : (questions && questions.length > 0 ? questions : []);

      const newRoom: ServerRoom = {
        id: roomId,
        subjectId: foundOpponent.ticket.subjectId || subjectId,
        status: 'countdown',
        player1: foundOpponent.ticket.player,
        player2: myPlayer,
        questions: battleQuestions,
        currentQ: 0,
        roundStatus: 'playing',
        roundStartTime: now + 3000,
        countdownStart: now,
        updatedAt: now
      };

      activeBattleRooms.set(roomId, newRoom);
      playerToRoomMap.set(foundOpponent.ticket.player.id, roomId);
      playerToRoomMap.set(playerId, roomId);

      console.log(`[Battle Matchmaker] MATCHED REAL PLAYERS! ${foundOpponent.ticket.player.name} vs ${myPlayer.name} in room ${roomId}`);

      return res.json({
        status: "matched",
        roomId,
        isPlayer1: false,
        opponent: foundOpponent.ticket.player,
        questions: newRoom.questions,
        subjectId: newRoom.subjectId
      });
    }

    // No active opponent right now: put in queue with fresh lastSeen
    waitingQueue.set(playerId, {
      player: myPlayer,
      subjectId,
      questions: questions || [],
      timestamp: now,
      lastSeen: now
    });

    console.log(`[Battle Matchmaker] ${myPlayer.name} entered radar. Active queue: ${waitingQueue.size}`);
    return res.json({ status: "waiting" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Poll match status while active on radar screen (called every 350ms)
app.post("/api/battle/poll-match", (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ error: "Missing playerId" });
    }

    const now = Date.now();
    purgeStaleTickets();

    // Check if matched into room
    const roomId = playerToRoomMap.get(playerId);
    if (roomId) {
      const room = activeBattleRooms.get(roomId);
      if (room && (room.status === 'countdown' || room.status === 'battle')) {
        waitingQueue.delete(playerId);
        const opponent = room.player1.id === playerId ? room.player2 : room.player1;
        const isP1 = room.player1.id === playerId;
        return res.json({
          status: "matched",
          roomId: room.id,
          isPlayer1: isP1,
          opponent,
          questions: room.questions,
          subjectId: room.subjectId
        });
      }
    }

    // Update active heartbeat for this player in queue
    const myTicket = waitingQueue.get(playerId);
    if (myTicket) {
      myTicket.lastSeen = now;

      // Proactive pairing: ONLY match if both players chose the EXACT SAME SUBJECT!
      const myNormSubject = normalizeBattleSubject(myTicket.subjectId);
      for (const [qId, otherTicket] of waitingQueue.entries()) {
        if (
          qId !== playerId && 
          otherTicket.player.id !== playerId && 
          (now - otherTicket.lastSeen <= 8000) &&
          normalizeBattleSubject(otherTicket.subjectId) === myNormSubject
        ) {
          waitingQueue.delete(playerId);
          waitingQueue.delete(qId);

          const newRoomId = `room_${now}_${Math.random().toString(36).substring(2, 6)}`;
          const battleQuestions = (otherTicket.questions && otherTicket.questions.length > 0)
            ? otherTicket.questions
            : (myTicket.questions && myTicket.questions.length > 0 ? myTicket.questions : []);

          const newRoom: ServerRoom = {
            id: newRoomId,
            subjectId: otherTicket.subjectId || myTicket.subjectId,
            status: 'countdown',
            player1: otherTicket.player,
            player2: myTicket.player,
            questions: battleQuestions,
            currentQ: 0,
            roundStatus: 'playing',
            roundStartTime: now + 3000,
            countdownStart: now,
            updatedAt: now
          };

          activeBattleRooms.set(newRoomId, newRoom);
          playerToRoomMap.set(otherTicket.player.id, newRoomId);
          playerToRoomMap.set(playerId, newRoomId);

          console.log(`[Battle Matchmaker] PROACTIVE MATCH: ${otherTicket.player.name} vs ${myTicket.player.name} in room ${newRoomId}`);

          return res.json({
            status: "matched",
            roomId: newRoomId,
            isPlayer1: false,
            opponent: otherTicket.player,
            questions: newRoom.questions,
            subjectId: newRoom.subjectId
          });
        }
      }
    }

    return res.json({ status: "waiting" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Cleanly cancel/leave queue or room
app.post("/api/battle/cancel", (req, res) => {
  try {
    const { playerId, roomId } = req.body;
    if (playerId) {
      waitingQueue.delete(playerId);
      const targetRoomId = roomId || playerToRoomMap.get(playerId);
      if (targetRoomId) {
        const room = activeBattleRooms.get(targetRoomId);
        if (room) {
          if (room.status === 'waiting' && room.player1.id === playerId) {
            // Host cancelled before anyone joined -> immediately destroy abandoned room
            activeBattleRooms.delete(targetRoomId);
            console.log(`[Battle Matchmaker] Waiting room ${targetRoomId} deleted because host cancelled.`);
          } else if (room.status === 'countdown' || room.status === 'battle') {
            // Player forfeited active battle -> mark finished so remaining opponent wins cleanly
            const leaver = room.player1.id === playerId ? room.player1 : (room.player2?.id === playerId ? room.player2 : null);
            if (leaver) leaver.finished = true;
            room.status = 'finished';
            room.updatedAt = Date.now();
            console.log(`[Battle Matchmaker] Player ${playerId} forfeited match in room ${targetRoomId}.`);
          }
        }
        playerToRoomMap.delete(playerId);
      }
      console.log(`[Battle Matchmaker] Player ${playerId} cleanly left queue/room.`);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

// 4. Create Friend Room
app.post("/api/battle/room/create", (req, res) => {
  try {
    const { roomCode, player, subjectId, questions } = req.body;
    const now = Date.now();
    const code = (roomCode || `AP-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();
    const roomId = `room_${code}`;

    const newRoom: ServerRoom = {
      id: roomId,
      code,
      subjectId,
      status: 'waiting',
      player1: {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        score: 0,
        hasAnswered: false,
        currentQ: 0,
        lastSeen: now
      },
      player2: null,
      questions: questions || [],
      currentQ: 0,
      roundStatus: 'playing',
      roundStartTime: now + 3000,
      updatedAt: now
    };

    activeBattleRooms.set(roomId, newRoom);
    playerToRoomMap.set(player.id, roomId);

    res.json({ success: true, roomId, code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Join Friend Room
app.post("/api/battle/room/join", (req, res) => {
  try {
    const { roomCode, player } = req.body;
    const code = (roomCode || "").toUpperCase().trim();
    const roomId = `room_${code}`;

    const room = activeBattleRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found. Check the code!" });
    }
    if (room.player1.id === player.id) {
      return res.status(400).json({ error: "You are the host of this room!" });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: "Room already in progress or full!" });
    }

    const now = Date.now();
    room.player2 = {
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      score: 0,
      hasAnswered: false,
      currentQ: 0,
      lastSeen: now
    };
    room.status = 'countdown';
    room.countdownStart = now;
    room.roundStartTime = now + 3000;
    room.updatedAt = now;

    playerToRoomMap.set(player.id, roomId);

    res.json({
      success: true,
      roomId,
      room,
      opponent: room.player1,
      questions: room.questions,
      subjectId: room.subjectId
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Real-time Player Action & Synchronized Round Progression
app.post("/api/battle/action", (req, res) => {
  try {
    const { roomId, playerId, score, hasAnswered, finished } = req.body;
    const room = activeBattleRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const now = Date.now();
    const target = room.player1.id === playerId ? room.player1 : (room.player2?.id === playerId ? room.player2 : null);
    if (target) {
      if (typeof score === 'number') target.score = score;
      if (typeof hasAnswered === 'boolean') target.hasAnswered = hasAnswered;
      if (typeof finished === 'boolean') target.finished = finished;
      target.lastSeen = now;
      room.updatedAt = now;
    }

    // CHECK: Have both players answered this question?
    if ((room.status === 'battle' || room.status === 'countdown') && room.roundStatus === 'playing') {
      const p1Answered = room.player1.hasAnswered;
      const p2Answered = room.player2?.hasAnswered;

      if (p1Answered && p2Answered) {
        // Both answered! Trigger synchronized reveal for 2.0s
        room.roundStatus = 'revealed';
        room.revealStartTime = now;
        room.updatedAt = now;
      }
    }

    if (room.player1.finished && room.player2?.finished) {
      room.status = 'finished';
      room.updatedAt = now;
    }

    res.json({ success: true, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Room Status & Server Round Clock Advancement (polled every 350ms)
app.get("/api/battle/room/:roomId", (req, res) => {
  try {
    const { roomId } = req.params;
    const room = activeBattleRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const now = Date.now();

    // 1. Transition from countdown to battle when 3000ms has elapsed
    if (room.status === 'countdown' && room.countdownStart) {
      if (now - room.countdownStart >= 3000) {
        room.status = 'battle';
        room.roundStatus = 'playing';
        room.roundStartTime = now;
        room.updatedAt = now;
      }
    }

    // 2. Auto-advance round if reveal timeout (2000ms) has elapsed
    if (room.status === 'battle' && room.roundStatus === 'revealed' && room.revealStartTime) {
      if (now - room.revealStartTime >= 2000) {
        const nextQ = room.currentQ + 1;
        if (nextQ < (room.questions?.length || 5)) {
          room.currentQ = nextQ;
          room.roundStatus = 'playing';
          room.roundStartTime = now;
          room.player1.hasAnswered = false;
          if (room.player2) room.player2.hasAnswered = false;
          room.revealStartTime = undefined;
          room.updatedAt = now;
        } else {
          room.status = 'finished';
          room.updatedAt = now;
        }
      }
    }

    // 3. Auto-timeout round if dynamic question duration (30s-60s) elapsed without both answering
    if (room.status === 'battle' && room.roundStatus === 'playing') {
      const currQ = room.questions?.[room.currentQ];
      const qDurationMs = ((currQ?.timeLimit || 30) * 1000) + 500;
      if (now - room.roundStartTime >= qDurationMs) {
        room.roundStatus = 'revealed';
        room.revealStartTime = now;
        room.player1.hasAnswered = true;
        if (room.player2) room.player2.hasAnswered = true;
        room.updatedAt = now;
      }
    }

    res.json({ room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const hasDist = fs.existsSync(path.join(distPath, "index.html"));
  const isDevExplicit = (process.env.NODE_ENV || "").toLowerCase() === "development";

  if (hasDist && !isDevExplicit) {
    console.log("[Server] Serving production static frontend from:", distPath);
    app.use("/assets", express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true
    }));
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      }
    }));

    app.get("*", (req, res) => {
      const ext = path.extname(req.path);
      if (ext || req.path.startsWith('/src') || req.path.startsWith('/api')) {
        return res.status(404).send('Not Found');
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    try {
      const viteModule = "vite";
      const { createServer: createViteServer } = await import(/* @vite-ignore */ viteModule);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite dev server not loaded:", e);
    }
  }

  const server = app.listen(Number(PORT) || 3000, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.timeout = 300000;
}

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);

if (!isServerless) {
  startServer();
}

export default app;

