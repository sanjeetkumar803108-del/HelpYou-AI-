const fs = require('fs');
let lines = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8').split('\n');

let newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('} catch {') && lines[i+1].includes('else {')) {
    newLines.push(lines[i]);
    newLines.push('              setResult(`Error: Server returned status ${xhr.status}`);');
    newLines.push('            }');
    skip = true;
    continue;
  }
  
  if (skip) {
    if (lines[i].includes("setStep('result');")) {
      skip = false;
      newLines.push(lines[i]);
    }
    continue;
  }
  
  newLines.push(lines[i]);
}

fs.writeFileSync('src/components/NoteMaker.tsx', newLines.join('\n'));
