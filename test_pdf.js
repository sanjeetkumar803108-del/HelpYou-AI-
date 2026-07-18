const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const pdfBuffer = fs.readFileSync('package.json'); // Just using package.json as a mock file
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/json', data: pdfBuffer.toString('base64') } },
            { text: "Summarize this" }
          ]
        }
      ]
    });
    console.log("Success:", res.text.substring(0, 50));
  } catch(e) {
    console.error("Failed:", e.message);
  }
}
test();
