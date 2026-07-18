import { GoogleGenAI } from '@google/genai';
async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{ parts: [{ text: 'Hello!' }] }]
    });
    console.log("Success! text length:", res.text.length);
  } catch(e) {
    console.error("Failed:", e.message);
  }
}
test();
