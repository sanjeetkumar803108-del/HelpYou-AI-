const fs = require('fs');
const glob = require('fs').readdirSync;
const { execSync } = require('child_process');

function removeLimits() {
  const filesToUpdate = [
    'src/components/ContentGenerator.tsx',
    'src/components/EssayGrader.tsx',
    'src/components/MagicScanner.tsx',
    'src/components/GrammarEnhancer.tsx',
    'src/components/FlashcardGenerator.tsx',
    'src/components/AITutor.tsx',
    'src/components/Summariser.tsx',
    'server.ts'
  ];

  for (let file of filesToUpdate) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');

    // Remove UI limits
    content = content.replace(/wordCount > 1600 \? '[^']+' : '[^']+'/g, "'text-zinc-400'");
    content = content.replace(/wordCount > 1600/g, 'false');
    content = content.replace(/wordCount <= 1600/g, 'true');
    content = content.replace(/\{wordCount\} \/ 1600 words/g, '{wordCount} words');
    content = content.replace(/\{wordCount\}\/1600/g, '{wordCount} words');
    content = content.replace(/\{wordCount\} \/ 1600/g, '{wordCount}');
    
    // Server limits
    content = content.replace(/if\s*\(wordCount\s*>\s*1600\)\s*\{\s*return res\.status\(400\)\.json\(\{ error: "[^"]+" \}\);\s*\}/g, '');

    fs.writeFileSync(file, content);
  }
}
removeLimits();
console.log("Limits removed.");
