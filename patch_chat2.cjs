const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const oldStr = `model: "gemini-flash-latest",
        contents,
        config: { 
          systemInstruction: { parts: [{ text: systemInstruction }] },
          tools: [{ googleSearch: {} }] 
        }`;

const newStr = `model: "gemini-2.5-flash-lite",
        contents,
        config: { 
          systemInstruction: { parts: [{ text: systemInstruction }] },
          tools: [{ googleSearch: {} }] 
        }`;

content = content.replace(oldStr, newStr);
content = content.replace(oldStr, newStr);

fs.writeFileSync('server.ts', content);
