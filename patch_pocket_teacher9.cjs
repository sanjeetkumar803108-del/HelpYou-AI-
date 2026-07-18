const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

// Fix TypeScript error with keys() import
content = content.replace("await import('idb-keyval').then(m => m.keys())", "await keys()");

fs.writeFileSync('src/components/PocketTeacher.tsx', content);
