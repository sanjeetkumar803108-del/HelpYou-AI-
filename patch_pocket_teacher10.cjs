const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

content = content.replace("const keys = await import('idb-keyval').keys();", "const idbKeys = await keys();");
content = content.replace("for (const key of keys) {", "for (const key of idbKeys) {");

fs.writeFileSync('src/components/PocketTeacher.tsx', content);
