const fs = require('fs');
let content = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8');

content = content.replace(
  `    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('action', action);`,
  `    const formData = new FormData();
    formData.append('action', action);
    formData.append('pdf', file);`
);

fs.writeFileSync('src/components/NoteMaker.tsx', content);
