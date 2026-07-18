const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  'const requireModule = createRequire(import.meta.url);',
  'const requireModule = typeof require !== "undefined" ? require : createRequire(import.meta.url);'
);

fs.writeFileSync('server.ts', content);
