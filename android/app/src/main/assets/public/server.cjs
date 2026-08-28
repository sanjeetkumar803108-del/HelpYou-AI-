var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_multer = __toESM(require("multer"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_genai = require("@google/genai");
var import_crypto = __toESM(require("crypto"), 1);
var import_youtube_transcript = require("youtube-transcript");
var import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
var import_xss = __toESM(require("xss"), 1);
import_dotenv.default.config();
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});
var app = (0, import_express.default)();
app.set("trust proxy", 1);
var PORT = process.env.PORT || 3e3;
app.use((0, import_cors.default)());
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
var apiLimiter = (0, import_express_rate_limit.default)({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 100,
  // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", apiLimiter);
app.all(["/api/health", "/health", "/api/status"], (req, res) => {
  res.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    geminiKeyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 6) + "..." : "MISSING",
    isVercel: Boolean(process.env.VERCEL)
  });
});
var sanitizeInput = (obj) => {
  if (typeof obj === "string") {
    return (0, import_xss.default)(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeInput(item));
  }
  if (typeof obj === "object" && obj !== null) {
    const sanitizedObj = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitizedObj[key] = sanitizeInput(value);
    }
    return sanitizedObj;
  }
  return obj;
};
app.use((req, res, next) => {
  console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${req.method} ${req.url}`);
  next();
});
var summaryCache = /* @__PURE__ */ new Map();
function safeParseJSON(text, forceType = "none") {
  if (!text) return forceType === "array" ? [] : forceType === "object" ? {} : null;
  const cleaned = text.trim();
  const parse = (str) => {
    try {
      const parsed = JSON.parse(str);
      if (forceType === "array" && !Array.isArray(parsed)) {
        return [parsed];
      }
      if (forceType === "object" && Array.isArray(parsed)) {
        return parsed[0] || {};
      }
      return parsed;
    } catch (e) {
      return null;
    }
  };
  let result = parse(cleaned);
  if (result) return result;
  let extracted = cleaned;
  if (extracted.includes("```")) {
    extracted = extracted.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    result = parse(extracted);
    if (result) return result;
  }
  const objStart = extracted.indexOf("{");
  const objEnd = extracted.lastIndexOf("}");
  const arrStart = extracted.indexOf("[");
  const arrEnd = extracted.lastIndexOf("]");
  const hasObj = objStart !== -1 && objEnd !== -1 && objEnd > objStart;
  const hasArr = arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart;
  if (hasObj && (!hasArr || objStart < arrStart)) {
    result = parse(extracted.slice(objStart, objEnd + 1));
    if (result) return result;
  }
  if (hasArr) {
    result = parse(extracted.slice(arrStart, arrEnd + 1));
    if (result) return result;
  }
  if (forceType === "array") return [];
  if (forceType === "object") return {};
  throw new Error("Could not parse JSON from AI response");
}
async function fetchWithTimeout(url, options = {}, timeout = 9e4) {
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
var lastQuotaExceededTime = 0;
var rateLimitedModels = {};
app.use(import_express.default.json({ limit: "35mb" }));
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
app.use(import_express.default.urlencoded({ limit: "35mb", extended: true }));
app.use((err, req, res, next) => {
  if (err instanceof import_multer.default.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 30MB." });
    }
  }
  console.error("[Global Error Handler] Caught unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.path && req.path.startsWith("/api")) {
    return res.status(err.status || 500).json({
      error: err.message || "An unexpected error occurred on the server.",
      success: false
    });
  }
  next(err);
});
var upload = (0, import_multer.default)({
  storage: import_multer.default.memoryStorage(),
  limits: { fileSize: 35 * 1024 * 1024 }
});
app.use((req, res, next) => {
  const purgeFiles = () => {
    try {
      if (req.file) {
        if (req.file.buffer && Buffer.isBuffer(req.file.buffer)) {
          req.file.buffer.fill(0);
          console.log("[PrivacyGuard] Securely purged single uploaded file buffer from memory.");
        }
        req.file = void 0;
      }
      if (req.files) {
        if (Array.isArray(req.files)) {
          req.files.forEach((file) => {
            if (file.buffer && Buffer.isBuffer(file.buffer)) {
              file.buffer.fill(0);
            }
          });
          console.log("[PrivacyGuard] Securely purged multiple uploaded file buffers from memory.");
        } else if (typeof req.files === "object") {
          Object.values(req.files).forEach((fileArr) => {
            if (Array.isArray(fileArr)) {
              fileArr.forEach((file) => {
                if (file.buffer && Buffer.isBuffer(file.buffer)) {
                  file.buffer.fill(0);
                }
              });
            }
          });
          console.log("[PrivacyGuard] Securely purged object-based multiple uploaded file buffers from memory.");
        }
        req.files = void 0;
      }
    } catch (e) {
      console.error("[PrivacyGuard] Error while purging buffers:", e);
    }
  };
  res.on("finish", purgeFiles);
  res.on("close", purgeFiles);
  next();
});
function pcmToWav(pcmBuffer, sampleRate = 24e3, numChannels = 1, bitsPerSample = 16) {
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
  wavHeader.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
  wavHeader.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(numBytes, 40);
  return Buffer.concat([wavHeader, pcmBuffer]);
}
var ai = null;
function getAI() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    ai = new import_genai.GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });
  }
  return ai;
}
function extractUserQuery(params) {
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
  }
  return "";
}
async function safeGenerateContent(params, retries = 3, delay = 200) {
  const gradeLevel = params.gradeLevel;
  const clonedParams = { ...params };
  delete clonedParams.gradeLevel;
  if (!clonedParams.config) {
    clonedParams.config = {};
  } else {
    clonedParams.config = { ...clonedParams.config };
  }
  const isTtsModel = !!(clonedParams.model && clonedParams.model.includes("tts"));
  if (isTtsModel && clonedParams.config) {
    delete clonedParams.config.systemInstruction;
  }
  if (!isTtsModel) {
    if (!clonedParams.config.systemInstruction) {
      clonedParams.config.systemInstruction = { parts: [{ text: "" }] };
    } else {
      let sysInstr2 = clonedParams.config.systemInstruction;
      if (typeof sysInstr2 === "string") {
        sysInstr2 = { parts: [{ text: sysInstr2 }] };
      } else {
        sysInstr2 = { ...sysInstr2 };
        if (sysInstr2.parts) {
          sysInstr2.parts = sysInstr2.parts.map((p) => ({ ...p }));
        }
      }
      clonedParams.config.systemInstruction = sysInstr2;
    }
  }
  if (clonedParams.config.tools) {
    clonedParams.config.tools = clonedParams.config.tools.map((t) => ({ ...t }));
  }
  if (!isTtsModel) {
    const dateInstruction = `The current date and time is: ${(/* @__PURE__ */ new Date()).toISOString()}. You must treat this as the absolute present moment.`;
    const originalParts = clonedParams.config.systemInstruction.parts || [];
    const originalText = originalParts[0]?.text || "";
    clonedParams.config.systemInstruction.parts = [
      { text: `${originalText}

${dateInstruction}`.trim() },
      ...originalParts.slice(1)
    ];
    if (gradeLevel) {
      const gradeInstruction = `CRITICAL INSTRUCTION: The user you are interacting with is currently in Grade: ${gradeLevel}. You MUST strictly adapt your entire response, vocabulary, conceptual complexity, sentence structure, and examples to perfectly match the comprehension level of a ${gradeLevel} student. Absolutely DO NOT use advanced jargon, higher-level academic concepts, or complex language that exceeds this specific grade level. Keep the tone encouraging and age-appropriate.`;
      const parts = clonedParams.config.systemInstruction.parts || [];
      const text = parts[0]?.text || "";
      clonedParams.config.systemInstruction.parts = [
        { text: `${gradeInstruction}

${text}`.trim() },
        ...parts.slice(1)
      ];
    }
  }
  const query = extractUserQuery(clonedParams);
  const sysInstr = clonedParams?.config?.systemInstruction?.parts?.[0]?.text || "";
  const respMime = clonedParams?.config?.responseMimeType || "";
  const isSpecialtyModel = params.model && (params.model.includes("tts") || params.model.includes("image") || params.model.includes("video") || params.model.includes("veo") || params.model.includes("lyria") || params.model.includes("clip"));
  let requestedModel = params.model;
  let modelsToTry = isSpecialtyModel ? [requestedModel] : [
    requestedModel || "gemini-3.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-3.6-flash"
  ].filter((value, index, self) => self.indexOf(value) === index);
  if (!isSpecialtyModel) {
    const now = Date.now();
    const activeModels = [];
    const backburnerModels = [];
    for (const m of modelsToTry) {
      const lastLimited = rateLimitedModels[m] || 0;
      if (now - lastLimited < 36e5) {
        backburnerModels.push(m);
      } else {
        activeModels.push(m);
      }
    }
    if (activeModels.length > 0) {
      modelsToTry = [...activeModels, ...backburnerModels];
    }
  }
  let lastError = null;
  let anyQuotaExceeded = false;
  for (const model of modelsToTry) {
    const currentParams = {
      model,
      contents: clonedParams.contents
    };
    if (clonedParams.config) {
      currentParams.config = { ...clonedParams.config };
      if (currentParams.config.tools) {
        currentParams.config.tools = currentParams.config.tools.map((t) => ({ ...t }));
      }
      if (currentParams.config.systemInstruction) {
        currentParams.config.systemInstruction = { ...currentParams.config.systemInstruction };
        if (currentParams.config.systemInstruction.parts) {
          currentParams.config.systemInstruction.parts = currentParams.config.systemInstruction.parts.map((p) => ({ ...p }));
        }
      }
    }
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const aiClient = getAI();
        const response = await aiClient.models.generateContent(currentParams);
        return response;
      } catch (error) {
        lastError = error;
        const errorStr = String(error.message || error).toLowerCase();
        const isRateLimitOrOverloaded = errorStr.includes("429") || errorStr.includes("503") || errorStr.includes("quota") || errorStr.includes("limit") || errorStr.includes("resource_exhausted") || errorStr.includes("unavailable") || errorStr.includes("overloaded") || errorStr.includes("demand");
        if (isRateLimitOrOverloaded) {
          console.warn(`[ai-client] Model ${model} (attempt ${attempt}/${retries}) hit rate-limit or quota constraint:`, errorStr);
        } else {
          console.error(`[ai-client] Model ${model} (attempt ${attempt}/${retries}) failed:`, errorStr);
        }
        if (isRateLimitOrOverloaded) {
          anyQuotaExceeded = true;
          lastQuotaExceededTime = Date.now();
          rateLimitedModels[model] = Date.now();
          const hasSearch = currentParams?.config?.tools?.some((t) => t.googleSearch);
          if (hasSearch) {
            console.warn(`[ai-client] Search grounding quota exhausted. Stripping googleSearch tool and retrying model ${model} without search...`);
            if (currentParams?.config?.tools) {
              currentParams.config.tools = currentParams.config.tools.filter((t) => !t.googleSearch);
              if (currentParams.config.tools.length === 0) {
                delete currentParams.config.tools;
              }
            }
            attempt--;
            continue;
          }
          const isHardQuotaLimit = errorStr.includes("quota") || errorStr.includes("resource_exhausted") || errorStr.includes("503") || errorStr.includes("unavailable") || errorStr.includes("overloaded") || errorStr.includes("demand") || errorStr.includes("429") && !errorStr.includes("overloaded");
          if (isHardQuotaLimit) {
            console.warn(`[ai-client] Model ${model} is unavailable, overloaded, or hit quota. Skipping retries for this model and instantly routing to fallback...`);
            break;
          }
          if (attempt < retries) {
            const waitTime = delay * Math.pow(2, attempt - 1);
            console.warn(`[ai-client] Model ${model} overloaded or rate-limited. Retrying in ${waitTime}ms...`);
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
        data: req.file.buffer.toString("base64")
      }
    };
    const profileContext = req.body.profileContext;
    const gradeLevel = req.body.gradeLevel;
    const textPart = {
      text: `You are the core intelligence engine for "HelpYou AI", an elite educational and research assistant, SAT/ACT Expert, and Master Educator.
You are analyzing an uploaded photo. Scan the image to locate the primary problem, question, diagram, or text. Ignore any background noise, hands, or irrelevant objects. Focus solely on extracting and analyzing the core subject.
${profileContext ? `
USER PROFILE CONTEXT:
${profileContext}
` : ""}

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
  "markdown_content": "### Comparison Table

| Parameter | Category A | Category B |
|---|---|---|
| Detail 1 | Description | Description |",
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
  "markdown_content": "### Historical Context / Overview
Your detailed overview here...

### Major Events & Impact
- Point 1
- Point 2

### Analytical Takeaways
- Key lesson / impact",
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
3. HIGH EMPATHY: Be patient and deeply encouraging.`
    };
    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: [{ parts: [imagePart, textPart] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
        // ⚡ Low temp = focused, faster JSON output
        maxOutputTokens: 8192,
        // ⚡ Large token capacity so full multi-step solutions never truncate
        candidateCount: 1
        // ⚡ Only generate 1 candidate, not multiple
      }
    });
    res.json({ text: response.text });
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Scan quota exceeded:", error.message);
      return res.json({
        text: `\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded

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
function getSystemInstruction(mode, targetLanguage) {
  let instruction = "";
  if (mode === "Translate") {
    instruction = `You are an expert translator for "HelpYou AI". The user has provided an image or text to be translated into the target language: "${targetLanguage || "English"}".
Your absolute and strict mandate is to translate the text/question into "${targetLanguage || "English"}" perfectly, keeping the natural meaning intact.

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
\u{1F3AF} Core Concept / Overview: Clear, formal academic definition & context.
\u{1F4DD} Step-by-Step Logic / Key Events: A rigorous, sound breakdown.
\u26A0\uFE0F Analytical Takeaway / Exam Traps: Key points to remember.`;
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
  * PASS 1 (Expression & Question Anatomy): Deconstruct every term, sign (+/-), parenthesis, exponent, radical, fraction, constant, and boundary condition without dropping or modifying ANY symbol. In nested expressions (e.g. sin(90 * cos(90 / 6))), isolate innermost operations first. Default to Degrees (\xB0) for standard numericals unless explicitly in Radians or containing \u03C0. In Advanced Calculus & Definite Integrals (e.g. int_0^{pi/2} \frac{x sin x}{1 + cos^2 x} dx): Check whether King's property int_0^a f(x)dx = int_0^a f(a-x)dx preserves the denominator. If the denominator transforms (e.g. cos^2 x 	o sin^2 x), DO NOT force an incorrect substitution. Instead, immediately apply Integration by Parts: let u = x, dv = \frac{sin x}{1+cos^2 x}dx implies v = -arctan(cos x), giving boundary term 0 and simplifying to int_0^{pi/2} arctan(cos x) dx.
  * PASS 2 (Forward Step-by-Step PEMDAS Execution): Apply strict Order of Operations (PEMDAS/BODMAS): Parentheses -> Exponents/Roots -> Multiplication/Division -> Addition/Subtraction. Show standard theoretical formulas, substitute exact values, and calculate intermediate values with dual representation (exact radical/fraction and 4-decimal precision).
  * PASS 3 (Reverse Sanity Check & Boundary Validation): Verify every arithmetic and trigonometric step (e.g. 90/6 = 15, cos(15\xB0) = (sqrt(6)+sqrt(2))/4 \u2248 0.9659, 90 * 0.9659 = 86.9333\xB0, sin(86.9333\xB0) \u2248 0.9985, arctan(1) = pi/4, arctan(0) = 0, arcsin(1) = pi/2, arccos(0) = pi/2, ln(1) = 0). Check mathematical ranges (e.g. |sin|, |cos| <= 1, probabilities in [0,1], non-negative square roots). Ensure 100% mathematical accuracy before outputting.
- MANDATORY LINE-BY-LINE FORMATTING & SPACING PROTOCOL (NO CLUSTERED TEXT):
  * LINE BREAK AFTER EVERY SENTENCE: Never write long, crammed multi-sentence paragraphs. Every single sentence, explanation, or calculation must be on its OWN line, separated by a blank line (\\n\\n).
  * NO BULLET SYMBOLS: Do NOT use bullet signs (no "\u2022", no "-", no "*", no "1.", no "2."). Arrange points cleanly and spacious using blank lines (\\n\\n) between sentences.
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
  "markdown_content": "### Comparison Table

| Parameter | Category A | Category B |
|---|---|---|
| Detail 1 | Description | Description |",
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
  "markdown_content": "### Historical Context / Overview
Your detailed overview here...

### Major Events & Impact
- Point 1
- Point 2

### Analytical Takeaways
- Key lesson / impact",
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
    instruction += `

CRITICAL LANGUAGE RULE: You are a polyglot AI engine for HelpYou AI. You must automatically detect the user's input language, dialect, or script. If the user writes in English, reply in English. If the user writes in Hindi (Devanagari), reply in Hindi. If the user writes in Hinglish (Hindi written in English alphabet, e.g., "bhai ispe research karo"), you MUST reply completely in natural, high-quality Hinglish. Never default to English when the user initiated the query in Hinglish.`;
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
    let parsedHistory = history ? typeof history === "string" ? JSON.parse(history) : history : [];
    const imagePart = req.file ? {
      inlineData: {
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64")
      }
    } : null;
    let userMessage = message;
    if (contextualDoubtStepId && contextualDoubtContent) {
      userMessage = `[CONTEXTUAL DOUBT: Student is questioning Step ${contextualDoubtStepId} ("${contextualDoubtTitle}"). Content of this step they are questioning: "${contextualDoubtContent}". Answer their question specifically with respect to this step context. Do not ignore this context.]

${userMessage}`;
    }
    const hasImage = !!imagePart || parsedHistory.some((m) => m.parts && m.parts.some((p) => p.inlineData || p.imageUrl));
    const normalizedMsg = (userMessage || "").toLowerCase();
    const shouldEnableSearch = !hasImage && (normalizedMsg.includes("search") || normalizedMsg.includes("browse") || normalizedMsg.includes("live") || normalizedMsg.includes("current") || normalizedMsg.includes("weather") || normalizedMsg.includes("news") || normalizedMsg.includes("rates") || normalizedMsg.includes("today") || normalizedMsg.includes("current events") || normalizedMsg.includes("recent") || normalizedMsg.includes("latest") || normalizedMsg.includes("exchange") || normalizedMsg.includes("stats") || normalizedMsg.includes("price") || normalizedMsg.includes("fact") || normalizedMsg.includes("forecast") || normalizedMsg.includes("who is"));
    let systemInstruction = "";
    if (isEvaluation === "true" || isEvaluation === true) {
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
      if (gradeLevel) {
        const gradeInstruction = `CRITICAL INSTRUCTION: The user you are interacting with is currently in Grade: ${gradeLevel}. You MUST strictly adapt your entire response, vocabulary, conceptual complexity, sentence structure, and examples to perfectly match the comprehension level of a ${gradeLevel} student. Absolutely DO NOT use advanced jargon, higher-level academic concepts, or complex language that exceeds this specific grade level. Keep the tone encouraging and age-appropriate.`;
        systemInstruction = `${gradeInstruction}

${systemInstruction}`;
      }
      systemInstruction += `

The current date and time is: ${(/* @__PURE__ */ new Date()).toISOString()}. You must treat this as the absolute present moment.`;
    }
    systemInstruction += `

CRITICAL LANGUAGE RULE: You MUST strictly mirror the user's language, tone, and script. If the user writes in English, reply in English. If the user writes in Hindi (Devanagari), reply in Hindi. If the user writes in Hinglish (Hindi words written in the English alphabet, e.g., "kya haal hai"), you MUST reply completely in Hinglish. Do NOT default to English or mix English sentences if the user initiated the conversation in Hinglish or another language.`;
    if (shouldEnableSearch) {
      systemInstruction += `


[CRITICAL DEEP SEARCH MODE ACTIVE]
The user is asking for real-time, live, or current up-to-date data (e.g., currency rates, weather, events today, recent facts).
- You MUST execute the live Google Search tool before generating your response. Do NOT rely on your internal training weights.
- You MUST explicitly cite the exact date of the data you retrieve from the live search (e.g., "As of today, July 17, 2026...", "Based on live search results for July 17, 2026...").
- If the live search fails or returns no results, you MUST explicitly state: "Unable to fetch real-time data at the moment," instead of hallucinating past data or future forecasts.
- Ensure your entire output remains structured in the requested format (such as JSON if that is required by the active mode).
`;
    }
    let contents = [];
    if (parsedHistory.length === 0) {
      const parts = [];
      if (imagePart) parts.push(imagePart);
      const defaultMessage = userMessage || "Please solve the problem shown in the image step by step. Write out the steps clearly and logically, ensuring each part of the solution is easy to understand.";
      parts.push({ text: defaultMessage });
      contents = [{ role: "user", parts }];
    } else {
      const isScannerPlaceholder = parsedHistory[0]?.role === "user" && (!parsedHistory[0].parts || parsedHistory[0].parts.length === 0);
      if (imagePart && isScannerPlaceholder) {
        parsedHistory[0].parts = [imagePart];
      } else if (imagePart && parsedHistory[0]?.role === "user") {
        const hasNoInlineData = !parsedHistory[0].parts.some((p) => p.inlineData);
        if (hasNoInlineData) {
          parsedHistory[0].parts.unshift(imagePart);
        }
      }
      const parts = [];
      if (imagePart && !isScannerPlaceholder && (parsedHistory[0]?.role !== "user" || parsedHistory[0].parts.some((p) => p.inlineData))) {
        parts.push(imagePart);
      } else if (imagePart && !isScannerPlaceholder) {
        parts.push(imagePart);
      }
      if (userMessage) {
        parts.push({ text: userMessage + "\n\nPlease continue providing step-by-step guidance." });
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
      const activeModels = [];
      const backburnerModels = [];
      for (const m of modelsToTry) {
        const lastLimited = rateLimitedModels[m] || 0;
        if (now - lastLimited < 36e5) {
          backburnerModels.push(m);
        } else {
          activeModels.push(m);
        }
      }
      if (activeModels.length > 0) {
        modelsToTry = [...activeModels, ...backburnerModels];
      }
      let responseStream = null;
      let successModel = "";
      for (const model of modelsToTry) {
        try {
          const aiClient2 = getAI();
          responseStream = await aiClient2.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: { parts: [{ text: systemInstruction }] },
              responseMimeType: isEvaluation === "true" || isEvaluation === true ? "text/plain" : "application/json",
              maxOutputTokens: 8192,
              temperature: 0.2,
              candidateCount: 1
            }
          });
          successModel = model;
          break;
        } catch (err) {
          const errStr = String(err.message || err).toLowerCase();
          const isRateLimitOrQuota = errStr.includes("429") || errStr.includes("503") || errStr.includes("502") || errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("limit") || errStr.includes("unavailable") || errStr.includes("overloaded") || errStr.includes("demand") || errStr.includes("temporary");
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
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      try {
        for await (const chunk of responseStream) {
          const text = chunk.text || "";
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}

`);
          }
        }
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      } catch (err) {
        console.error("Error during streaming:", err);
        res.write(`data: ${JSON.stringify({ error: err.message || "Stream interrupted" })}

`);
        res.end();
        return;
      }
    } else {
      const response = await safeGenerateContent({
        model: "gemini-3.5-flash-lite",
        contents,
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: isEvaluation === "true" || isEvaluation === true ? "text/plain" : "application/json",
          temperature: 0.7,
          // ⚡ Balanced temp for conversational AI
          maxOutputTokens: 8192,
          // ⚡ High output token ceiling to prevent incomplete generation
          candidateCount: 1
          // ⚡ Single candidate only
        }
      });
      res.json({ text: response.text });
    }
  } catch (error) {
    if (error.isRateLimit || error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Chat quota exceeded:", error.message);
      return res.status(429).json({
        isRateLimit: true,
        error: "System is currently busy helping many students! \u{1F4DA}\nWe're processing your request as fast as possible. Please wait for 60 seconds and try again, or take a quick stretch break. Your learning journey is our priority!"
      });
    }
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message || "Failed to generate response" });
  }
});
app.post("/api/summarize", upload.single("pdf"), async (req, res) => {
  try {
    const action = req.body.action || "summarize";
    const textInput = req.body.text || "";
    const gradeLevel = req.body.gradeLevel;
    const format = req.body.format || "bullet";
    if (!req.file && !textInput) {
      return res.status(400).json({ error: "No PDF file or text content provided" });
    }
    let cacheKey = "";
    if (req.file) {
      cacheKey = import_crypto.default.createHash("sha256").update(req.file.buffer).digest("hex") + "_" + action;
    } else {
      cacheKey = import_crypto.default.createHash("sha256").update(Buffer.from(textInput)).digest("hex") + "_" + action;
    }
    if (summaryCache.has(cacheKey)) {
      const cached = summaryCache.get(cacheKey);
      if (action === "flashcards-json") {
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
        const pdfData = await pdf(req.file.buffer, { max: 60 });
        if (pdfData.numpages > 60) {
          return res.status(400).json({ error: "PDF document exceeds 60 pages limit. Please upload a shorter document." });
        }
        extractedText = pdfData.text || "";
        if (extractedText.trim().length < 50) {
          useRawFile = true;
        }
        if (extractedText && extractedText.length > 2e5) {
          extractedText = extractedText.slice(0, 2e5);
        }
      } catch (parseError) {
        console.warn("Failed to parse PDF locally with pdf-parse, will fallback to raw bytes:", parseError);
        useRawFile = true;
      }
    } else {
      extractedText = textInput;
    }
    let promptText = "";
    let responseMimeType = "text/plain";
    if (action === "audio") {
      promptText = "You are an engaging, expert study podcast host. Your job is to convert the provided document into a 4-5 minute study audio script (approx 500-700 words). CRITICAL RULE: DO NOT copy and paste the text verbatim. You must extract the high-yield concepts, definitions, and frameworks, and explain them in your own words using a conversational, easy-to-understand tone. Use relatable analogies. Strike a balance between being concise and highly educational. Never sound like you are just reading a textbook. Use the following strict rules:\n1. TONE & STYLE: Conversational, warm, and highly engaging. Speak directly to the listener using 'you', 'we', and 'let's explore this'.\n2. SIMPLICITY & ANALOGIES: Demystify complex terms, explaining them immediately using clear language. Use relatable analogies, but ensure technical definitions, important rules, and key examples are NOT skipped.\n3. PACING & STRUCTURE: Start with an attention-grabbing podcast-style hook or intro (e.g., 'Welcome to your deep study revision briefing...'). Include clear transitions between different chapters or sections. Cover all critical topics from the text sequentially. End with a complete revision summary and an encouraging sign-off.\n4. AUDIO-FRIENDLY FORMATTING: Since this will be spoken aloud, DO NOT use any markdown formatting such as bold (**), italics (*), hashtags (#), or bullet points (-). Write in clean, conversational plain text and paragraphs. Keep sentences clear and punchy for natural breathing pauses.\nDo not include any intro or outro text confirming you understand the instructions. Just output the podcast script directly.";
    } else if (action === "flashcards" || action === "flashcards-json") {
      if (action === "flashcards-json") {
        responseMimeType = "application/json";
        promptText = `Act as an expert study coach. Extract the top 10 to 15 most critical, high-yield concepts from the provided document and format them into flashcards.
        Rules:
        1. The 'question' should be concise and direct.
        2. The 'answer' should be short (1-2 sentences max).
        3. If there is code/HTML, wrap it in backticks.
        4. Output ONLY a valid JSON array of objects.
        
        Format:
        [
          {"question": "...", "answer": "..."},
          ...
        ]`;
      } else {
        promptText = "Extract the most important facts and concepts from the provided document and format them into 10 high-quality flashcards. Format exactly like this for each:\n\n**Q: [Question]**\n*A: [Answer]*\n\nCRITICAL: If the document contains code tags, HTML, or web development terms (like <div>, <header>, etc.), ALWAYS wrap them in markdown backticks (e.g., `<div>`) so they render as plain text and not formatting. Keep answers concise.";
      }
    } else if (action === "quiz") {
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
    if (action !== "audio") {
      promptText += "\n\nOUTPUT QUALITY RULES:\n1. Use ONLY standard markdown: ## headings, ### subheadings, - bullet lists, **bold**, *italic*.\n2. Each bullet point MUST be on its OWN separate line. Never put multiple points on the same line.\n3. NO LaTeX, no '$', no '$$', no '\\\\frac'. Write math as plain text (e.g., A = P(1 + r/n)^(nt)).\n4. NO emojis or special unicode characters.\n5. Ensure there is a blank line before and after every heading and before and after every list.";
    } else {
      promptText += "\n\nCRITICAL FORMATTING INSTRUCTIONS: Output ONLY standard, plain ASCII-compatible conversational text. You are STRICTLY FORBIDDEN from using emojis, LaTeX math blocks, special characters, or markdown formatting (like bold, italics, bullet points, or hashtags) as they interfere with text-to-speech rendering.";
    }
    const textPart = { text: promptText };
    let contentsPayload;
    if (useRawFile && req.file) {
      const pdfPart = {
        inlineData: {
          mimeType: req.file.mimetype || "application/pdf",
          data: req.file.buffer.toString("base64")
        }
      };
      contentsPayload = { parts: [pdfPart, textPart] };
    } else if (extractedText && extractedText.trim().length > 10) {
      const documentContentPart = { text: `DOCUMENT CONTENT:
${extractedText}` };
      contentsPayload = { parts: [documentContentPart, textPart] };
    } else if (req.file) {
      const pdfPart = {
        inlineData: {
          mimeType: req.file.mimetype || "application/pdf",
          data: req.file.buffer.toString("base64")
        }
      };
      contentsPayload = { parts: [pdfPart, textPart] };
    } else {
      return res.status(400).json({ error: "Text content is too short to process." });
    }
    const summarizeModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest"
    ];
    let summaryText = "";
    let summarizeError = null;
    for (const model of summarizeModels) {
      try {
        const response = await safeGenerateContent({
          model,
          contents: contentsPayload,
          config: {
            responseMimeType,
            maxOutputTokens: 8192,
            temperature: 0.3
          }
        });
        summaryText = response.text || "";
        summarizeError = null;
        break;
      } catch (err) {
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
    if (action === "flashcards-json") {
      const flashcards = safeParseJSON(summaryText, "array");
      summaryCache.set(cacheKey, flashcards);
      return res.json({ flashcards });
    }
    summaryCache.set(cacheKey, summaryText);
    res.json({ text: summaryText });
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits or has exceeded its quota. Please try again in 60 seconds.`
      });
    }
    console.error("Summarize error:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary" });
  }
});
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }
    let textToSpeak = text;
    if (textToSpeak.length > 1500) {
      textToSpeak = textToSpeak.substring(0, 1500) + "...";
    }
    const response = await safeGenerateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Please generate audio for this text: ${textToSpeak}` }] }],
      config: {
        responseModalities: [import_genai.Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
        }
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const rawPcm = Buffer.from(base64Audio, "base64");
      const wavBuffer = pcmToWav(rawPcm);
      const base64Wav = wavBuffer.toString("base64");
      res.json({ audio: base64Wav, mimeType: "audio/wav" });
    } else {
      res.status(500).json({ error: "No audio generated" });
    }
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("TTS quota exceeded:", error.message);
      return res.status(429).json({ error: "API quota limit exceeded for audio conversion. Please try again in 60 seconds." });
    }
    console.error("TTS error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/grade-essay", async (req, res) => {
  try {
    const { text, curriculum, subject, gradeLevel, images } = req.body;
    const wordCount = text ? text.trim().split(/\s+/).filter((w) => w.length > 0).length : 0;
    if (!text && (!images || !Array.isArray(images) || images.length === 0)) {
      return res.status(400).json({ error: "Missing text or images" });
    }
    const aiClient = getAI();
    const curr = curriculum || "AP (Advanced Placement)";
    const subj = subject || "General Essay";
    let rubricInstructions = "";
    let scoreHeader = "";
    if (curr.includes("AP")) {
      scoreHeader = "AP RUBRIC SCORE: [Score]/6 (Thesis: [ThesisScore]/1, Evidence: [EvidenceScore]/4, Sophistication: [SophisticationScore]/1)";
      rubricInstructions = `You MUST evaluate the essay using the official AP 6-point scale:
Thesis: 0 or 1 point
Evidence and Commentary: 0 to 4 points
Sophistication: 0 or 1 point
Your score output must EXACTLY match this format (with correct points calculated):
AP RUBRIC SCORE: [Score]/6 (Thesis: [ThesisScore]/1, Evidence: [EvidenceScore]/4, Sophistication: [SophisticationScore]/1)`;
    } else if (curr.includes("IELTS") || curr.includes("TOEFL")) {
      const isIelts = subj.toLowerCase().includes("ielts") || subj.toLowerCase().includes("task");
      if (isIelts) {
        scoreHeader = "IELTS BAND SCORE: [BandScore]/9 (Task Achievement: [TAScore]/9, Coherence: [CCScore]/9, Lexical: [LRScore]/9, Grammar: [GRAScore]/9)";
        rubricInstructions = `You MUST evaluate the essay using the official IELTS 9-band scale across four criteria (Task Achievement/Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy).
Your score output must EXACTLY match this format:
IELTS BAND SCORE: [BandScore]/9 (Task Achievement: [TAScore]/9, Coherence: [CCScore]/9, Lexical: [LRScore]/9, Grammar: [GRAScore]/9)`;
      } else {
        scoreHeader = "TOEFL SCORE: [Score]/30";
        rubricInstructions = `You MUST evaluate the essay using the official TOEFL Writing scale (0 to 30 points) based on development of ideas, organization, language use, and accuracy.
Your score output must EXACTLY match this format:
TOEFL SCORE: [Score]/30`;
      }
    } else if (curr.includes("IB")) {
      scoreHeader = "IB CRITERIA SCORE: [Score]/34 (Focus: [FocusScore]/10, Analysis: [AnalysisScore]/10, Structure: [StructureScore]/10, Language: [LanguageScore]/4)";
      rubricInstructions = `You MUST evaluate the essay using the official IB grading criteria (scale from 0 to 34).
Your score output must EXACTLY match this format:
IB CRITERIA SCORE: [Score]/34 (Focus: [FocusScore]/10, Analysis: [AnalysisScore]/10, Structure: [StructureScore]/10, Language: [LanguageScore]/4)`;
    } else if (curr.includes("A-Levels")) {
      scoreHeader = "A-LEVEL GRADE: [Grade] (A*, A, B, C, D, or E) - Score: [Score]/25";
      rubricInstructions = `You MUST evaluate the essay based on UK A-Level marking bands (scale from 0 to 25).
Your score output must EXACTLY match this format:
A-LEVEL GRADE: [Grade] (A*, A, B, C, D, or E) - Score: [Score]/25`;
    } else {
      scoreHeader = "HIGH SCHOOL RUBRIC SCORE: [Score]/100 (Focus/Org: [FocusScore]/25, Content/Dev: [ContentScore]/25, Style: [StyleScore]/25, Grammar: [GrammarScore]/25)";
      rubricInstructions = `You MUST evaluate the essay using a standard high school grading rubric out of 100 points, broken down into Focus/Organization, Content/Development, Style/Sentence Structure, and Grammar/Mechanics (each 25 points).
Your score output must EXACTLY match this format:
HIGH SCHOOL RUBRIC SCORE: [Score]/100 (Focus/Org: [FocusScore]/25, Content/Dev: [ContentScore]/25, Style: [StyleScore]/25, Grammar: [GrammarScore]/25)`;
    }
    const systemInstruction = `Act as an expert certified educator and Essay Grader for the "${curr}" curriculum, specifically for the subject/essay type: "${subj}".
Your task is to grade and provide constructive, highly specific feedback on the student's essay.

CRITICAL INSTRUCTION: The user you are interacting with is currently in Grade: ${gradeLevel}. You MUST strictly adapt your entire response, vocabulary, conceptual complexity, sentence structure, and examples to perfectly match the comprehension level of a ${gradeLevel} student. Absolutely DO NOT use advanced jargon, higher-level academic concepts, or complex language that exceeds this specific grade level. Keep the tone encouraging and age-appropriate.

Tone: Encouraging, professional, and clear. Speak directly to the student.

CRITICAL RULES (MUST FOLLOW):
1. NO RAW LETTER GRADES (except if A-Level curriculum where A-Level bands specify grades, but do not just write "A" or "B" without details).
2. OFFICIAL SPECIFIC RUBRIC FORMAT: 
${rubricInstructions}
3. \u26A1 SPEED & CONCISENESS RULE: Deliver your feedback using highly concise, clear, and punchy plain text. Keep sentence lengths short. Avoid general or redundant context. Limit the response to a total of 250 words to ensure instant grading delivery.
4. STRICT PLAIN TEXT RULE (CRITICAL): Absolutely DO NOT use any Markdown formatting like asterisks (** or *), hashes (#), underscores, backticks, or dashes/bullet points (-, *, \u2022). Use simple numbered steps (e.g., 1. or 2.) or regular line breaks and capitalized section headers. Do not output any HTML tags or markdown formatting symbols. Output ONLY clean, raw plain text.

Analyze the provided text and output your response EXACTLY in the following structure. Do not add any conversational filler before or after.

${scoreHeader}

POINT DEDUCTION ANALYSIS:
[Explain any lost points or bands. For every single point/band the student did NOT earn, explicitly state which point was lost and why in 1-2 plain sentences. If they scored perfectly, write: "No points lost! Outstanding work."]

STRENGTHS:
[1-2 clear, plain sentences highlighting a strong point in their writing, without any dashes, asterisks or bullet points]

AREAS FOR IMPROVEMENT:
1. [Area 1 in plain text]
2. [Area 2 in plain text]

GRAMMAR AND POLISH:
[Highlight 1 specific grammatical error and provide the corrected version in a simple plain sentence, without any markdown]

OVERALL VERDICT:
[A short 2-sentence encouraging plain text summary].`;
    const originalModel = "gemini-3.6-flash";
    let modelsToTry = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
      "gemini-3.6-flash"
    ];
    const now = Date.now();
    const activeModels = [];
    const backburnerModels = [];
    for (const m of modelsToTry) {
      const lastLimited = rateLimitedModels[m] || 0;
      if (now - lastLimited < 36e5) {
        backburnerModels.push(m);
      } else {
        activeModels.push(m);
      }
    }
    if (activeModels.length > 0) {
      modelsToTry = [...activeModels, ...backburnerModels];
    }
    const contentParts = [];
    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (!img) continue;
        const parts = img.split(",");
        const base64Data = parts[1] || img;
        const mimeType = parts[0]?.split(";")[0]?.split(":")[1] || "image/jpeg";
        contentParts.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      }
    }
    const targetText = text || "Please read the student's handwritten or typed essay from the attached image(s) and grade it strictly according to the rubric.";
    contentParts.push({ text: targetText });
    let streamResponse = null;
    let lastError = null;
    let anyQuotaExceeded = false;
    for (const model of modelsToTry) {
      try {
        streamResponse = await aiClient.models.generateContentStream({
          model,
          contents: { parts: contentParts },
          config: {
            systemInstruction,
            temperature: 0.15,
            maxOutputTokens: 8192
          }
        });
        break;
      } catch (err) {
        lastError = err;
        const errStr = String(err.message || err);
        const isRateLimitOrQuota = errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("resource_exhausted") || errStr.includes("limit");
        if (isRateLimitOrQuota) {
          console.warn(`[grade-essay stream] Model ${model} hit rate-limit or quota constraint:`, errStr);
          lastQuotaExceededTime = Date.now();
          rateLimitedModels[model] = Date.now();
          anyQuotaExceeded = true;
          continue;
        } else {
          console.error(`[grade-essay stream] Model ${model} failed:`, errStr);
        }
      }
    }
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
  } catch (error) {
    console.error("Essay Grader error:", error);
    const errorStr = String(error.message || error);
    const isQuotaError = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("RESOURCE_EXHAUSTED");
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
        data: req.file.buffer.toString("base64")
      }
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
  } catch (error) {
    console.error("OCR Error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe image" });
  }
});
app.post("/api/scan-images", upload.array("images", 5), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }
    const imageParts = files.map((file) => ({
      inlineData: {
        mimeType: file.mimetype,
        data: file.buffer.toString("base64")
      }
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
  } catch (error) {
    console.error("Multimodal OCR Error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe images" });
  }
});
app.post("/api/generate-flashcards", async (req, res) => {
  try {
    const { text, gradeLevel, count } = req.body;
    const wordCount = text ? text.trim().split(/\s+/).filter((w) => w.length > 0).length : 0;
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }
    const requestedCount = Math.min(Math.max(parseInt(count) || 10, 1), 30);
    const aiClient = getAI();
    const systemInstruction = `Act as an expert study coach and cognitive learning specialist. Analyze the provided text. Regardless of the text's length, extract exactly the top ${requestedCount} most critical, high-yield concepts. Generate exactly ${requestedCount} flashcards. Prioritize quality and core concepts.

Rules for Flashcards:
1. Focus on key definitions, dates, formulas, or core concepts.
2. The 'question' should be concise and direct.
3. The 'answer' should be short and easy to memorize (1-2 sentences max).
4. CRITICAL: If the topic involves coding, HTML, or web development (like <div>, <header>, <span>), ALWAYS wrap those tags or attributes in markdown backticks (e.g., \`<div>\`) so they are treated as plain text and not rendered as HTML.

CRITICAL OUTPUT RULE:
You must output ONLY a valid JSON array of objects. Do not wrap the JSON in markdown blocks (like \`\`\`json), do not include any introductory or concluding text. The output must be directly parseable by a JSON parser.

Format exactly like this:
[
  {
    "question": "What is the powerhouse of the cell?",
    "answer": "The mitochondria."
  },
  {
    "question": "What year did the US declare independence?",
    "answer": "1776."
  }
]`;
    const response = await safeGenerateContent({
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: `Generate exactly ${requestedCount} flashcards from this text: ${text}` }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });
    let outputText = response.text || "[]";
    res.json({ flashcards: safeParseJSON(outputText, "array") });
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Flashcards quota exceeded:", error.message);
      return res.json({
        flashcards: [
          {
            question: "\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded",
            answer: "The Gemini API has exceeded its rate limit. Please wait 60 seconds and try again, or check your API key in settings."
          }
        ]
      });
    }
    console.error("Flashcards error:", error);
    res.status(500).json({ error: error.message || "Failed to generate flashcards" });
  }
});
async function robustFetchYoutubeTranscript(videoId) {
  console.log(`[robustFetchYoutubeTranscript] Fetching transcript for video: ${videoId}`);
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  ];
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  let captionTracks = [];
  let lastError = null;
  const innerTubeClients = [
    {
      name: "ANDROID",
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "20.10.38"
        }
      },
      userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14)"
    },
    {
      name: "WEB",
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240228.01.00",
          hl: "en",
          gl: "US"
        }
      },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    {
      name: "IOS",
      context: {
        client: {
          clientName: "IOS",
          clientVersion: "19.29.1",
          deviceModel: "iPhone16,2",
          osName: "iPhone",
          osVersion: "17.5.1",
          hl: "en",
          gl: "US"
        }
      },
      userAgent: "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5_1 like Mac OS X; en_US)"
    },
    {
      name: "TVHTML5",
      context: {
        client: {
          clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
          clientVersion: "1.0",
          hl: "en",
          gl: "US"
        }
      },
      userAgent: "Mozilla/5.0 (Chromecast; PlaybackEngine) AppleWebKit/537.36 (KHTML, like Gecko) Kit/6.0.211116.14 Chrome/94.0.4606.111 Safari/537.36"
    }
  ];
  for (const clientConfig of innerTubeClients) {
    try {
      const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
      console.log(`[robustFetch] Trying InnerTube API (${clientConfig.name} client) for videoId: ${videoId}...`);
      const resp = await fetchWithTimeout(INNERTUBE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": clientConfig.userAgent
        },
        body: JSON.stringify({
          context: clientConfig.context,
          videoId
        })
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
    } catch (err) {
      console.error(`[robustFetch] InnerTube API (${clientConfig.name}) failed:`, err.message || err);
      lastError = err;
    }
  }
  if (captionTracks.length === 0) {
    try {
      console.log(`[robustFetch] Trying Web Page HTML scraping for videoId: ${videoId}...`);
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const resp = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": randomUserAgent,
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      if (!resp.ok) {
        throw new Error(`Web page request failed with status: ${resp.status}`);
      }
      const body = await resp.text();
      if (body.includes('class="g-recaptcha"')) {
        throw new Error("YouTube blocks request with Recaptcha (Too Many Requests / 429)");
      }
      let playerResponse = null;
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
            if (body[i] === "{") depth++;
            else if (body[i] === "}") {
              depth--;
              if (depth === 0) {
                try {
                  playerResponse = JSON.parse(body.slice(jsonStart, i + 1));
                  break;
                } catch (_) {
                }
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
    } catch (err) {
      console.error(`[robustFetch] Web Page scraping failed with error:`, err);
      lastError = err;
    }
  }
  if (captionTracks.length === 0) {
    throw lastError || new Error("No caption tracks found or available on this video. Please ensure Closed Captions (CC) are enabled.");
  }
  let selectedTrack = captionTracks.find((t) => t.languageCode === "en");
  if (!selectedTrack) {
    selectedTrack = captionTracks.find((t) => t.languageCode && t.languageCode.startsWith("en"));
  }
  if (!selectedTrack) {
    selectedTrack = captionTracks[0];
    console.log(`[robustFetch] English transcript not found. Falling back to first available language: ${selectedTrack.languageCode}`);
  } else {
    console.log(`[robustFetch] Selected language track: ${selectedTrack.languageCode}`);
  }
  const transcriptURL = selectedTrack.baseUrl;
  if (!transcriptURL) {
    throw new Error("Selected caption track has no baseUrl");
  }
  console.log(`[robustFetch] Fetching transcript XML from: ${transcriptURL}`);
  const transcriptResponse = await fetchWithTimeout(transcriptURL, {
    headers: {
      "User-Agent": randomUserAgent
    }
  });
  if (!transcriptResponse.ok) {
    throw new Error(`Failed to fetch transcript XML, status: ${transcriptResponse.status}`);
  }
  const xmlText = await transcriptResponse.text();
  try {
    const results2 = import_youtube_transcript.YoutubeTranscript.parseTranscriptXml(xmlText, selectedTrack.languageCode);
    if (results2 && results2.length > 0) {
      return results2;
    }
  } catch (parseErr) {
    console.error("[robustFetch] YoutubeTranscript.parseTranscriptXml failed, using local fallback parser:", parseErr);
  }
  const results = [];
  const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(xmlText)) !== null) {
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const inner = match[3];
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/g, "");
    }
    text = decodeEntities(text).trim();
    if (text) {
      results.push({
        text,
        duration: durMs,
        offset: startMs,
        lang: selectedTrack.languageCode
      });
    }
  }
  if (results.length > 0) return results;
  const classicResults = [...xmlText.matchAll(RE_XML_TRANSCRIPT)];
  return classicResults.map((res) => ({
    text: decodeEntities(res[3]),
    duration: parseFloat(res[2]) * 1e3,
    offset: parseFloat(res[1]) * 1e3,
    lang: selectedTrack.languageCode
  }));
}
function decodeEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
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
      if (parsedUrl.hostname === "youtu.be") {
        videoId = parsedUrl.pathname.slice(1);
      } else if (parsedUrl.hostname.includes("youtube.com")) {
        if (parsedUrl.pathname.startsWith("/shorts/")) {
          videoId = parsedUrl.pathname.split("/")[2];
        } else {
          videoId = parsedUrl.searchParams.get("v") || "";
        }
      }
    } catch (e) {
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
    const fileHash = import_crypto.default.createHash("sha256").update(url).digest("hex");
    if (summaryCache.has(fileHash) && !followUp) {
      return res.json({
        text: summaryCache.get(fileHash),
        title: title || "YouTube Video",
        authorName: authorName || "",
        videoId
      });
    }
    if (followUp) {
      const systemInstruction2 = `You are an expert study coach. The student is asking a follow-up question or requesting an interactive study enhancement based on a previous YouTube video summary.
Your task is to fulfill the request in a highly informative, educational, and engaging way.
Keep your response concise, structured with headings, bullet points, and highlight key terms using markdown.

1. TIMESTAMPS INTEGRATION:
If any specific parts of the video are mentioned, or if referring to specific events, include relevant timestamps formatted exactly as **\u23F1\uFE0F MM:SS** (e.g. **\u23F1\uFE0F 04:20**).

2. INTERACTIVE STUDY SUGGESTIONS:
At the very end of your response, you MUST output 2-3 new interactive follow-up study suggestions formatted exactly as \`[SUGGESTION: ...]\`, e.g.:
\`[SUGGESTION: Explain key concepts simpler]\`
\`[SUGGESTION: Test me with 3 practice questions]\`
\`[SUGGESTION: Generate a list of key terms]\``;
      const promptText = `Previous Summary:
${previousSummary}

Student's Request: "${followUp}"`;
      const response2 = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: { parts: [{ text: promptText }] },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction2 }] }
        }
      });
      const outputText2 = response2.text || "No response generated.";
      return res.json({
        text: outputText2,
        title: title || "YouTube Video",
        authorName: authorName || "",
        videoId
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
      transcriptText = transcript.map((t) => {
        const totalSec = Math.floor((t.offset || 0) / 1e3);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        const timestampStr = `[${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}]`;
        return `${timestampStr} ${t.text}`;
      }).join(" ");
      if (transcriptText.length > 25e4) {
        transcriptText = transcriptText.substring(0, 25e4) + "... [transcript truncated for length]";
      }
      if (transcriptText.trim().split(/\s+/).length < 20) {
        throw new Error("Transcript too short for meaningful summary");
      }
    } catch (e) {
      console.warn("YouTube transcript extraction unavailable, returning strict fallback:", e.message || e);
      return res.status(400).json({
        error: "\u26A0\uFE0F I couldn't read the subtitles for this video. Please try pasting the video's transcript directly into the Text Note-Maker."
      });
    }
    const transcriptWordCount = transcriptText.trim().split(/\s+/).filter((w) => w.length > 0).length;
    if (transcriptWordCount < 50) {
      return res.status(400).json({
        error: "\u26A0\uFE0F I couldn't read the subtitles for this video. Please try pasting the video's transcript directly into the Text Note-Maker."
      });
    }
    const systemInstruction = `You are an AI assistant tasked with creating high-yield study notes from YouTube videos. Once you have the transcript, create a structured summary with clear headings, bullet points, and key takeaways.
    
1. TIMESTAMPS INTEGRATION:
For each major bullet point, key concept, or important takeaway, locate the closest timestamp in the provided text (formatted as [MM:SS]) and prepend it to the bullet point styled exactly as **\u23F1\uFE0F MM:SS** (e.g., **\u23F1\uFE0F 04:20**). Do not guess timestamps if none are in the transcript, but if they are, use them.

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
      videoId
    });
  } catch (error) {
    if (error.isRateLimit || error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("YouTube summary quota exceeded:", error.message);
      return res.status(429).json({
        isRateLimit: true,
        error: "System is currently busy helping many students! \u{1F4DA}\nWe're processing your request as fast as possible. Please wait for 60 seconds and try again, or take a quick stretch break. Your learning journey is our priority!"
      });
    }
    console.error("YouTube summary error:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary" });
  }
});
app.post("/api/generate-content", async (req, res) => {
  try {
    const { topic, type, tone = "Academic", format = "Standard", gradeLevel } = req.body;
    const wordCount = topic ? topic.trim().split(/\s+/).filter((w) => w.length > 0).length : 0;
    if (!topic || !type) {
      return res.status(400).json({ error: "Missing topic or type" });
    }
    const aiClient = getAI();
    let formatSpecificRules = "";
    if (type.toUpperCase() === "ESSAY") {
      formatSpecificRules = `
- Avoid the basic 3-point template or five-paragraph essay structure.
- Dive deep into complex analysis, address potential counter-arguments, and synthesize information authoritatively.`;
    } else if (type.toUpperCase() === "BLOG") {
      formatSpecificRules = `
- Ground the text in reality. Use concrete examples, hypothetical case studies, or hard numbers (e.g., specific revenue differences, subscriber counts).
- Use punchy, scannable paragraphs and Markdown subheadings (###).`;
    } else if (type.toUpperCase() === "POEM") {
      formatSpecificRules = `
- Strictly use proper line breaks (\\n) and stanzas. Do not output a continuous block of text.
- Focus on vivid, sensory imagery and rhythm.`;
    } else if (type.toUpperCase() === "PARAGRAPH") {
      formatSpecificRules = `
- Deliver a single, highly concentrated block of thought without filler fluff.`;
    }
    let toneSpecificRules = "";
    if (tone.toUpperCase() === "ACADEMIC") {
      toneSpecificRules = `
- Maintain extreme objectivity and formal structure.
- Incorporate realistic (or requested) citations logically.
- Synthesize complex mechanisms.`;
    } else if (tone.toUpperCase() === "PERSUASIVE") {
      toneSpecificRules = `
- Write from the trenches. Be direct, authoritative, and logic-driven.
- Convince the reader using realistic scenarios, not abstract philosophy.`;
    } else if (tone.toUpperCase() === "CREATIVE") {
      toneSpecificRules = `
- "Show, don't tell."
- Focus on emotional resonance, setting the scene, and exploring the human element.
- Avoid melodrama.`;
    } else if (tone.toUpperCase() === "CASUAL") {
      toneSpecificRules = `
- Write like a knowledgeable friend or a top-tier Reddit/Twitter thread.
- Be relatable, conversational, and highly engaging.`;
    }
    const systemInstruction = `You are an expert, human-sounding writer capable of adapting to any format and tone. Your primary goal is to generate high-quality, deeply engaging content while strictly avoiding formulaic "AI-speak."

1. THE GLOBAL ANTI-ROBOT FILTER (Applies to ALL outputs):
- BAN AI CLICH\xC9S: Never use overused words like "delve," "testament," "realm," "tapestry," "crucial," "foster," or "unassailable." Use natural, precise, and internet-native vocabulary.
- NO ROBOTIC TRANSITIONS: Eliminate mechanical transitions ("Firstly," "Furthermore," "In conclusion," "Ultimately"). Weave ideas together naturally.
- NO GENERIC ENDINGS: Never end with a summary paragraph wrapping up the text. End with a provocative thought, a call-to-action, or a lingering image depending on the format.
- NO ROBOTIC FILLER: Do not say "Here is your content" or "Certainly". Output ONLY the final content itself.

2. DYNAMIC FORMAT RULES (Adapt based on user's 'Content Type' selection):
${formatSpecificRules}

3. DYNAMIC TONE RULES (Adapt based on user's 'Tone' selection):
${toneSpecificRules}

ACADEMIC FORMATTING COMPLIANCE (If applicable):
- MLA: If MLA formatting was selected, include a standard MLA Header, centered title, in-text citations, and Works Cited.
- APA: If APA formatting was selected, include APA Title block, section headers, in-text citations, and References.
- Standard: Standard introduction, body, and conclusion.`;
    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: `Generate a ${type} in ${format} format with a ${tone} tone. Topic: ${topic}` }] },
      config: { systemInstruction: { parts: [{ text: systemInstruction }] } }
    });
    const outputText = response.text || "No content generated.";
    res.json({ text: outputText });
  } catch (error) {
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
    const wordCount = text ? text.trim().split(/\s+/).filter((w) => w.length > 0).length : 0;
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
    "A concise, educational bullet point of what was fixed and why (e.g., 'Corrected spelling of "milks" to "milk" because "milk" is an uncountable noun.'). Limit to 3-6 key educational fixes."
  ]
}`;
    const contentParts = [];
    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (!img) continue;
        const parts = img.split(",");
        const base64Data = parts[1] || img;
        const mimeType = parts[0]?.split(";")[0]?.split(":")[1] || "image/jpeg";
        contentParts.push({
          inlineData: {
            mimeType,
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
    let fixes = [];
    try {
      const parsed = safeParseJSON(outputRaw, "object");
      correctedText = parsed.correctedText || parsed.text || outputRaw;
      fixes = Array.isArray(parsed.fixes) ? parsed.fixes : [];
    } catch (parseError) {
      console.log("[grammar-enhance] Failed to parse JSON, falling back to raw output", parseError);
      correctedText = outputRaw;
      fixes = ["Reviewed grammar, spelling, and phrasing structures."];
    }
    res.json({ text: correctedText, fixes });
  } catch (error) {
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
        const pdfModule = await import("pdf-parse/lib/pdf-parse.js");
        const parsePdf = pdfModule.default || pdfModule;
        const pdfData = await parsePdf(req.file.buffer, { max: 60 });
        if (pdfData.numpages > 60) {
          return res.status(400).json({ error: "PDF document exceeds 60 pages limit. Please upload a shorter document." });
        }
        extractedText = pdfData.text || "";
        if (extractedText && extractedText.length > 5e5) {
          extractedText = extractedText.slice(0, 5e5);
        }
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse PDF: " + parseError.message });
      }
    } else {
      extractedText = req.file.buffer.toString("utf-8");
    }
    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: "Could not extract any readable text from this file." });
    }
    res.json({ text: extractedText.trim() });
  } catch (error) {
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
      const blockedPhrases = ["403 forbidden", "access denied", "robot check", "captcha", "cloudflare"];
      const lowercaseText = cleanText.toLowerCase();
      const isBlocked = blockedPhrases.some((phrase) => lowercaseText.includes(phrase));
      if (cleanText.length < 20 || isBlocked) {
        return res.status(400).json({ error: "Unable to read this link. The website's security is blocking our AI. Please copy and paste the article text directly into the box." });
      }
      if (cleanText.length > 6e4) {
        cleanText = cleanText.slice(0, 6e4) + "...";
      }
      res.json({ text: cleanText.trim() });
    } catch (fetchError) {
      res.status(500).json({ error: "Unable to read this link. The website's security is blocking our AI. Please copy and paste the article text directly into the box." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to retrieve webpage content." });
  }
});
app.post("/api/summarize-text", async (req, res) => {
  try {
    const { text, format, gradeLevel } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }
    const wordCount = text ? text.trim().split(/\s+/).filter((w) => w.length > 0).length : 0;
    const aiClient = getAI();
    const summaryFormat = format || "bullet";
    const blockedPhrases = ["403 forbidden", "access denied", "robot check", "captcha", "cloudflare"];
    const lowercaseText = text.toLowerCase();
    if (text.length < 20 || blockedPhrases.some((p) => lowercaseText.includes(p))) {
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
    const textSumModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest"
    ];
    let textSummaryResult = "";
    let textSumError = null;
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
      } catch (err) {
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
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Text summarize quota exceeded:", error.message);
      return res.json({
        text: `\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits. Please wait 60 seconds and try again.`
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
    const topicText = topic && topic.trim() ? topic.trim() : `general concepts in ${stream || "academic subjects"}`;
    const aiClient = getAI();
    const systemInstruction = `You are an Elite Academic Advisor, US High School & AP/College Teacher, and Expert AI Tutor.
The user wants to generate high-yield, level-appropriate SUBJECTIVE (open-ended/essay) practice questions.
Your ONLY job is to generate exactly ${requestedCount} subjective practice questions based on the topic and the user's profile.

CRITICAL RULES:
1. NO ANSWERS: Do not include any answers, options, multiple choice letters, hints, solutions, or explanations. You must ONLY output the question prompts themselves.
2. STRICT SUBJECTIVE FOCUS: Every single question must be an open-ended, subjective, conceptual, or analytical inquiry. They must require deep explanation, structured essay responses, mathematical proofs, or architectural coding plans. Do not output simple retrieval questions.
3. STRICT JSON OUTPUT: You must output ONLY a valid JSON object containing an array of strings in a key named "questions". Do not wrap the JSON in markdown code blocks like \`\`\`json. Absolutely ZERO conversational text before or after the JSON.
4. CRISP & CONCISE: Keep every question incredibly clear, direct, and free of redundant words. Avoid wordy, run-on sentences.
5. WORD LIMIT: Each question must be extremely direct and MUST NOT exceed 30-40 words.
6. CHUNKING FOR COMPLEXITY: If a question requires a complex scenario or detailed context, DO NOT write a massive paragraph. Instead, break it down using sub-parts (e.g., Part A, Part B) or bullet points.
7. NO FLUFF: Maintain elite academic rigor and Bloom's Taxonomy cognitive depth, but deliver it in bite-sized, digestible mobile text.

Use this exact JSON structure:
{
  "questions": [
    "Part A: Explain how supply and demand adjusts prices in a competitive market during a supply shock. Part B: Predict the consumer response.",
    "Analyze the ethical implications of using advanced AI algorithms for autonomous driving in critical, unavoidable crash scenarios.",
    "Describe the primary biochemical and molecular steps that occur in a eukaryotic muscle cell during a sliding filament contraction."
  ]
}`;
    let generatedText = "";
    try {
      const response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: { parts: [{ text: `Topic: ${topicText}. Grade Level: ${gradeLevel || "11th Grade (Junior)"}. Academic Stream: ${stream || "STEM / Engineering"}. Count: Generate exactly ${requestedCount} questions now.` }] },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
        }
      });
      generatedText = response.text || "";
    } catch (apiError) {
      console.warn("API Error during subjective question generation:", apiError);
      throw apiError;
    }
    const parsed = safeParseJSON(generatedText, "object");
    if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return res.json({ questions: parsed.questions });
    } else if (Array.isArray(parsed)) {
      return res.json({ questions: parsed });
    }
    throw new Error("Failed to generate a valid subjective questions structure.");
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("Question generation endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to generate questions" });
  }
});
app.post("/api/evaluate-answer", async (req, res) => {
  try {
    const questionText = req.body.questionText || req.body.question || "";
    const userAnswer = req.body.userAnswer || req.body.answer || "";
    const userGrade = req.body.userGrade || req.body.gradeLevel;
    const curriculum = req.body.curriculum;
    const subject = req.body.subject;
    if (!questionText) {
      return res.status(400).json({ error: "Missing questionText" });
    }
    if (!userAnswer || !userAnswer.trim()) {
      return res.status(400).json({ error: "Please write an answer before submitting for evaluation!" });
    }
    const systemInstruction = `You are a strict academic examiner. DO NOT act as a standard tutor. Your SOLE purpose is to grade the student's answer based on their grade level. YOU MUST output strictly using this format:

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
    const response = await safeGenerateContent({
      gradeLevel: userGrade,
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: `Evaluate the student's answer for: "${questionText}". Student's Answer is: "${userAnswer}".` }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] }
      }
    });
    const text = response.text || "Failed to evaluate response.";
    res.json({ evaluation: text });
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("Evaluation endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to evaluate answer" });
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
    const systemInstruction = `You are an Elite US High School Teacher and SAT/AP Exam Expert. The user will provide a subject or specific topic. 
Your ONLY job is to generate a highly accurate, exam-level Multiple Choice Quiz for that topic.

CRITICAL RULES:
1. STRICT JSON OUTPUT: You must output ONLY a valid JSON array. Do not wrap it in markdown blockquotes like \`\`\`json. Absolutely ZERO conversational text before or after the JSON.
2. FORMAT: Generate exactly ${requestedCount} questions. Each question must have exactly 4 options and a short explanation.
3. CORRECT ANSWER: The "correctAnswer" field MUST be a single string that EXACTLY matches one of the strings in the "options" array. Do not return an array of multiple correct answers.
4. MULTIPLE EQUATIONS FORMATTING: If generating any math questions, options, or explanations that contain multiple equations (such as systems of linear equations), you must strictly separate the equations using a clear delimiter like the word 'and' or a newline character (\\n) so they do not blend together into a single string.

Use this exact JSON structure:
[
  {
    "question": "What is the primary function of the mitochondria in a eukaryotic cell?",
    "options": ["A) Protein synthesis", "B) DNA replication", "C) ATP production", "D) Lipid breakdown"],
    "correctAnswer": "C) ATP production",
    "explanation": "Mitochondria generate most of the cell's supply of adenosine triphosphate (ATP), used as a source of chemical energy."
  }
]`;
    let quizText = "";
    try {
      const response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: { parts: [{ text: `Topic: ${topic}. Generate the ${requestedCount}-question JSON quiz now.` }] },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
        }
      });
      quizText = response.text || "";
    } catch (apiError) {
      console.warn("API Error during quiz generation:", apiError);
      throw apiError;
    }
    const parsed = safeParseJSON(quizText, "array");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return res.json({ quiz: parsed });
    }
    throw new Error("Failed to generate a valid quiz structure.");
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
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
    const maxSizeBytes = 10 * 1024 * 1024;
    if (req.file.size > maxSizeBytes) {
      return res.status(400).json({ error: "PDF file size must not exceed 10MB." });
    }
    let extractedText = "";
    let numPages = 0;
    try {
      const pdfModule = await import("pdf-parse/lib/pdf-parse.js");
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
      const slicedText = extractedText.length > 15e4 ? extractedText.slice(0, 15e4) : extractedText;
      response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-3.5-flash-lite",
        contents: [{
          parts: [{ text: `DOCUMENT CONTENT:
${slicedText}

Generate the ${requestedCount}-question JSON quiz now based strictly on the content above.` }]
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
          data: req.file.buffer.toString("base64")
        }
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
      const parsed = safeParseJSON(quizText, "array");
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[PDF Quiz API] Successfully parsed quiz with ${parsed.length} questions.`);
        return res.json({ quiz: parsed });
      }
    } catch (parseError) {
      console.error("[PDF Quiz API] JSON parse error for PDF quiz output:", parseError, quizText);
    }
    return res.status(400).json({ error: "Failed to generate a valid quiz structure from the PDF. Please ensure it has readable text or images." });
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
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
        data: req.file.buffer.toString("base64")
      }
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
      const parsed = safeParseJSON(quizText, "array");
      if (Array.isArray(parsed) && parsed.length > 0) {
        return res.json({ quiz: parsed });
      }
    } catch (parseError) {
      console.error("JSON parse error for image quiz output:", parseError, quizText);
    }
    return res.status(500).json({ error: "Failed to generate a valid quiz structure from the image." });
  } catch (error) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        text: `\u26A0\uFE0F AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("Image quiz generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate quiz from image" });
  }
});
async function extractSearchKeywords(userQuery) {
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
    const parsed = safeParseJSON(response.text || "[]", "array");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((k) => String(k).trim()).filter(Boolean);
    }
  } catch (e) {
    console.error("[extractSearchKeywords] Error:", e);
  }
  const clean = userQuery.replace(/^(bhai|tum|please|zara|karo|batao|explain|mujhe|janna|hai|deep|search|kya|hua|tha|pe|par|about)\s+/gi, "").trim();
  return [clean || userQuery];
}
async function performLiveWebSearch(query, searchKeywords = []) {
  const sources = [];
  const seenUrls = /* @__PURE__ */ new Set();
  const queriesToSearch = Array.from(/* @__PURE__ */ new Set([
    ...searchKeywords,
    query.replace(/^(bhai|tum|please|zara|karo|batao|explain|mujhe|janna|hai|deep|search)\s+/gi, "").trim()
  ])).filter((q) => q && q.length > 2).slice(0, 3);
  const searchTasks = queriesToSearch.map(async (kw) => {
    const encoded = encodeURIComponent(kw);
    try {
      const rssRes = await fetchWithTimeout(`https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      }, 7e3);
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
        for (let i = 0; i < Math.min(4, items.length); i++) {
          const block = items[i][1];
          const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").trim();
          const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
          const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
          const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
          if (title && link && !seenUrls.has(link)) {
            seenUrls.add(link);
            sources.push({
              title,
              uri: link,
              sourceName: source || "Live News",
              snippet: `Published: ${pubDate}. Publisher: ${source}. Headline: ${title}`,
              pubDate,
              type: "news"
            });
          }
        }
      }
    } catch (e) {
      console.warn(`[performLiveWebSearch] Google News RSS error for "${kw}":`, e);
    }
    try {
      const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&utf8=&format=json&srlimit=3`;
      const wikiRes = await fetchWithTimeout(wikiSearchUrl, { headers: { "User-Agent": "HelpYouAI-Bot/1.0" } }, 7e3);
      if (wikiRes.ok) {
        const data = await wikiRes.json();
        const items = data.query?.search || [];
        for (const item of items) {
          const pageTitle = item.title;
          const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`;
          if (seenUrls.has(pageUrl)) continue;
          seenUrls.add(pageUrl);
          let extract = item.snippet.replace(/<[^>]+>/g, "");
          try {
            const sumRes = await fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`, {
              headers: { "User-Agent": "HelpYouAI-Bot/1.0" }
            }, 4e3);
            if (sumRes.ok) {
              const sumData = await sumRes.json();
              if (sumData.extract) extract = sumData.extract;
            }
          } catch (_) {
          }
          sources.push({
            title: pageTitle,
            uri: pageUrl,
            sourceName: "Wikipedia Encyclopedia",
            snippet: extract,
            type: "encyclopedia"
          });
        }
      }
    } catch (e) {
      console.warn(`[performLiveWebSearch] Wikipedia error for "${kw}":`, e);
    }
    try {
      const ddgRes = await fetchWithTimeout(`https://api.duckduckgo.com/?q=${encoded}&format=json`, {}, 5e3);
      if (ddgRes.ok) {
        const ddg = await ddgRes.json();
        if (ddg.Heading && ddg.AbstractURL && !seenUrls.has(ddg.AbstractURL)) {
          seenUrls.add(ddg.AbstractURL);
          sources.push({
            title: ddg.Heading,
            uri: ddg.AbstractURL,
            sourceName: ddg.AbstractSource || "DuckDuckGo Knowledge",
            snippet: ddg.Abstract || "",
            type: "knowledge"
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
  const { question, wrongInput, correctConcept, gradeLevel } = req.body;
  try {
    if (!question || !wrongInput || !correctConcept) {
      return res.status(400).json({ error: "Missing required mistake fields: question, wrongInput, or correctConcept" });
    }
    const systemInstruction = `You are "Deep Search AI", an elite, highly intelligent educational assistant. Adopt a highly professional, crisp, and direct tone.

Your job is to analyze a student's academic mistake and provide a structured conceptual correction.
Adopt a highly professional, crisp, direct, and encouraging academic voice.
DO NOT use any markdown bolding syntax like "**" or emojis in your final output.

You MUST format your response as a strict JSON object with EXACTLY these three keys:
1. "why_it_happened": One short, direct sentence explaining the core misunderstanding or why the student made this mistake.
2. "the_fix": The absolute correct concept explained in extremely simple and clear terms.
3. "pro_memory_trick": Provide a clever mnemonic, short analogy, or a strict memory rule to help the student easily memorize this.

Example format:
{
  "why_it_happened": "The core misunderstanding is confusing the magnetic poles with geographic directions.",
  "the_fix": "The magnetic north pole of Earth is actually near the geographic south pole.",
  "pro_memory_trick": "Remember that opposites attract, so the north compass needle points to where the magnet's south pole lives."
}`;
    const prompt = `Student Mistake Context:
Original Question/Topic: ${question}
User's Incorrect Answer/Input: ${wrongInput}
Correct Concept/Answer: ${correctConcept}

Please analyze this mistake and output the correction in the strict JSON format specified.`;
    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: prompt }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });
    let rawText = response.text || "";
    let parsedResult = null;
    try {
      parsedResult = safeParseJSON(rawText, "object");
    } catch (parseError) {
      console.error("Failed to parse JSON response for fix-mistake:", parseError, rawText);
      parsedResult = {
        why_it_happened: `There was a misunderstanding with the topic or question.`,
        the_fix: `The correct concept is: ${correctConcept}`,
        pro_memory_trick: "Review this topic carefully to prevent making this mistake again!"
      };
    }
    res.json(parsedResult);
  } catch (error) {
    console.error("Fix mistake endpoint failed:", error);
    res.status(500).json({
      error: "Failed to generate AI correction for this mistake.",
      details: error.message
    });
  }
});
app.post("/api/generate-practice", async (req, res) => {
  const { question, wrongInput, correctConcept, sourceFeature, gradeLevel } = req.body;
  try {
    if (!question || !correctConcept) {
      return res.status(400).json({ error: "Missing required fields: question or correctConcept" });
    }
    const systemInstruction = `You are "Magic AI Tutor", an elite, highly intelligent educational assistant.
Adopt an encouraging, patient, precise, and crisp tone.
Your task is to analyze the student's mistake and generate exactly 3 interactive practice questions in a similar domain or testing the exact same conceptual gap, but with different numbers, words, or contexts so they can master the concept.

Each question MUST be a multiple-choice question with exactly 4 options.
The questions should vary in difficulty (Easy, Medium, Hard).
DO NOT use any markdown bolding syntax like "**" or emojis in your questions, options, or explanations. Use clean line breaks for readability.

You MUST format your response as a strict JSON array containing exactly 3 objects.
Each object MUST have the following keys:
1. "question": The practice question text (e.g. "If a triangle has sides of length 3 and 4, and the angle between them is 90 degrees, what is the length of the hypotenuse?").
2. "options": An array of exactly 4 strings representing the choices.
3. "correctIndex": The 0-based index of the correct option in the options array (integer 0, 1, 2, or 3).
4. "explanation": A helpful, encouraging explanation of why that option is correct and how to solve it step-by-step. Keep it friendly and educational.

Example format:
[
  {
    "question": "What is the magnetic polarity of Earth's geographic North Pole?",
    "options": [
      "Magnetic North Polarity",
      "Magnetic South Polarity",
      "It has no magnetic polarity",
      "It fluctuates every hour"
    ],
    "correctIndex": 1,
    "explanation": "Earth's geographic North Pole actually behaves like a magnetic South Pole, which is why the north-seeking end of a compass needle points towards it! Opposites attract."
  }
]`;
    const prompt = `Student Mistake Context:
Subject/Category: ${sourceFeature || "General Study"}
Original Question/Concept: ${question}
User's Incorrect Response: ${wrongInput || "Incorrect response"}
Correct Explanation: ${correctConcept}

Please generate exactly 3 similar practice questions to help the student test and master this specific concept. Avoid exact repetition, instead create original similar problems.
Return the response in the strict JSON array format specified.`;
    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash-lite",
      contents: { parts: [{ text: prompt }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });
    let rawText = response.text || "";
    let parsedResult = null;
    try {
      parsedResult = safeParseJSON(rawText, "array");
    } catch (parseError) {
      console.error("Failed to parse JSON response for generate-practice:", parseError, rawText);
      parsedResult = [
        {
          "question": `Based on your previous mistake about "${question}", which of the following represents the correct understanding?`,
          "options": [
            `${correctConcept}`,
            "An alternative incorrect interpretation",
            "A common misconception on the same topic",
            "None of the above options are true"
          ],
          "correctIndex": 0,
          "explanation": `The correct concept is: ${correctConcept}. This practice question helps reinforce it.`
        }
      ];
    }
    res.json(parsedResult);
  } catch (error) {
    console.error("Generate practice endpoint failed:", error);
    res.status(500).json({
      error: "Failed to generate practice questions.",
      details: error.message
    });
  }
});
app.post("/api/live-study-tutor", async (req, res) => {
  const { query, profileContext, studentNotes, gradeLevel } = req.body;
  try {
    if (!query || !query.trim()) {
      return res.status(400).json({ error: "Missing search query" });
    }
    const rawQuery = query.trim();
    const keywords = await extractSearchKeywords(rawQuery);
    const searchResults = await performLiveWebSearch(rawQuery, keywords);
    const verifiedContextString = searchResults.map(
      (s, idx) => `[Verified Source ${idx + 1}] Title: ${s.title}
URL: ${s.uri}
Publisher: ${s.sourceName}
Content Snippet: ${s.snippet}
`
    ).join("\n---\n");
    const systemInstruction = `You are the lead intelligence engine for "Deep Search AI" in the "HelpYou AI" app.
Your mission is to process student queries and produce an elite, point-wise, in-depth academic research report grounded in real-time verified data.

CRITICAL FORMATTING & STRUCTURE RULES:
1. ONLY ONE MAIN HEADLINE:
   - "topic_title" MUST be a crisp, elegant, concise headline of 3 to 6 words max (e.g. "Jeju Island Case Investigation", "JEE Main 2026 Registration Guide"). Avoid long multi-clause sentence titles.
2. NEVER OUTPUT LARGE UNBROKEN PARAGRAPHS:
   - All explanations MUST be strictly broken down into small, digestible subheadings and point-wise bullet points.
   - Each entry in "live_updates" MUST start with a small markdown subheading (e.g. "### \u{1F4CC} Core Background & Overview", "### \u{1F50D} Detailed Timeline & Developments", "### \u2696\uFE0F Systemic Impact & Public Reforms", "### \u{1F4A1} High-Yield Student Takeaways").
   - Under each subheading, provide 2 to 4 detailed bullet points starting with bold anchors (e.g. "* **Incident Timeline:** In late August 2026...").
3. TRUTHFULNESS & GROUNDING:
   - Base all facts, recent dates, exam notices, historical events, and names strictly on reality and the provided Verified Web Search Context.
   - ZERO HALLUCINATIONS: Do not fabricate dates, numbers, event outcomes, or policies.
4. STEM vs HUMANITIES RIGOR:
   - STEM Queries (Physics, Chemistry, Math, Biology): Provide core formulas wrapped in LaTeX ($...$ or $$...$$), step-by-step principles, and key parameters.
   - Humanities/News Queries: Provide structured bullet points covering background origin, chronological milestones, institutional impact, and current status.
5. LANGUAGE MATCHING:
   - If the user wrote in Hinglish (e.g. "Bhai Jeju island pe kya hua tha"), write the entire response in natural, articulate, point-wise Hinglish.
   - If Hindi, write Hindi. If English, write English.
6. ZERO FAKE URLS:
   - In "source_links", ONLY use exact verified URLs from context. If no URLs match, use verified official root domains.

STRICT JSON OUTPUT FORMAT:
{
  "topic_title": "Concise Main Headline (3-6 words)",
  "match_score": "98%",
  "live_updates": [
    "### \u{1F4CC} Core Background & Overview\\n* **Foundational Context:** Clear, detailed background facts.\\n* **Core Definition & Significance:** Key concepts students need to know.",
    "### \u{1F50D} Detailed Timeline & Key Developments\\n* **Chronological Events:** Specific dates and verified occurrences.\\n* **Key Turning Points:** Critical discoveries or policy shifts.",
    "### \u2696\uFE0F Analytical Impact & Real-World Consequences\\n* **Institutional Response:** Official commissions, public reaction, or examination implications.\\n* **Modern Status:** Current status as of today.",
    "### \u{1F4A1} High-Yield Student Takeaways\\n* **Critical Exam Insights:** High-yield questions and summary synthesis.\\n* **Common Misconceptions:** Key distinctions to avoid exam traps."
  ],
  "action_steps": [
    "Step 1: Foundational Review - core concepts and essential timeline to master",
    "Step 2: Analytical Deep-Dive - key turning points or core mechanisms",
    "Step 3: Synthesis & Verification - high-yield review against verified facts"
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
${profileContext ? `STUDENT PROFILE CONTEXT:
${profileContext}
` : ""}
${studentNotes ? `STUDENT LOCAL STUDY NOTES / TARGET SYLLABUS:
${studentNotes}
` : ""}

VERIFIED REAL-TIME WEB SEARCH DATA:
${verifiedContextString || "No external search feeds returned. Synthesize using accurate, verified ground truth."}

Conduct a deep, point-wise, structured academic research analysis with small markdown subheadings (### ...) and bullet points under each section, returning strictly the JSON structure above.`;
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
    let parsedResult = null;
    try {
      parsedResult = safeParseJSON(rawText, "object");
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
        source_links: searchResults.map((s) => s.uri).slice(0, 5)
      };
    }
    const cleanSources = [];
    const detailedSources = [];
    const seenUrls = /* @__PURE__ */ new Set();
    const candidateLinks = Array.isArray(parsedResult.source_links) && parsedResult.source_links.length > 0 ? parsedResult.source_links : searchResults.map((s) => s.uri);
    for (const link of candidateLinks) {
      if (typeof link !== "string" || !link.startsWith("http") || seenUrls.has(link)) continue;
      seenUrls.add(link);
      cleanSources.push(link);
      const matched = searchResults.find((s) => s.uri === link);
      let displayTitle = matched?.title;
      if (!displayTitle) {
        try {
          const u = new URL(link);
          const host = u.hostname.replace(/^www\./, "");
          if (host.includes("wikipedia")) displayTitle = "Wikipedia Academic Article";
          else if (host.includes("britannica")) displayTitle = "Encyclopaedia Britannica";
          else if (host.includes("news.google")) displayTitle = "Google News Live Feed";
          else displayTitle = `${host} Verified Research`;
        } catch (_) {
          displayTitle = "Verified Web Source";
        }
      }
      detailedSources.push({
        title: displayTitle,
        uri: link,
        sourceName: matched?.sourceName
      });
    }
    if (detailedSources.length === 0 && searchResults.length > 0) {
      for (const s of searchResults.slice(0, 5)) {
        if (!seenUrls.has(s.uri)) {
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
    if (detailedSources.length === 0) {
      const defaultWiki = `https://en.wikipedia.org/wiki/${encodeURIComponent((keywords[0] || rawQuery).replace(/ /g, "_"))}`;
      cleanSources.push(defaultWiki, "https://news.google.com");
      detailedSources.push(
        { title: `${keywords[0] || rawQuery} - Wikipedia Encyclopedia`, uri: defaultWiki, sourceName: "Wikipedia" },
        { title: "Google News Real-Time Index", uri: "https://news.google.com", sourceName: "Google News" }
      );
    }
    parsedResult.source_links = cleanSources.slice(0, 6);
    parsedResult.detailed_sources = detailedSources.slice(0, 6);
    if (!Array.isArray(parsedResult.related_queries) || parsedResult.related_queries.length === 0) {
      parsedResult.related_queries = [
        `Key milestones of ${parsedResult.topic_title}`,
        `Exam questions on ${parsedResult.topic_title}`,
        `Latest 2026 updates regarding ${parsedResult.topic_title}`
      ];
    }
    res.json(parsedResult);
  } catch (error) {
    console.error("[live-study-tutor] Fatal error:", error);
    res.status(500).json({
      error: error.message || "Failed to conduct deep research search. Please try again.",
      success: false
    });
  }
});
app.post("/api/generate-trivia", async (req, res) => {
  try {
    const { gradeLevel, academicStream, topic, excludeQuestions, country } = req.body;
    const aiClient = getAI();
    const normalizeStr = (s) => s ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    const excludesSet = new Set((excludeQuestions || []).map((q) => normalizeStr(q)));
    let attempts = 0;
    let finalTrivia = null;
    let extraAvoidInstruction = "";
    while (attempts < 3) {
      attempts++;
      let promptText = `Generate a single, unique, highly engaging educational trivia question tailored for:
- Student Academic Grade: ${gradeLevel || "11th Grade (Junior)"}
- Academic Track/Stream: ${academicStream || "STEM / Engineering"}
- Student's Country: ${country || "United States"}`;
      if (country && country.trim().length > 0) {
        promptText += `
- Country-Specific Customization: Design a question that relates to, is contextualised for, or is based on the school curriculum, general knowledge, history, geography, science, famous figures, or academic themes of ${country}.`;
      }
      if (topic && topic.trim().length > 0) {
        promptText += `
- Specific Topic/Subject Focus: ${topic}`;
      }
      if (excludeQuestions && Array.isArray(excludeQuestions) && excludeQuestions.length > 0) {
        promptText += `
- EXCLUDE the following questions (do NOT generate them or anything similar): ${JSON.stringify(excludeQuestions.slice(-120))}`;
      }
      if (extraAvoidInstruction) {
        promptText += `
${extraAvoidInstruction}`;
      }
      const systemInstruction = `You are an Elite Interactive Quiz and Trivia Game Creator.
Generate a single multiple-choice trivia question that is highly informative, accurate, and customized.

GAME-PLAY & UNIQUE QUESTION STYLE:
- Design "Thinking Questions" (conceptual puzzles, scientific anomalies, real-world educational paradoxes, or reasoning riddles) rather than standard factual memorization.
- Make it highly gamified, interactive, and stimulating to think about. It should feel like a premium educational mind game!

CRITICAL RULES:
1. STRICT JSON OUTPUT: You must output ONLY a valid JSON object matching the schema below. Do not wrap it in markdown blockquotes like \`\`\`json. Absolutely ZERO conversational text before or after the JSON.
2. CORRECT INDEX: The "correctIndex" field must be a valid 0-based index of the correct option in the "options" array.
3. FACT: Provide an interesting, educational, and fun "fact" explaining the background or context of the answer. Include emojis!
4. OPTIONS: Provide exactly 3 or 4 engaging options. Options should be clearly distinct.

Required JSON Structure:
{
  "subjectTag": "\u{1F9EC} AP Biology Trivia",
  "question": "What is the primary role of the Golgi apparatus in a eukaryotic cell?",
  "options": ["A) Packaging and sorting proteins", "B) Synthesizing ribosomes", "C) ATP production", "D) Storing calcium ions"],
  "correctIndex": 0,
  "fact": "The Golgi apparatus acts like the post office of the cell, sorting and shipping proteins! \u{1F4E6}"
}`;
      const response = await safeGenerateContent({
        gradeLevel: gradeLevel || "11th Grade (Junior)",
        model: "gemini-3.5-flash-lite",
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
        }
      });
      const triviaText = response.text || "";
      const parsed = safeParseJSON(triviaText, "object");
      if (parsed && parsed.question && Array.isArray(parsed.options)) {
        const normQ = normalizeStr(parsed.question);
        if (!excludesSet.has(normQ)) {
          finalTrivia = parsed;
          break;
        } else {
          console.warn(`[Trivia Loop] Duplicate question generated: "${parsed.question}". Retrying...`);
          extraAvoidInstruction = `
- IMPORTANT: You previously generated "${parsed.question}", which was already asked. Please choose a completely different subtopic or a creative new angle to make sure it is 100% unique.`;
        }
      }
    }
    if (finalTrivia) {
      return res.json({ trivia: finalTrivia });
    }
    throw new Error("Failed to parse or generate a unique trivia response after multiple attempts");
  } catch (error) {
    console.error("Trivia generation error:", error);
    const fallbacks = [
      {
        subjectTag: "\u{1F3DB}\uFE0F AP World History",
        question: "Which edible substance found in ancient Egyptian tombs is famous for never spoiling?",
        options: ["Olive Oil", "Honey", "Barley Wine"],
        correctIndex: 1,
        fact: "Honey never spoils! Its low moisture and high acidity create an environment where bacteria cannot grow. Archaeologists have found 3,000-year-old honey that is still perfectly edible! \u{1F36F}"
      },
      {
        subjectTag: "\u{1FA90} AP Astronomy & Physics",
        question: "Which planet in our solar system has a day that is longer than its entire orbital year?",
        options: ["Mars", "Venus", "Mercury"],
        correctIndex: 1,
        fact: "A day on Venus is longer than its year! It takes Venus 243 Earth days to rotate once on its axis, but only 225 Earth days to complete one orbit around the Sun. \u{1FA90}"
      },
      {
        subjectTag: "\u{1F996} AP Environmental Science",
        question: "Which of these prehistoric creatures actually lived closer in time to modern humans?",
        options: ["Tyrannosaurus Rex", "Stegosaurus", "Triceratops"],
        correctIndex: 0,
        fact: "Tyrannosaurus Rex lived closer to us! T-Rex roamed 66 million years ago, whereas the Stegosaurus lived 150 million years ago\u2014an 84 million year gap! \u{1F996}"
      },
      {
        subjectTag: "\u{1F9EC} AP Biology Trivia",
        question: "How many hearts does an octopus have to pump blood through its body?",
        options: ["2 Hearts", "3 Hearts", "9 Hearts"],
        correctIndex: 1,
        fact: "Octopuses have three hearts, nine brains, and blue blood! Two hearts pump blood to the gills, while a third pumps it to the rest of the body. \u{1F419}"
      },
      {
        subjectTag: "\u26A1 AP Physics Trivia",
        question: "Approximately how many slices of bread can a single bolt of lightning toast?",
        options: ["1,000 slices", "10,000 slices", "100,000 slices"],
        correctIndex: 2,
        fact: "A single lightning bolt contains enough energy to toast over 100,000 slices of bread! \u{1F35E}"
      }
    ];
    const randomIndex = Math.floor(Math.random() * fallbacks.length);
    res.json({ trivia: fallbacks[randomIndex], isFallback: true });
  }
});
var SUBS_FILE_PATH = import_path.default.join(process.cwd(), "subscriptions.json");
function getStoredSubscriptions() {
  try {
    if (import_fs.default.existsSync(SUBS_FILE_PATH)) {
      return JSON.parse(import_fs.default.readFileSync(SUBS_FILE_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("Error reading subscriptions from file:", error);
  }
  return {};
}
function writeStoredSubscriptions(subs) {
  try {
    import_fs.default.writeFileSync(SUBS_FILE_PATH, JSON.stringify(subs, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving subscriptions to file:", error);
  }
}
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
app.get("/api/time", (req, res) => {
  res.json({ timestamp: Date.now() });
});
async function startServer() {
  const distPath = import_path.default.join(process.cwd(), "dist");
  const hasDist = import_fs.default.existsSync(import_path.default.join(distPath, "index.html"));
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production" || hasDist;
  if (isProd && hasDist) {
    console.log("[Server] Serving static frontend from:", distPath);
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      const ext = import_path.default.extname(req.path);
      if (ext || req.path.startsWith("/src") || req.path.startsWith("/api")) {
        return res.status(404).send("Not Found");
      }
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  } else {
    try {
      const viteModule = "vite";
      const { createServer: createViteServer } = await import(
        /* @vite-ignore */
        viteModule
      );
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite dev server not loaded:", e);
    }
  }
  const server = app.listen(Number(PORT) || 3e3, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.timeout = 3e5;
}
var isServerless = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
);
if (!isServerless) {
  startServer();
}
var server_default = app;
//# sourceMappingURL=server.cjs.map
