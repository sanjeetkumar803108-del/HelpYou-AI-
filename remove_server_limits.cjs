const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// The regex might not have matched because of whitespace
content = content.replace(/if\s*\(false\)\s*\{\s*return res.status\(400\)\.json\([^)]+\);\s*\}/g, '');
content = content.replace(/if\s*\(wordCount\s*>\s*1600\)\s*\{\s*return res.status\(400\)\.json\([^)]+\);\s*\}/g, '');
content = content.replace(/if\s*\([^)]*\bwordCount\b[^)]*1600[^)]*\)\s*\{[^}]+\}/g, '');

fs.writeFileSync('server.ts', content);
