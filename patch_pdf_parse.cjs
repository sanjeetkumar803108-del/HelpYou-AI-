const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/await pdf\(req\.file\.buffer\);/g, 'await pdf(req.file.buffer, { max: 100 });\\n      if (extractedText && extractedText.length > 500000) { extractedText = extractedText.slice(0, 500000); }');

// Wait, the regex replace will match both places. Let's do it carefully.
content = content.replace(
  'const pdfData = await pdf(req.file.buffer);\\n      extractedText = pdfData.text || "";',
  'const pdfData = await pdf(req.file.buffer, { max: 100 });\\n      extractedText = pdfData.text || "";\\n      if (extractedText.length > 800000) { extractedText = extractedText.slice(0, 800000); }'
);
content = content.replace(
  'const pdfData = await pdf(req.file.buffer);\\n        extractedText = pdfData.text || "";',
  'const pdfData = await pdf(req.file.buffer, { max: 100 });\\n        extractedText = pdfData.text || "";\\n        if (extractedText.length > 800000) { extractedText = extractedText.slice(0, 800000); }'
);


fs.writeFileSync('server.ts', content);
