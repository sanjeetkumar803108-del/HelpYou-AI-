const fs = require('fs');
const lines = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8').split('\n');
const fixed = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('if (xhr.status === 413) {\\n')) {
    skip = true;
    fixed.push('              if (xhr.status === 413) {');
    fixed.push('                setResult(`Error: File is too large (413 Payload Too Large). Even though the app allows up to 100MB, the hosting infrastructure may have a lower limit (e.g. 32MB). Please try a smaller file.`);');
    fixed.push('              } else {');
    fixed.push('                setResult(`Error: Server returned status ${xhr.status}`);');
    fixed.push('              }');
  } else if (skip) {
    if (lines[i].includes('}')) {
      // Continue skipping until we find the end of the block
      if (lines[i].includes('\\n              }')) {
         skip = false;
      }
    }
  } else {
    fixed.push(lines[i]);
  }
}
fs.writeFileSync('src/components/NoteMaker.tsx', fixed.join('\n'));
