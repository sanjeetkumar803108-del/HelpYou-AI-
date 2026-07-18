const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

// Change import to include keys
content = content.replace("import { get, set, del } from 'idb-keyval';", "import { get, set, del, keys } from 'idb-keyval';");

// Use keys directly instead of dynamic import
content = content.replace(/await import\('idb-keyval'\)\.then\(m => m\.keys\(\)\)/g, "await keys()");
fs.writeFileSync('src/components/PocketTeacher.tsx', content);
