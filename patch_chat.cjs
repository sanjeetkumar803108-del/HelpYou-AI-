const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const oldChat = `      const response = await aiClient.models.generateContent({
        model: "gemini-flash-latest",
        contents,
        config: { systemInstruction: { parts: [{ text: systemInstruction }] } }
      });`;

const newChat = `      const response = await aiClient.models.generateContent({
        model: "gemini-flash-latest",
        contents,
        config: { 
          systemInstruction: { parts: [{ text: systemInstruction }] },
          tools: [{ googleSearch: {} }] 
        }
      });`;

content = content.replace(oldChat, newChat);

const oldChat2 = `      const response = await aiClient.models.generateContent({
        model: "gemini-flash-latest",
        contents,
        config: { systemInstruction: { parts: [{ text: systemInstruction }] } }
      });`;

content = content.replace(oldChat2, newChat);

fs.writeFileSync('server.ts', content);
