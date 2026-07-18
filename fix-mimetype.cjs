const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  'if (req.file.mimetype === "application/pdf") {',
  'if (req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf")) {'
);

fs.writeFileSync('server.ts', content);
