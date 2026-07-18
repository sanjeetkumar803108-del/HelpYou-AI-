import { GoogleGenAI } from '@google/genai';
async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts: [{ text: 'What is the current weather in New York?' }] }],
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    console.log("Success! text:", res.text);
  } catch(e) {
    console.error("Failed:", e.message);
  }
}
test();
