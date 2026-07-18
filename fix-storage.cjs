const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('localStorage.getItem') || content.includes('localStorage.setItem')) {
    let newContent = content;
    
    // Add import if not present
    if (!newContent.includes('safeGetItem')) {
      // Find the last import
      const lastImportIndex = newContent.lastIndexOf('import ');
      if (lastImportIndex !== -1) {
        const nextNewline = newContent.indexOf('\n', lastImportIndex);
        
        let importPath = '../utils/storage';
        if (file === 'src/App.tsx') importPath = './utils/storage';
        else if (file.startsWith('src/utils/')) importPath = './storage';
        
        newContent = newContent.slice(0, nextNewline) + `\nimport { safeGetItem, safeSetItem } from '${importPath}';` + newContent.slice(nextNewline);
      } else {
        newContent = `import { safeGetItem, safeSetItem } from '../utils/storage';\n` + newContent;
      }
    }

    newContent = newContent.replace(/localStorage\.getItem\((.*?)\)/g, 'safeGetItem($1)');
    newContent = newContent.replace(/localStorage\.setItem\((.*?),\s*(.*?)\)/g, 'safeSetItem($1, $2)');
    
    fs.writeFileSync(file, newContent);
    console.log(`Updated ${file}`);
  }
}
