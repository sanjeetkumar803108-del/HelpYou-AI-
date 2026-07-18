const fs = require('fs');
let content = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8');

content = content.replace(
  'const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {\n    const selected = e.target.files?.[0];\n    if (!selected) return;',
  'const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {\n    const selected = e.target.files?.[0];\n    if (!selected) return;\n    if (selected.size > 95 * 1024 * 1024) {\n      alert("File is too large! Please select a PDF smaller than 95MB.");\n      return;\n    }'
);

content = content.replace(
  'setResult(`Error: Server returned status ${xhr.status}`);',
  'if (xhr.status === 413) {\n                setResult(`Error: File is too large (413 Payload Too Large). Even though the app allows up to 100MB, the hosting infrastructure may have a lower limit (e.g. 32MB). Please try a smaller file.`);\n              } else {\n                setResult(`Error: Server returned status ${xhr.status}`);\n              }'
);

fs.writeFileSync('src/components/NoteMaker.tsx', content);
