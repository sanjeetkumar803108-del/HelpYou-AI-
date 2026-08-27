const dotenv = require('dotenv');
dotenv.config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function safeGenerate(params) {
  const modelsToTry = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-3.6-flash"
  ];

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`Trying model: ${model}...`);
      const cleanParams = {
        model,
        contents: params.contents,
        ...(params.config ? { config: params.config } : {})
      };
      const response = await ai.models.generateContent(cleanParams);
      console.log(`✅ Success with model: ${model}!`);
      return response;
    } catch (e) {
      console.warn(`Model ${model} failed (${e.status || e.message?.slice(0, 50)})`);
      lastError = e;
    }
  }

  throw lastError;
}

async function run() {
  console.log("Testing safeGenerate with query 'JEE Main 2026 registration' and extra fields...");
  try {
    const res = await safeGenerate({
      gradeLevel: '12',
      model: 'gemini-3.6-flash', // even if 3.6 hits 429 quota, fallback will succeed!
      contents: [{ parts: [{ text: 'Give brief info on JEE Main 2026.' }] }],
      config: {
        systemInstruction: { parts: [{ text: 'You are Deep Search AI.' }] },
        responseMimeType: 'application/json'
      }
    });
    console.log("Result:", res.text?.slice(0, 150));
  } catch (err) {
    console.error("ALL FAILED:", err);
  }
}

run();
