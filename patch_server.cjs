const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  'const pdfPart = {\\n        inlineData: {\\n          mimeType: req.file.mimetype || "application/pdf",\\n          data: req.file.buffer.toString("base64"),\\n        },\\n      };\\n      contentsPayload = { parts: [pdfPart, textPart] };',
  'if (req.file.buffer.length > 15 * 1024 * 1024) {\\n        return res.status(400).json({ error: "PDF text extraction failed and file is too large (>15MB) for raw image/pdf fallback. Please use a smaller file or a text-based PDF." });\\n      }\\n      const pdfPart = {\\n        inlineData: {\\n          mimeType: req.file.mimetype || "application/pdf",\\n          data: req.file.buffer.toString("base64"),\\n        },\\n      };\\n      contentsPayload = { parts: [pdfPart, textPart] };'
);

fs.writeFileSync('server.ts', content);
