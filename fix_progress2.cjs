const fs = require('fs');
let lines = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8').split('\\n');

let newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('let currentProgress = 0;')) {
    skip = true;
  }
  if (skip && lines[i].includes('}, 120);')) {
    skip = false;
    continue;
  }
  if (skip) continue;
  
  if (lines[i].includes('// Supplement with actual progress if available and ahead')) {
    continue;
  }
  
  if (lines[i].includes('setUploadProgress(prev => Math.max(prev, Math.min(percentComplete, 95)));')) {
    newLines.push(lines[i].replace('setUploadProgress(prev => Math.max(prev, Math.min(percentComplete, 95)));', 'setUploadProgress(percentComplete);'));
    continue;
  }
  
  if (lines[i].includes('clearInterval(progressInterval);')) {
    continue; // remove it
  }
  
  newLines.push(lines[i]);
}

fs.writeFileSync('src/components/NoteMaker.tsx', newLines.join('\\n'));
