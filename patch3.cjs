const fs = require('fs');
let content = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8');

// I'll replace the broken block directly with regex
content = content.replace(/if \(xhr\.status === 413\) \{\\n[^}]+\} else \{\\n[^}]+\}/g, '');
content = content.replace(/if \(xhr\.status === 413\) \{/g, '');
content = content.replace(/setResult\(`Error: File is too large \(413 Payload Too Large\)[^`]+`\);/g, '');
content = content.replace(/\n              \} else \{\n                \n                \} else \{/g, '');
content = content.replace(/setResult\(`Error: Server returned status \$\{xhr\.status\}`\);\n              \}\n            \}\n            setStep\('result'\);\n          \}/g, `if (xhr.status === 413) { setResult("Error: File is too large (413 Payload Too Large). Even though the app allows up to 100MB, the hosting infrastructure may have a lower limit (e.g. 32MB). Please try a smaller file."); } else { setResult(\`Error: Server returned status \${xhr.status}\`); }\n            }\n            setStep('result');\n          }`);
// This regex might be messy, let's just use sed to restore and patch properly.

fs.writeFileSync('src/components/NoteMaker.tsx.temp', content);
