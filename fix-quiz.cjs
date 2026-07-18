const fs = require('fs');
let content = fs.readFileSync('src/components/QuizGenerator.tsx', 'utf8');
content = content.replace("import { \nimport { safeGetItem, safeSetItem } from '../utils/storage';", "import { safeGetItem, safeSetItem } from '../utils/storage';\nimport {");
fs.writeFileSync('src/components/QuizGenerator.tsx', content);
