import { GoogleGenAI } from '@google/genai';
async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const list = await ai.models.list();
    for await (const m of list) {
        console.log(m.name);
    }
  } catch(e) {
    console.error("Failed:", e.message);
  }
}
test();
