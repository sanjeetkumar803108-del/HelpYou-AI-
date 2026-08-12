import express from "express";
import path from "path";
import multer from "multer";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import crypto from "crypto";
import { YoutubeTranscript } from 'youtube-transcript';
import rateLimit from "express-rate-limit";
import xss from "xss";
import pdf from "pdf-parse";

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

app.use(cors());

// 1. Strict Rate Limiting (Brute Force Protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Auth Specific Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 failed login/auth attempts
  message: { error: "Too many login attempts, please try again after 15 minutes." },
});
app.use('/api/auth/', authLimiter); // Assuming if there's any backend auth

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
 * Robust JSON extraction and parsing utility.
 * Handles cases where models output markdown blocks or conversational text.
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
  
  // 3. Extract using structural patterns (find first { or [ and last } or ])
  const objStart = extracted.indexOf('{');
  const objEnd = extracted.lastIndexOf('}');
  const arrStart = extracted.indexOf('[');
  const arrEnd = extracted.lastIndexOf(']');
  
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




async function safeGenerateContent(params: any, retries = 3, delay = 500): Promise<any> {
  // Extract gradeLevel if provided
  const gradeLevel = params.gradeLevel;
  
  // We only clone the top-level structure and config elements to avoid serializing huge base64 strings (which causes CPU freezes and timeouts).
  const clonedParams = { ...params };
  delete clonedParams.gradeLevel;

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

    if (gradeLevel) {
      const gradeInstruction = `CRITICAL INSTRUCTION: The user you are interacting with is currently in Grade: ${gradeLevel}. You MUST strictly adapt your entire response, vocabulary, conceptual complexity, sentence structure, and examples to perfectly match the comprehension level of a ${gradeLevel} student. Absolutely DO NOT use advanced jargon, higher-level academic concepts, or complex language that exceeds this specific grade level. Keep the tone encouraging and age-appropriate.`;
      
      const parts = clonedParams.config.systemInstruction.parts || [];
      const text = parts[0]?.text || "";
      clonedParams.config.systemInstruction.parts = [
        { text: `${gradeInstruction}\n\n${text}`.trim() },
        ...parts.slice(1)
      ];
    }
  }

  const query = extractUserQuery(clonedParams);
  const sysInstr = clonedParams?.config?.systemInstruction?.parts?.[0]?.text || "";
  const respMime = clonedParams?.config?.responseMimeType || "";

  // Set up sequential models to try if the default model hits rate limits or quota issues
  const isSpecialtyModel = params.model && (
    params.model.includes("tts") || 
    params.model.includes("image") || 
    params.model.includes("video") || 
    params.model.includes("veo") || 
    params.model.includes("lyria") ||
    params.model.includes("clip")
  );

  let requestedModel = params.model;
  if (requestedModel === "gemini-flash-latest") {
    requestedModel = "gemini-3.6-flash";
  }

  let modelsToTry = isSpecialtyModel ? [requestedModel] : [
    requestedModel || "gemini-3.6-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash"
  ].filter((value, index, self) => self.indexOf(value) === index);

  if (!isSpecialtyModel) {
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
  }

  let lastError: any = null;
  let anyQuotaExceeded = false;

  for (const model of modelsToTry) {
    // Generate fresh clean parameters for the current model run from clonedParams
    const currentParams = { ...clonedParams };
    if (clonedParams.config) {
      currentParams.config = { ...clonedParams.config };
      if (clonedParams.config.tools) {
        currentParams.config.tools = clonedParams.config.tools.map((t: any) => ({ ...t }));
      }
      if (clonedParams.config.systemInstruction) {
        currentParams.config.systemInstruction = { ...clonedParams.config.systemInstruction };
        if (clonedParams.config.systemInstruction.parts) {
          currentParams.config.systemInstruction.parts = clonedParams.config.systemInstruction.parts.map((p: any) => ({ ...p }));
        }
      }
    }
    currentParams.model = model;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const aiClient = getAI();
        const response = await aiClient.models.generateContent(currentParams);
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
                                        errorStr.includes("demand");
        
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
                                   (errorStr.includes("429") && !errorStr.includes("overloaded"));
          
          if (isHardQuotaLimit) {
            console.warn(`[ai-client] Model ${model} hit hard quota limit. Skipping retries for this model and trying fallback...`);
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

  if (anyQuotaExceeded) {
    const rateLimitError: any = new Error("GEMINI_QUOTA_EXHAUSTED");
    rateLimitError.isRateLimit = true;
    throw rateLimitError;
  }
  throw lastError || new Error("AI generation failed after multiple attempts");
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
      text: `You are "Magic AI Tutor", an elite, highly intelligent, encouraging educational assistant, SAT/ACT Expert, and Master Educator.
You are analyzing a full-screen, uncropped photo. Scan the image to locate the primary mathematical equation, science question, diagram, or text problem. Ignore any background noise, hands, or irrelevant objects. Focus solely on extracting and solving the main academic problem visible in the image.
${profileContext ? `\nUSER PROFILE CONTEXT:\n${profileContext}\n` : ''}

Adopt an encouraging, patient, precise, and crisp tone. Use clean line breaks and emojis for visual readability.
DO NOT use any markdown bolding syntax like "**" or emojis inside latex delimiters.

CRITICAL SYSTEM INSTRUCTION (MANDATORY):
Before generating your response, you MUST analyze the extracted academic problem and categorize it into one of the following 3 routing rules to determine the output formatting:

--- CATEGORIZATION & ROUTING RULES ---

1. RULE 1 (Math & Physics Calculations):
- Use this ONLY if the query is a mathematical equation, physics numerical, derivation, or problem requiring step-by-step sequential solving.
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
      "content": "A detailed, encouraging explanation with formulas and step-by-step calculations. Whenever generating mathematical numbers, formulas, symbols, or equations, you must strictly wrap them in LaTeX delimiters. Use single '$' for inline math and double '$$' for block math equations.",
      "is_final_answer": false
    }
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
  "markdown_content": "### Comparison Table\n\n| Parameter | Category A | Category B |\n|---|---|---|\n| Detail 1 | Description | Description |"
}

3. RULE 3 (General Theory/Biology/History):
- Use this for general explanations, descriptive essays, conceptual questions, diagrams, small talk, or conversational queries (e.g., "Explain photosynthesis", "Who was George Washington?", "Why is the sky blue?").
- Set "format_type" to "markdown".
- Output structured, rich text using standard markdown headings (###) and bullet points. It must NEVER use steps or sequential solver cards for this.
- Place the entire response in the "markdown_content" field. Do NOT use the "solution_steps" array.
- Output strictly in this format:
{
  "topic_title": "Concept: [Topic Title]",
  "format_type": "markdown",
  "markdown_content": "### Overview\nYour detailed overview here...\n\n### Key Concepts\n- Bullet point 1\n- Bullet point 2"
}

--- STRICT CONSTRAINTS & FORMATTING RULES ---
- The entire output MUST be a valid JSON object. No raw conversational text is allowed outside of the JSON object. Do NOT wrap the JSON in markdown code blocks like \`\`\`json. Only output pure valid raw JSON.
- Always append exactly 3 plain text follow-up suggestions at the absolute end, formatted strictly as [SUGGESTION: text] on new lines AFTER the JSON object.
- Example suffix:
[SUGGESTION: Plain text suggestion 1]
[SUGGESTION: Plain text suggestion 2]
[SUGGESTION: Plain text suggestion 3]
- Do NOT use LaTeX inside the suggestions.

THE "MASTER EDUCATOR" TEACHING PROTOCOL:
1. EXTREME SIMPLIFICATION: Teach complex topics simply and clearly. Never assume prior knowledge.
2. THE ANALOGY RULE: Use relatable, real-world analogies where helpful.
3. HIGH EMPATHY: Be patient and deeply encouraging.`,
    };
    
    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-3.5-flash",
      contents: [{ parts: [imagePart, textPart] }],
      config: {
        responseMimeType: "application/json"
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
    instruction = `You are an expert translator. The user has provided an image or text to be translated into the target language: "${targetLanguage || 'English'}".
Your absolute and strict mandate is to translate the text/question into "${targetLanguage || 'English'}" perfectly, keeping the natural meaning intact.

CRITICAL SAFETY & QUALITY RULES (MUST FOLLOW):
1. You MUST output ONLY the direct, translated text.
2. Do NOT include ANY introductory text, concluding remarks, or conversational filler (e.g., do NOT write "Here is the translation:", "Translated text:", or "Sure, I can help with that").
3. Absolutely NO extra explanations, no side notes, and no additional output. Only the translated content itself.
4. If the input is a question, translate the question itself, do NOT answer it.
5. If the input is a single word or phrase, translate it directly.
6. Absolutely no conversational preamble. The output must be 100% clean translated text only.`;
  } else if (mode === "All Subjects") {
    instruction = `You are a High School AP/SAT Master Coach. Your tone is mature, highly intellectual, direct, and concise.
The student has scanned a question from an academic subject (which could be history, geography, biology, literature, chemistry, physics, etc.).
Your absolute mandate is to explain the question and its answer with rigorous academic authority. Avoid any child-like vocabulary, juvenile analogies, or patronizing language.

You MUST structure your response strictly using this layout:
🎯 Core Concept: Clear, formal academic definition.
📝 Step-by-Step Logic: A rigorous, sound breakdown of the solution.
⚠️ Common Pitfall: Point out high-level traps students fall into on exams.`;
  } else if (mode === "General") {
    instruction = `You are a High School AP/SAT Master Coach. Your tone is mature, highly intellectual, direct, and concise. The user has scanned or typed a general question or image.
Your task is to provide a comprehensive, clear, and highly accurate answer with rigorous academic authority. Avoid any child-like vocabulary, juvenile analogies, or patronizing language. Start directly with the answer to the question. Do not use conversational filler at the start.`;
  } else {
    // Default / Math mode
    instruction = `You are "Magic AI Tutor", an elite, highly intelligent, encouraging educational assistant, SAT/ACT Expert, and Master Educator.
Adopt an encouraging, patient, precise, and crisp tone. Use clean line breaks and emojis for visual readability.
DO NOT use any markdown bolding syntax like "**" or emojis inside latex delimiters.

CRITICAL SYSTEM INSTRUCTION (MANDATORY):
Before generating your response, you MUST analyze the user's query and categorize it into one of the following 3 routing rules to determine the output formatting:

--- CATEGORIZATION & ROUTING RULES ---

1. RULE 1 (Math & Physics Calculations):
- Use this ONLY if the query is a mathematical equation, physics numerical, derivation, or problem requiring step-by-step sequential solving.
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
      "content": "A detailed, encouraging explanation with formulas and step-by-step calculations. Whenever generating mathematical numbers, formulas, symbols, or equations, you must strictly wrap them in LaTeX delimiters. Use single '$' for inline math and double '$$' for block math equations.",
      "is_final_answer": false
    }
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
  "markdown_content": "### Comparison Table\n\n| Parameter | Category A | Category B |\n|---|---|---|\n| Detail 1 | Description | Description |"
}

3. RULE 3 (General Theory/Biology/History):
- Use this for general explanations, descriptive essays, conceptual questions, small talk, or conversational queries (e.g., "Explain photosynthesis", "Who was George Washington?", "Why is the sky blue?").
- Set "format_type" to "markdown".
- Output structured, rich text using standard markdown headings (###) and bullet points. It must NEVER use steps or sequential solver cards for this.
- Place the entire response in the "markdown_content" field. Do NOT use the "solution_steps" array.
- Output strictly in this format:
{
  "topic_title": "Concept: [Topic Title]",
  "format_type": "markdown",
  "markdown_content": "### Overview\nYour detailed overview here...\n\n### Key Concepts\n- Bullet point 1\n- Bullet point 2"
}

--- STRICT CONSTRAINTS & FORMATTING RULES ---
- The entire output MUST be a valid JSON object. No raw conversational text is allowed outside of the JSON object. Do NOT wrap the JSON in markdown code blocks like \`\`\`json. Only output pure valid raw JSON.
- Always append exactly 3 plain text follow-up suggestions at the absolute end, formatted strictly as [SUGGESTION: text] on new lines AFTER the JSON object.
- Example suffix:
[SUGGESTION: Plain text suggestion 1]
[SUGGESTION: Plain text suggestion 2]
[SUGGESTION: Plain text suggestion 3]
- Do NOT use LaTeX inside the suggestions.

THE "MASTER EDUCATOR" TEACHING PROTOCOL:
1. EXTREME SIMPLIFICATION: Teach complex topics simply and clearly. Never assume prior knowledge.
2. THE ANALOGY RULE: Use relatable, real-world analogies where helpful.
3. HIGH EMPATHY: Be patient and deeply encouraging.`;
  }

  if (mode !== "Translate") {
    instruction += `\n\nCRITICAL: You are a polyglot AI Tutor. You must automatically detect the user's input language, dialect, or script. You MUST generate your entire response in that EXACT same language (e.g., Hindi, Hinglish, Spanish). Never default to English unless the user explicitly inputs English.`;
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
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
        "gemini-2.5-flash"
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
              ...(shouldEnableSearch ? { tools: [{ googleSearch: {} }] } : {})
            }
          });
          successModel = model;
          break;
        } catch (err: any) {
          const errStr = String(err.message || err).toLowerCase();
          const isRateLimitOrQuota = errStr.includes("429") || 
                                     errStr.includes("quota") || 
                                     errStr.includes("resource_exhausted") || 
                                     errStr.includes("limit");
          
          if (isRateLimitOrQuota) {
            console.warn(`[chat stream] Model ${model} hit rate-limit or quota constraint:`, errStr);
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
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
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
        model: "gemini-flash-latest",
        contents,
        config: { 
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: (isEvaluation === 'true' || isEvaluation === true) ? "text/plain" : "application/json",
          ...(shouldEnableSearch ? { tools: [{ googleSearch: {} }] } : {})
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
        const pdfData = await pdf(req.file.buffer, { max: 60 });
        
        // Explicitly check page count
        if (pdfData.numpages > 60) {
          return res.status(400).json({ error: "PDF document exceeds 60 pages limit. Please upload a shorter document." });
        }

        extractedText = pdfData.text || "";
        // If extracted text is too short, it might be a scanned PDF or images
        if (extractedText.trim().length < 50) {
          useRawFile = true;
        }
        
        if (extractedText && extractedText.length > 200000) { extractedText = extractedText.slice(0, 200000); }
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
1. Structure the output using clear, BOLD HEADINGS for different sections (e.g., **Key Concepts**).
2. MANDATORY: Every single point must start with a standard visual bullet symbol (•). Do not use numbers, stars, or dashes, only the "•" symbol.
3. STRICT FORMATTING: Ensure there is a line break before and after each heading. 
4. CONCISE: Keep each bullet point under 2 sentences. 
5. NO NARRATIVE: Do not write intro or conclusion paragraphs. Start immediately with the first heading and its associated bullet points.
6. EXAMPLE OF EXPECTED FORMAT:

**Heading Name**

• Fact or point one.
• Fact or point two.

IF FORMAT IS "Short TL;DR":
1. Provide the absolute bottom-line of the text.
2. Structure it as one short "Executive Summary" paragraph (max 3-4 sentences).
3. Follow it with a "Top 3 Takeaways" numbered list.
4. Keep the tone professional, direct, and time-saving.

IF FORMAT IS "Explain Like I'm 5":
1. Break down complex jargon into grade-school level vocabulary.
2. Use at least one relatable, everyday analogy (e.g., comparing a system to a school, a car, or pizza).
3. Keep the tone extremely warm, engaging, and story-like.
4. Use short paragraphs and emojis to make it visually friendly for beginners.`;
    }

    if (action !== 'audio') {
      promptText += "\n\nCRITICAL FORMATTING INSTRUCTIONS: You must generate clean, highly readable, and structured study notes. You are STRICTLY FORBIDDEN from using complex characters, emojis, or math formatting.\n" +
        "You MUST obey the following rules blindly:\n" +
        "1. NO LATEX OR MATH BLOCKS: Never use '$', '$$', '\\text{}', '\\rightarrow', or any LaTeX syntax anywhere in the response.\n" +
        "2. PLAIN TEXT ARROWS: If you need an arrow, use standard keyboard characters only: '->' or '=>'.\n" +
        "3. NO EMOJIS OR WEIRD UNICODE: Do not use emojis, fancy bullets, or special symbols. They break the PDF encoder.\n" +
        "4. STRICT MARKDOWN ONLY: Use only basic, universal markdown formatting:\n" +
        "   - Headings: '#', '##', '###'\n" +
        "   - Lists: Use ONLY the standard hyphen '-' or numbers '1.' for lists. Do not use special bullets.\n" +
        "   - Bold/Italic: '**text**' or '*text*'\n" +
        "   - Code Blocks: Strictly use triple backticks (```) for any code, syntax, or technical snippets. Do not use $$ for code.\n" +
        "Output ONLY standard, plain ASCII-compatible markdown text.";
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
    
    const response = await safeGenerateContent({
      model: "gemini-flash-latest",
      contents: contentsPayload,
      config: {
        responseMimeType: responseMimeType
      }
    });
    
    const summaryText = response.text || "";
    
    // Handle JSON response for flashcards-json
    if (action === 'flashcards-json') {
      const flashcards = safeParseJSON(summaryText, 'array');
      summaryCache.set(cacheKey, flashcards);
      return res.json({ flashcards });
    }

    summaryCache.set(cacheKey, summaryText);
    res.json({ text: summaryText });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
       return res.status(429).json({ 
         error: "QUOTA_EXCEEDED",
         text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits or has exceeded its quota. Please try again in 60 seconds.`
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
    
    // Slice text to maximum 1500 characters to make generation fast, avoid timeouts, and preserve low latency.
    let textToSpeak = text;
    if (textToSpeak.length > 1500) {
      textToSpeak = textToSpeak.substring(0, 1500) + "...";
    }
    
    const response = await safeGenerateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Please generate audio for this text: ${textToSpeak}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
      },
    });
    
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      // Wrap raw linear 16-bit PCM inside a browser-playable WAV container
      const rawPcm = Buffer.from(base64Audio, "base64");
      const wavBuffer = pcmToWav(rawPcm);
      const base64Wav = wavBuffer.toString("base64");
      res.json({ audio: base64Wav, mimeType: "audio/wav" });
    } else {
      res.status(500).json({ error: "No audio generated" });
    }
  } catch (error: any) {
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
    const { text, curriculum, subject, gradeLevel } = req.body;
    
    const wordCount = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
    


    if (!text) {
      return res.status(400).json({ error: "Missing text" });
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

    const systemInstruction = `Act as an expert certified educator and Essay Grader for the "${curr}" curriculum, specifically for the subject/essay type: "${subj}".
Your task is to grade and provide constructive, highly specific feedback on the student's essay.

CRITICAL INSTRUCTION: The user you are interacting with is currently in Grade: ${gradeLevel}. You MUST strictly adapt your entire response, vocabulary, conceptual complexity, sentence structure, and examples to perfectly match the comprehension level of a ${gradeLevel} student. Absolutely DO NOT use advanced jargon, higher-level academic concepts, or complex language that exceeds this specific grade level. Keep the tone encouraging and age-appropriate.

Tone: Encouraging, professional, and clear. Speak directly to the student.

CRITICAL RULES (MUST FOLLOW):
1. NO RAW LETTER GRADES (except if A-Level curriculum where A-Level bands specify grades, but do not just write "A" or "B" without details).
2. OFFICIAL SPECIFIC RUBRIC FORMAT: 
${rubricInstructions}
3. ⚡ SPEED & CONCISENESS RULE: Deliver your feedback using highly concise, clear, and punchy plain text. Keep sentence lengths short. Avoid general or redundant context. Limit the response to a total of 250 words to ensure instant grading delivery.
4. STRICT PLAIN TEXT RULE (CRITICAL): Absolutely DO NOT use any Markdown formatting like asterisks (** or *), hashes (#), underscores, backticks, or dashes/bullet points (-, *, •). Use simple numbered steps (e.g., 1. or 2.) or regular line breaks and capitalized section headers. Do not output any HTML tags or markdown formatting symbols. Output ONLY clean, raw plain text.

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
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
      "gemini-2.5-flash"
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
    
    let streamResponse = null;
    let lastError: any = null;
    let anyQuotaExceeded = false;

    for (const model of modelsToTry) {
      try {
        streamResponse = await aiClient.models.generateContentStream({
          model,
          contents: text,
          config: { 
            systemInstruction: systemInstruction,
            temperature: 0.15,
            maxOutputTokens: 1500
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
      model: "gemini-3.5-flash",
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
      model: "gemini-3.5-flash",
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
    const { text, gradeLevel, count } = req.body;
    
    const wordCount = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
    

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
      model: "gemini-flash-latest",
      contents: { parts: [{ text: `Generate exactly ${requestedCount} flashcards from this text: ${text}` }] },
      config: { 
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
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
                } catch (_) {}
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
        model: "gemini-flash-latest",
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
      model: "gemini-flash-latest",
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
- BAN AI CLICHÉS: Never use overused words like "delve," "testament," "realm," "tapestry," "crucial," "foster," or "unassailable." Use natural, precise, and internet-native vocabulary.
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
      model: "gemini-flash-latest",
      contents: { parts: [{ text: `Generate a ${type} in ${format} format with a ${tone} tone. Topic: ${topic}` }] },
      config: { systemInstruction: { parts: [{ text: systemInstruction }] } }
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
    const { text, mode, gradeLevel } = req.body;
    
    const wordCount = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
    
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
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

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-flash-latest",
      contents: { parts: [{ text: text }] },
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
        const pdfData = await pdf(req.file.buffer, { max: 60 });
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
1. Structure the output using clear, BOLD HEADINGS for different sections (e.g., **Key Concepts**).
2. MANDATORY: Every single point must start with a standard visual bullet symbol (•). Do not use numbers, stars, or dashes, only the "•" symbol.
3. STRICT FORMATTING: Ensure there is a line break before and after each heading. 
4. CONCISE: Keep each bullet point under 2 sentences. 
5. NO NARRATIVE: Do not write intro or conclusion paragraphs. Start immediately with the first heading and its associated bullet points.
6. EXAMPLE OF EXPECTED FORMAT:

**Heading Name**

• Fact or point one.
• Fact or point two.

IF FORMAT IS "Short TL;DR":
1. Provide the absolute bottom-line of the text.
2. Structure it as one short "Executive Summary" paragraph (max 3-4 sentences).
3. Follow it with a "Top 3 Takeaways" numbered list.
4. Keep the tone professional, direct, and time-saving.

IF FORMAT IS "Explain Like I'm 5":
1. Break down complex jargon into grade-school level vocabulary.
2. Use at least one relatable, everyday analogy (e.g., comparing a system to a school, a car, or pizza).
3. Keep the tone extremely warm, engaging, and story-like.
4. Use short paragraphs and emojis to make it visually friendly for beginners.`;

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-flash-latest",
      contents: { parts: [{ text }] },
      config: { systemInstruction: { parts: [{ text: systemInstruction }] } }
    });
    
    res.json({ text: response.text });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      console.warn("Text summarize quota exceeded:", error.message);
      return res.json({ 
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded

The Gemini API is currently experiencing rate limits or has exceeded its quota.

How to resolve this:
1. Wait 60 seconds and submit your text again.
2. Ensure you have configured a valid, active API Key in the Settings > Secrets panel of AI Studio.
3. If you are using a free tier, consider adding billing to avoid limit blocks.`
      });
    }
    console.error("Text summarize error:", error);
    res.status(500).json({ error: error.message || "Failed to summarize text." });
  }
});



app.post("/api/generate-questions", async (req, res) => {
  try {
    const { topic, count, gradeLevel, stream } = req.body;
    const requestedCount = Math.min(Math.max(parseInt(count) || 5, 1), 15);
    const topicText = topic && topic.trim() ? topic.trim() : `general concepts in ${stream || 'academic subjects'}`;

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
        model: "gemini-3.6-flash",
        contents: { parts: [{ text: `Topic: ${topicText}. Grade Level: ${gradeLevel || '11th Grade (Junior)'}. Academic Stream: ${stream || 'STEM / Engineering'}. Count: Generate exactly ${requestedCount} questions now.` }] },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
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




app.post("/api/evaluate-answer", async (req, res) => {
  try {
    const { questionText, userAnswer, userGrade, curriculum, subject } = req.body;
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
      model: "gemini-3.5-flash",
      contents: { parts: [{ text: `Evaluate the student's answer for: "${questionText}". Student's Answer is: "${userAnswer}".` }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] }
      }
    });

    const text = response.text || "Failed to evaluate response.";
    res.json({ evaluation: text });

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
        model: "gemini-flash-latest",
        contents: { parts: [{ text: `Topic: ${topic}. Generate the ${requestedCount}-question JSON quiz now.` }] },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
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
      return res.status(400).json({ error: "No PDF file provided" });
    }

    // Enforce 10MB size limit
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSizeBytes) {
      return res.status(400).json({ error: "PDF file size must not exceed 10MB." });
    }

    // Attempt text extraction first using pdf-parse
    let extractedText = "";
    let numPages = 0;
    try {
      const pdfData = await pdf(req.file.buffer, { max: 51 });
      numPages = pdfData.numpages;
      extractedText = pdfData.text || "";
    } catch (parseError) {
      console.warn("Failed to parse PDF locally with pdf-parse:", parseError);
    }

    if (numPages > 50) {
      return res.status(400).json({ error: "PDF document exceeds 50 pages limit. Please upload a shorter document (max 50 pages)." });
    }

    const requestedCount = Math.min(Math.max(parseInt(count) || 5, 1), 30);

    const systemInstruction = `You are an expert exam creator. Analyze the provided study material and extract the most high-yield concepts. Generate exactly ${requestedCount} multiple choice questions based ONLY on this text/document. Output your response STRICTLY in JSON format as an array of objects. Each object must have the following keys: 'question' (string), 'options' (an array of exactly 4 strings), 'correctAnswer' (string, must exactly match one of the options), and 'explanation' (string, detailing why the answer is correct).

CRITICAL RULES:
1. STRICT JSON OUTPUT: You must output ONLY a valid JSON array. Do not wrap it in markdown blockquotes like \`\`\`json. Absolutely ZERO conversational text before or after the JSON.
2. FORMAT: Generate exactly ${requestedCount} questions. Each question must have exactly 4 options and a short explanation.
3. CORRECT ANSWER: The "correctAnswer" field MUST be a single string that EXACTLY matches one of the strings in the "options" array.
4. MULTIPLE EQUATIONS FORMATTING: If generating any math questions, options, or explanations that contain multiple equations (such as systems of linear equations), you must strictly separate the equations using a clear delimiter like the word 'and' or a newline character (\\n) so they do not blend together into a single string.`;

    let response;
    if (extractedText && extractedText.trim().length >= 50) {
      // Use the highly reliable text extraction path
      const slicedText = extractedText.length > 150000 ? extractedText.slice(0, 150000) : extractedText;
      response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-flash-latest",
        contents: {
          parts: [{ text: `DOCUMENT CONTENT:\n${slicedText}\n\nGenerate the ${requestedCount}-question JSON quiz now based strictly on the content above.` }]
        },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
        }
      });
    } else {
      // Fallback to base64 PDF multimodal processing (e.g. for scanned PDFs or low-quality extractions)
      const pdfPart = {
        inlineData: {
          mimeType: "application/pdf",
          data: req.file.buffer.toString("base64"),
        },
      };

      response = await safeGenerateContent({
        gradeLevel,
        model: "gemini-flash-latest",
        contents: { 
          parts: [
            pdfPart,
            { text: `Analyze the attached PDF document and generate the ${requestedCount}-question JSON quiz now based strictly on its content.` }
          ] 
        },
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: "application/json"
        }
      });
    }

    let quizText = response.text || "";
    try {
      const parsed = safeParseJSON(quizText, 'array');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return res.json({ quiz: parsed });
      }
    } catch (parseError) {
      console.error("JSON parse error for PDF quiz output:", parseError, quizText);
    }

    return res.status(400).json({ error: "Failed to generate a valid quiz structure from the PDF. Please ensure it has readable text or images." });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXHAUSTED") {
      return res.status(429).json({ 
        error: "QUOTA_EXCEEDED",
        text: `⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently experiencing rate limits. Please try again in 60 seconds.`
      });
    }
    console.error("PDF quiz generation error:", error);
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
      model: "gemini-3.5-flash",
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

function getEducationalFallback(query: string, profileContext = "", studentNotes = "") {
  const q = query.toLowerCase().trim();
  
  let title = "Academic Concept Guide";
  let updates = "Your AI Tutor has retrieved this curated academic briefing from our local study database.";
  let match = "95%";
  let steps = ["Review the core formulas and definitions", "Practice solving 3 active recall questions", "Check related syllabus topics"];
  let tips = "Active recall and spaced repetition are the most scientifically proven study methods.";
  let links = ["https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(query)];

  if (q.includes("math") || q.includes("algebra") || q.includes("equation") || q.includes("calculus") || q.includes("quadratic")) {
    title = "Mathematics Core Concept Guide";
    updates = `Here is a high-yield breakdown of the mathematical concept:

1. UNDERSTAND THE CORE STRUCTURE:
Every mathematical equation or formula is a balanced statement. Focus on identifying the independent variables and coefficients.

2. LOGICAL SEQUENCE:
Always simplify terms step-by-step. Keep equations balanced by performing operations on both sides of the equals sign uniformly.

3. VISUALIZATION:
Try to plot or visualize the function or equation on a coordinate plane. This builds deep intuitive understanding rather than just rote memorization.

Note: Since search grounding is currently under heavy traffic, we have activated this high-fidelity local tutor briefing to keep you on track.`;
    match = "98%";
    steps = [
      "Isolate the variable you want to solve for",
      "Plug in known values and simplify carefully",
      "Check your final answer by substituting it back into the original equation"
    ];
    tips = "Never skip steps in algebra. Writing down every single line prevents silly sign errors.";
    links = ["https://www.khanacademy.org", "https://www.wolframalpha.com"];
  } else if (q.includes("physics") || q.includes("force") || q.includes("motion") || q.includes("gravity") || q.includes("energy")) {
    title = "Physics Principles Briefing";
    updates = `Here is a dedicated briefing on the requested physics topic:

1. IDENTIFY THE PHYSICAL SYSTEM:
Begin by drawing a free-body diagram or mental model. Label all active forces, velocities, masses, or energy states.

2. CHOOSE THE GOVERNING EQUATIONS:
Recall Newton's Laws, Conservation of Energy, or Kinematics. Write down the relevant formulas first.

3. UNIT CONSISTENCY:
Always verify that all physical constants and variables are in SI units (meters, kilograms, seconds) before calculating.

Note: Local study backup active. We are serving high-yield physics frameworks to ensure study continuity.`;
    match = "96%";
    steps = [
      "Draw a free-body diagram or visual representation",
      "List all known parameters with their SI units",
      "Solve the algebraic formula before substituting numerical values"
    ];
    tips = "Physics is not about memorizing numbers; it is about understanding how different quantities relate to each other.";
    links = ["https://www.khanacademy.org", "https://www.physicsclassroom.com"];
  } else if (q.includes("chemistry") || q.includes("reaction") || q.includes("acid") || q.includes("organic") || q.includes("molecule")) {
    title = "Chemistry & Molecular Sciences Study Guide";
    updates = `Here is a structured overview of the chemistry concept:

1. BALANCING & STOICHIOMETRY:
In any chemical equation, mass must be conserved. Ensure the number of atoms of each element is identical on both sides.

2. ELECTRON BEHAVIOR:
Remember that chemical bonds (covalent, ionic) are governed by the octet rule and the movement of valence electrons.

3. THERMODYNAMICS & KINETICS:
Distinguish between how fast a reaction occurs (kinetics) and how far it will go (equilibrium/thermodynamics).

Note: Local study backup active. Enjoy this high-quality academic synthesis.`;
    match = "97%";
    steps = [
      "Identify the reactants and products",
      "Balance the chemical equation starting with the most complex molecule",
      "Apply molar ratios to determine yield or concentrations"
    ];
    tips = "Visualize molecules in 3D using basic molecular geometry rules. This makes understanding reactions much easier.";
    links = ["https://www.khanacademy.org", "https://pubchem.ncbi.nlm.nih.gov"];
  } else if (q.includes("exam") || q.includes("test") || q.includes("date") || q.includes("syllabus") || q.includes("schedule")) {
    title = "Exam Prep & Syllabus Action Plan";
    updates = `Here is a direct study and preparation guide:

1. BREAK DOWN THE SYLLABUS:
Review your curriculum guidelines carefully. Highlight the highest-weight chapters first to maximize your score potential.

2. SCHEDULE REVIEWS:
Divide your study material into smaller daily blocks. Aim for 45-minute focused study sessions followed by 5-minute rest intervals (Pomodoro technique).

3. PRACTICE PAST PAPERS:
Solving past examination papers under timed conditions is the single most effective way to eliminate exam-day anxiety.

Note: Local prep mode active. Let's make sure you excel in your upcoming tests!`;
    match = "95%";
    steps = [
      "Gather all syllabus documents and textbooks",
      "Create a structured 7-day study calendar",
      "Practice solving 5 high-yield sample questions from past papers"
    ];
    tips = "Sleep is a critical part of consolidation. Never sacrifice sleep the night before an exam to pull an all-nighter.";
    links = ["https://en.wikipedia.org/wiki/Test_preparation"];
  } else {
    const capitalizedWord = query.charAt(0).toUpperCase() + query.slice(1);
    title = `Study Guide: ${capitalizedWord}`;
    updates = `Here is a high-yield study briefing compiled specifically for you:

1. CORE CONCEPT ANALYSIS:
Let's break down the subject matter. Focus on the fundamental rules, definitions, and theories first before moving to complex examples.

2. STRUCTURING YOUR KNOWLEDGE:
Try summarizing this topic in your own words. Teaching or explaining it to a peer is the ultimate test of true understanding.

3. APPLIED STUDY STRATEGY:
Apply what you've learned by creating active recall questions (e.g. flashcards) instead of passive re-reading.

Note: The Live Search system is currently handling extremely high volume, so we have loaded this local tutorial framework to keep your study session rolling seamlessly.`;
    match = "92%";
    steps = [
      "Summarize the key definition of this concept in one simple sentence",
      "Find and read one academic article or section in your textbook about this",
      "Explain the concept out loud to a friend or yourself to solidify understanding"
    ];
    tips = "Understanding the 'why' behind a concept is infinitely more powerful than memorizing the 'what'.";
    links = ["https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(query)];
  }

  if (profileContext) {
    updates += `\n\nTailored for: ${profileContext.replace(/Grade:|Subject:|Stream:/gi, '').trim()}`;
  }

  return {
    topic_title: title,
    live_updates: updates,
    match_score: match,
    action_steps: steps,
    pro_tips: tips,
    source_links: links
  };
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
      model: "gemini-flash-latest",
      contents: { parts: [{ text: prompt }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });

    let rawText = response.text || "";
    let parsedResult: any = null;
    try {
      parsedResult = safeParseJSON(rawText, 'object');
    } catch (parseError) {
      console.error("Failed to parse JSON response for fix-mistake:", parseError, rawText);
      parsedResult = {
        why_it_happened: `There was a misunderstanding with the topic or question.`,
        the_fix: `The correct concept is: ${correctConcept}`,
        pro_memory_trick: "Review this topic carefully to prevent making this mistake again!"
      };
    }

    res.json(parsedResult);
  } catch (error: any) {
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
Subject/Category: ${sourceFeature || 'General Study'}
Original Question/Concept: ${question}
User's Incorrect Response: ${wrongInput || 'Incorrect response'}
Correct Explanation: ${correctConcept}

Please generate exactly 3 similar practice questions to help the student test and master this specific concept. Avoid exact repetition, instead create original similar problems.
Return the response in the strict JSON array format specified.`;

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-flash-latest",
      contents: { parts: [{ text: prompt }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });

    let rawText = response.text || "";
    let parsedResult: any = null;
    try {
      parsedResult = safeParseJSON(rawText, 'array');
    } catch (parseError) {
      console.error("Failed to parse JSON response for generate-practice:", parseError, rawText);
      // Fallback questions
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
  } catch (error: any) {
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
    if (!query) {
      return res.status(400).json({ error: "Missing search query" });
    }

    const systemInstruction = `You are "Deep Search AI", an elite, highly intelligent educational assistant and expert master tutor.

EXPERT ACADEMIC TUTORING GUIDELINES:
- Provide detailed, comprehensive, deep, and easy-to-understand explanations.
- For educational or academic topics (such as Physics, Chemistry, Biology, Mathematics, or Computer Science concepts), act as a world-class expert tutor: explain fundamental principles deeply, break down key equations or concepts step-by-step, and provide clear real-world examples.
- Format all information thoroughly using structured bullet points, clear step-by-step breakdowns, and actionable insights.

DYNAMIC TEMPORAL CONTEXT:
The current date and time is: ${new Date().toISOString()}. You must treat this as the absolute present moment.

REAL-TIME GOOGLE SEARCH GROUNDING:
You MUST use the Google Search tool to retrieve current, live, up-to-date real-time data (e.g., currency exchange rates, live news, weather, sports scores, current events, facts for the current year 2026). Do NOT rely on pre-trained training weights for these queries.

RESULT GROUNDING & CITATION (ANTI-HALLUCINATION):
- Explicitly cite the exact date of the data you retrieve from the live search in your response (e.g., "As of today, July 22, 2026...", "Based on live search results...").
- If the live search fails or returns no results, explicitly state: "Unable to fetch real-time data at the moment," instead of hallucinating past data or future forecasts.

STRICT TIME & DATE OVERRIDE (ZERO HALLUCINATION):
NEVER output placeholder dates, past dates, or internal training dates (such as June 2024). The date provided by the live search source is the ABSOLUTE TRUTH.

DATA BLENDING (LOCAL + LIVE):
Intelligently combine live web search results with the student's provided local context (e.g., their grade level, stream, or uploaded study notes). Filter and tailor the information deeply to match what the student needs to master the topic.

STRICT JSON OUTPUT FORMAT (FOR UI RENDERING):
To ensure the mobile app frontend renders premium UI cards, output your final response in strict JSON format using the exact structure below. NEVER use raw markdown bolding '**' inside text strings.

{
  "topic_title": "Comprehensive Topic Heading (Crisp, authoritative, and clear)",
  "live_updates": [
    "Detailed fact/concept bullet point 1 with clear explanation",
    "Detailed fact/concept bullet point 2 with key principles",
    "Detailed fact/concept bullet point 3 with real-world context/examples",
    "Detailed fact/concept bullet point 4 with important formulas or key takeaways"
  ],
  "match_score": "A percentage score (e.g., '98%') showing relevance to student's profile",
  "action_steps": [
    "Step 1: Deep Explanation & Foundation - Detailed conceptual overview with examples",
    "Step 2: Step-by-Step Breakdown - Analytical derivation, formula application, or practical procedure",
    "Step 3: Mastery Verification - Key questions or practice problem steps to solidify understanding"
  ],
  "pro_tips": "In-depth expert tutor insight explaining common traps, shortcuts, memory tricks, or real-world applications with concrete examples.",
  "source_links": ["Verified Link 1", "Verified Link 2"]
}

FALLBACK BEHAVIOR:
If a live search fails, state in the JSON output that real-time data is currently unavailable, and provide the best theoretical guidance and deep conceptual tutor explanation based on core knowledge without guessing dates.`;

    const contentPrompt = `USER SEARCH QUERY: ${query}
${profileContext ? `STUDENT PROFILE: ${profileContext}` : ""}
${studentNotes ? `LOCAL STUDY NOTES / STUDY FILE CONTENT: ${studentNotes}` : ""}

Please perform a Google Search, combine the facts with the student profile context, and format the response strictly in JSON according to our specified schema (with NO markdown bolding '**').`;

    const response = await safeGenerateContent({
      gradeLevel,
      model: "gemini-flash-latest",
      contents: { parts: [{ text: contentPrompt }] },
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });

    let rawText = response.text || "";
    let parsedResult: any = null;
    try {
      parsedResult = safeParseJSON(rawText, 'object');
      if (!parsedResult || Object.keys(parsedResult).length === 0 || !parsedResult.topic_title) {
        throw new Error("Invalid or empty parsed JSON structure");
      }
    } catch (parseError) {
      console.error("Failed to parse JSON response from live search tutor:", parseError, rawText);
      // Fallback response inside schema
      parsedResult = {
        topic_title: "Live Search Results",
        live_updates: "Real-time study search results could not be fully parsed. Please refine your query! 📚",
        match_score: "80%",
        action_steps: ["Try re-submitting your query", "Verify your network connection", "Ask standard AI tutor instead"],
        pro_tips: "Keeping search queries concise yields the highest accuracy.",
        source_links: []
      };
    }

    // Capture grounding links if available as a powerful reference fallback
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks)) {
      const links = chunks
        .map((c: any) => ({
          title: c.web?.title || c.maps?.title || "Reference Source",
          uri: c.web?.uri || c.maps?.uri
        }))
        .filter((item: any) => item.uri);

      if (links.length > 0) {
        // Blend with parsed source links, avoiding duplicates
        const existingLinks = parsedResult.source_links || [];
        const mergedLinks = [...new Set([...existingLinks, ...links.map((l: any) => l.uri)])];
        parsedResult.source_links = mergedLinks;
        parsedResult.detailed_sources = links;
      }
    }

    res.json(parsedResult);
  } catch (error: any) {
    console.warn("Live study tutor search failed or rate-limited. Activating beautiful educational fallback mode:", error.message || error);
    
    // Generate a high-yield academic study guide as a seamless local fallback
    const fallbackResponse = getEducationalFallback(query, profileContext, studentNotes);
    res.json(fallbackResponse);
  }
});

app.post("/api/generate-trivia", async (req, res) => {
  try {
    const { gradeLevel, academicStream, topic, excludeQuestions, country } = req.body;
    
    const aiClient = getAI();
    
    let promptText = `Generate a single, unique, highly engaging educational trivia question tailored for:
- Student Academic Grade: ${gradeLevel || "11th Grade (Junior)"}
- Academic Track/Stream: ${academicStream || "STEM / Engineering"}
- Student's Country: ${country || "United States"}`;

    if (country && country.trim().length > 0) {
      promptText += `\n- Country-Specific Customization: Design a question that relates to, is contextualised for, or is based on the school curriculum, general knowledge, history, geography, science, famous figures, or academic themes of ${country}. For instance, if the student is from India, ask about Indian history, science achievements, or geography. If from United States, ask about US-relevant topics, etc.`;
    }

    if (topic && topic.trim().length > 0) {
      promptText += `\n- Specific Topic/Subject: ${topic}`;
    }

    if (excludeQuestions && Array.isArray(excludeQuestions) && excludeQuestions.length > 0) {
      promptText += `\n- EXCLUDE the following questions (do not generate similar questions): ${JSON.stringify(excludeQuestions.slice(-10))}`;
    }

    const systemInstruction = `You are an Elite Interactive Quiz and Trivia Game Creator.
Generate a single multiple-choice trivia question that is highly informative, accurate, and customized to the student's grade level and academic track.

CRITICAL RULES:
1. STRICT JSON OUTPUT: You must output ONLY a valid JSON object matching the schema below. Do not wrap it in markdown blockquotes like \`\`\`json. Absolutely ZERO conversational text before or after the JSON.
2. CORRECT INDEX: The "correctIndex" field must be a valid 0-based index of the correct option in the "options" array.
3. FACT: Provide an interesting, educational, and fun "fact" explaining the background or context of the answer. Include emojis!
4. OPTIONS: Provide exactly 3 or 4 engaging options. Options should be clearly distinct.

Required JSON Structure:
{
  "subjectTag": "🧬 AP Biology Trivia",
  "question": "What is the primary role of the Golgi apparatus in a eukaryotic cell?",
  "options": ["A) Packaging and sorting proteins", "B) Synthesizing ribosomes", "C) ATP production", "D) Storing calcium ions"],
  "correctIndex": 0,
  "fact": "The Golgi apparatus acts like the post office of the cell, sorting and shipping proteins! 📦"
}`;

    const response = await safeGenerateContent({
      gradeLevel: gradeLevel || "11th Grade (Junior)",
      model: "gemini-3.5-flash",
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json"
      }
    });

    const triviaText = response.text || "";
    const parsed = safeParseJSON(triviaText, 'object');
    if (parsed && parsed.question && Array.isArray(parsed.options)) {
      return res.json({ trivia: parsed });
    }

    throw new Error("Failed to parse valid trivia response from AI");
  } catch (error: any) {
    console.error("Trivia generation error:", error);
    // Fallback to a random hardcoded trivia
    const fallbacks = [
      {
        subjectTag: "🏛️ AP World History",
        question: "Which edible substance found in ancient Egyptian tombs is famous for never spoiling?",
        options: ["Olive Oil", "Honey", "Barley Wine"],
        correctIndex: 1,
        fact: "Honey never spoils! Its low moisture and high acidity create an environment where bacteria cannot grow. Archaeologists have found 3,000-year-old honey that is still perfectly edible! 🍯"
      },
      {
        subjectTag: "🪐 AP Astronomy & Physics",
        question: "Which planet in our solar system has a day that is longer than its entire orbital year?",
        options: ["Mars", "Venus", "Mercury"],
        correctIndex: 1,
        fact: "A day on Venus is longer than its year! It takes Venus 243 Earth days to rotate once on its axis, but only 225 Earth days to complete one orbit around the Sun. 🪐"
      },
      {
        subjectTag: "🦖 AP Environmental Science",
        question: "Which of these prehistoric creatures actually lived closer in time to modern humans?",
        options: ["Tyrannosaurus Rex", "Stegosaurus", "Triceratops"],
        correctIndex: 0,
        fact: "Tyrannosaurus Rex lived closer to us! T-Rex roamed 66 million years ago, whereas the Stegosaurus lived 150 million years ago—an 84 million year gap! 🦖"
      },
      {
        subjectTag: "🧬 AP Biology Trivia",
        question: "How many hearts does an octopus have to pump blood through its body?",
        options: ["2 Hearts", "3 Hearts", "9 Hearts"],
        correctIndex: 1,
        fact: "Octopuses have three hearts, nine brains, and blue blood! Two hearts pump blood to the gills, while a third pumps it to the rest of the body. 🐙"
      },
      {
        subjectTag: "⚡ AP Physics Trivia",
        question: "Approximately how many slices of bread can a single bolt of lightning toast?",
        options: ["1,000 slices", "10,000 slices", "100,000 slices"],
        correctIndex: 2,
        fact: "A single lightning bolt contains enough energy to toast over 100,000 slices of bread! 🍞"
      }
    ];
    const randomIndex = Math.floor(Math.random() * fallbacks.length);
    res.json({ trivia: fallbacks[randomIndex], isFallback: true });
  }
});

import fs from "fs";

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

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    // Serve original source files for source maps/debugging to prevent 404 network errors
    app.get("/src/*", (req, res) => {
      let relativePath = req.params[0] || "";
      if (!relativePath && req.path.startsWith("/src/")) {
        relativePath = req.path.substring(5);
      }
      try {
        relativePath = decodeURIComponent(relativePath);
      } catch (e) {
        // Fallback to original
      }
      const filePath = path.join(process.cwd(), "src", relativePath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) {
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          } else if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
            // Serve TypeScript source files as text/plain so the browser doesn't try to parse them as executable JS scripts
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
          } else {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
          }
          return res.send(content);
        } catch (err) {
          return res.status(500).send("Error reading file");
        }
      }
      return res.status(404).send("Not Found");
    });

    app.get("*", (req, res) => {
      const ext = path.extname(req.path);
      if (ext || req.path.startsWith('/src') || req.path.startsWith('/api')) {
        return res.status(404).send('Not Found');
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.timeout = 300000;
}

export default app;

if (process.env.VERCEL !== "1") {
  startServer();
}

