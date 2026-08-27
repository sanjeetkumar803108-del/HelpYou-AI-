const dotenv = require('dotenv');
dotenv.config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function verifyAll() {
  console.log("=== 1. VERIFYING LIVE TUTOR SEARCH ENGINE ===");
  try {
    const prompt = 'STUDENT SEARCH QUERY: "JEE Main 2026 registration"\nConduct research analysis and return JSON.';
    const systemInstruction = 'You are Deep Search AI. Return JSON object with topic_title, match_score, live_updates, action_steps, pro_tips, source_links.';

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    });

    console.log("✅ Deep Search Response Status: OK");
    console.log("Snippet:", response.text?.slice(0, 120));
  } catch (err) {
    console.error("❌ Deep Search Error:", err.status, err.message);
  }

  console.log("\n=== 2. VERIFYING AI CHATBOT / TUTOR STREAMING ===");
  try {
    const chatStream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: "Hello AI Tutor, explain Ohm's Law." }] }],
      config: {
        systemInstruction: { parts: [{ text: "You are HelpYou AI Tutor. Return JSON object." }] },
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        temperature: 0.2
      }
    });

    let collected = "";
    for await (const chunk of chatStream) {
      collected += chunk.text || "";
    }
    console.log("✅ Chat Stream Status: OK");
    console.log("Streamed Length:", collected.length, "bytes");
    console.log("Stream Snippet:", collected.slice(0, 120));
  } catch (err) {
    console.error("❌ Chat Stream Error:", err.status, err.message);
  }
}

verifyAll();
